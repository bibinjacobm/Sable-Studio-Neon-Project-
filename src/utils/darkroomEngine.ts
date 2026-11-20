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
    // and avoids WebGL2 FBO texture-stride readback bugs that can corrupt half of a float mask.
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
  }
  return promise;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * Resample a 2D float mask cleanly onto exact target dimensions (dstW x dstH)
 * using bilinear interpolation so mask arrays always match source canvas pixels 1:1.
 */
function resampleFloatMask(
  src: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Float32Array {
  if (srcW === dstW && srcH === dstH && src.length === dstW * dstH) {
    return src;
  }

  const dst = new Float32Array(dstW * dstH);
  const scaleX = srcW > 1 && dstW > 1 ? (srcW - 1) / (dstW - 1) : 0;
  const scaleY = srcH > 1 && dstH > 1 ? (srcH - 1) / (dstH - 1) : 0;

  for (let y = 0; y < dstH; y++) {
    const my = y * scaleY;
    const y0 = Math.floor(my);
    const y1 = Math.min(srcH - 1, y0 + 1);
    const fy = my - y0;
    const row0 = y0 * srcW;
    const row1 = y1 * srcW;
    const dstRow = y * dstW;

    for (let x = 0; x < dstW; x++) {
      const mx = x * scaleX;
      const x0 = Math.floor(mx);
      const x1 = Math.min(srcW - 1, x0 + 1);
      const fx = mx - x0;

      const v00 = src[row0 + x0];
      const v10 = src[row0 + x1];
      const v01 = src[row1 + x0];
      const v11 = src[row1 + x1];
      dst[dstRow + x] = (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
    }
  }

  return dst;
}

function blurFloatMask(
  src: Float32Array,
  width: number,
  height: number,
  radius: number
): Float32Array {
  if (radius <= 0) return src;
  const tmp = new Float32Array(width * height);
  const dst = new Float32Array(width * height);
  const windowSize = radius * 2 + 1;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let x = -radius; x <= radius; x++) {
      const clampedX = Math.max(0, Math.min(width - 1, x));
      sum += src[row + clampedX];
    }
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / windowSize;
      const removeX = Math.max(0, Math.min(width - 1, x - radius));
      const addX = Math.max(0, Math.min(width - 1, x + radius + 1));
      sum += src[row + addX] - src[row + removeX];
    }
  }

  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) {
      const clampedY = Math.max(0, Math.min(height - 1, y));
      sum += tmp[clampedY * width + x];
    }
    for (let y = 0; y < height; y++) {
      dst[y * width + x] = sum / windowSize;
      const removeY = Math.max(0, Math.min(height - 1, y - radius));
      const addY = Math.max(0, Math.min(height - 1, y + radius + 1));
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

  // Two-pass box blur approximates smooth Gaussian optical bokeh
  for (let pass = 0; pass < 2; pass++) {
    // Horizontal pass: rgba -> tmp
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let x = -r; x <= r; x++) {
        const cx = Math.max(0, Math.min(width - 1, x));
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

        const remX = Math.max(0, Math.min(width - 1, x - r));
        const addX = Math.max(0, Math.min(width - 1, x + r + 1));
        const remP = (rowOffset + remX) * 4;
        const addP = (rowOffset + addX) * 4;
        sr += rgba[addP] - rgba[remP];
        sg += rgba[addP + 1] - rgba[remP + 1];
        sb += rgba[addP + 2] - rgba[remP + 2];
      }
    }

    // Vertical pass: tmp -> rgba
    for (let x = 0; x < width; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let y = -r; y <= r; y++) {
        const cy = Math.max(0, Math.min(height - 1, y));
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

        const remY = Math.max(0, Math.min(height - 1, y - r));
        const addY = Math.max(0, Math.min(height - 1, y + r + 1));
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
 * YCbCr skin likelihood estimate (0..1) so wardrobe tone styling protects neck, chin, and arms.
 */
function estimateSkinLikelihood(r: number, g: number, b: number): number {
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  const cbDist = Math.abs(cb - 102) / 26;
  const crDist = Math.abs(cr - 153) / 24;
  const d = Math.hypot(cbDist, crDist);
  return Math.max(0, Math.min(1, 1 - (d - 0.75) / 0.55));
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

/**
 * Create a clean 2D canvas with explicit dimensions and reset compositing state
 * (globalCompositeOperation = 'source-over', globalAlpha = 1).
 */
function createCleanCanvas(
  width: number,
  height: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable.');
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
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

  let result: ReturnType<ImageSegmenter['segment']> | null = null;
  try {
    result = segmenter.segment(srcCanvas);
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

    // Clone every WASM Float32Array into independent JS memory before reading the next mask
    const clonedMasks = masks.map((m) => new Float32Array(m.getAsFloat32Array()));
    if (clonedMasks.some((buf) => buf.length < expectedLen)) {
      return buildFallbackPortraitMask(srcW, srcH, anchor);
    }

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
        rawFg[i] = Math.max(0, Math.min(1, (fgVal - 0.12) / 0.76));
        rawHair[i] = hairArr[i];
        const totalSkin = Math.min(1, bodySkinArr[i] + faceSkinArr[i]);
        rawSkin[i] = totalSkin;
        const pureClothes = clothesArr[i] * Math.max(0, 1 - totalSkin * 2.2);
        rawClothes[i] = pureClothes > 0.35 ? Math.min(1, (pureClothes - 0.35) / 0.45) : 0;
      }
    } else {
      // Binary selfie_segmenter.tflite: smooth neural foreground matte
      const channel = clonedMasks[clonedMasks.length - 1];

      let invertMask = false;
      if (clonedMasks.length === 1 && maskW > 8 && maskH > 8) {
        const cornerAvg =
          (channel[0] +
            channel[maskW - 1] +
            channel[Math.floor(maskH * 0.1) * maskW] +
            channel[Math.floor(maskH * 0.1) * maskW + (maskW - 1)]) /
          4;
        const centerAvg = channel[Math.floor(maskH * 0.5) * maskW + Math.floor(maskW * 0.5)];
        if (cornerAvg > centerAvg + 0.25) {
          invertMask = true;
        }
      }

      const { ctx: sampleCtx } = createCleanCanvas(maskW, maskH);
      sampleCtx.drawImage(srcCanvas, 0, 0, maskW, maskH);
      const samplePx = sampleCtx.getImageData(0, 0, maskW, maskH).data;

      const neckStartY = Math.min(0.85, anchor.faceCenterY + anchor.faceHeightRatio * 0.72);
      const crownY = Math.max(0.05, anchor.faceCenterY - anchor.faceHeightRatio * 0.2);

      for (let y = 0; y < maskH; y++) {
        const ny = y / Math.max(1, maskH - 1);
        for (let x = 0; x < maskW; x++) {
          const i = y * maskW + x;
          const rawVal = invertMask ? 1 - channel[i] : channel[i];
          const fg = Math.max(0, Math.min(1, (rawVal - 0.14) / 0.72));
          rawFg[i] = fg;

          if (fg > 0.05) {
            const skinProb = estimateSkinLikelihood(
              samplePx[i * 4],
              samplePx[i * 4 + 1],
              samplePx[i * 4 + 2]
            );
            rawSkin[i] = fg * skinProb;

            if (ny < crownY && skinProb < 0.45) {
              rawHair[i] = fg * 0.85;
            }

            if (ny > neckStartY && skinProb < 0.28) {
              const verticalFade = Math.min(1, (ny - neckStartY) / 0.14);
              rawClothes[i] = fg * verticalFade * (1 - skinProb * 2.5);
            }
          }
        }
      }
    }

    // Feather at mask resolution, then resample strictly to exact source dimensions (srcW x srcH)
    // so every compositing step indexes masks 1:1 with the source canvas pixels.
    const featherFg = blurFloatMask(rawFg, maskW, maskH, Math.max(1, Math.round(maskW / 320)));
    const featherClothes = blurFloatMask(
      rawClothes,
      maskW,
      maskH,
      Math.max(2, Math.round(maskW / 140))
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
      const mapped = 48 + Math.pow(lum, 1.04) * 98;
      tr = mapped * 0.97;
      tg = mapped * 0.99;
      tb = mapped * 1.03;
      break;
    }
    case 'crisp-oxford': {
      const mapped = 162 + Math.pow(lum, 0.72) * 84;
      tr = mapped * 1.01;
      tg = mapped * 1.0;
      tb = mapped * 0.97;
      break;
    }
    case 'black-turtleneck': {
      const mapped = 30 + Math.pow(lum, 1.16) * 68;
      tr = mapped;
      tg = mapped;
      tb = mapped * 1.02;
      break;
    }
    case 'smart-knit': {
      const mapped = 38 + Math.pow(lum, 1.04) * 102;
      tr = mapped * 0.68;
      tg = mapped * 0.8;
      tb = mapped * 1.15;
      break;
    }
  }

  const blend = Math.min(0.7, strength * 0.7);
  return [
    r * (1 - blend) + tr * blend,
    g * (1 - blend) + tg * blend,
    b * (1 - blend) + tb * blend,
  ];
}

function computeKeyLightMultiplier(
  nx: number,
  ny: number,
  lightingId: LightingId,
  strength: number
): number {
  const s = strength * 0.11;
  let delta = 0;

  switch (lightingId) {
    case 'rembrandt': {
      const dist = Math.hypot((nx - 0.45) * 0.85, (ny - 0.35) * 0.85);
      delta = s * (0.22 - dist * 0.28 + (0.5 - nx) * 0.06);
      break;
    }
    case 'golden-rim': {
      const dist = Math.hypot((nx - 0.52) * 0.85, (ny - 0.35) * 0.85);
      delta = s * (0.22 - dist * 0.26);
      break;
    }
    case 'diffused-window': {
      const dist = Math.hypot((nx - 0.48) * 0.8, (ny - 0.36) * 0.8);
      delta = s * (0.2 - dist * 0.22 + (0.5 - nx) * 0.05);
      break;
    }
    case 'softbox-key':
    default: {
      const dist = Math.hypot((nx - 0.5) * 0.85, (ny - 0.36) * 0.85);
      delta = s * (0.24 - dist * 0.26);
      break;
    }
  }

  return Math.max(0.97, Math.min(1.06, 1 + delta));
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
  // STAGE 1: Match ALL working canvases & masks strictly to source dimensions (srcW x srcH)
  // so every pixel and mask channel aligns 1:1 with zero clipping or coordinate shift.
  // -------------------------------------------------------------------------
  const srcCanvas = rasterizeSourceCanvas(sourceImg);
  const srcW = srcCanvas.width;
  const srcH = srcCanvas.height;
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) throw new Error('Source canvas context unavailable.');
  const srcPx = srcCtx.getImageData(0, 0, srcW, srcH).data;

  // Guarantee masks match exact srcW x srcH dimensions
  const fgMask = resampleFloatMask(masks.foreground, masks.width, masks.height, srcW, srcH);
  const hairMask = resampleFloatMask(masks.hair, masks.width, masks.height, srcW, srcH);
  const skinMask = resampleFloatMask(masks.skin, masks.width, masks.height, srcW, srcH);
  const clothesMask = resampleFloatMask(masks.clothes, masks.width, masks.height, srcW, srcH);

  // 1A. Draw Studio Backdrop onto bgWorkCanvas at exact (srcW x srcH)
  const { canvas: bgWorkCanvas, ctx: bgCtx } = createCleanCanvas(srcW, srcH);
  const [ambR, ambG, ambB] = style.ambientRgb;
  bgCtx.fillStyle = `rgb(${ambR}, ${ambG}, ${ambB})`;
  bgCtx.fillRect(0, 0, srcW, srcH);

  const bgScale =
    Math.max(srcW / backdropImg.naturalWidth, srcH / backdropImg.naturalHeight) *
    style.backdropCropZoom;
  const drawBgW = backdropImg.naturalWidth * bgScale;
  const drawBgH = backdropImg.naturalHeight * bgScale;
  const drawBgX = (srcW - drawBgW) / 2;
  const drawBgY = (srcH - drawBgH) / 2;
  bgCtx.drawImage(backdropImg, drawBgX, drawBgY, drawBgW, drawBgH);

  const bgImageData = bgCtx.getImageData(0, 0, srcW, srcH);
  const bgPx = bgImageData.data;

  // Deterministic CPU bokeh blur (no ctx.filter GPU tile bugs)
  const scaledBlurRadius = Math.round((recipe.backdropBlur * Math.max(srcW, srcH)) / 1280);
  if (scaledBlurRadius > 0) {
    blurRgbaBuffer(bgPx, srcW, srcH, scaledBlurRadius);
  }

  // Uniform tonal grading across entire (srcW x srcH) backdrop plate
  const bgExposureMul = Math.pow(2, recipe.exposure * 0.42);
  const bgContrastFactor = 1 + recipe.contrast * 0.3;
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
  bgCtx.putImageData(bgImageData, 0, 0);

  // 1B. Process Segmented Foreground Subject Layer at exact (srcW x srcH)
  const { canvas: subjectCanvas, ctx: subjectCtx } = createCleanCanvas(srcW, srcH);
  const subjectImageData = subjectCtx.createImageData(srcW, srcH);
  const subPx = subjectImageData.data;

  const [rimR, rimG, rimB] =
    recipe.lightingId === 'golden-rim'
      ? [255, 212, 140]
      : recipe.monochrome
        ? [240, 240, 240]
        : style.rimRgb;

  const exposureMul = Math.pow(2, recipe.exposure * 0.9);
  const contrastFactor = 1 + recipe.contrast * 0.68;
  const satFactor = recipe.monochrome ? 0 : Math.max(0, 1 + recipe.saturation);

  for (let y = 0; y < srcH; y++) {
    const ny = y / Math.max(1, srcH - 1);
    const row = y * srcW;

    for (let x = 0; x < srcW; x++) {
      const mIdx = row + x;
      const pIdx = mIdx * 4;
      const alpha = fgMask[mIdx];

      if (alpha <= 0.004) {
        subPx[pIdx] = 0;
        subPx[pIdx + 1] = 0;
        subPx[pIdx + 2] = 0;
        subPx[pIdx + 3] = 0;
        continue;
      }

      const nx = x / Math.max(1, srcW - 1);
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

      const lum = (0.299 * fr + 0.587 * fg + 0.114 * fb) / 255;
      const shadowBlend = Math.max(0, 1 - lum * 1.5) * 0.08;
      fr = fr * (1 - shadowBlend) + ambR * shadowBlend;
      fg = fg * (1 - shadowBlend) + ambG * shadowBlend;
      fb = fb * (1 - shadowBlend) + ambB * shadowBlend;

      // Edge spill suppression + subtle hair/shoulder studio rim light
      if (alpha < 0.92) {
        const edgeFactor = Math.sin(alpha * Math.PI);
        const decon = (1 - alpha) * 0.3;
        fr = fr * (1 - decon) + bgPx[pIdx] * decon;
        fg = fg * (1 - decon) + bgPx[pIdx + 1] * decon;
        fb = fb * (1 - decon) + bgPx[pIdx + 2] * decon;

        const upperBias = Math.max(0.25, 1.08 - ny * 0.8);
        const rimPower =
          edgeFactor * recipe.rimLight * 0.62 * upperBias * (0.45 + hairWeight * 0.55);

        fr += (rimR - fr) * rimPower * 0.46;
        fg += (rimG - fg) * rimPower * 0.46;
        fb += (rimB - fb) * rimPower * 0.46;
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

      subPx[pIdx] = clampByte(fr);
      subPx[pIdx + 1] = clampByte(fg);
      subPx[pIdx + 2] = clampByte(fb);
      subPx[pIdx + 3] = clampByte(alpha * 255);
    }
  }
  subjectCtx.putImageData(subjectImageData, 0, 0);

  // 1C. Composite Backdrop + Subject cleanly with explicit source-over at exact (srcW x srcH)
  const { canvas: compositeCanvas, ctx: compCtx } = createCleanCanvas(srcW, srcH);
  compCtx.globalCompositeOperation = 'source-over';
  compCtx.globalAlpha = 1;
  compCtx.drawImage(bgWorkCanvas, 0, 0, srcW, srcH);
  compCtx.drawImage(subjectCanvas, 0, 0, srcW, srcH);

  // -------------------------------------------------------------------------
  // STAGE 2: Apply Optical Framing Crop onto Final Output (outW x outH)
  // Using the exact same source crop rectangle for both studio & aligned original
  // -------------------------------------------------------------------------
  const { width: outW, height: outH } = getOutputDimensions(recipe.aspectRatio);
  const outAspect = outW / outH;
  const framingTarget = getFramingTarget(recipe.framingId);

  // Compute maximum crop rectangle inside [0..srcW] x [0..srcH] matching outAspect
  const maxCropH = srcW / outAspect <= srcH ? srcW / outAspect : srcH;
  const maxCropW = maxCropH * outAspect;

  // Target crop height so the subject's face spans framingTarget.targetFaceHeight
  const desiredCropH =
    (anchor.faceHeightRatio * srcH) /
    Math.max(0.12, framingTarget.targetFaceHeight * recipe.zoomAdjust);
  const cropH = Math.max(maxCropH * 0.48, Math.min(maxCropH, desiredCropH));
  const cropW = cropH * outAspect;

  const faceX = anchor.faceCenterX * srcW;
  const faceY = anchor.faceCenterY * srcH;
  const desiredEyeFrac = framingTarget.targetEyeY + recipe.verticalOffset;

  const rawCropX = faceX - cropW * 0.5;
  const rawCropY = faceY - cropH * desiredEyeFrac;
  const cropX = Math.max(0, Math.min(srcW - cropW, rawCropX));
  const cropY = Math.max(0, Math.min(srcH - cropH, rawCropY));

  const { canvas: outCanvas, ctx: outCtx } = createCleanCanvas(outW, outH);
  outCtx.drawImage(compositeCanvas, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

  // Unified optical vignette & subtle analog grain on final framed output (outW x outH)
  if (recipe.vignette > 0.01 || recipe.grain > 0.01) {
    const finalData = outCtx.getImageData(0, 0, outW, outH);
    const px = finalData.data;
    const grainAmp = recipe.grain * 18;
    let seed = 133791;
    const nextNoise = (): number => {
      seed = (seed * 1664525 + 1013904223) | 0;
      return ((seed >>> 24) / 255 - 0.5) * 2;
    };

    for (let y = 0; y < outH; y++) {
      const vy = (y / outH - 0.45) * 1.3;
      const vySq = vy * vy;
      const row = y * outW;

      for (let x = 0; x < outW; x++) {
        const idx = (row + x) * 4;
        let r = px[idx];
        let g = px[idx + 1];
        let b = px[idx + 2];

        if (recipe.vignette > 0.01) {
          const vx = (x / outW - 0.5) * 1.4;
          const vig = 1 - Math.min(0.5, (vx * vx + vySq) * recipe.vignette * 0.38);
          r *= vig;
          g *= vig;
          b *= vig;
        }

        if (grainAmp > 0.3) {
          const n = nextNoise() * grainAmp;
          r += n;
          g += n;
          b += n;
        }

        px[idx] = clampByte(r);
        px[idx + 1] = clampByte(g);
        px[idx + 2] = clampByte(b);
        px[idx + 3] = 255;
      }
    }
    outCtx.putImageData(finalData, 0, 0);
  }

  // Produce pixel-aligned original crop with the exact same (cropX, cropY, cropW, cropH)
  const { canvas: alignedCanvas, ctx: alignedCtx } = createCleanCanvas(outW, outH);
  alignedCtx.drawImage(srcCanvas, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

  return {
    imageUrl: outCanvas.toDataURL('image/png'),
    alignedSourceUrl: alignedCanvas.toDataURL('image/jpeg', 0.92),
  };
}
