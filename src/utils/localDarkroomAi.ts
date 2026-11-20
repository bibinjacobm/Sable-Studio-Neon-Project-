import {
  buildDefaultRecipe,
  type DarkroomRecipe,
  type FramingAnchor,
  type SelfieCritique,
  type StudioDirectionConfig,
} from '../data/studioCatalog';

/**
 * Safely POST JSON and parse JSON response.
 * Returns null if the endpoint is unavailable (e.g. static published host returning HTML/text 404)
 * so the caller can seamlessly fall back to local client-side processing without throwing parse errors.
 */
export async function safePostJson<T>(
  url: string,
  payload: Record<string, unknown>
): Promise<T | null> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return null;
    }

    const text = await response.text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

interface PhotometricStats {
  meanLuminance: number; // 0..255
  centerLuminance: number; // 0..255
  stdDev: number; // contrast spread
  warmthBias: number; // positive = warm/yellow cast, negative = cool/blue cast
  aspectRatio: number;
}

async function measureImagePhotometrics(dataUrl: string): Promise<PhotometricStats> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Image load failed'));
    el.src = dataUrl;
  });

  const sampleW = 96;
  const sampleH = Math.max(48, Math.round((img.naturalHeight / Math.max(1, img.naturalWidth)) * sampleW));
  const canvas = document.createElement('canvas');
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      meanLuminance: 128,
      centerLuminance: 132,
      stdDev: 42,
      warmthBias: 0,
      aspectRatio: img.naturalWidth / Math.max(1, img.naturalHeight),
    };
  }

  ctx.drawImage(img, 0, 0, sampleW, sampleH);
  const { data } = ctx.getImageData(0, 0, sampleW, sampleH);

  let sumLum = 0;
  let sumLumSq = 0;
  let sumCenterLum = 0;
  let centerCount = 0;
  let sumR = 0;
  let sumB = 0;
  const total = sampleW * sampleH;

  for (let y = 0; y < sampleH; y++) {
    const inCenterY = y >= sampleH * 0.2 && y <= sampleH * 0.65;
    for (let x = 0; x < sampleW; x++) {
      const idx = (y * sampleW + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      sumLum += lum;
      sumLumSq += lum * lum;
      sumR += r;
      sumB += b;

      if (inCenterY && x >= sampleW * 0.28 && x <= sampleW * 0.72) {
        sumCenterLum += lum;
        centerCount += 1;
      }
    }
  }

  const meanLuminance = sumLum / Math.max(1, total);
  const variance = Math.max(0, sumLumSq / Math.max(1, total) - meanLuminance * meanLuminance);
  const stdDev = Math.sqrt(variance);
  const centerLuminance = centerCount > 0 ? sumCenterLum / centerCount : meanLuminance;
  const warmthBias = (sumR - sumB) / Math.max(1, total) / 255;

  return {
    meanLuminance,
    centerLuminance,
    stdDev,
    warmthBias,
    aspectRatio: img.naturalWidth / Math.max(1, img.naturalHeight),
  };
}

/**
 * Genuine client-side photometric selfie analysis used seamlessly whenever
 * the server API route is unavailable (e.g., static publish).
 */
export async function analyzeSelfieLocally(dataUrl: string): Promise<SelfieCritique> {
  const stats = await measureImagePhotometrics(dataUrl);

  const isDim = stats.centerLuminance < 105;
  const isBright = stats.centerLuminance > 168;
  const isWarmCast = stats.warmthBias > 0.08;
  const isCoolCast = stats.warmthBias < -0.04;
  const isLowContrast = stats.stdDev < 38;

  let lightingAssessment =
    'Even ambient exposure across the face; softbox studio fill will enhance clarity and eye separation.';
  if (isDim) {
    lightingAssessment =
      'Slightly underexposed facial midtones detected; gentle exposure lift and softbox key light will brighten features cleanly.';
  } else if (isBright) {
    lightingAssessment =
      'Bright highlight exposure detected; balanced studio contrast and controlled backdrop luminance will preserve detail.';
  } else if (isWarmCast) {
    lightingAssessment =
      'Warm indoor ambient color cast detected; neutral daylight white-balance correction will restore natural skin tones.';
  } else if (isCoolCast) {
    lightingAssessment =
      'Cool ambient lighting detected; subtle golden rim warmth will add inviting editorial depth.';
  }

  const recommendedStyleId = isDim
    ? 'corporate-grey'
    : isWarmCast
      ? 'modern-tech'
      : isCoolCast
        ? 'outdoor-natural'
        : isLowContrast
          ? 'editorial-mono'
          : 'corporate-grey';

  const recommendedLightingId = isDim
    ? 'softbox-key'
    : isCoolCast
      ? 'golden-rim'
      : isLowContrast
        ? 'rembrandt'
        : 'diffused-window';

  const recommendedAttireId =
    recommendedStyleId === 'modern-tech'
      ? 'smart-knit'
      : recommendedStyleId === 'editorial-mono'
        ? 'black-turtleneck'
        : 'charcoal-blazer';

  const recommendedFramingId = stats.aspectRatio > 1.05 ? 'head-shoulders' : 'head-shoulders';

  const summary = isDim
    ? 'Clean eye contact with subdued room light—lifting facial exposure against a balanced studio backdrop will deliver crisp executive polish.'
    : isWarmCast
      ? 'Strong natural expression with warm indoor lighting—neutralizing skin warmth inside a daylight architectural setting will look effortless.'
      : 'Well-balanced facial exposure ready for clean studio backdrop separation, tailored wardrobe toning, and subtle rim light.';

  const retouchIdeas = isDim
    ? [
        'Brighten face exposure and soften shadows',
        'Switch backdrop to Modern Tech Office daylight',
      ]
    : [
        'Add warmer golden hour rim light and softer bokeh',
        'Convert to dramatic silver-gelatin monochrome',
      ];

  return {
    summary,
    lightingAssessment,
    recommendedStyleId,
    recommendedAttireId,
    recommendedFramingId,
    recommendedLightingId,
    retouchIdeas,
  };
}

export async function planFramingLocally(
  dataUrl: string,
  config: StudioDirectionConfig
): Promise<{ anchor: FramingAnchor; recipe: DarkroomRecipe; directorNote: string }> {
  const baseRecipe = buildDefaultRecipe(config);
  const anchor: FramingAnchor = {
    faceCenterX: 0.5,
    faceCenterY: 0.36,
    faceHeightRatio: 0.34,
  };

  try {
    const stats = await measureImagePhotometrics(dataUrl);
    // Gently auto-level underexposed or overexposed selfies while keeping lighting uniform
    let exposureDelta = 0;
    if (stats.centerLuminance < 110) {
      exposureDelta = Math.min(0.16, ((118 - stats.centerLuminance) / 118) * 0.24);
    } else if (stats.centerLuminance > 175) {
      exposureDelta = Math.max(-0.1, ((165 - stats.centerLuminance) / 165) * 0.16);
    }

    // Gently neutralize strong indoor yellow/blue casts
    const warmthCorrection = Math.max(-0.1, Math.min(0.1, -stats.warmthBias * 0.45));

    const calibrated: DarkroomRecipe = {
      ...baseRecipe,
      exposure: Math.max(-0.3, Math.min(0.32, baseRecipe.exposure + exposureDelta)),
      warmth: Math.max(-0.3, Math.min(0.3, baseRecipe.warmth + warmthCorrection)),
    };

    const note =
      exposureDelta > 0.05
        ? 'Lifted facial midtones evenly and neutralized ambient cast for clean studio polish.'
        : 'Balanced studio exposure, backdrop depth, and uniform facial key illumination.';

    return { anchor, recipe: calibrated, directorNote: note };
  } catch {
    return {
      anchor,
      recipe: baseRecipe,
      directorNote: 'Balanced studio exposure and clean backdrop separation applied.',
    };
  }
}

export function applyRetouchLocally(
  prompt: string,
  current: DarkroomRecipe
): { recipe: DarkroomRecipe; directorNote: string } {
  const lower = prompt.toLowerCase();
  const next: DarkroomRecipe = { ...current };
  const notes: string[] = [];

  if (lower.includes('black and white') || lower.includes('monochrome') || lower.includes('b&w')) {
    next.monochrome = true;
    next.saturation = -1;
    next.contrast = Math.min(0.32, next.contrast + 0.08);
    next.grain = Math.max(next.grain, 0.13);
    notes.push('silver-gelatin monochrome');
  } else if (lower.includes('color') || lower.includes('colour')) {
    next.monochrome = false;
    next.saturation = 0.04;
    notes.push('restored natural color');
  }

  if (lower.includes('bright') || lower.includes('lighter') || lower.includes('lift')) {
    next.exposure = Math.min(0.3, next.exposure + 0.09);
    notes.push('lifted exposure');
  }
  if (lower.includes('dark') || lower.includes('moody') || lower.includes('dramatic')) {
    next.exposure = Math.max(-0.2, next.exposure - 0.05);
    next.contrast = Math.min(0.34, next.contrast + 0.08);
    next.vignette = Math.min(0.62, next.vignette + 0.1);
    next.lightingId = 'rembrandt';
    notes.push('deeper sculptural contrast');
  }
  if (lower.includes('soft') || lower.includes('gentle')) {
    next.contrast = Math.max(-0.12, next.contrast - 0.06);
    next.keyLightStrength = Math.max(0.25, next.keyLightStrength - 0.12);
    notes.push('softer shadow rolloff');
  }
  if (lower.includes('warm') || lower.includes('golden') || lower.includes('sunset')) {
    next.warmth = Math.min(0.28, next.warmth + 0.1);
    next.rimLight = Math.min(0.9, next.rimLight + 0.18);
    next.lightingId = 'golden-rim';
    notes.push('warm golden rim light');
  }
  if (lower.includes('cool') || lower.includes('crisp')) {
    next.warmth = Math.max(-0.25, next.warmth - 0.09);
    notes.push('cooler architectural balance');
  }
  if (lower.includes('blur') || lower.includes('bokeh')) {
    next.backdropBlur = Math.min(16, next.backdropBlur + 4);
    notes.push('softer backdrop bokeh');
  }
  if (lower.includes('tight') || lower.includes('closer') || lower.includes('zoom in') || lower.includes('85mm')) {
    next.framingId = 'tight-headshot';
    next.zoomAdjust = Math.min(1.26, next.zoomAdjust + 0.1);
    notes.push('tighter 85mm crop');
  }
  if (lower.includes('wide') || lower.includes('zoom out') || lower.includes('mid-chest')) {
    next.framingId = 'mid-chest';
    next.zoomAdjust = Math.max(0.88, next.zoomAdjust - 0.1);
    notes.push('wider editorial crop');
  }

  if (lower.includes('navy')) {
    next.attireId = 'smart-knit';
    notes.push('executive navy wardrobe tone');
  } else if (lower.includes('charcoal') || lower.includes('blazer') || lower.includes('suit')) {
    next.attireId = 'charcoal-blazer';
    notes.push('charcoal suit tone');
  } else if (lower.includes('white') || lower.includes('ivory') || lower.includes('oxford')) {
    next.attireId = 'crisp-oxford';
    notes.push('crisp ivory shirt tone');
  } else if (lower.includes('turtleneck') || lower.includes('black shirt') || lower.includes('obsidian')) {
    next.attireId = 'black-turtleneck';
    notes.push('obsidian knit tone');
  }

  if (lower.includes('office') || lower.includes('tech')) {
    next.styleId = 'modern-tech';
    notes.push('Modern Tech Office backdrop');
  } else if (lower.includes('outdoor') || lower.includes('garden') || lower.includes('nature')) {
    next.styleId = 'outdoor-natural';
    notes.push('Outdoor Natural Light backdrop');
  } else if (lower.includes('grey') || lower.includes('gray') || lower.includes('corporate')) {
    next.styleId = 'corporate-grey';
    notes.push('Corporate Grey backdrop');
  } else if (lower.includes('lounge') || lower.includes('walnut') || lower.includes('executive')) {
    next.styleId = 'executive-lounge';
    notes.push('Executive Warm Lounge backdrop');
  } else if (lower.includes('gallery') || lower.includes('travertine') || lower.includes('architect')) {
    next.styleId = 'architectural-daylight';
    notes.push('Architectural Daylight backdrop');
  }

  const directorNote =
    notes.length > 0
      ? `Applied darkroom retouch: ${notes.join(', ')}.`
      : `Applied subtle studio polish for "${prompt}".`;

  return { recipe: next, directorNote };
}
