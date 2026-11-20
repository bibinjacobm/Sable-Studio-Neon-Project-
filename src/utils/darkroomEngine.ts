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
  // 2. Same-origin bundled 244KB neural selfie segmenter (always available in static builds!)
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

    for (const wasmPath of wasmPaths) {
      for (const delegate of ['GPU', 'CPU'] as const) {
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
      const dxH = (x - cx) / (headR * 0.92);
      const dyH = (y - cy) / (headR * 1.18);
      const dHead = Math.sqrt(dxH * dxH + dyH * dyH);

      const dyS = (y - (cy + headR * 1.85)) / (headR * 1.55);
      const dxS = (x - cx) / (headR * 2.15);
      const dShoulders = Math.sqrt(dxS * dxS + dyS * dyS);

      const d = Math.min(dHead, dShoulders);
      const fg = Math.max(0, Math.min(1, 1 - (d - 0.88) / 0.35));
      foreground[idx] = fg;

      if (dHead < 0.95) {
        skin[idx] = fg * 0.85;
      }
      if (dHead < 1.1 && y < cy - headR * 0.15) {
        hair[idx] = fg * 0.7;
      }
      if (y > cy + headR * 1.05 && dShoulders < 1.05) {
        clothes[idx] = fg * 0.85;
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
  const width = img.naturalWidth;
  const height = img.naturalHeight;

  const segmenter = await getSegmenter();
  if (!segmenter) {
    return buildFallbackPortraitMask(width, height, anchor);
  }

  try {
    const result = segmenter.segment(img);
    const masks = result.confidenceMasks ?? [];
    if (masks.length === 0) {
      result.close();
      return buildFallbackPortraitMask(width, height, anchor);
    }

    const maskW = masks[0].width;
    const maskH = masks[0].height;
    const len = maskW * maskH;

    let foreground: Float32Array;
    const hair = new Float32Array(len);
    const skin = new Float32Array(len);
    const clothes = new Float32Array(len);
    let isMulticlass = false;

    if (masks.length >= 5) {
      // MediaPipe selfie_multiclass_256x256:
      // 0: background, 1: hair, 2: body-skin, 3: face-skin, 4: clothes, 5: others
      isMulticlass = true;
      const bg = masks[0].getAsFloat32Array();
      const hairArr = masks[1].getAsFloat32Array();
      const bodySkinArr = masks[2].getAsFloat32Array();
      const faceSkinArr = masks[3].getAsFloat32Array();
      const clothesArr = masks[4].getAsFloat32Array();

      foreground = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const rawFg = 1 - bg[i];
        foreground[i] = Math.max(0, Math.min(1, (rawFg - 0.12) / 0.76));
        hair[i] = hairArr[i];
        skin[i] = Math.min(1, bodySkinArr[i] + faceSkinArr[i]);
        clothes[i] = clothesArr[i];
      }
    } else {
      // Binary selfie_segmenter.tflite: smooth neural person silhouette + anatomical zone weights
      const fgArr = masks[masks.length - 1].getAsFloat32Array();
      foreground = new Float32Array(len);
      const neckY = Math.min(0.85, anchor.faceCenterY + anchor.faceHeightRatio * 0.68);
      const crownY = Math.max(0.05, anchor.faceCenterY - anchor.faceHeightRatio * 0.2);

      for (let y = 0; y < maskH; y++) {
        const ny = y / Math.max(1, maskH - 1);
        for (let x = 0; x < maskW; x++) {
          const i = y * maskW + x;
          const fg = Math.max(0, Math.min(1, (fgArr[i] - 0.14) / 0.72));
          foreground[i] = fg;
          if (fg > 0.05) {
            if (ny < crownY) {
              hair[i] = fg * 0.85;
            } else if (ny < neckY) {
              skin[i] = fg * 0.85;
            } else {
              // Smooth transition below neckline for attire tone styling
              const t = Math.min(1, (ny - neckY) / 0.08);
              clothes[i] = fg * t;
              skin[i] = fg * (1 - t) * 0.6;
            }
          }
        }
      }
    }

    result.close();

    const featheredFg = blurFloatMask(
      foreground,
      maskW,
      maskH,
      Math.max(1, Math.round(maskW / 320))
    );

    return {
      width: maskW,
      height: maskH,
      isMulticlass,
      foreground: featheredFg,
      hair,
      skin,
      clothes,
    };
  } catch {
    return buildFallbackPortraitMask(width, height, anchor);
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

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function applyAttireStyling(
  r: number,
  g: number,
  b: number,
  attireId: AttireId,
  strength: number
): [number, number, number] {
  if (attireId === 'keep-original' || strength <= 0.02) {
    return [r, g, b];
  }

  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  let tr = r;
  let tg = g;
  let tb = b;

  switch (attireId) {
    case 'charcoal-blazer': {
      const mapped = 26 + Math.pow(lum, 1.15) * 90;
      tr = mapped * 0.96;
      tg = mapped * 0.98;
      tb = mapped * 1.03;
      break;
    }
    case 'crisp-oxford': {
      const mapped = 152 + Math.pow(lum, 0.72) * 94;
      tr = mapped * 1.01;
      tg = mapped * 1.0;
      tb = mapped * 0.97;
      break;
    }
    case 'black-turtleneck': {
      const mapped = 16 + Math.pow(lum, 1.32) * 56;
      tr = mapped;
      tg = mapped;
      tb = mapped * 1.02;
      break;
    }
    case 'smart-knit': {
      const mapped = 20 + Math.pow(lum, 1.14) * 94;
      tr = mapped * 0.62;
      tg = mapped * 0.76;
      tb = mapped * 1.18;
      break;
    }
  }

  const blend = Math.min(0.84, strength * 0.84);
  return [
    r * (1 - blend) + tr * blend,
    g * (1 - blend) + tg * blend,
    b * (1 - blend) + tb * blend,
  ];
}

/**
 * Refined, cohesive studio illumination across the entire portrait.
 * Keeps lighting natural and balanced (never darkening half the image into a harsh two-tone split).
 */
function computeKeyLightMultiplier(
  nx: number,
  ny: number,
  lightingId: LightingId,
  strength: number
): number {
  const s = strength * 0.16;
  let delta = 0;

  switch (lightingId) {
    case 'rembrandt': {
      // Gentle sculptural modeling from upper-left with generous soft fill on shadow side
      const dist = Math.hypot((nx - 0.42) * 0.9, (ny - 0.34) * 0.9);
      delta = s * (0.28 - dist * 0.42 + (0.5 - nx) * 0.14);
      break;
    }
    case 'golden-rim': {
      // Soft luminous wraparound warmth
      const dist = Math.hypot((nx - 0.54) * 0.85, (ny - 0.34) * 0.85);
      delta = s * (0.26 - dist * 0.34);
      break;
    }
    case 'diffused-window': {
      // Broad, even north-window softness
      const dist = Math.hypot((nx - 0.46) * 0.8, (ny - 0.36) * 0.8);
      delta = s * (0.22 - dist * 0.28 + (0.5 - nx) * 0.1);
      break;
    }
    case 'softbox-key':
    default: {
      // Large feathered centered studio octabox
      const dist = Math.hypot((nx - 0.5) * 0.9, (ny - 0.35) * 0.85);
      delta = s * (0.28 - dist * 0.38);
      break;
    }
  }

  // Strictly bound optical lift/falloff so brightness remains harmonious across the whole frame
  return Math.max(0.93, Math.min(1.1, 1 + delta));
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

  const { width: outW, height: outH } = getOutputDimensions(recipe.aspectRatio);
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  // 1. Render Studio Backdrop Plate with Optical Bokeh Blur & Center Zoom
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = outW;
  bgCanvas.height = outH;
  const bgCtx = bgCanvas.getContext('2d', { willReadFrequently: true });
  if (!bgCtx) throw new Error('Backdrop canvas unavailable.');

  const bgScaleBase = Math.max(outW / backdropImg.naturalWidth, outH / backdropImg.naturalHeight);
  const bgScale = bgScaleBase * style.backdropCropZoom;
  const drawBgW = backdropImg.naturalWidth * bgScale;
  const drawBgH = backdropImg.naturalHeight * bgScale;
  const drawBgX = (outW - drawBgW) / 2;
  const drawBgY = (outH - drawBgH) / 2;

  const blurPx = Math.max(0, Math.round(recipe.backdropBlur));
  const bgBrightness = 1 + recipe.exposure * 0.4;
  const bgContrast = 1 + recipe.contrast * 0.3;
  const bgSat = recipe.monochrome ? 0 : Math.max(0, 1 + recipe.saturation * 0.5);
  bgCtx.filter = `blur(${blurPx}px) brightness(${bgBrightness.toFixed(2)}) contrast(${bgContrast.toFixed(2)}) saturate(${bgSat.toFixed(2)})`;
  const pad = blurPx * 2;
  bgCtx.drawImage(
    backdropImg,
    drawBgX - pad,
    drawBgY - pad,
    drawBgW + pad * 2,
    drawBgH + pad * 2
  );
  bgCtx.filter = 'none';

  if (!recipe.monochrome && Math.abs(recipe.warmth) > 0.02) {
    bgCtx.fillStyle =
      recipe.warmth > 0
        ? `rgba(255, 198, 130, ${(recipe.warmth * 0.14).toFixed(3)})`
        : `rgba(140, 185, 255, ${(Math.abs(recipe.warmth) * 0.14).toFixed(3)})`;
    bgCtx.fillRect(0, 0, outW, outH);
  }

  const bgData = bgCtx.getImageData(0, 0, outW, outH);

  // 2. Compute Optical Framing Transform (Center Face on Studio Rule-of-Thirds)
  const srcW = sourceImg.naturalWidth;
  const srcH = sourceImg.naturalHeight;
  const framingTarget = getFramingTarget(recipe.framingId);

  const desiredScale =
    ((framingTarget.targetFaceHeight * outH) / Math.max(1, anchor.faceHeightRatio * srcH)) *
    recipe.zoomAdjust;
  const minCoverScale = Math.max(outW / srcW, outH / srcH);
  const scale = Math.max(minCoverScale * 0.96, Math.min(minCoverScale * 2.15, desiredScale));

  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const targetFaceY = (framingTarget.targetEyeY + recipe.verticalOffset) * outH;
  let drawX = outW * 0.5 - anchor.faceCenterX * drawW;
  let drawY = targetFaceY - anchor.faceCenterY * drawH;

  if (drawY + drawH < outH) drawY = outH - drawH;
  if (drawY > 0) drawY = 0;
  if (drawX > 0) drawX = 0;
  if (drawX + drawW < outW) drawX = outW - drawW;

  // Draw aligned source selfie (also exported as alignedSourceUrl for pixel-accurate Split Compare!)
  const fgCanvas = document.createElement('canvas');
  fgCanvas.width = outW;
  fgCanvas.height = outH;
  const fgCtx = fgCanvas.getContext('2d', { willReadFrequently: true });
  if (!fgCtx) throw new Error('Foreground canvas unavailable.');
  fgCtx.drawImage(sourceImg, drawX, drawY, drawW, drawH);
  const alignedSourceUrl = fgCanvas.toDataURL('image/jpeg', 0.92);
  const fgData = fgCtx.getImageData(0, 0, outW, outH);

  // 3. Pixel-Level Darkroom Compositing, Relighting, Attire & Rim Light
  const outImage = ctx.createImageData(outW, outH);
  const out = outImage.data;
  const fgPx = fgData.data;
  const bgPx = bgData.data;

  const maskW = masks.width;
  const maskH = masks.height;
  const [ambR, ambG, ambB] = style.ambientRgb;
  const [rimR, rimG, rimB] =
    recipe.lightingId === 'golden-rim'
      ? [255, 212, 140]
      : recipe.monochrome
        ? [240, 240, 240]
        : style.rimRgb;

  const exposureMul = Math.pow(2, recipe.exposure * 0.9);
  const contrastFactor = 1 + recipe.contrast * 0.72;
  const satFactor = recipe.monochrome ? 0 : Math.max(0, 1 + recipe.saturation);
  const grainAmp = recipe.grain * 22;

  const sampleMask = (arr: Float32Array, sx: number, sy: number): number => {
    const mx = sx * (maskW - 1);
    const my = sy * (maskH - 1);
    const x0 = Math.max(0, Math.min(maskW - 1, Math.floor(mx)));
    const y0 = Math.max(0, Math.min(maskH - 1, Math.floor(my)));
    const x1 = Math.min(maskW - 1, x0 + 1);
    const y1 = Math.min(maskH - 1, y0 + 1);
    const fx = mx - x0;
    const fy = my - y0;
    const v00 = arr[y0 * maskW + x0];
    const v10 = arr[y0 * maskW + x1];
    const v01 = arr[y1 * maskW + x0];
    const v11 = arr[y1 * maskW + x1];
    return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
  };

  let seed = 133791;
  const nextNoise = (): number => {
    seed = (seed * 1664525 + 1013904223) | 0;
    return ((seed >>> 24) / 255 - 0.5) * 2;
  };

  for (let y = 0; y < outH; y++) {
    const ny = y / outH;
    const sy = (y - drawY) / drawH;
    const inY = sy >= 0 && sy <= 1;

    for (let x = 0; x < outW; x++) {
      const idx = (y * outW + x) * 4;
      const nx = x / outW;
      const sx = (x - drawX) / drawW;

      const br = bgPx[idx];
      const bg = bgPx[idx + 1];
      const bb = bgPx[idx + 2];

      let fr = br;
      let fg = bg;
      let fb = bb;
      let alpha = 0;

      if (inY && sx >= 0 && sx <= 1) {
        alpha = sampleMask(masks.foreground, sx, sy);

        if (alpha > 0.01) {
          fr = fgPx[idx];
          fg = fgPx[idx + 1];
          fb = fgPx[idx + 2];

          const clothesWeight = sampleMask(masks.clothes, sx, sy);
          const hairWeight = sampleMask(masks.hair, sx, sy);
          const skinWeight = sampleMask(masks.skin, sx, sy);

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
            const wShift = recipe.warmth * 26;
            fr += wShift;
            fg += wShift * 0.25;
            fb -= wShift * 0.88;
          }

          const localContrast = skinWeight > 0.3 ? 1 + (contrastFactor - 1) * 0.68 : contrastFactor;
          fr = (fr - 128) * localContrast + 128;
          fg = (fg - 128) * localContrast + 128;
          fb = (fb - 128) * localContrast + 128;

          const lum = (0.299 * fr + 0.587 * fg + 0.114 * fb) / 255;
          const shadowBlend = Math.max(0, 1 - lum * 1.45) * 0.09;
          fr = fr * (1 - shadowBlend) + ambR * shadowBlend;
          fg = fg * (1 - shadowBlend) + ambG * shadowBlend;
          fb = fb * (1 - shadowBlend) + ambB * shadowBlend;

          if (alpha < 0.92) {
            const edgeFactor = Math.sin(alpha * Math.PI);
            const decon = (1 - alpha) * 0.32;
            fr = fr * (1 - decon) + br * decon;
            fg = fg * (1 - decon) + bg * decon;
            fb = fb * (1 - decon) + bb * decon;

            const upperBias = Math.max(0.2, 1.1 - ny * 0.85);
            const rimPower =
              edgeFactor *
              recipe.rimLight *
              0.7 *
              upperBias *
              (0.45 + hairWeight * 0.6);

            fr += (rimR - fr) * rimPower * 0.52;
            fg += (rimG - fg) * rimPower * 0.52;
            fb += (rimB - fb) * rimPower * 0.52;
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
        }
      }

      let r = fr * alpha + br * (1 - alpha);
      let g = fg * alpha + bg * (1 - alpha);
      let b = fb * alpha + bb * (1 - alpha);

      if (recipe.vignette > 0.01) {
        const vx = (nx - 0.5) * 1.42;
        const vy = (ny - 0.45) * 1.32;
        const distSq = vx * vx + vy * vy;
        const vig = 1 - Math.min(0.65, distSq * recipe.vignette * 0.48);
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

      out[idx] = clampByte(r);
      out[idx + 1] = clampByte(g);
      out[idx + 2] = clampByte(b);
      out[idx + 3] = 255;
    }
  }

  ctx.putImageData(outImage, 0, 0);
  return {
    imageUrl: canvas.toDataURL('image/png'),
    alignedSourceUrl,
  };
}
