import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { FramingAnchor } from '../data/studioCatalog';
import { segmentSelfie, type SegmentationMasks } from './darkroomEngine';

export interface SymmetryPoint {
  x: number;
  y: number;
}

export interface SymmetryPairOverlay {
  label: string;
  region: 'eyes' | 'central' | 'contour';
  left: SymmetryPoint;
  right: SymmetryPoint;
  pairScore: number;
}

export type SymmetryRating = 'Balanced' | 'Natural' | 'Asymmetric';
export type SymmetrySourceMode = 'face-landmarks' | 'segmentation-contour';

export interface FacialSymmetryReport {
  overallScore: number;
  rating: SymmetryRating;
  eyesBrowsScore: number;
  noseMouthScore: number;
  jawCheeksScore: number;
  headRollDeg: number;
  yawRatio: number;
  poseLabel: string;
  landmarkCount: number;
  sourceMode: SymmetrySourceMode;
  guidance: string;
  imageWidth: number;
  imageHeight: number;
  midlineTop: SymmetryPoint;
  midlineBottom: SymmetryPoint;
  eyeLineLeft: SymmetryPoint;
  eyeLineRight: SymmetryPoint;
  overlayPairs: SymmetryPairOverlay[];
}

const FALLBACK_LANDMARKER_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';

const MAX_ANALYSIS_DIM = 512;
const MAX_CACHE_ENTRIES = 16;

let faceLandmarkerPromise: Promise<FaceLandmarker | null> | null = null;
const symmetryCache = new Map<string, FacialSymmetryReport>();

interface LandmarkPairSpec {
  leftIdx: number;
  rightIdx: number;
  label: string;
  region: 'eyes' | 'central' | 'contour';
  showInOverlay?: boolean;
}

const BILATERAL_PAIRS: LandmarkPairSpec[] = [
  // Eyes & Brows
  { leftIdx: 33, rightIdx: 263, label: 'Outer Eyes', region: 'eyes', showInOverlay: true },
  { leftIdx: 133, rightIdx: 362, label: 'Inner Eyes', region: 'eyes' },
  { leftIdx: 159, rightIdx: 386, label: 'Upper Lids', region: 'eyes' },
  { leftIdx: 145, rightIdx: 374, label: 'Lower Lids', region: 'eyes' },
  { leftIdx: 105, rightIdx: 334, label: 'Brow Arches', region: 'eyes', showInOverlay: true },
  { leftIdx: 107, rightIdx: 336, label: 'Inner Brows', region: 'eyes' },
  { leftIdx: 70, rightIdx: 300, label: 'Outer Brows', region: 'eyes' },
  // Nose & Mouth
  { leftIdx: 129, rightIdx: 358, label: 'Nostril Wings', region: 'central', showInOverlay: true },
  { leftIdx: 98, rightIdx: 327, label: 'Alar Base', region: 'central' },
  { leftIdx: 61, rightIdx: 291, label: 'Mouth Corners', region: 'central', showInOverlay: true },
  { leftIdx: 37, rightIdx: 267, label: 'Upper Lip', region: 'central' },
  { leftIdx: 84, rightIdx: 314, label: 'Lower Lip', region: 'central' },
  // Jaw & Cheeks
  { leftIdx: 234, rightIdx: 454, label: 'Cheekbones', region: 'contour', showInOverlay: true },
  { leftIdx: 93, rightIdx: 323, label: 'Mid Cheeks', region: 'contour' },
  { leftIdx: 132, rightIdx: 361, label: 'Lower Cheeks', region: 'contour' },
  { leftIdx: 172, rightIdx: 397, label: 'Jaw Angles', region: 'contour', showInOverlay: true },
  { leftIdx: 150, rightIdx: 379, label: 'Chin Contour', region: 'contour' },
];

const MIDLINE_INDICES = [10, 168, 6, 1, 164, 152];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isBenignMediaPipeStderr(args: unknown[]): boolean {
  const message = args
    .map((arg) => (typeof arg === 'string' ? arg : ''))
    .join(' ')
    .trim();
  if (!message) return false;
  return (
    (/^INFO:\s/i.test(message) &&
      (message.includes('TensorFlow Lite') ||
        message.includes('XNNPACK') ||
        message.includes('MediaPipe') ||
        message.includes('delegate'))) ||
    message.includes('absl::InitializeLog()')
  );
}

async function resolveFaceLandmarkerModelUrl(): Promise<string[]> {
  const candidates: string[] = [];
  try {
    const check = await fetch('/api/mediapipe/face-landmarker', { method: 'HEAD' });
    const contentType = check.headers.get('content-type') ?? '';
    if (check.ok && contentType.includes('octet-stream')) {
      candidates.push('/api/mediapipe/face-landmarker');
    }
  } catch {
    // Fall back to direct model URL
  }
  candidates.push(FALLBACK_LANDMARKER_URL);
  return candidates;
}

async function getFaceLandmarker(): Promise<FaceLandmarker | null> {
  if (faceLandmarkerPromise) return faceLandmarkerPromise;

  faceLandmarkerPromise = (async () => {
    const modelUrls = await resolveFaceLandmarkerModelUrl();
    const wasmPaths = [
      '/mediapipe-wasm',
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm',
    ];

    const previousConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      if (isBenignMediaPipeStderr(args)) {
        return;
      }
      previousConsoleError.apply(console, args);
    };

    try {
      for (const wasmPath of wasmPaths) {
        for (const modelAssetPath of modelUrls) {
          for (const delegate of ['CPU', 'GPU'] as const) {
            try {
              const vision = await FilesetResolver.forVisionTasks(wasmPath);
              const landmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                  modelAssetPath,
                  delegate,
                },
                runningMode: 'IMAGE',
                numFaces: 1,
                outputFaceBlendshapes: false,
                outputFacialTransformationMatrixes: false,
              });
              return landmarker;
            } catch {
              // Try next delegate / asset path
            }
          }
        }
      }
      return null;
    } finally {
      console.error = previousConsoleError;
    }
  })();

  return faceLandmarkerPromise;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load portrait for symmetry analysis'));
    img.src = src;
  });
}

function rasterizeCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const naturalW = img.naturalWidth || img.width || 512;
  const naturalH = img.naturalHeight || img.height || 512;
  const scale = Math.min(1, MAX_ANALYSIS_DIM / Math.max(naturalW, naturalH));
  const w = Math.max(64, Math.round((naturalW * scale) / 4) * 4);
  const h = Math.max(64, Math.round((naturalH * scale) / 4) * 4);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    ctx.drawImage(img, 0, 0, w, h);
  }
  return canvas;
}

function classifyRating(score: number): SymmetryRating {
  if (score >= 88) return 'Balanced';
  if (score >= 76) return 'Natural';
  return 'Asymmetric';
}

function classifyPose(yawRatio: number, headRollDeg: number): string {
  const absRoll = Math.abs(headRollDeg);
  if (yawRatio >= 0.24) return 'Angled 3/4 pose';
  if (yawRatio >= 0.13) return 'Subtle 3/4 turn';
  if (absRoll >= 5.5) return 'Tilted horizon';
  return 'Square to lens';
}

function buildGuidance(
  overallScore: number,
  eyesBrowsScore: number,
  noseMouthScore: number,
  jawCheeksScore: number,
  headRollDeg: number,
  yawRatio: number
): string {
  const absRoll = Math.abs(headRollDeg);
  const tiltDirection = headRollDeg > 0 ? 'counter-clockwise' : 'clockwise';

  if (yawRatio >= 0.24) {
    return `Classic 3/4 editorial head turn lowers raw frontal mirror parity (${overallScore}%); eye-line alignment holds at ${eyesBrowsScore}%.`;
  }

  if (absRoll >= 5.5) {
    return `Head tilts ${absRoll.toFixed(1)}° off vertical — leveling ${tiltDirection} slightly will sharpen executive balance.`;
  }

  if (overallScore >= 90) {
    return `Strong bilateral alignment across eyes (${eyesBrowsScore}%) and jawline (${jawCheeksScore}%) with a steady ${absRoll.toFixed(1)}° horizon.`;
  }

  const lowest = Math.min(eyesBrowsScore, noseMouthScore, jawCheeksScore);
  if (lowest === jawCheeksScore && yawRatio >= 0.13) {
    return `Subtle 3/4 turn introduces natural contour asymmetry (${jawCheeksScore}% jaw balance); ideal for editorial depth.`;
  }
  if (lowest === eyesBrowsScore) {
    return `Natural eye-and-brow expression shifts upper balance to ${eyesBrowsScore}%; softbox key light helps harmonize brow shadow.`;
  }
  if (lowest === noseMouthScore) {
    return `Expressive smile or lower-face angle softens central parity (${noseMouthScore}%); balanced framing preserves approachability.`;
  }
  return `Natural portrait balance (${overallScore}%) with ${absRoll.toFixed(1)}° head tilt; suited for both corporate and editorial crops.`;
}

function computeReportFromFaceLandmarks(
  landmarks: Array<{ x: number; y: number; z?: number }>,
  imageWidth: number,
  imageHeight: number
): FacialSymmetryReport | null {
  if (landmarks.length < 468) return null;

  const aspect = imageWidth / Math.max(1, imageHeight);

  // Fit midline axis in isotropic image space (x scaled by aspect ratio)
  const midlinePts = MIDLINE_INDICES.map((idx) => {
    const pt = landmarks[idx];
    return { x: pt.x * aspect, y: pt.y };
  });

  let cx = 0;
  let cy = 0;
  for (const pt of midlinePts) {
    cx += pt.x;
    cy += pt.y;
  }
  cx /= midlinePts.length;
  cy /= midlinePts.length;

  // Principal axis via 2x2 covariance of midline landmarks
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const pt of midlinePts) {
    const dx = pt.x - cx;
    const dy = pt.y - cy;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }

  // Fallback vector from forehead (10) to chin (152) blended with eigenvector for stability
  const topLm = landmarks[10];
  const chinLm = landmarks[152];
  let ux = (chinLm.x - topLm.x) * aspect;
  let uy = chinLm.y - topLm.y;
  const fallbackLen = Math.hypot(ux, uy);
  if (fallbackLen < 1e-4) return null;
  ux /= fallbackLen;
  uy /= fallbackLen;

  // Refine direction with principal eigenvector of midline covariance
  const trace = sxx + syy;
  const detTerm = Math.hypot(sxx - syy, 2 * sxy);
  const lambda1 = (trace + detTerm) * 0.5;
  let ex = sxy;
  let ey = lambda1 - sxx;
  const eLen = Math.hypot(ex, ey);
  if (eLen > 1e-6) {
    ex /= eLen;
    ey /= eLen;
    if (ex * ux + ey * uy < 0) {
      ex = -ex;
      ey = -ey;
    }
    ux = ux * 0.35 + ex * 0.65;
    uy = uy * 0.35 + ey * 0.65;
    const norm = Math.hypot(ux, uy) || 1;
    ux /= norm;
    uy /= norm;
  }

  // Right-pointing axis orthogonal to downward face axis (ux, uy)
  const rx = uy;
  const ry = -ux;

  // Signed head roll in degrees (positive = clockwise / head tilted right)
  const rawRollDeg = Math.atan2(-ux, uy) * (180 / Math.PI);
  const headRollDeg = Number(clamp(rawRollDeg, -35, 35).toFixed(1));

  const projectLocal = (lm: { x: number; y: number }) => {
    const dx = lm.x * aspect - cx;
    const dy = lm.y - cy;
    return {
      lateral: dx * rx + dy * ry,
      vertical: dx * ux + dy * uy,
    };
  };

  // Face width normalization from cheekbones (234, 454) and outer eye corners (33, 263)
  const leftCheek = projectLocal(landmarks[234]);
  const rightCheek = projectLocal(landmarks[454]);
  const leftEyeOuter = projectLocal(landmarks[33]);
  const rightEyeOuter = projectLocal(landmarks[263]);

  const cheekSpan = Math.abs(rightCheek.lateral - leftCheek.lateral);
  const eyeSpan = Math.abs(rightEyeOuter.lateral - leftEyeOuter.lateral);
  const scale = Math.max(cheekSpan, eyeSpan * 1.35, 0.08);

  // Estimate head yaw from cheek & mid-cheek span ratio relative to nasal midline
  const leftCheekMid = projectLocal(landmarks[93]);
  const rightCheekMid = projectLocal(landmarks[323]);
  const leftSpan = (Math.abs(leftCheek.lateral) + Math.abs(leftCheekMid.lateral)) * 0.5;
  const rightSpan = (Math.abs(rightCheek.lateral) + Math.abs(rightCheekMid.lateral)) * 0.5;
  const yawRatio = clamp(Math.abs(leftSpan - rightSpan) / Math.max(leftSpan + rightSpan, 1e-4), 0, 1);

  // Subtle yaw compensation factor so natural 3/4 editorial turns aren't over-penalized
  const yawLateralDamping = 1 - Math.min(0.45, yawRatio * 0.95);

  const regionScores: Record<'eyes' | 'central' | 'contour', number[]> = {
    eyes: [],
    central: [],
    contour: [],
  };
  const overlayPairs: SymmetryPairOverlay[] = [];

  for (const spec of BILATERAL_PAIRS) {
    const lmL = landmarks[spec.leftIdx];
    const lmR = landmarks[spec.rightIdx];
    const locL = projectLocal(lmL);
    const locR = projectLocal(lmR);

    const lateralDiff = Math.abs(Math.abs(locL.lateral) - Math.abs(locR.lateral)) / scale;
    const verticalDiff = Math.abs(locL.vertical - locR.vertical) / scale;

    const combinedErr = lateralDiff * 0.72 * yawLateralDamping + verticalDiff * 1.18;
    const pairScore = clamp(Math.round(100 * Math.exp(-3.1 * combinedErr)), 45, 99);

    regionScores[spec.region].push(pairScore);
    if (spec.showInOverlay) {
      overlayPairs.push({
        label: spec.label,
        region: spec.region,
        left: { x: clamp(lmL.x, 0, 1), y: clamp(lmL.y, 0, 1) },
        right: { x: clamp(lmR.x, 0, 1), y: clamp(lmR.y, 0, 1) },
        pairScore,
      });
    }
  }

  const avg = (values: number[]) =>
    values.length > 0
      ? Math.round(values.reduce((sum, val) => sum + val, 0) / values.length)
      : 85;

  const eyesBrowsScore = avg(regionScores.eyes);
  const noseMouthScore = avg(regionScores.central);
  const jawCheeksScore = avg(regionScores.contour);

  // Gentle penalty only for extreme roll/yaw while reflecting true bilateral landmark parity
  const rollPenalty = Math.max(0, Math.abs(headRollDeg) - 4) * 0.35;
  const yawPenalty = Math.max(0, yawRatio - 0.14) * 14;
  const rawOverall =
    eyesBrowsScore * 0.4 + noseMouthScore * 0.3 + jawCheeksScore * 0.3 - rollPenalty - yawPenalty;
  const overallScore = clamp(Math.round(rawOverall), 52, 99);

  // Compute cleanly extended midline endpoints (forehead crown to chin tip)
  const topLocal = projectLocal(topLm);
  const chinLocal = projectLocal(chinLm);
  const faceHeightLocal = Math.max(0.08, chinLocal.vertical - topLocal.vertical);
  const topT = topLocal.vertical - faceHeightLocal * 0.1;
  const botT = chinLocal.vertical + faceHeightLocal * 0.08;

  const unproject = (lateral: number, vertical: number): SymmetryPoint => ({
    x: clamp((cx + lateral * rx + vertical * ux) / aspect, 0, 1),
    y: clamp(cy + lateral * ry + vertical * uy, 0, 1),
  });

  const eyeMidV = (leftEyeOuter.vertical + rightEyeOuter.vertical) * 0.5;
  const eyeHalfSpan = Math.max(Math.abs(leftEyeOuter.lateral), Math.abs(rightEyeOuter.lateral)) * 1.18;

  return {
    overallScore,
    rating: classifyRating(overallScore),
    eyesBrowsScore,
    noseMouthScore,
    jawCheeksScore,
    headRollDeg,
    yawRatio: Number(yawRatio.toFixed(2)),
    poseLabel: classifyPose(yawRatio, headRollDeg),
    landmarkCount: landmarks.length,
    sourceMode: 'face-landmarks',
    guidance: buildGuidance(
      overallScore,
      eyesBrowsScore,
      noseMouthScore,
      jawCheeksScore,
      headRollDeg,
      yawRatio
    ),
    imageWidth,
    imageHeight,
    midlineTop: unproject(0, topT),
    midlineBottom: unproject(0, botT),
    eyeLineLeft: unproject(-eyeHalfSpan, eyeMidV),
    eyeLineRight: unproject(eyeHalfSpan, eyeMidV),
    overlayPairs,
  };
}

/**
 * Fallback bilateral facial symmetry analysis using the segmentation engine's face/skin mask
 * and grayscale facial gradient reflection when the 478-point FaceLandmarker is unavailable.
 */
async function analyzeSymmetryFromSegmentation(
  imageUrl: string,
  canvas: HTMLCanvasElement,
  anchor: FramingAnchor | null
): Promise<FacialSymmetryReport> {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx ? ctx.getImageData(0, 0, w, h).data : new Uint8ClampedArray(w * h * 4);

  const safeAnchor: FramingAnchor = anchor ?? {
    faceCenterX: 0.5,
    faceCenterY: 0.37,
    faceHeightRatio: 0.34,
  };

  let masks: SegmentationMasks | null = null;
  try {
    masks = await segmentSelfie(imageUrl, safeAnchor);
  } catch {
    masks = null;
  }

  // Locate face region bounds from segmentation skin/foreground mask or framing anchor
  const faceCenterY = clamp(safeAnchor.faceCenterY, 0.18, 0.65);
  const faceHeight = clamp(safeAnchor.faceHeightRatio, 0.18, 0.58);
  const topY = Math.max(0, Math.floor((faceCenterY - faceHeight * 0.52) * h));
  const botY = Math.min(h - 1, Math.ceil((faceCenterY + faceHeight * 0.56) * h));

  const maskData = masks ? (masks.isMulticlass ? masks.skin : masks.foreground) : null;
  const maskW = masks?.width ?? w;
  const maskH = masks?.height ?? h;

  const sampleMask = (nx: number, ny: number): number => {
    if (!maskData) return 1;
    const mx = clamp(Math.floor(nx * maskW), 0, maskW - 1);
    const my = clamp(Math.floor(ny * maskH), 0, maskH - 1);
    return maskData[my * maskW + mx];
  };

  const sampleLuma = (px: number, py: number): number => {
    const cx = clamp(Math.round(px), 0, w - 1);
    const cy = clamp(Math.round(py), 0, h - 1);
    const idx = (cy * w + cx) * 4;
    return (0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2]) / 255;
  };

  // Estimate horizontal midline & slight tilt from row-by-row foreground/skin mask centroids
  const rowCenters: Array<{ y: number; cx: number; halfW: number }> = [];
  const searchHalfW = Math.max(16, Math.round(faceHeight * h * 0.48));
  const initCx = clamp(safeAnchor.faceCenterX, 0.2, 0.8) * w;

  for (let y = topY; y <= botY; y += 2) {
    const ny = y / h;
    let sumX = 0;
    let sumW = 0;
    let minX = w;
    let maxX = 0;

    const x0 = Math.max(0, Math.floor(initCx - searchHalfW));
    const x1 = Math.min(w - 1, Math.ceil(initCx + searchHalfW));
    for (let x = x0; x <= x1; x += 2) {
      const weight = sampleMask(x / w, ny);
      if (weight > 0.35) {
        sumX += x * weight;
        sumW += weight;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }

    if (sumW > 4 && maxX > minX + 10) {
      rowCenters.push({
        y,
        cx: sumX / sumW,
        halfW: (maxX - minX) * 0.5,
      });
    }
  }

  let meanY = (topY + botY) * 0.5;
  let meanCx = initCx;
  let slopeXPerY = 0;
  let avgHalfW = searchHalfW * 0.72;

  if (rowCenters.length >= 6) {
    meanY = rowCenters.reduce((acc, r) => acc + r.y, 0) / rowCenters.length;
    meanCx = rowCenters.reduce((acc, r) => acc + r.cx, 0) / rowCenters.length;
    avgHalfW = rowCenters.reduce((acc, r) => acc + r.halfW, 0) / rowCenters.length;

    let num = 0;
    let den = 0;
    for (const r of rowCenters) {
      const dy = r.y - meanY;
      num += dy * (r.cx - meanCx);
      den += dy * dy;
    }
    if (den > 1) {
      slopeXPerY = clamp(num / den, -0.35, 0.35);
    }
  }

  const headRollDeg = Number(clamp((-Math.atan(slopeXPerY) * 180) / Math.PI, -20, 20).toFixed(1));

  // Measure bilateral reflection symmetry across 3 facial bands (upper: eyes, mid: nose/cheeks, lower: mouth/jaw)
  const measureBandSymmetry = (bandStartFrac: number, bandEndFrac: number): number => {
    const yStart = Math.round(topY + (botY - topY) * bandStartFrac);
    const yEnd = Math.round(topY + (botY - topY) * bandEndFrac);
    const halfSpan = Math.max(12, Math.round(avgHalfW * 0.88));

    let lumaDiffSum = 0;
    let maskDiffSum = 0;
    let samples = 0;

    for (let y = yStart; y <= yEnd; y += 2) {
      const axisX = meanCx + (y - meanY) * slopeXPerY;
      for (let d = 3; d <= halfSpan; d += 3) {
        const lx = axisX - d;
        const rx = axisX + d;
        if (lx < 1 || rx >= w - 1) continue;

        const mL = sampleMask(lx / w, y / h);
        const mR = sampleMask(rx / w, y / h);
        const lL = sampleLuma(lx, y);
        const lR = sampleLuma(rx, y);

        maskDiffSum += Math.abs(mL - mR);
        lumaDiffSum += Math.abs(lL - lR);
        samples++;
      }
    }

    if (samples === 0) return 82;
    const avgMaskErr = maskDiffSum / samples;
    const avgLumaErr = lumaDiffSum / samples;
    const combinedErr = avgMaskErr * 0.55 + avgLumaErr * 0.7;
    return clamp(Math.round(100 * Math.exp(-1.15 * combinedErr)), 58, 96);
  };

  const eyesBrowsScore = measureBandSymmetry(0.16, 0.44);
  const noseMouthScore = measureBandSymmetry(0.44, 0.74);
  const jawCheeksScore = measureBandSymmetry(0.55, 0.94);

  const yawRatio = clamp(Math.abs(meanCx / w - safeAnchor.faceCenterX) * 1.4, 0, 0.35);
  const overallScore = clamp(
    Math.round(eyesBrowsScore * 0.4 + noseMouthScore * 0.3 + jawCheeksScore * 0.3),
    55,
    97
  );

  const axisAt = (yPx: number) => clamp((meanCx + (yPx - meanY) * slopeXPerY) / w, 0.1, 0.9);
  const eyeY = topY + (botY - topY) * 0.34;
  const halfWNorm = clamp(avgHalfW / w, 0.08, 0.32);

  const makePair = (
    label: string,
    region: 'eyes' | 'central' | 'contour',
    fracY: number,
    spanScale: number,
    pairScore: number
  ): SymmetryPairOverlay => {
    const py = topY + (botY - topY) * fracY;
    const ax = axisAt(py);
    const dx = halfWNorm * spanScale;
    return {
      label,
      region,
      left: { x: clamp(ax - dx, 0, 1), y: clamp(py / h, 0, 1) },
      right: { x: clamp(ax + dx, 0, 1), y: clamp(py / h, 0, 1) },
      pairScore,
    };
  };

  return {
    overallScore,
    rating: classifyRating(overallScore),
    eyesBrowsScore,
    noseMouthScore,
    jawCheeksScore,
    headRollDeg,
    yawRatio: Number(yawRatio.toFixed(2)),
    poseLabel: classifyPose(yawRatio, headRollDeg),
    landmarkCount: 12,
    sourceMode: 'segmentation-contour',
    guidance: buildGuidance(
      overallScore,
      eyesBrowsScore,
      noseMouthScore,
      jawCheeksScore,
      headRollDeg,
      yawRatio
    ),
    imageWidth: w,
    imageHeight: h,
    midlineTop: { x: axisAt(topY), y: clamp(topY / h, 0, 1) },
    midlineBottom: { x: axisAt(botY), y: clamp(botY / h, 0, 1) },
    eyeLineLeft: { x: clamp(axisAt(eyeY) - halfWNorm * 0.85, 0, 1), y: clamp(eyeY / h, 0, 1) },
    eyeLineRight: { x: clamp(axisAt(eyeY) + halfWNorm * 0.85, 0, 1), y: clamp(eyeY / h, 0, 1) },
    overlayPairs: [
      makePair('Brow Arches', 'eyes', 0.25, 0.56, eyesBrowsScore),
      makePair('Outer Eyes', 'eyes', 0.34, 0.64, eyesBrowsScore),
      makePair('Cheekbones', 'contour', 0.5, 0.86, jawCheeksScore),
      makePair('Nostril Wings', 'central', 0.56, 0.26, noseMouthScore),
      makePair('Mouth Corners', 'central', 0.72, 0.42, noseMouthScore),
      makePair('Jaw Angles', 'contour', 0.8, 0.72, jawCheeksScore),
    ],
  };
}

/**
 * Analyzes bilateral facial symmetry using MediaPipe's 478-point FaceLandmarker
 * with an automatic segmentation-mask contour fallback so every portrait gets
 * a reliable, client-side symmetry percentage and anatomical breakdown.
 */
export async function analyzeFacialSymmetry(
  imageUrl: string,
  anchor: FramingAnchor | null = null
): Promise<FacialSymmetryReport> {
  const cacheKey = `${imageUrl.slice(0, 96)}:${imageUrl.slice(-32)}:${imageUrl.length}`;
  const cached = symmetryCache.get(cacheKey);
  if (cached) return cached;

  const img = await loadImage(imageUrl);
  const canvas = rasterizeCanvas(img);

  let report: FacialSymmetryReport | null = null;
  const landmarker = await getFaceLandmarker();
  if (landmarker) {
    try {
      const result = landmarker.detect(canvas);
      const face = result.faceLandmarks?.[0];
      if (face && face.length >= 468) {
        report = computeReportFromFaceLandmarks(face, canvas.width, canvas.height);
      }
    } catch {
      report = null;
    }
  }

  if (!report) {
    report = await analyzeSymmetryFromSegmentation(imageUrl, canvas, anchor);
  }

  if (symmetryCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = symmetryCache.keys().next().value;
    if (oldestKey) {
      symmetryCache.delete(oldestKey);
    }
  }
  symmetryCache.set(cacheKey, report);
  return report;
}
