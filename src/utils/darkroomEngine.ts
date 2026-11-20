import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import {
  getStyleById,
  type AspectRatioOption,
  type AttireId,
  type DarkroomRecipe,
  type FramingAnchor,
  type FramingId,
  type LightingId,
} from '../data/studioCatalog';

export interface SegmentationMasks {
  width: number;
  height: number;
  isMulticlass: boolean;
  foreground: Float32Array;
  hair: Float32Array;
  skin: Float32Array;
  clothes: Float32Array;
}

export interface RenderedHeadshotResult {
  imageUrl: string;
  alignedSourceUrl: string;
}

interface ViewportCropRect {
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
}

const MAX_SEGMENTER_DIMENSION = 512;

let segmenterPromise: Promise<ImageSegmenter | null> | null = null;
const backdropCache = new Map<string, Promise<HTMLImageElement>>();

async function resolveAvailableModelUrl(): Promise<string> {
  // 1. Prefer full multiclass model from Express proxy when running full-stack
  try {
    const check = await fetch('/api/mediapipe/model', { method: 'HEAD' });
    const contentType = check.headers.get('content-type') ?? '';
    if (check.ok && contentType.includes('octet-stream')) {
      return '/api/mediapipe/model';
    }
  } catch {
    // Fall through to bundled same-origin model
  }
  // 2. Same-origin bundled 244KB neural selfie segmenter (always available in static builds)
  return '/src/assets/models/selfie_segmenter.tflite';
}

async function getSegmenter(): Promise<ImageSegmenter | null> {
  if (segmenterPromise) return segmenterPromise;

  segmenterPromise = (async () => {
    const modelAssetPath = await resolveAvailableModelUrl();
    const wasmPaths = [
      '/mediapipe-wasm',
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm',
    ];

    // Prefer CPU (WASM SIMD) first for single-image segmentation: bit-exact across all GPUs/browsers
    // and avoids WebGL2 FBO float-readback bugs that can corrupt half of a confidence mask.
    for (const wasmPath of wasmPaths) {
      for (const delegate of ['CPU', 'GPU'] as const) {
        try {
          const vision = await FilesetResolver.forVisionTasks(wasmPath);
          const segmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath,
              delegate,
            },
            runningMode: 'IMAGE',
            outputCategoryMask: false,
            outputConfidenceMasks: true,
          });
          return segmenter;
        } catch {
          // Try next delegate / wasm location
        }
      }
    }
    return null;
  })();

  return segmenterPromise;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = backdropCache.get(src);
  if (cached) return cached;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });

  if (src.startsWith('/src/assets/')) {
    backdropCache.set(src, promise);
    promise.catch(() => {
      backdropCache.delete(src);
    });
  }
  return promise;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function clampUnit(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Create a clean 2D canvas with explicit integer pixel dimensions and reset state
 * (identity transform, source-over compositing, full opacity, no filter/clipping).
 */
function createCleanCanvas(
  width: number,
  height: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const safeW = Math.max(1, Math.round(width));
  const safeH = Math.max(1, Math.round(height));
  const canvas = document.createElement('canvas');
  canvas.width = safeW;
  canvas.height = safeH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable.');
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

/**
 * Rasterize the uploaded source image at its exact natural pixel dimensions (srcW x srcH).
 */
function rasterizeSourceCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const srcW = Math.max(1, img.naturalWidth || img.width);
  const srcH = Math.max(1, img.naturalHeight || img.height);
  const { canvas, ctx } = createCleanCanvas(srcW, srcH);
  ctx.drawImage(img, 0, 0, srcW, srcH);
  return canvas;
}

/**
 * Build a 4-pixel-aligned intermediate canvas (max 512px) for MediaPipe inference.
 * Keeps WebGL/WASM texture row strides 16-byte aligned and prevents large-FBO
 * readback truncation while preserving the source image's exact aspect ratio.
 */
function buildAlignedSegmentationCanvas(srcCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const srcW = srcCanvas.width;
  const srcH = srcCanvas.height;
  const longest = Math.max(srcW, srcH);
  const scale = longest > MAX_SEGMENTER_DIMENSION ? MAX_SEGMENTER_DIMENSION / longest : 1;

  const segW = Math.max(64, Math.round((srcW * scale) / 4) * 4);
  const segH = Math.max(64, Math.round((srcH * scale) / 4) * 4);

  const { canvas, ctx } = createCleanCanvas(segW, segH);
  ctx.drawImage(srcCanvas, 0, 0, srcW, srcH, 0, 0, segW, segH);
  return canvas;
}

/**
 * Pixel-center bilinear resampling of a float mask from a sub-rectangle
 * (cropX, cropY, cropW, cropH) inside (srcW x srcH) onto exact destination (dstW x dstH).
 * Matches Canvas 2D drawImage(src, cropX, cropY, cropW, cropH, 0, 0, dstW, dstH)
 * to sub-pixel precision so masks align 1:1 with the rendered viewport pixels.
 */
function resampleFloatMaskRegion(
  src: Float32Array,
  srcW: number,
  srcH: number,
  cropX: number,
  cropY: number,
  cropW: number,
  cropH: number,
  dstW: number,
  dstH: number
): Float32Array {
  const isIdentity =
    srcW === dstW &&
    srcH === dstH &&
    cropX === 0 &&
    cropY === 0 &&
    cropW === srcW &&
    cropH === srcH &&
    src.length === dstW * dstH;

  if (isIdentity) {
    return src;
  }

  const dst = new Float32Array(dstW * dstH);
  const maxSrcX = Math.max(0, srcW - 1);
  const maxSrcY = Math.max(0, srcH - 1);

  for (let y = 0; y < dstH; y++) {
    const v = (y + 0.5) / dstH;
    const rawSy = cropY + v * cropH - 0.5;
    const sy = rawSy < 0 ? 0 : rawSy > maxSrcY ? maxSrcY : rawSy;
    const y0 = Math.floor(sy);
    const y1 = y0 < maxSrcY ? y0 + 1 : maxSrcY;
    const fy = sy - y0;
    const oneMinusFy = 1 - fy;
    const row0 = y0 * srcW;
    const row1 = y1 * srcW;
    const dstRow = y * dstW;

    for (let x = 0; x < dstW; x++) {
      const u = (x + 0.5) / dstW;
      const rawSx = cropX + u * cropW - 0.5;
      const sx = rawSx < 0 ? 0 : rawSx > maxSrcX ? maxSrcX : rawSx;
      const x0 = Math.floor(sx);
      const x1 = x0 < maxSrcX ? x0 + 1 : maxSrcX;
      const fx = sx - x0;

      const top = src[row0 + x0] * (1 - fx) + src[row0 + x1] * fx;
      const bot = src[row1 + x0] * (1 - fx) + src[row1 + x1] * fx;
      dst[dstRow + x] = top * oneMinusFy + bot * fy;
    }
  }

  return dst;
}

function resampleFloatMask(
  src: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Float32Array {
  return resampleFloatMaskRegion(src, srcW, srcH, 0, 0, srcW, srcH, dstW, dstH);
}

function blurFloatMask(
  src: Float32Array,
  width: number,
  height: number,
  radius: number
): Float32Array {
  if (radius <= 0) return src;
  const r = Math.min(32, Math.round(radius));
  const tmp = new Float32Array(width * height);
  const dst = new Float32Array(width * height);
  const windowSize = r * 2 + 1;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let x = -r; x <= r; x++) {
      const clampedX = x < 0 ? 0 : x >= width ? width - 1 : x;
      sum += src[row + clampedX];
    }
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / windowSize;
      const removeX = x - r < 0 ? 0 : x - r;
      const addX = x + r + 1 >= width ? width - 1 : x + r + 1;
      sum += src[row + addX] - src[row + removeX];
    }
  }

  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) {
      const clampedY = y < 0 ? 0 : y >= height ? height - 1 : y;
      sum += tmp[clampedY * width + x];
    }
    for (let y = 0; y < height; y++) {
      dst[y * width + x] = sum / windowSize;
      const removeY = y - r < 0 ? 0 : y - r;
      const addY = y + r + 1 >= height ? height - 1 : y + r + 1;
      sum += tmp[addY * width + x] - tmp[removeY * width + x];
    }
  }

  return dst;
}

/**
 * Deterministic separable box blur directly on RGBA pixel data across full (width x height).
 * Replaces CanvasRenderingContext2D.filter so Safari and Chromium GPU tile readbacks
 * can never produce half-frame blur or brightness artifacts.
 */
function blurRgbaBuffer(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): void {
  if (radius <= 0) return;
  const r = Math.min(24, Math.round(radius));
  const windowSize = r * 2 + 1;
  const tmp = new Uint8ClampedArray(rgba.length);

  // Two-pass separable box blur approximates smooth Gaussian optical bokeh
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let x = -r; x <= r; x++) {
        const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
        const p = (rowOffset + cx) * 4;
        sr += rgba[p];
        sg += rgba[p + 1];
        sb += rgba[p + 2];
      }
      for (let x = 0; x < width; x++) {
        const dstIdx = (rowOffset + x) * 4;
        tmp[dstIdx] = Math.round(sr / windowSize);
        tmp[dstIdx + 1] = Math.round(sg / windowSize);
        tmp[dstIdx + 2] = Math.round(sb / windowSize);
        tmp[dstIdx + 3] = 255;

        const remX = x - r < 0 ? 0 : x - r;
        const addX = x + r + 1 >= width ? width - 1 : x + r + 1;
        const remP = (rowOffset + remX) * 4;
        const addP = (rowOffset + addX) * 4;
        sr += rgba[addP] - rgba[remP];
        sg += rgba[addP + 1] - rgba[remP + 1];
        sb += rgba[addP + 2] - rgba[remP + 2];
      }
    }

    for (let x = 0; x < width; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let y = -r; y <= r; y++) {
        const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
        const p = (cy * width + x) * 4;
        sr += tmp[p];
        sg += tmp[p + 1];
        sb += tmp[p + 2];
      }
      for (let y = 0; y < height; y++) {
        const dstIdx = (y * width + x) * 4;
        rgba[dstIdx] = Math.round(sr / windowSize);
        rgba[dstIdx + 1] = Math.round(sg / windowSize);
        rgba[dstIdx + 2] = Math.round(sb / windowSize);
        rgba[dstIdx + 3] = 255;

        const remY = y - r < 0 ? 0 : y - r;
        const addY = y + r + 1 >= height ? height - 1 : y + r + 1;
        const remP = (remY * width + x) * 4;
        const addP = (addY * width + x) * 4;
        sr += tmp[addP] - tmp[remP];
        sg += tmp[addP + 1] - tmp[remP + 1];
        sb += tmp[addP + 2] - tmp[remP + 2];
      }
    }
  }
}

/**
 * YCbCr skin likelihood estimate (0..1) so wardrobe tone styling protects face, neck, and arms.
 */
function estimateSkinLikelihood(r: number, g: number, b: number): number {
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  const cbDist = Math.abs(cb - 102) / 26;
  const crDist = Math.abs(cr - 153) / 24;
  const d = Math.hypot(cbDist, crDist);
  return Math.max(0, Math.min(1, 1 - (d - 0.75) / 0.55));
}

function sampleRegionAverage(
  mask: Float32Array,
  width: number,
  height: number,
  x0Frac: number,
  y0Frac: number,
  x1Frac: number,
  y1Frac: number
): number {
  const xStart = Math.max(0, Math.floor(x0Frac * width));
  const xEnd = Math.min(width, Math.max(xStart + 1, Math.ceil(x1Frac * width)));
  const yStart = Math.max(0, Math.floor(y0Frac * height));
  const yEnd = Math.min(height, Math.max(yStart + 1, Math.ceil(y1Frac * height)));

  let sum = 0;
  let count = 0;
  for (let y = yStart; y < yEnd; y++) {
    const row = y * width;
    for (let x = xStart; x < xEnd; x++) {
      sum += mask[row + x];
      count += 1;
    }
  }
  return count > 0 ? sum / count : 0;
}

/**
 * Verify that a segmented foreground mask spans the full image cleanly without
 * empty output, full-frame saturation, or a hardware/WASM 50/50 half-frame readback glitch.
 */
function isForegroundMaskValid(mask: Float32Array, width: number, height: number): boolean {
  const total = width * height;
  if (total <= 0 || mask.length < total) return false;

  let fgCount = 0;
  let leftSum = 0;
  let rightSum = 0;
  let topSum = 0;
  let bottomSum = 0;
  let leftMax = 0;
  let rightMax = 0;
  let topMax = 0;
  let bottomMax = 0;

  const halfX = Math.floor(width / 2);
  const halfY = Math.floor(height / 2);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    const isTop = y < halfY;
    for (let x = 0; x < width; x++) {
      const v = mask[row + x];
      if (!Number.isFinite(v)) return false;
      if (v > 0.35) fgCount += 1;

      if (x < halfX) {
        leftSum += v;
        if (v > leftMax) leftMax = v;
      } else {
        rightSum += v;
        if (v > rightMax) rightMax = v;
      }

      if (isTop) {
        topSum += v;
        if (v > topMax) topMax = v;
      } else {
        bottomSum += v;
        if (v > bottomMax) bottomMax = v;
      }
    }
  }

  const fgRatio = fgCount / total;
  if (fgRatio < 0.03 || fgRatio > 0.985) {
    return false;
  }

  // Detect corrupted GPU/WASM half-buffer readbacks where exactly one half is dead zero
  const halfPixels = Math.max(1, total / 2);
  const leftMean = leftSum / halfPixels;
  const rightMean = rightSum / halfPixels;
  const topMean = topSum / halfPixels;
  const bottomMean = bottomSum / halfPixels;

  const leftDead = leftMax < 0.015 && rightMean > 0.2;
  const rightDead = rightMax < 0.015 && leftMean > 0.2;
  const topDead = topMax < 0.015 && bottomMean > 0.2;
  const bottomDead = bottomMax < 0.015 && topMean > 0.2;

  if (leftDead || rightDead || topDead || bottomDead) {
    return false;
  }

  return true;
}

function buildFallbackPortraitMask(
  width: number,
  height: number,
  anchor: FramingAnchor
): SegmentationMasks {
  const size = width * height;
  const foreground = new Float32Array(size);
  const hair = new Float32Array(size);
  const skin = new Float32Array(size);
  const clothes = new Float32Array(size);

  const cx = anchor.faceCenterX * width;
  const cy = anchor.faceCenterY * height;
  const headR = Math.max(width, height) * anchor.faceHeightRatio * 0.55;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const dxH = (x - cx) / (headR * 0.95);
      const dyH = (y - cy) / (headR * 1.2);
      const dHead = Math.sqrt(dxH * dxH + dyH * dyH);

      const dyS = (y - (cy + headR * 1.9)) / (headR * 1.6);
      const dxS = (x - cx) / (headR * 2.25);
      const dShoulders = Math.sqrt(dxS * dxS + dyS * dyS);

      const d = Math.min(dHead, dShoulders);
      const fg = Math.max(0, Math.min(1, 1 - (d - 0.88) / 0.38));
      foreground[idx] = fg;

      if (dHead < 1.0) {
        skin[idx] = fg * 0.85;
      }
      if (dHead < 1.15 && y < cy - headR * 0.15) {
        hair[idx] = fg * 0.7;
      }
    }
  }

  return { width, height, isMulticlass: false, foreground, hair, skin, clothes };
}

export async function segmentSelfie(
  sourceDataUrl: string,
  anchor: FramingAnchor
): Promise<SegmentationMasks> {
  const img = await loadImage(sourceDataUrl);
  const srcCanvas = rasterizeSourceCanvas(img);
  const srcW = srcCanvas.width;
  const srcH = srcCanvas.height;

  const segmenter = await getSegmenter();
  if (!segmenter) {
    return buildFallbackPortraitMask(srcW, srcH, anchor);
  }

  // Feed a clean 4-pixel-aligned canvas (<=512px) into MediaPipe so WebGL/WASM
  // buffer stride and texture readbacks stay 100% aligned across all browsers.
  const segInputCanvas = buildAlignedSegmentationCanvas(srcCanvas);

  let result: ReturnType<ImageSegmenter['segment']> | null = null;
  try {
    result = segmenter.segment(segInputCanvas);
    const masks = result.confidenceMasks ?? [];
    if (masks.length === 0) {
      return buildFallbackPortraitMask(srcW, srcH, anchor);
    }

    const maskW = masks[0].width;
    const maskH = masks[0].height;
    const expectedLen = maskW * maskH;
    if (expectedLen <= 0) {
      return buildFallbackPortraitMask(srcW, srcH, anchor);
    }

    // Clone every WASM/WebGL Float32Array into independent JS memory and clamp cleanly to [0, 1]
    const clonedMasks = masks.map((m) => {
      const view = m.getAsFloat32Array();
      const copy = new Float32Array(expectedLen);
      const len = Math.min(expectedLen, view.length);
      for (let i = 0; i < len; i++) {
        copy[i] = clampUnit(view[i]);
      }
      return copy;
    });

    const rawFg = new Float32Array(expectedLen);
    const rawHair = new Float32Array(expectedLen);
    const rawSkin = new Float32Array(expectedLen);
    const rawClothes = new Float32Array(expectedLen);
    let isMulticlass = false;

    if (clonedMasks.length >= 5) {
      // MediaPipe selfie_multiclass_256x256:
      // 0: background, 1: hair, 2: body-skin, 3: face-skin, 4: clothes, 5: others
      isMulticlass = true;
      const bg = clonedMasks[0];
      const hairArr = clonedMasks[1];
      const bodySkinArr = clonedMasks[2];
      const faceSkinArr = clonedMasks[3];
      const clothesArr = clonedMasks[4];

      for (let i = 0; i < expectedLen; i++) {
        const fgVal = 1 - bg[i];
        rawFg[i] = clampUnit((fgVal - 0.12) / 0.76);
        rawHair[i] = hairArr[i];
        const totalSkin = Math.min(1, bodySkinArr[i] + faceSkinArr[i]);
        rawSkin[i] = totalSkin;
        const pureClothes = clothesArr[i] * Math.max(0, 1 - totalSkin * 2.4 - hairArr[i] * 1.4);
        rawClothes[i] = pureClothes > 0.38 ? Math.min(1, (pureClothes - 0.38) / 0.45) : 0;
      }
    } else {
      // Binary selfie_segmenter.tflite (1 or 2 channels): pick true foreground via region check
      let bestChannel = clonedMasks[clonedMasks.length - 1];
      let invertMask = false;

      const fx0 = Math.max(0.15, anchor.faceCenterX - 0.12);
      const fx1 = Math.min(0.85, anchor.faceCenterX + 0.12);
      const fy0 = Math.max(0.12, anchor.faceCenterY - 0.1);
      const fy1 = Math.min(0.85, anchor.faceCenterY + 0.15);

      if (clonedMasks.length === 2) {
        const scoreChannel = (ch: Float32Array): number => {
          const centerScore = sampleRegionAverage(ch, maskW, maskH, fx0, fy0, fx1, fy1);
          const cornerScore =
            (sampleRegionAverage(ch, maskW, maskH, 0, 0, 0.14, 0.14) +
              sampleRegionAverage(ch, maskW, maskH, 0.86, 0, 1, 0.14)) *
            0.5;
          return centerScore - cornerScore;
        };
        bestChannel = scoreChannel(clonedMasks[1]) >= scoreChannel(clonedMasks[0])
          ? clonedMasks[1]
          : clonedMasks[0];
      } else {
        const centerAvg = sampleRegionAverage(bestChannel, maskW, maskH, fx0, fy0, fx1, fy1);
        const cornerAvg =
          (sampleRegionAverage(bestChannel, maskW, maskH, 0, 0, 0.14, 0.14) +
            sampleRegionAverage(bestChannel, maskW, maskH, 0.86, 0, 1, 0.14)) *
          0.5;
        if (cornerAvg > centerAvg + 0.2) {
          invertMask = true;
        }
      }

      const { ctx: sampleCtx } = createCleanCanvas(maskW, maskH);
      sampleCtx.drawImage(srcCanvas, 0, 0, srcW, srcH, 0, 0, maskW, maskH);
      const samplePx = sampleCtx.getImageData(0, 0, maskW, maskH).data;

      const neckStartY = Math.min(0.86, anchor.faceCenterY + anchor.faceHeightRatio * 0.78);
      const crownY = Math.max(0.05, anchor.faceCenterY - anchor.faceHeightRatio * 0.2);

      for (let y = 0; y < maskH; y++) {
        const ny = y / Math.max(1, maskH - 1);
        for (let x = 0; x < maskW; x++) {
          const i = y * maskW + x;
          const rawVal = invertMask ? 1 - bestChannel[i] : bestChannel[i];
          const fg = clampUnit((rawVal - 0.14) / 0.72);
          rawFg[i] = fg;

          if (fg > 0.05) {
            const r = samplePx[i * 4];
            const g = samplePx[i * 4 + 1];
            const b = samplePx[i * 4 + 2];
            const skinProb = estimateSkinLikelihood(r, g, b);
            rawSkin[i] = fg * skinProb;

            if (ny < crownY && skinProb < 0.45) {
              rawHair[i] = fg * 0.85;
            }

            if (fg > 0.45 && ny > neckStartY && skinProb < 0.22) {
              const verticalFade = Math.min(1, (ny - neckStartY) / 0.22);
              rawClothes[i] = fg * verticalFade * Math.max(0, 1 - skinProb * 3.0);
            }
          }
        }
      }
    }

    if (!isForegroundMaskValid(rawFg, maskW, maskH)) {
      return buildFallbackPortraitMask(srcW, srcH, anchor);
    }

    // Smooth edge feathering at mask resolution before pixel-center resampling to exact (srcW x srcH)
    const featherFg = blurFloatMask(rawFg, maskW, maskH, Math.max(1, Math.round(maskW / 280)));
    const featherClothes = blurFloatMask(
      rawClothes,
      maskW,
      maskH,
      Math.max(3, Math.round(maskW / 100))
    );

    return {
      width: srcW,
      height: srcH,
      isMulticlass,
      foreground: resampleFloatMask(featherFg, maskW, maskH, srcW, srcH),
      hair: resampleFloatMask(rawHair, maskW, maskH, srcW, srcH),
      skin: resampleFloatMask(rawSkin, maskW, maskH, srcW, srcH),
      clothes: resampleFloatMask(featherClothes, maskW, maskH, srcW, srcH),
    };
  } catch {
    return buildFallbackPortraitMask(srcW, srcH, anchor);
  } finally {
    result?.close();
  }
}

function getOutputDimensions(aspectRatio: AspectRatioOption): { width: number; height: number } {
  if (aspectRatio === '1:1') return { width: 1080, height: 1080 };
  if (aspectRatio === '4:3') return { width: 1200, height: 900 };
  return { width: 960, height: 1280 };
}

function getFramingTarget(framingId: FramingId): { targetFaceHeight: number; targetEyeY: number } {
  switch (framingId) {
    case 'tight-headshot':
      return { targetFaceHeight: 0.44, targetEyeY: 0.38 };
    case 'mid-chest':
      return { targetFaceHeight: 0.27, targetEyeY: 0.31 };
    case 'head-shoulders':
    default:
      return { targetFaceHeight: 0.35, targetEyeY: 0.34 };
  }
}

function computeViewportCropRect(
  srcW: number,
  srcH: number,
  outW: number,
  outH: number,
  anchor: FramingAnchor,
  recipe: DarkroomRecipe
): ViewportCropRect {
  const outAspect = outW / outH;
  const framingTarget = getFramingTarget(recipe.framingId);

  const maxCropH = srcW / outAspect <= srcH ? srcW / outAspect : srcH;
  const desiredCropH =
    (anchor.faceHeightRatio * srcH) /
    Math.max(0.12, framingTarget.targetFaceHeight * recipe.zoomAdjust);

  const boundedH = Math.max(maxCropH * 0.48, Math.min(maxCropH, desiredCropH));
  const cropW = Math.min(srcW, boundedH * outAspect);
  const cropH = Math.min(srcH, cropW / outAspect);

  const faceX = anchor.faceCenterX * srcW;
  const faceY = anchor.faceCenterY * srcH;
  const desiredEyeFrac = framingTarget.targetEyeY + recipe.verticalOffset;

  const rawCropX = faceX - cropW * 0.5;
  const rawCropY = faceY - cropH * desiredEyeFrac;

  return {
    cropX: Math.max(0, Math.min(srcW - cropW, rawCropX)),
    cropY: Math.max(0, Math.min(srcH - cropH, rawCropY)),
    cropW,
    cropH,
  };
}

/**
 * Natural, luminance-balanced wardrobe toning that harmonizes garment hue/value
 * without creating harsh dark/bright tonal cliffs across the portrait.
 */
function applyAttireStyling(
  r: number,
  g: number,
  b: number,
  attireId: AttireId,
  strength: number
): [number, number, number] {
  if (attireId === 'keep-original' || strength <= 0.04) {
    return [r, g, b];
  }

  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  let tr = r;
  let tg = g;
  let tb = b;

  switch (attireId) {
    case 'charcoal-blazer': {
      const mapped = 56 + Math.pow(lum, 0.96) * 112;
      tr = mapped * 0.97;
      tg = mapped * 0.99;
      tb = mapped * 1.03;
      break;
    }
    case 'crisp-oxford': {
      const mapped = 158 + Math.pow(lum, 0.76) * 86;
      tr = mapped * 1.01;
      tg = mapped * 1.0;
      tb = mapped * 0.98;
      break;
    }
    case 'black-turtleneck': {
      const mapped = 36 + Math.pow(lum, 1.08) * 82;
      tr = mapped;
      tg = mapped;
      tb = mapped * 1.02;
      break;
    }
    case 'smart-knit': {
      const mapped = 46 + Math.pow(lum, 0.98) * 108;
      tr = mapped * 0.74;
      tg = mapped * 0.84;
      tb = mapped * 1.12;
      break;
    }
  }

  const blend = Math.min(0.56, strength * 0.56);
  return [
    r * (1 - blend) + tr * blend,
    g * (1 - blend) + tg * blend,
    b * (1 - blend) + tb * blend,
  ];
}

/**
 * Smooth, radially symmetric key illumination centered on the framed subject's actual
 * face coordinates in the final viewport. Guarantees uniform, natural studio falloff
 * with zero left/right or top/bottom 50/50 brightness split.
 */
function computeKeyLightMultiplier(
  nx: number,
  ny: number,
  faceNx: number,
  faceNy: number,
  lightingId: LightingId,
  strength: number
): number {
  const s = strength * 0.09;
  const dx = (nx - faceNx) * 0.75;
  const dy = (ny - faceNy) * 0.75;
  const dist = Math.hypot(dx, dy);

  let delta = 0;
  switch (lightingId) {
    case 'rembrandt': {
      delta = s * (0.22 - dist * 0.26);
      break;
    }
    case 'golden-rim': {
      delta = s * (0.2 - dist * 0.22);
      break;
    }
    case 'diffused-window': {
      delta = s * (0.18 - dist * 0.18);
      break;
    }
    case 'softbox-key':
    default: {
      delta = s * (0.24 - dist * 0.22);
      break;
    }
  }

  return Math.max(0.96, Math.min(1.06, 1 + delta));
}

export async function renderStudioHeadshot(
  sourceDataUrl: string,
  masks: SegmentationMasks,
  recipe: DarkroomRecipe,
  anchor: FramingAnchor
): Promise<RenderedHeadshotResult> {
  const style = getStyleById(recipe.styleId);
  const [sourceImg, backdropImg] = await Promise.all([
    loadImage(sourceDataUrl),
    loadImage(style.backdropImage),
  ]);

  // -------------------------------------------------------------------------
  // STAGE 1: Rasterize source & compute exact framing crop into final viewport (outW x outH)
  // Every image buffer and mask channel is aligned to the EXACT same (outW x outH) grid
  // before a single compositing pixel is computed.
  // -------------------------------------------------------------------------
  const srcCanvas = rasterizeSourceCanvas(sourceImg);
  const srcW = srcCanvas.width;
  const srcH = srcCanvas.height;

  const { width: outW, height: outH } = getOutputDimensions(recipe.aspectRatio);
  const { cropX, cropY, cropW, cropH } = computeViewportCropRect(
    srcW,
    srcH,
    outW,
    outH,
    anchor,
    recipe
  );

  // 1A. Rasterize the cropped source portrait directly onto the (outW x outH) viewport grid.
  // This exact canvas also produces alignedSourceUrl for pixel-accurate Before/After comparison.
  const { canvas: alignedSrcCanvas, ctx: alignedSrcCtx } = createCleanCanvas(outW, outH);
  alignedSrcCtx.drawImage(srcCanvas, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
  const srcPx = alignedSrcCtx.getImageData(0, 0, outW, outH).data;

  // 1B. Map the source crop rectangle into mask coordinates and resample every mask channel
  // onto the exact same (outW x outH) viewport dimensions using pixel-center interpolation.
  const maskScaleX = masks.width / srcW;
  const maskScaleY = masks.height / srcH;
  const maskCropX = cropX * maskScaleX;
  const maskCropY = cropY * maskScaleY;
  const maskCropW = cropW * maskScaleX;
  const maskCropH = cropH * maskScaleY;

  const fgMask = resampleFloatMaskRegion(
    masks.foreground,
    masks.width,
    masks.height,
    maskCropX,
    maskCropY,
    maskCropW,
    maskCropH,
    outW,
    outH
  );
  const hairMask = resampleFloatMaskRegion(
    masks.hair,
    masks.width,
    masks.height,
    maskCropX,
    maskCropY,
    maskCropW,
    maskCropH,
    outW,
    outH
  );
  const skinMask = resampleFloatMaskRegion(
    masks.skin,
    masks.width,
    masks.height,
    maskCropX,
    maskCropY,
    maskCropW,
    maskCropH,
    outW,
    outH
  );
  const clothesMask = resampleFloatMaskRegion(
    masks.clothes,
    masks.width,
    masks.height,
    maskCropX,
    maskCropY,
    maskCropW,
    maskCropH,
    outW,
    outH
  );

  // -------------------------------------------------------------------------
  // STAGE 2: Render Studio Backdrop symmetrically across the full (outW x outH) viewport
  // -------------------------------------------------------------------------
  const { ctx: bgCtx } = createCleanCanvas(outW, outH);
  const [ambR, ambG, ambB] = style.ambientRgb;
  bgCtx.fillStyle = `rgb(${ambR}, ${ambG}, ${ambB})`;
  bgCtx.fillRect(0, 0, outW, outH);

  const bgNaturalW = Math.max(1, backdropImg.naturalWidth || backdropImg.width);
  const bgNaturalH = Math.max(1, backdropImg.naturalHeight || backdropImg.height);
  const bgScale =
    Math.max(outW / bgNaturalW, outH / bgNaturalH) * style.backdropCropZoom;
  const drawBgW = bgNaturalW * bgScale;
  const drawBgH = bgNaturalH * bgScale;
  const drawBgX = (outW - drawBgW) / 2;
  const drawBgY = (outH - drawBgH) / 2;
  bgCtx.drawImage(backdropImg, drawBgX, drawBgY, drawBgW, drawBgH);

  const bgImageData = bgCtx.getImageData(0, 0, outW, outH);
  const bgPx = bgImageData.data;

  // Deterministic CPU bokeh blur across full (outW x outH) viewport (zero GPU tile artifacts)
  const scaledBlurRadius = Math.round((recipe.backdropBlur * Math.max(outW, outH)) / 1280);
  if (scaledBlurRadius > 0) {
    blurRgbaBuffer(bgPx, outW, outH, scaledBlurRadius);
  }

  // Uniform tonal grading across entire (outW x outH) backdrop plate
  const bgExposureMul = Math.pow(2, recipe.exposure * 0.42);
  const bgContrastFactor = 1 + recipe.contrast * 0.28;
  const bgSatFactor = recipe.monochrome ? 0 : Math.max(0, 1 + recipe.saturation * 0.5);
  const bgWarmShift = recipe.monochrome ? 0 : recipe.warmth * 18;

  for (let i = 0; i < bgPx.length; i += 4) {
    let r = bgPx[i] * bgExposureMul + bgWarmShift;
    let g = bgPx[i + 1] * bgExposureMul + bgWarmShift * 0.25;
    let b = bgPx[i + 2] * bgExposureMul - bgWarmShift * 0.8;

    r = (r - 128) * bgContrastFactor + 128;
    g = (g - 128) * bgContrastFactor + 128;
    b = (b - 128) * bgContrastFactor + 128;

    if (recipe.monochrome) {
      const mono = 0.3 * r + 0.59 * g + 0.11 * b;
      r = mono;
      g = mono;
      b = mono;
    } else if (bgSatFactor !== 1) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * bgSatFactor;
      g = gray + (g - gray) * bgSatFactor;
      b = gray + (b - gray) * bgSatFactor;
    }

    bgPx[i] = clampByte(r);
    bgPx[i + 1] = clampByte(g);
    bgPx[i + 2] = clampByte(b);
    bgPx[i + 3] = 255;
  }

  // -------------------------------------------------------------------------
  // STAGE 3: Single Unified Full-Viewport Relighting, Floating-Point Alpha Compositing,
  // Vignette, and Analog Grain Pass directly into outCanvas (outW x outH)
  // -------------------------------------------------------------------------
  const { canvas: outCanvas, ctx: outCtx } = createCleanCanvas(outW, outH);
  const outImageData = outCtx.createImageData(outW, outH);
  const outPx = outImageData.data;

  const [rimR, rimG, rimB] =
    recipe.lightingId === 'golden-rim'
      ? [255, 212, 140]
      : recipe.monochrome
        ? [240, 240, 240]
        : style.rimRgb;

  const exposureMul = Math.pow(2, recipe.exposure * 0.85);
  const contrastFactor = 1 + recipe.contrast * 0.64;
  const satFactor = recipe.monochrome ? 0 : Math.max(0, 1 + recipe.saturation);

  // Subject face center in final viewport coordinates [0..1]
  const framedFaceNx = clampUnit((anchor.faceCenterX * srcW - cropX) / Math.max(1, cropW));
  const framedFaceNy = clampUnit((anchor.faceCenterY * srcH - cropY) / Math.max(1, cropH));

  const applyVignette = recipe.vignette > 0.01;
  const grainAmp = recipe.grain > 0.01 ? recipe.grain * 16 : 0;
  let seed = 133791;
  const nextNoise = (): number => {
    seed = (seed * 1664525 + 1013904223) | 0;
    return ((seed >>> 24) / 255 - 0.5) * 2;
  };

  for (let y = 0; y < outH; y++) {
    const ny = y / Math.max(1, outH - 1);
    const vy = (y / outH - 0.45) * 1.3;
    const vySq = vy * vy;
    const row = y * outW;

    for (let x = 0; x < outW; x++) {
      const mIdx = row + x;
      const pIdx = mIdx * 4;
      const alpha = fgMask[mIdx];

      const br = bgPx[pIdx];
      const bg = bgPx[pIdx + 1];
      const bb = bgPx[pIdx + 2];

      let outR = br;
      let outG = bg;
      let outB = bb;

      if (alpha > 0.002) {
        const nx = x / Math.max(1, outW - 1);
        let fr = srcPx[pIdx];
        let fg = srcPx[pIdx + 1];
        let fb = srcPx[pIdx + 2];

        const clothesWeight = clothesMask[mIdx];
        const hairWeight = hairMask[mIdx];
        const skinWeight = skinMask[mIdx];

        if (clothesWeight > 0.08 && recipe.attireId !== 'keep-original') {
          [fr, fg, fb] = applyAttireStyling(fr, fg, fb, recipe.attireId, clothesWeight);
        }

        const keyMul = computeKeyLightMultiplier(
          nx,
          ny,
          framedFaceNx,
          framedFaceNy,
          recipe.lightingId,
          recipe.keyLightStrength
        );
        const totalLight = exposureMul * keyMul;
        fr *= totalLight;
        fg *= totalLight;
        fb *= totalLight;

        if (recipe.warmth !== 0) {
          const wShift = recipe.warmth * 22;
          fr += wShift;
          fg += wShift * 0.25;
          fb -= wShift * 0.85;
        }

        const localContrast = skinWeight > 0.3 ? 1 + (contrastFactor - 1) * 0.65 : contrastFactor;
        fr = (fr - 128) * localContrast + 128;
        fg = (fg - 128) * localContrast + 128;
        fb = (fb - 128) * localContrast + 128;

        // Subtle ambient shadow integration so subject black levels match the backdrop
        const lum = (0.299 * fr + 0.587 * fg + 0.114 * fb) / 255;
        const shadowBlend = Math.max(0, 1 - lum * 1.5) * 0.07;
        fr = fr * (1 - shadowBlend) + ambR * shadowBlend;
        fg = fg * (1 - shadowBlend) + ambG * shadowBlend;
        fb = fb * (1 - shadowBlend) + ambB * shadowBlend;

        // Edge spill suppression + subtle hair/shoulder studio rim light
        if (alpha < 0.92) {
          const edgeFactor = Math.sin(alpha * Math.PI);
          const decon = (1 - alpha) * 0.28;
          fr = fr * (1 - decon) + br * decon;
          fg = fg * (1 - decon) + bg * decon;
          fb = fb * (1 - decon) + bb * decon;

          const upperBias = Math.max(0.25, 1.08 - ny * 0.8);
          const rimPower =
            edgeFactor * recipe.rimLight * 0.58 * upperBias * (0.45 + hairWeight * 0.55);

          fr += (rimR - fr) * rimPower * 0.44;
          fg += (rimG - fg) * rimPower * 0.44;
          fb += (rimB - fb) * rimPower * 0.44;
        }

        if (recipe.monochrome) {
          const mono = 0.36 * fr + 0.52 * fg + 0.12 * fb;
          fr = mono * 1.015;
          fg = mono * 1.005;
          fb = mono * 0.985;
        } else if (satFactor !== 1) {
          const gray = 0.299 * fr + 0.587 * fg + 0.114 * fb;
          fr = gray + (fr - gray) * satFactor;
          fg = gray + (fg - gray) * satFactor;
          fb = gray + (fb - gray) * satFactor;
        }

        // Exact floating-point source-over blend directly across the full viewport
        const invAlpha = 1 - alpha;
        outR = fr * alpha + br * invAlpha;
        outG = fg * alpha + bg * invAlpha;
        outB = fb * alpha + bb * invAlpha;
      }

      if (applyVignette) {
        const vx = (x / outW - 0.5) * 1.4;
        const vig = 1 - Math.min(0.46, (vx * vx + vySq) * recipe.vignette * 0.36);
        outR *= vig;
        outG *= vig;
        outB *= vig;
      }

      if (grainAmp > 0.3) {
        const n = nextNoise() * grainAmp;
        outR += n;
        outG += n;
        outB += n;
      }

      outPx[pIdx] = clampByte(outR);
      outPx[pIdx + 1] = clampByte(outG);
      outPx[pIdx + 2] = clampByte(outB);
      outPx[pIdx + 3] = 255;
    }
  }

  outCtx.putImageData(outImageData, 0, 0);

  return {
    imageUrl: outCanvas.toDataURL('image/png'),
    alignedSourceUrl: alignedSrcCanvas.toDataURL('image/jpeg', 0.92),
  };
}
