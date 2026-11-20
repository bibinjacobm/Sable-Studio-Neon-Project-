import type {
  AdvancedLightingPresetId,
  FramingAnchor,
  LightingId,
} from '../data/studioCatalog';

export type LightingQualityRating = 'Low' | 'Med' | 'High';

export interface LightingQualityReport {
  rating: LightingQualityRating;
  score: number;
  dynamicRangeScore: number;
  dynamicRangeLabel: 'Compressed' | 'Balanced' | 'Wide';
  shadowHarshnessScore: number;
  shadowHarshnessLabel: 'Soft' | 'Moderate' | 'Harsh';
  clippedPercent: number;
  correctionLevel: 'Minimal correction' | 'Moderate correction' | 'Heavy correction';
  correctionGuidance: string;
  recommendedLightingId: LightingId;
  recommendedAdvancedPreset: AdvancedLightingPresetId;
  recommendedPresetLabel: string;
  usedFaceRegion: boolean;
  /** 48 smoothed, normalized (0..1) luminance intensity distribution bins from black (0) to white (255) */
  histogramBins: number[];
  /** 48 exact pixel-percentage shares (0..100, 1 decimal) corresponding to each luminance bin */
  histogramBinPercents: number[];
  shadowPercent: number;
  midtonePercent: number;
  highlightPercent: number;
  p02Percent: number;
  p98Percent: number;
  meanLuminancePercent: number;
  /** Detected light-source clock/azimuth angle in degrees (0=top, 90=camera-right, 180=bottom, 270=camera-left) */
  lightAngleDeg: number;
  /** Strength of directional lighting vs flat/even illumination (0..1) */
  lightDirectionStrength: number;
  /** Human-readable orientation of detected source light */
  lightOrientationLabel: string;
}

export interface LightingCompassAlignment {
  detectedAngleDeg: number;
  targetAngleDeg: number;
  deltaDeg: number;
  absDeltaDeg: number;
  isEvenlyLit: boolean;
  matchStatus: 'Aligned' | 'Minor Offset' | 'Cross-Lit';
  detectedLabel: string;
  targetLabel: string;
  shortAdjustment: string;
  detailedSuggestion: string;
}

export interface LightingHeatmapAnalysis {
  overlayDataUrl: string;
  shadowPercent: number;
  midtonePercent: number;
  highlightPercent: number;
  keyBias: 'left' | 'right' | 'balanced';
  contrastLabel: 'Soft / Flat' | 'Balanced' | 'High Contrast';
  exposureSummary: string;
}

const MAX_HEATMAP_DIMENSION = 640;
const MAX_QUALITY_DIMENSION = 160;
const MAX_CACHE_ENTRIES = 12;
const heatmapCache = new Map<string, LightingHeatmapAnalysis>();
const qualityCache = new Map<string, LightingQualityReport>();

interface ColorStop {
  pos: number;
  rgb: [number, number, number];
}

// Perceptual studio false-color exposure ramp:
// Deep Shadow (Indigo) -> Shadow (Cobalt) -> Balanced Midtone (Teal/Emerald) -> Bright Key (Brass/Amber) -> Peak Highlight (Coral/Crimson)
const FALSE_COLOR_STOPS: ColorStop[] = [
  { pos: 0.0, rgb: [24, 34, 96] },
  { pos: 0.18, rgb: [40, 78, 168] },
  { pos: 0.36, rgb: [46, 144, 166] },
  { pos: 0.54, rgb: [78, 166, 124] },
  { pos: 0.72, rgb: [212, 168, 83] },
  { pos: 0.88, rgb: [232, 114, 54] },
  { pos: 1.0, rgb: [224, 58, 58] },
];

function sampleFalseColor(normLum: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, normLum));
  for (let i = 0; i < FALSE_COLOR_STOPS.length - 1; i++) {
    const a = FALSE_COLOR_STOPS[i];
    const b = FALSE_COLOR_STOPS[i + 1];
    if (t >= a.pos && t <= b.pos) {
      const local = (t - a.pos) / Math.max(0.0001, b.pos - a.pos);
      return [
        Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * local),
        Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * local),
        Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * local),
      ];
    }
  }
  return FALSE_COLOR_STOPS[FALSE_COLOR_STOPS.length - 1].rgb;
}

/**
 * Generates a studio false-color exposure heat-map overlay for a source portrait,
 * visualizing luminance intensity, shadow distribution, directional key bias, and tonal spread.
 */
export async function generateLightingHeatmap(
  sourceDataUrl: string
): Promise<LightingHeatmapAnalysis> {
  const cached = heatmapCache.get(sourceDataUrl);
  if (cached) {
    return cached;
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Unable to analyze source image for lighting heat-map.'));
    el.src = sourceDataUrl;
  });

  const srcW = Math.max(1, img.naturalWidth || img.width);
  const srcH = Math.max(1, img.naturalHeight || img.height);
  const scale = Math.min(1, MAX_HEATMAP_DIMENSION / Math.max(srcW, srcH));
  const width = Math.max(64, Math.round(srcW * scale));
  const height = Math.max(64, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable for lighting heat-map.');
  }

  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const totalPixels = width * height;

  // Store normalized luminance for smooth contour detection & photometric stats
  const lumField = new Float32Array(totalPixels);

  let shadowCount = 0;
  let midtoneCount = 0;
  let highlightCount = 0;
  let sumLum = 0;
  let sumLumSq = 0;

  // Measure left vs right lighting balance across the central portrait region
  let leftSum = 0;
  let leftCount = 0;
  let rightSum = 0;
  let rightCount = 0;
  let centerSum = 0;
  let centerCount = 0;

  const xMin = Math.floor(width * 0.22);
  const xMid = Math.floor(width * 0.5);
  const xMax = Math.ceil(width * 0.78);
  const yMin = Math.floor(height * 0.14);
  const yMax = Math.ceil(height * 0.7);

  for (let y = 0; y < height; y++) {
    const inPortraitY = y >= yMin && y <= yMax;
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = (rowOffset + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const normLum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

      lumField[rowOffset + x] = normLum;
      sumLum += normLum;
      sumLumSq += normLum * normLum;

      if (normLum < 0.3) {
        shadowCount += 1;
      } else if (normLum > 0.72) {
        highlightCount += 1;
      } else {
        midtoneCount += 1;
      }

      if (inPortraitY && x >= xMin && x <= xMax) {
        centerSum += normLum;
        centerCount += 1;
        if (x < xMid) {
          leftSum += normLum;
          leftCount += 1;
        } else {
          rightSum += normLum;
          rightCount += 1;
        }
      }
    }
  }

  // Render false-color exposure zones with subtle topographic iso-luminance contours
  const outImage = ctx.createImageData(width, height);
  const out = outImage.data;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    const nextRow = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x++) {
      const pIdx = rowOffset + x;
      const normLum = lumField[pIdx];
      const [cr, cg, cb] = sampleFalseColor(normLum);

      // Subtle exposure-zone contour lines at 20%, 40%, 60%, 80% luminance
      const band = Math.floor(normLum * 5);
      const rightBand = Math.floor(lumField[rowOffset + Math.min(width - 1, x + 1)] * 5);
      const downBand = Math.floor(lumField[nextRow + x] * 5);
      const isContour = band !== rightBand || band !== downBand;

      const idx = pIdx * 4;
      if (isContour) {
        out[idx] = Math.min(255, Math.round(cr * 0.72 + 72));
        out[idx + 1] = Math.min(255, Math.round(cg * 0.72 + 72));
        out[idx + 2] = Math.min(255, Math.round(cb * 0.72 + 68));
        out[idx + 3] = 210;
      } else {
        out[idx] = cr;
        out[idx + 1] = cg;
        out[idx + 2] = cb;
        // Slightly stronger opacity on extreme shadows/highlights to spotlight problem zones
        const extremity = Math.abs(normLum - 0.5) * 2;
        out[idx + 3] = Math.round(148 + extremity * 56);
      }
    }
  }

  ctx.putImageData(outImage, 0, 0);
  const overlayDataUrl = canvas.toDataURL('image/png');

  const meanLum = sumLum / Math.max(1, totalPixels);
  const variance = Math.max(0, sumLumSq / Math.max(1, totalPixels) - meanLum * meanLum);
  const stdDev = Math.sqrt(variance);
  const centerMean = centerCount > 0 ? centerSum / centerCount : meanLum;
  const leftMean = leftCount > 0 ? leftSum / leftCount : centerMean;
  const rightMean = rightCount > 0 ? rightSum / rightCount : centerMean;
  const sideDelta = leftMean - rightMean;

  const keyBias: 'left' | 'right' | 'balanced' =
    sideDelta > 0.055 ? 'left' : sideDelta < -0.055 ? 'right' : 'balanced';

  const contrastLabel: 'Soft / Flat' | 'Balanced' | 'High Contrast' =
    stdDev < 0.16 ? 'Soft / Flat' : stdDev > 0.27 ? 'High Contrast' : 'Balanced';

  const shadowPercent = Math.round((shadowCount / Math.max(1, totalPixels)) * 100);
  const highlightPercent = Math.round((highlightCount / Math.max(1, totalPixels)) * 100);
  const midtonePercent = Math.max(0, 100 - shadowPercent - highlightPercent);

  let exposureSummary =
    'Evenly distributed facial midtones with gentle shadow falloff—ideal for natural daylight or studio fill.';
  if (centerMean < 0.4) {
    exposureSummary =
      'Deep shadow density across facial midtones—Softbox Studio Key or exposure lift will brighten features evenly.';
  } else if (centerMean > 0.68 || highlightPercent > 28) {
    exposureSummary =
      'Strong bright highlight zones detected—balanced studio contrast and controlled backdrop luminance preserve detail.';
  } else if (keyBias !== 'balanced') {
    exposureSummary = `Directional key falls stronger from the ${keyBias} side—studio fill light or Rembrandt sculpting will balance shadow falloff.`;
  } else if (contrastLabel === 'Soft / Flat') {
    exposureSummary =
      'Low ambient contrast spread—Rembrandt lighting or Editorial Monochrome adds crisp dimensional modeling.';
  }

  const analysis: LightingHeatmapAnalysis = {
    overlayDataUrl,
    shadowPercent,
    midtonePercent,
    highlightPercent,
    keyBias,
    contrastLabel,
    exposureSummary,
  };

  if (heatmapCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = heatmapCache.keys().next().value;
    if (oldestKey) {
      heatmapCache.delete(oldestKey);
    }
  }
  heatmapCache.set(sourceDataUrl, analysis);

  return analysis;
}

/**
 * Fast photometric analyzer (<10ms on a 160px canvas) evaluating an input selfie's
 * usable dynamic range, highlight/shadow clipping, and face-anchored shadow-edge harshness
 * to produce a Low / Med / High Lighting Quality rating and actionable studio correction guidance.
 */
export async function analyzeLightingQuality(
  sourceDataUrl: string,
  anchor?: FramingAnchor | null
): Promise<LightingQualityReport> {
  const anchorKey = anchor
    ? `${anchor.faceCenterX.toFixed(2)}:${anchor.faceCenterY.toFixed(2)}:${anchor.faceHeightRatio.toFixed(2)}`
    : 'default';
  const cacheKey = `${sourceDataUrl}|${anchorKey}`;
  const cached = qualityCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Unable to analyze input selfie lighting quality.'));
    el.src = sourceDataUrl;
  });

  const srcW = Math.max(1, img.naturalWidth || img.width);
  const srcH = Math.max(1, img.naturalHeight || img.height);
  const scale = Math.min(1, MAX_QUALITY_DIMENSION / Math.max(srcW, srcH));
  const width = Math.max(48, Math.round(srcW * scale));
  const height = Math.max(48, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable for lighting quality analysis.');
  }

  ctx.drawImage(img, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const totalPixels = width * height;

  const lum = new Float32Array(totalPixels);
  const hist = new Uint32Array(256);

  let blackClipCount = 0;
  let whiteClipCount = 0;

  // Use detected facial alignment region when available for tighter shadow-harshness accuracy
  const usedFaceRegion = Boolean(anchor);
  let xMin = Math.floor(width * 0.22);
  let xMid = Math.floor(width * 0.5);
  let xMax = Math.ceil(width * 0.78);
  let yMin = Math.floor(height * 0.14);
  let yMax = Math.ceil(height * 0.72);

  if (anchor) {
    const faceH = Math.max(0.18, Math.min(0.68, anchor.faceHeightRatio)) * height;
    const faceW = Math.min(width * 0.72, faceH * 0.85);
    const cx = Math.max(0.15, Math.min(0.85, anchor.faceCenterX)) * width;
    const cy = Math.max(0.15, Math.min(0.85, anchor.faceCenterY)) * height;
    xMin = Math.max(2, Math.floor(cx - faceW * 0.55));
    xMax = Math.min(width - 2, Math.ceil(cx + faceW * 0.55));
    xMid = Math.round(Math.max(xMin + 1, Math.min(xMax - 1, cx)));
    yMin = Math.max(2, Math.floor(cy - faceH * 0.58));
    yMax = Math.min(height - 2, Math.ceil(cy + faceH * 0.58));
  }

  let faceLumSum = 0;
  let faceCount = 0;
  let faceDeepShadowCount = 0;
  let leftSum = 0;
  let leftCount = 0;
  let rightSum = 0;
  let rightCount = 0;
  let totalLumSum = 0;
  let shadowCount = 0;
  let highlightCount = 0;

  // Weighted directional luminance moments inside face region for 2D light-source orientation
  const faceCenterPxX = (xMin + xMax) * 0.5;
  const faceCenterPxY = (yMin + yMax) * 0.5;
  const faceHalfW = Math.max(1, (xMax - xMin) * 0.5);
  const faceHalfH = Math.max(1, (yMax - yMin) * 0.5);
  let dirMomentX = 0;
  let dirMomentY = 0;
  let dirWeightSum = 0;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    const inFaceY = y >= yMin && y <= yMax;
    for (let x = 0; x < width; x++) {
      const idx = (row + x) * 4;
      const l = (0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2]) / 255;
      lum[row + x] = l;
      totalLumSum += l;
      const bin = Math.max(0, Math.min(255, Math.round(l * 255)));
      hist[bin] += 1;

      if (l < 0.04) blackClipCount += 1;
      if (l > 0.96) whiteClipCount += 1;
      if (l < 0.3) shadowCount += 1;
      else if (l > 0.72) highlightCount += 1;

      if (inFaceY && x >= xMin && x <= xMax) {
        faceLumSum += l;
        faceCount += 1;
        if (l < 0.22) faceDeepShadowCount += 1;
        if (x < xMid) {
          leftSum += l;
          leftCount += 1;
        } else {
          rightSum += l;
          rightCount += 1;
        }

        const nx = (x - faceCenterPxX) / faceHalfW;
        const ny = (y - faceCenterPxY) / faceHalfH;
        // Circular portrait weighting emphasizes cheeks, forehead & jawline over background corners
        if (nx * nx + ny * ny <= 1.05) {
          const w = Math.pow(Math.max(0.02, l), 1.6);
          dirMomentX += nx * w;
          dirMomentY += ny * w;
          dirWeightSum += w;
        }
      }
    }
  }

  // 1. Dynamic Range: usable 2nd-to-98th percentile tonal span minus clipping penalty
  const targetLow = totalPixels * 0.02;
  const targetHigh = totalPixels * 0.98;
  let cumulative = 0;
  let p02 = 0;
  let p98 = 1;
  let foundLow = false;

  for (let b = 0; b < 256; b++) {
    cumulative += hist[b];
    if (!foundLow && cumulative >= targetLow) {
      p02 = b / 255;
      foundLow = true;
    }
    if (cumulative >= targetHigh) {
      p98 = b / 255;
      break;
    }
  }

  const usableSpan = Math.max(0, p98 - p02);
  const blackClipFrac = blackClipCount / Math.max(1, totalPixels);
  const whiteClipFrac = whiteClipCount / Math.max(1, totalPixels);
  const clippedFrac = blackClipFrac + whiteClipFrac;

  // Ideal usable span sits around 0.62 - 0.88 without heavy clipping
  let spanQuality = 1;
  if (usableSpan < 0.62) {
    spanQuality = Math.max(0.2, usableSpan / 0.62);
  } else if (usableSpan > 0.92) {
    spanQuality = Math.max(0.65, 1 - (usableSpan - 0.92) * 3.5);
  }
  const clipPenalty = Math.min(0.65, blackClipFrac * 2.1 + whiteClipFrac * 2.5);
  const dynamicRangeScore = Math.round(
    Math.max(12, Math.min(100, (spanQuality - clipPenalty) * 100))
  );
  const dynamicRangeLabel: LightingQualityReport['dynamicRangeLabel'] =
    dynamicRangeScore >= 72 ? 'Wide' : dynamicRangeScore >= 50 ? 'Balanced' : 'Compressed';

  // 2. Shadow Harshness: steepness of shadow-transition edges + side-to-side lighting asymmetry
  let shadowGradSum = 0;
  let shadowGradCount = 0;
  let steepEdgeCount = 0;

  for (let y = Math.max(1, yMin); y < Math.min(height - 1, yMax); y++) {
    const row = y * width;
    for (let x = Math.max(1, xMin); x < Math.min(width - 1, xMax); x++) {
      const l = lum[row + x];
      if (l < 0.5) {
        const dx = Math.abs(lum[row + x + 1] - lum[row + x - 1]) * 0.5;
        const dy = Math.abs(lum[(y + 1) * width + x] - lum[(y - 1) * width + x]) * 0.5;
        const grad = Math.hypot(dx, dy);
        shadowGradSum += grad;
        shadowGradCount += 1;
        if (grad > 0.11) {
          steepEdgeCount += 1;
        }
      }
    }
  }

  const avgShadowGrad = shadowGradCount > 0 ? shadowGradSum / shadowGradCount : 0.03;
  const steepEdgeFrac = shadowGradCount > 0 ? steepEdgeCount / shadowGradCount : 0;
  const faceMean = faceCount > 0 ? faceLumSum / faceCount : 0.5;
  const faceDeepShadowFrac = faceCount > 0 ? faceDeepShadowCount / faceCount : 0;
  const leftMean = leftCount > 0 ? leftSum / leftCount : faceMean;
  const rightMean = rightCount > 0 ? rightSum / rightCount : faceMean;
  const sideAsymmetry = Math.abs(leftMean - rightMean);

  const edgeHarshness =
    Math.min(1, avgShadowGrad / 0.12) * 0.45 + Math.min(1, steepEdgeFrac / 0.28) * 0.25;
  const imbalanceHarshness =
    Math.min(1, sideAsymmetry / 0.18) * 0.18 + Math.min(1, faceDeepShadowFrac / 0.35) * 0.12;
  const shadowHarshnessScore = Math.round(
    Math.max(5, Math.min(100, (edgeHarshness + imbalanceHarshness) * 100))
  );

  const shadowHarshnessLabel: 'Soft' | 'Moderate' | 'Harsh' =
    shadowHarshnessScore <= 34 ? 'Soft' : shadowHarshnessScore <= 62 ? 'Moderate' : 'Harsh';

  // 3. Facial midtone exposure balance (ideal faceMean around 0.54)
  const exposureOffset = Math.abs(faceMean - 0.54);
  const exposureBalanceScore = Math.round(
    Math.max(15, Math.min(100, (1 - exposureOffset / 0.38) * 100))
  );

  const score = Math.round(
    dynamicRangeScore * 0.42 + (100 - shadowHarshnessScore) * 0.38 + exposureBalanceScore * 0.2
  );

  let rating: LightingQualityRating = 'Med';
  if (score >= 70 && shadowHarshnessScore <= 46 && dynamicRangeScore >= 60) {
    rating = 'High';
  } else if (score < 48 || shadowHarshnessScore >= 72 || dynamicRangeScore < 40) {
    rating = 'Low';
  }

  let correctionLevel: LightingQualityReport['correctionLevel'] = 'Moderate correction';
  let correctionGuidance =
    'Moderate tonal imbalance — Softbox Studio Key or Diffused Window lighting will smooth facial contrast.';
  let recommendedLightingId: LightingId = 'softbox-key';
  let recommendedAdvancedPreset: AdvancedLightingPresetId = 'none';
  let recommendedPresetLabel = 'Softbox Key';

  if (rating === 'High') {
    correctionLevel = 'Minimal correction';
    recommendedLightingId = 'diffused-window';
    recommendedAdvancedPreset = 'none';
    recommendedPresetLabel = 'Diffused Window';
    correctionGuidance =
      'Well-balanced dynamic range and soft shadow rolloff — subtle key fill and backdrop separation will look natural.';
  } else if (rating === 'Low') {
    correctionLevel = 'Heavy correction';
    if (shadowHarshnessScore >= 65) {
      recommendedLightingId = 'diffused-window';
      recommendedAdvancedPreset = 'soft-diffused';
      recommendedPresetLabel = 'Soft Diffused';
      correctionGuidance =
        'Harsh shadow transitions detected — apply Soft Diffused lighting to lift and smooth facial shadows.';
    } else if (clippedFrac >= 0.12) {
      recommendedLightingId = 'softbox-key';
      recommendedAdvancedPreset = 'soft-diffused';
      recommendedPresetLabel = 'Soft Diffused';
      correctionGuidance =
        'Clipped highlights or crushed blacks detected — studio exposure rebalancing and soft fill are recommended.';
    } else {
      recommendedLightingId = 'softbox-key';
      recommendedAdvancedPreset = 'none';
      recommendedPresetLabel = 'Softbox Key';
      correctionGuidance =
        'Compressed dynamic range detected — Softbox Studio Key relighting will restore clarity and dimensional depth.';
    }
  } else if (shadowHarshnessLabel === 'Harsh') {
    recommendedLightingId = 'diffused-window';
    recommendedAdvancedPreset = 'soft-diffused';
    recommendedPresetLabel = 'Soft Diffused';
    correctionGuidance =
      'Strong directional shadows detected — Soft Diffused fill will even out facial illumination.';
  } else if (dynamicRangeScore < 58) {
    recommendedLightingId = 'rembrandt';
    recommendedAdvancedPreset = 'none';
    recommendedPresetLabel = 'Rembrandt';
    correctionGuidance =
      'Slightly flat tonal range — Rembrandt studio lighting will add crisp dimensional modeling.';
  }

  // 4. Build 48-bin luminance distribution histogram for real-time tonal visualization
  const BIN_COUNT = 48;
  const rawCounts = new Float64Array(BIN_COUNT);
  for (let b = 0; b < 256; b++) {
    const bucket = Math.min(BIN_COUNT - 1, Math.floor((b / 256) * BIN_COUNT));
    rawCounts[bucket] += hist[b];
  }

  const histogramBinPercents: number[] = Array.from(rawCounts, (count) =>
    Number(((count / Math.max(1, totalPixels)) * 100).toFixed(1))
  );

  // Light 3-tap smoothing so curve reads like an optical darkroom light meter without hiding spikes
  const smoothed = new Float64Array(BIN_COUNT);
  for (let i = 0; i < BIN_COUNT; i++) {
    const prev = rawCounts[Math.max(0, i - 1)];
    const curr = rawCounts[i];
    const next = rawCounts[Math.min(BIN_COUNT - 1, i + 1)];
    smoothed[i] = prev * 0.2 + curr * 0.6 + next * 0.2;
  }

  // Normalize against the 95th-percentile bin so single clipped walls don't crush the entire curve
  const sortedPeaks = Array.from(smoothed).sort((a, b) => a - b);
  const robustPeak = Math.max(
    1,
    sortedPeaks[Math.min(BIN_COUNT - 1, Math.floor(BIN_COUNT * 0.94))] || sortedPeaks[BIN_COUNT - 1]
  );
  const histogramBins: number[] = Array.from(smoothed, (val) =>
    Number(Math.min(1, val / robustPeak).toFixed(3))
  );

  const shadowPercent = Math.round((shadowCount / Math.max(1, totalPixels)) * 100);
  const highlightPercent = Math.round((highlightCount / Math.max(1, totalPixels)) * 100);
  const midtonePercent = Math.max(0, 100 - shadowPercent - highlightPercent);
  const meanLuminancePercent = Math.round((totalLumSum / Math.max(1, totalPixels)) * 100);

  // 5. Compute 2D facial light-source orientation (0°=Top, 90°=Right, 180°=Bottom, 270°=Left)
  const normDirX = dirWeightSum > 0 ? dirMomentX / dirWeightSum : 0;
  const normDirY = dirWeightSum > 0 ? dirMomentY / dirWeightSum : -0.05;
  // Blend moment X with measured left/right facial asymmetry for robust side-light detection
  const blendedX = normDirX * 0.72 + (rightMean - leftMean) * 1.45;
  const blendedY = normDirY * 0.85;
  const vectorMag = Math.hypot(blendedX, blendedY);
  const lightDirectionStrength = Number(Math.min(1, vectorMag / 0.24).toFixed(2));
  const rawClockDeg = ((Math.atan2(blendedX, -blendedY) * 180) / Math.PI + 360) % 360;
  const lightAngleDeg = Math.round(rawClockDeg) % 360;

  let lightOrientationLabel = 'Front · Even';
  if (lightDirectionStrength >= 0.22) {
    if (lightAngleDeg >= 338 || lightAngleDeg < 23) lightOrientationLabel = 'Overhead Key';
    else if (lightAngleDeg < 68) lightOrientationLabel = 'Upper-Right Key';
    else if (lightAngleDeg < 113) lightOrientationLabel = 'Right Side Key';
    else if (lightAngleDeg < 158) lightOrientationLabel = 'Lower-Right Fill';
    else if (lightAngleDeg < 203) lightOrientationLabel = 'Underlit · Low';
    else if (lightAngleDeg < 248) lightOrientationLabel = 'Lower-Left Fill';
    else if (lightAngleDeg < 293) lightOrientationLabel = 'Left Side Key';
    else lightOrientationLabel = 'Upper-Left Key';
  }

  const report: LightingQualityReport = {
    rating,
    score,
    dynamicRangeScore,
    dynamicRangeLabel,
    shadowHarshnessScore,
    shadowHarshnessLabel,
    clippedPercent: Math.round(clippedFrac * 100),
    correctionLevel,
    correctionGuidance,
    recommendedLightingId,
    recommendedAdvancedPreset,
    recommendedPresetLabel,
    usedFaceRegion,
    histogramBins,
    histogramBinPercents,
    shadowPercent,
    midtonePercent,
    highlightPercent,
    p02Percent: Math.round(p02 * 100),
    p98Percent: Math.round(p98 * 100),
    meanLuminancePercent,
    lightAngleDeg,
    lightDirectionStrength,
    lightOrientationLabel,
  };

  if (qualityCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = qualityCache.keys().next().value;
    if (oldestKey) {
      qualityCache.delete(oldestKey);
    }
  }
  qualityCache.set(cacheKey, report);

  return report;
}

/**
 * Evaluates how well the source portrait's detected light-source angle matches the
 * currently selected studio lighting setup, returning subtle capture angle guidance.
 */
export function evaluateLightingCompassAlignment(
  report: LightingQualityReport,
  lightingId: LightingId,
  advancedPreset: AdvancedLightingPresetId
): LightingCompassAlignment {
  let targetAngleDeg = 325;
  let targetLabel = 'Softbox Upper-Left';

  if (advancedPreset === 'golden-hour') {
    targetAngleDeg = 42;
    targetLabel = 'Golden Hour Upper-Right';
  } else if (advancedPreset === 'noir-high-contrast') {
    targetAngleDeg = 295;
    targetLabel = 'Noir Sculpted Left';
  } else if (advancedPreset === 'soft-diffused') {
    targetAngleDeg = 0;
    targetLabel = 'Soft Diffused Front';
  } else {
    switch (lightingId) {
      case 'rembrandt':
        targetAngleDeg = 312;
        targetLabel = 'Rembrandt 45° Left';
        break;
      case 'golden-rim':
        targetAngleDeg = 48;
        targetLabel = 'Golden Rim Upper-Right';
        break;
      case 'diffused-window':
        targetAngleDeg = 300;
        targetLabel = 'Window Left Key';
        break;
      case 'softbox-key':
      default:
        targetAngleDeg = 328;
        targetLabel = 'Softbox Upper-Left';
        break;
    }
  }

  const detectedAngleDeg = report.lightAngleDeg;
  const isEvenlyLit = report.lightDirectionStrength < 0.22;

  // Signed shortest angular difference (-180..+180) from detected source light to studio target
  let deltaDeg = ((targetAngleDeg - detectedAngleDeg + 540) % 360) - 180;
  if (deltaDeg === -180) deltaDeg = 180;
  const absDeltaDeg = isEvenlyLit ? 0 : Math.abs(Math.round(deltaDeg));

  let matchStatus: LightingCompassAlignment['matchStatus'] = 'Aligned';
  if (!isEvenlyLit) {
    if (absDeltaDeg > 78 || (detectedAngleDeg >= 135 && detectedAngleDeg <= 225)) {
      matchStatus = 'Cross-Lit';
    } else if (absDeltaDeg > 24) {
      matchStatus = 'Minor Offset';
    }
  }

  // Subtle practical angle guidance for source photo integration
  const subtleTurnDeg = Math.min(25, Math.max(8, Math.round(absDeltaDeg * 0.35)));
  let shortAdjustment = 'Key aligned';
  let detailedSuggestion = `Source light aligns closely with ${targetLabel} — natural cheek and rim blending.`;

  if (isEvenlyLit) {
    shortAdjustment = 'Even front light';
    detailedSuggestion = `Even ambient fill blends cleanly into ${targetLabel}; tilt face ~10° off-axis if you want stronger dimensional sculpting.`;
  } else if (detectedAngleDeg >= 135 && detectedAngleDeg <= 225) {
    shortAdjustment = 'Raise light ~20°';
    detailedSuggestion = `Source light sits low (${detectedAngleDeg}°). Raise the camera or light ~20° above eye level so facial shadows match ${targetLabel}.`;
  } else if (matchStatus === 'Aligned') {
    shortAdjustment = `Aligned (${absDeltaDeg}°)`;
    detailedSuggestion = `${report.lightOrientationLabel} (${detectedAngleDeg}°) matches ${targetLabel} (${targetAngleDeg}°) for seamless studio integration.`;
  } else if (matchStatus === 'Minor Offset') {
    const turnDir = deltaDeg > 0 ? 'left' : 'right';
    shortAdjustment = `Turn ~${subtleTurnDeg}° ${turnDir}`;
    detailedSuggestion = `Turn face ~${subtleTurnDeg}° ${turnDir} (or rotate source key ${Math.abs(
      Math.round(deltaDeg)
    )}°) so specular highlights align with ${targetLabel}.`;
  } else {
    const turnDir = deltaDeg > 0 ? 'left' : 'right';
    shortAdjustment = `Angle ~${subtleTurnDeg}° ${turnDir}`;
    detailedSuggestion = `Source key (${report.lightOrientationLabel}) opposes ${targetLabel}. Angle subject ~${subtleTurnDeg}° ${turnDir} toward light—or choose a matching studio key side for higher realism.`;
  }

  return {
    detectedAngleDeg,
    targetAngleDeg,
    deltaDeg: Math.round(deltaDeg),
    absDeltaDeg,
    isEvenlyLit,
    matchStatus,
    detectedLabel: report.lightOrientationLabel,
    targetLabel,
    shortAdjustment,
    detailedSuggestion,
  };
}
