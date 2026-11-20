import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  ATTIRE_OPTIONS,
  FRAMING_OPTIONS,
  LIGHTING_OPTIONS,
  STUDIO_STYLES,
  applyAdvancedLightingPreset,
  buildDefaultRecipe,
  getAdvancedLightingPresetById,
  getAttireById,
  getFramingById,
  getLightingById,
  getStyleById,
  suggestSmartCrop,
  type AspectRatioOption,
  type AttireId,
  type DarkroomRecipe,
  type FramingAnchor,
  type FramingId,
  type LightingId,
  type StyleId,
} from './src/data/studioCatalog.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
// Uses exclusively free-tier Gemini model (gemini-4-hydrogen) — zero paid models required
const FREE_VISION_MODEL = 'gemini-4-hydrogen';

const MEDIAPIPE_MODEL_URLS = [
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
];

let cachedModelBuffer: { buffer: Buffer; isMulticlass: boolean } | null = null;

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, num));
}

function normalizeAspectRatio(value: unknown): AspectRatioOption {
  if (value === '1:1' || value === '4:3' || value === '3:4') {
    return value;
  }
  return '3:4';
}

const app = express();
app.use(express.json({ limit: '25mb' }));

// Serve MediaPipe WASM binaries directly from local node_modules (zero external CDN flakiness)
app.use(
  '/mediapipe-wasm',
  express.static(path.resolve(__dirname, 'node_modules/@mediapipe/tasks-vision/wasm'), {
    maxAge: '7d',
  })
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, studio: 'Sable Studio', mode: 'free-darkroom' });
});

// Proxy & cache the open-source MediaPipe selfie segmentation model cleanly with same-origin headers
app.get('/api/mediapipe/model', async (_req, res) => {
  try {
    if (!cachedModelBuffer) {
      for (let i = 0; i < MEDIAPIPE_MODEL_URLS.length; i++) {
        const url = MEDIAPIPE_MODEL_URLS[i];
        try {
          const upstream = await fetch(url);
          if (upstream.ok) {
            const arr = await upstream.arrayBuffer();
            cachedModelBuffer = {
              buffer: Buffer.from(arr),
              isMulticlass: i === 0,
            };
            break;
          }
        } catch {
          // Try next fallback model URL
        }
      }
    }

    if (!cachedModelBuffer) {
      res.status(502).json({ error: 'Unable to fetch segmentation model.' });
      return;
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Model-Type', cachedModelBuffer.isMulticlass ? 'multiclass' : 'binary');
    res.send(cachedModelBuffer.buffer);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Model proxy error' });
  }
});

/**
 * Free-tier AI Portrait Director (`gemini-4-hydrogen`)
 * Inspects uploaded selfie framing & lighting to return normalized face anchor coordinates
 * plus precision darkroom exposure/white-balance calibration.
 */
app.post('/api/headshots/plan', async (req, res) => {
  const {
    sourceBase64,
    sourceMimeType,
    styleId,
    attireId,
    framingId,
    smartCrop,
    detectedAnchor,
    lightingId,
    advancedLightingPreset,
    aspectRatio,
    extraNotes,
  } = req.body ?? {};

  const safeStyle = getStyleById(styleId);
  const safeAttire = getAttireById(attireId);
  const safeFraming = getFramingById(framingId);
  const safeSmartCrop = Boolean(smartCrop);
  const safeLighting = getLightingById(lightingId);
  const safeAdvancedPreset = getAdvancedLightingPresetById(advancedLightingPreset);
  const safeAspect = normalizeAspectRatio(aspectRatio);

  const baseRecipe = buildDefaultRecipe({
    styleId: safeStyle.id,
    attireId: safeAttire.id,
    framingId: safeFraming.id,
    smartCrop: safeSmartCrop,
    lightingId: safeLighting.id,
    advancedLightingPreset: safeAdvancedPreset.id,
    aspectRatio: safeAspect,
    extraNotes: typeof extraNotes === 'string' ? extraNotes : '',
  });

  const defaultAnchor: FramingAnchor = {
    faceCenterX: clamp(detectedAnchor?.faceCenterX, 0.2, 0.8, 0.5),
    faceCenterY: clamp(detectedAnchor?.faceCenterY, 0.14, 0.7, 0.37),
    faceHeightRatio: clamp(detectedAnchor?.faceHeightRatio, 0.15, 0.65, 0.34),
  };

  const ai = createGeminiClient();
  if (!ai || !sourceBase64 || typeof sourceBase64 !== 'string') {
    const smartSuggestion = safeSmartCrop ? suggestSmartCrop(defaultAnchor, safeAspect) : null;
    res.json({
      anchor: defaultAnchor,
      recipe: smartSuggestion
        ? {
            ...baseRecipe,
            framingId: smartSuggestion.framingId,
            zoomAdjust: smartSuggestion.zoomAdjust,
            verticalOffset: smartSuggestion.verticalOffset,
            smartCrop: true,
          }
        : baseRecipe,
      directorNote: `Developed on ${safeStyle.name} with ${safeLighting.label.toLowerCase()} and calibrated tonal balance.`,
    });
    return;
  }

  try {
    const mimeType =
      typeof sourceMimeType === 'string' && sourceMimeType.startsWith('image/')
        ? sourceMimeType
        : 'image/jpeg';

    const trimmedNotes =
      typeof extraNotes === 'string' ? extraNotes.trim().slice(0, 300) : '';

    const response = await ai.models.generateContent({
      model: FREE_VISION_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              data: sourceBase64,
              mimeType,
            },
          },
          {
            text: `You are a master portrait darkroom colorist and camera operator calibrating a studio headshot transform.
Inspect this uploaded selfie and return precise calibration parameters for compositing the subject onto the "${safeStyle.name}" studio backdrop with "${safeLighting.label}" lighting and "${safeFraming.label}" framing.${trimmedNotes ? `\nAdditional client direction: "${trimmedNotes}".` : ''}

Return:
1. faceCenterX (0.15..0.85): horizontal center of the person's face in normalized image coordinates (0=left, 1=right).
2. faceCenterY (0.12..0.75): vertical center of the person's eyes/bridge of nose (0=top, 1=bottom).
3. faceHeightRatio (0.12..0.65): height of the head from chin to crown divided by total image height.
4. exposureDelta (-0.25..+0.25): correction needed if the selfie is underexposed (+) or overexposed (-).
5. warmthDelta (-0.20..+0.20): white-balance correction if the selfie is too cool/blue (+) or too yellow/orange (-).
6. contrastDelta (-0.15..+0.20): subtle tonal contrast polish.
7. directorNote: One concise, specific sentence noting how lighting and framing were calibrated for this portrait.`,
          },
        ],
      },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            faceCenterX: { type: Type.NUMBER },
            faceCenterY: { type: Type.NUMBER },
            faceHeightRatio: { type: Type.NUMBER },
            exposureDelta: { type: Type.NUMBER },
            warmthDelta: { type: Type.NUMBER },
            contrastDelta: { type: Type.NUMBER },
            directorNote: { type: Type.STRING },
          },
          required: [
            'faceCenterX',
            'faceCenterY',
            'faceHeightRatio',
            'exposureDelta',
            'warmthDelta',
            'contrastDelta',
            'directorNote',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      faceCenterX?: number;
      faceCenterY?: number;
      faceHeightRatio?: number;
      exposureDelta?: number;
      warmthDelta?: number;
      contrastDelta?: number;
      directorNote?: string;
    };

    const anchor: FramingAnchor = {
      faceCenterX: clamp(parsed.faceCenterX, 0.2, 0.8, 0.5),
      faceCenterY: clamp(parsed.faceCenterY, 0.14, 0.7, 0.37),
      faceHeightRatio: clamp(parsed.faceHeightRatio, 0.15, 0.65, 0.34),
    };

    const smartSuggestion = safeSmartCrop ? suggestSmartCrop(anchor, safeAspect) : null;

    const calibratedRecipe: DarkroomRecipe = applyAdvancedLightingPreset(
      {
        ...baseRecipe,
        framingId: smartSuggestion ? smartSuggestion.framingId : baseRecipe.framingId,
        zoomAdjust: smartSuggestion ? smartSuggestion.zoomAdjust : baseRecipe.zoomAdjust,
        verticalOffset: smartSuggestion
          ? smartSuggestion.verticalOffset
          : baseRecipe.verticalOffset,
        smartCrop: safeSmartCrop,
        exposure: clamp(
          baseRecipe.exposure + clamp(parsed.exposureDelta, -0.22, 0.22, 0),
          -0.35,
          0.35,
          baseRecipe.exposure
        ),
        warmth: clamp(
          baseRecipe.warmth + clamp(parsed.warmthDelta, -0.2, 0.2, 0),
          -0.35,
          0.35,
          baseRecipe.warmth
        ),
        contrast: clamp(
          baseRecipe.contrast + clamp(parsed.contrastDelta, -0.12, 0.18, 0),
          -0.3,
          0.4,
          baseRecipe.contrast
        ),
      },
      safeAdvancedPreset.id
    );

    res.json({
      anchor,
      recipe: calibratedRecipe,
      directorNote:
        parsed.directorNote?.trim() ||
        `Calibrated exposure and eye-line framing for ${safeStyle.name}.`,
    });
  } catch {
    // Graceful free fallback so darkroom rendering never blocks the user
    res.json({
      anchor: defaultAnchor,
      recipe: baseRecipe,
      directorNote: `Developed on ${safeStyle.name} with ${safeLighting.label.toLowerCase()} and balanced studio tones.`,
    });
  }
});

/**
 * Free-tier AI Natural-Language Retouching Interpreter (`gemini-4-hydrogen`)
 * Translates any user retouching instruction into precise updated DarkroomRecipe settings.
 */
app.post('/api/headshots/retouch-recipe', async (req, res) => {
  const { retouchPrompt, currentRecipe } = req.body ?? {};
  const cleanPrompt =
    typeof retouchPrompt === 'string' ? retouchPrompt.trim().slice(0, 400) : '';

  if (!cleanPrompt) {
    res.status(400).json({ error: 'Enter a retouching instruction first.' });
    return;
  }

  const fallbackRecipe: DarkroomRecipe = {
    ...buildDefaultRecipe({
      styleId: getStyleById(currentRecipe?.styleId).id,
      attireId: getAttireById(currentRecipe?.attireId).id,
      framingId: getFramingById(currentRecipe?.framingId).id,
      smartCrop: Boolean(currentRecipe?.smartCrop),
      lightingId: getLightingById(currentRecipe?.lightingId).id,
      advancedLightingPreset: getAdvancedLightingPresetById(currentRecipe?.advancedLightingPreset)
        .id,
      aspectRatio: normalizeAspectRatio(currentRecipe?.aspectRatio),
      extraNotes: '',
    }),
    ...(typeof currentRecipe === 'object' && currentRecipe ? currentRecipe : {}),
  };

  const ai = createGeminiClient();
  if (!ai) {
    res.json({
      recipe: applyHeuristicRetouch(cleanPrompt, fallbackRecipe),
      directorNote: `Applied darkroom retouch: "${cleanPrompt}".`,
    });
    return;
  }

  try {
    const styleIds = STUDIO_STYLES.map((s) => s.id);
    const attireIds = ATTIRE_OPTIONS.map((a) => a.id);
    const framingIds = FRAMING_OPTIONS.map((f) => f.id);
    const lightingIds = LIGHTING_OPTIONS.map((l) => l.id);

    const response = await ai.models.generateContent({
      model: FREE_VISION_MODEL,
      contents: `You are an editorial darkroom retoucher translating a user's natural-language portrait edit instruction into exact darkroom parameters.

Current darkroom recipe:
${JSON.stringify(fallbackRecipe)}

User retouching prompt:
"${cleanPrompt}"

Allowed enums:
- styleId: ${styleIds.join(', ')}
- attireId: ${attireIds.join(', ')}
- framingId: ${framingIds.join(', ')}
- lightingId: ${lightingIds.join(', ')}

Rules:
- Only change parameters relevant to the user's request; keep untouched settings close to the current recipe.
- If the user asks for black-and-white / monochrome, set monochrome=true and saturation=-1. If they ask to restore color, set monochrome=false and saturation around 0.
- Ranges: exposure (-0.35..0.35), contrast (-0.30..0.40), warmth (-0.35..0.35), saturation (-1.0..0.35), backdropBlur (0..16), vignette (0..0.75), rimLight (0..1.0), keyLightStrength (0..1.0), grain (0..0.35), zoomAdjust (0.85..1.35), verticalOffset (-0.15..0.15).
- Provide a concise 1-sentence directorNote describing the visual adjustment applied.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            styleId: { type: Type.STRING, enum: styleIds },
            attireId: { type: Type.STRING, enum: attireIds },
            framingId: { type: Type.STRING, enum: framingIds },
            lightingId: { type: Type.STRING, enum: lightingIds },
            exposure: { type: Type.NUMBER },
            contrast: { type: Type.NUMBER },
            warmth: { type: Type.NUMBER },
            saturation: { type: Type.NUMBER },
            monochrome: { type: Type.BOOLEAN },
            backdropBlur: { type: Type.NUMBER },
            vignette: { type: Type.NUMBER },
            rimLight: { type: Type.NUMBER },
            keyLightStrength: { type: Type.NUMBER },
            grain: { type: Type.NUMBER },
            zoomAdjust: { type: Type.NUMBER },
            verticalOffset: { type: Type.NUMBER },
            directorNote: { type: Type.STRING },
          },
          required: [
            'styleId',
            'attireId',
            'framingId',
            'lightingId',
            'exposure',
            'contrast',
            'warmth',
            'saturation',
            'monochrome',
            'backdropBlur',
            'vignette',
            'rimLight',
            'keyLightStrength',
            'grain',
            'zoomAdjust',
            'verticalOffset',
            'directorNote',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<DarkroomRecipe> & {
      directorNote?: string;
    };

    const resolvedFramingId = getFramingById(parsed.framingId ?? fallbackRecipe.framingId).id;
    const framingChanged = resolvedFramingId !== fallbackRecipe.framingId;

    const nextRecipe: DarkroomRecipe = {
      styleId: getStyleById(parsed.styleId ?? fallbackRecipe.styleId).id,
      attireId: getAttireById(parsed.attireId ?? fallbackRecipe.attireId).id,
      framingId: resolvedFramingId,
      smartCrop: framingChanged ? false : Boolean(fallbackRecipe.smartCrop),
      lightingId: getLightingById(parsed.lightingId ?? fallbackRecipe.lightingId).id,
      aspectRatio: fallbackRecipe.aspectRatio,
      exposure: clamp(parsed.exposure, -0.35, 0.35, fallbackRecipe.exposure),
      contrast: clamp(parsed.contrast, -0.3, 0.4, fallbackRecipe.contrast),
      warmth: clamp(parsed.warmth, -0.35, 0.35, fallbackRecipe.warmth),
      saturation: clamp(parsed.saturation, -1, 0.35, fallbackRecipe.saturation),
      monochrome:
        typeof parsed.monochrome === 'boolean' ? parsed.monochrome : fallbackRecipe.monochrome,
      backdropBlur: clamp(parsed.backdropBlur, 0, 16, fallbackRecipe.backdropBlur),
      vignette: clamp(parsed.vignette, 0, 0.75, fallbackRecipe.vignette),
      rimLight: clamp(parsed.rimLight, 0, 1, fallbackRecipe.rimLight),
      keyLightStrength: clamp(parsed.keyLightStrength, 0, 1, fallbackRecipe.keyLightStrength),
      grain: clamp(parsed.grain, 0, 0.35, fallbackRecipe.grain),
      zoomAdjust: clamp(parsed.zoomAdjust, 0.85, 1.35, fallbackRecipe.zoomAdjust),
      verticalOffset: clamp(parsed.verticalOffset, -0.15, 0.15, fallbackRecipe.verticalOffset),
      sharpen: clamp(fallbackRecipe.sharpen, 0, 1, 0),
      advancedLightingPreset: getAdvancedLightingPresetById(fallbackRecipe.advancedLightingPreset)
        .id,
    };

    res.json({
      recipe: nextRecipe,
      directorNote: parsed.directorNote?.trim() || `Refined frame: "${cleanPrompt}".`,
    });
  } catch {
    res.json({
      recipe: applyHeuristicRetouch(cleanPrompt, fallbackRecipe),
      directorNote: `Applied darkroom adjustment: "${cleanPrompt}".`,
    });
  }
});

function applyHeuristicRetouch(prompt: string, current: DarkroomRecipe): DarkroomRecipe {
  const lower = prompt.toLowerCase();
  const next: DarkroomRecipe = { ...current };

  if (lower.includes('black and white') || lower.includes('monochrome') || lower.includes('b&w')) {
    next.monochrome = true;
    next.saturation = -1;
    next.contrast = Math.min(0.35, next.contrast + 0.1);
    next.grain = Math.max(next.grain, 0.14);
  }
  if (lower.includes('color') && !lower.includes('monochrome')) {
    next.monochrome = false;
    next.saturation = 0.04;
  }
  if (lower.includes('bright') || lower.includes('lighter') || lower.includes('lift')) {
    next.exposure = Math.min(0.32, next.exposure + 0.1);
  }
  if (lower.includes('dark') || lower.includes('moody') || lower.includes('dramatic')) {
    next.exposure = Math.max(-0.22, next.exposure - 0.06);
    next.contrast = Math.min(0.36, next.contrast + 0.1);
    next.vignette = Math.min(0.65, next.vignette + 0.12);
    next.lightingId = 'rembrandt';
  }
  if (lower.includes('soft') || lower.includes('gentle') || lower.includes('skin texture') || lower.includes('smooth')) {
    next.contrast = Math.max(-0.15, next.contrast - 0.07);
    next.keyLightStrength = Math.max(0.25, next.keyLightStrength - 0.15);
    next.sharpen = 0;
  }
  if (lower.includes('warm') || lower.includes('golden') || lower.includes('sunset')) {
    next.warmth = Math.min(0.32, next.warmth + 0.12);
    next.rimLight = Math.min(0.95, next.rimLight + 0.2);
    next.lightingId = 'golden-rim';
  }
  if (lower.includes('cool') || lower.includes('crisp')) {
    next.warmth = Math.max(-0.28, next.warmth - 0.1);
  }
  if (lower.includes('blur') || lower.includes('bokeh') || lower.includes('depth')) {
    next.backdropBlur = Math.min(16, next.backdropBlur + 4);
    next.vignette = Math.min(0.62, next.vignette + 0.06);
  }
  if (lower.includes('tight') || lower.includes('closer') || lower.includes('zoom in')) {
    next.framingId = 'tight-headshot';
    next.zoomAdjust = Math.min(1.28, next.zoomAdjust + 0.12);
    next.smartCrop = false;
  }
  if (lower.includes('wide') || lower.includes('zoom out')) {
    next.framingId = 'mid-chest';
    next.zoomAdjust = Math.max(0.88, next.zoomAdjust - 0.1);
    next.smartCrop = false;
  }
  if (lower.includes('navy')) next.attireId = 'smart-knit';
  else if (lower.includes('charcoal') || lower.includes('blazer')) next.attireId = 'charcoal-blazer';
  else if (lower.includes('white') || lower.includes('ivory') || lower.includes('oxford'))
    next.attireId = 'crisp-oxford';
  else if (lower.includes('turtleneck') || lower.includes('black shirt'))
    next.attireId = 'black-turtleneck';

  if (lower.includes('office') || lower.includes('tech')) next.styleId = 'modern-tech';
  else if (lower.includes('outdoor') || lower.includes('garden') || lower.includes('nature'))
    next.styleId = 'outdoor-natural';
  else if (lower.includes('grey') || lower.includes('gray') || lower.includes('corporate'))
    next.styleId = 'corporate-grey';
  else if (lower.includes('lounge') || lower.includes('walnut') || lower.includes('executive'))
    next.styleId = 'executive-lounge';
  else if (lower.includes('gallery') || lower.includes('travertine') || lower.includes('architect'))
    next.styleId = 'architectural-daylight';

  return next;
}

/**
 * Free-tier Selfie Lighting & Composition Critique (`gemini-4-hydrogen`)
 */
app.post('/api/headshots/analyze', async (req, res) => {
  try {
    const { sourceBase64, sourceMimeType } = req.body ?? {};
    if (!sourceBase64 || typeof sourceBase64 !== 'string') {
      res.status(400).json({ error: 'Upload a selfie first to run the studio lighting critique.' });
      return;
    }

    const ai = createGeminiClient();
    if (!ai) {
      res.json({
        summary:
          'Clean front-facing posture ready for seamless studio relighting and gentle tonal sculpting.',
        lightingAssessment:
          'Balanced ambient exposure; softbox key fill and subtle hair rim separation recommended.',
        recommendedStyleId: 'corporate-grey',
        recommendedAttireId: 'charcoal-blazer',
        recommendedFramingId: 'head-shoulders',
        recommendedLightingId: 'softbox-key',
        retouchIdeas: [
          'Add warmer golden hour rim light and softer bokeh',
          'Convert to dramatic silver-gelatin monochrome',
        ],
      });
      return;
    }

    const mimeType =
      typeof sourceMimeType === 'string' && sourceMimeType.startsWith('image/')
        ? sourceMimeType
        : 'image/jpeg';

    const styleIds = STUDIO_STYLES.map((s) => s.id);
    const attireIds = ATTIRE_OPTIONS.map((a) => a.id);
    const framingIds = FRAMING_OPTIONS.map((f) => f.id);
    const lightingIds = LIGHTING_OPTIONS.map((l) => l.id);

    const response = await ai.models.generateContent({
      model: FREE_VISION_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              data: sourceBase64,
              mimeType,
            },
          },
          {
            text: `You are a veteran editorial portrait photographer reviewing a client's casual selfie before a studio headshot session.
Evaluate the selfie's current lighting, angle, and background, then recommend the single best combination from these exact IDs:
- styleId options: ${styleIds.join(', ')}
- attireId options: ${attireIds.join(', ')}
- framingId options: ${framingIds.join(', ')}
- lightingId options: ${lightingIds.join(', ')}

Keep the critique concise, encouraging, and grounded in real portrait photography (max 2 short sentences for summary, 1 short sentence for lightingAssessment, and 2 concise retouchIdeas).`,
          },
        ],
      },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            lightingAssessment: { type: Type.STRING },
            recommendedStyleId: { type: Type.STRING, enum: styleIds },
            recommendedAttireId: { type: Type.STRING, enum: attireIds },
            recommendedFramingId: { type: Type.STRING, enum: framingIds },
            recommendedLightingId: { type: Type.STRING, enum: lightingIds },
            retouchIdeas: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: [
            'summary',
            'lightingAssessment',
            'recommendedStyleId',
            'recommendedAttireId',
            'recommendedFramingId',
            'recommendedLightingId',
            'retouchIdeas',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      summary?: string;
      lightingAssessment?: string;
      recommendedStyleId?: StyleId;
      recommendedAttireId?: AttireId;
      recommendedFramingId?: FramingId;
      recommendedLightingId?: LightingId;
      retouchIdeas?: string[];
    };

    res.json({
      summary:
        parsed.summary || 'Strong eye contact and clear facial features ready for studio lighting.',
      lightingAssessment:
        parsed.lightingAssessment ||
        'Ambient light detected; studio key diffusion will add dimension.',
      recommendedStyleId: getStyleById(parsed.recommendedStyleId ?? 'corporate-grey').id,
      recommendedAttireId: getAttireById(parsed.recommendedAttireId ?? 'charcoal-blazer').id,
      recommendedFramingId: getFramingById(parsed.recommendedFramingId ?? 'head-shoulders').id,
      recommendedLightingId: getLightingById(parsed.recommendedLightingId ?? 'softbox-key').id,
      retouchIdeas: Array.isArray(parsed.retouchIdeas)
        ? parsed.retouchIdeas.slice(0, 2)
        : ['Brighten face exposure and soften shadows'],
    });
  } catch {
    res.json({
      summary:
        'Good natural eye contact and clean framing—ideal for a medium-format corporate or daylight portrait.',
      lightingAssessment:
        'Soft studio key light and subtle rim separation will elevate facial depth cleanly.',
      recommendedStyleId: 'modern-tech',
      recommendedAttireId: 'smart-knit',
      recommendedFramingId: 'head-shoulders',
      recommendedLightingId: 'diffused-window',
      retouchIdeas: [
        'Brighten face exposure and soften shadows',
        'Add warmer golden hour rim light and softer bokeh',
      ],
    });
  }
});

/**
 * Lightweight Free-Tier Retouch Suggestion Generator (`gemini-4-hydrogen`, ThinkingLevel.LOW)
 * Generates context-aware retouching suggestions tailored to the active portrait's style settings.
 */
app.post('/api/headshots/suggest-retouches', async (req, res) => {
  const {
    styleName,
    attireLabel,
    framingLabel,
    lightingLabel,
    aspectRatio,
    recipe,
    retouchPrompt,
    directorNote,
    previousSuggestions,
  } = req.body ?? {};

  const ai = createGeminiClient();
  if (!ai) {
    res.status(503).json({
      error:
        'Gemini API key is not configured in Settings > Secrets. Add a Gemini API key to use AI Auto-Suggest.',
    });
    return;
  }

  const safeStyle = getStyleById(recipe?.styleId);
  const safeAttire = getAttireById(recipe?.attireId);
  const safeFraming = getFramingById(recipe?.framingId);
  const safeLighting = getLightingById(recipe?.lightingId);
  const safeAdvancedPreset = getAdvancedLightingPresetById(recipe?.advancedLightingPreset);

  const avoidList = Array.isArray(previousSuggestions)
    ? previousSuggestions
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .slice(0, 8)
    : [];

  const promptText = `You are a veteran editorial portrait retoucher inside Sable Studio.
Suggest 4 concise, actionable, studio-authentic retouching instructions tailored to this portrait's current settings.

Current portrait configuration:
- Backdrop / Style: ${typeof styleName === 'string' && styleName.trim() ? styleName : safeStyle.name}
- Wardrobe Tone: ${typeof attireLabel === 'string' && attireLabel.trim() ? attireLabel : safeAttire.label}
- Lens Framing: ${typeof framingLabel === 'string' && framingLabel.trim() ? framingLabel : safeFraming.label} (${recipe?.smartCrop ? 'Smart Crop On' : 'Manual Crop'})
- Lighting Setup: ${typeof lightingLabel === 'string' && lightingLabel.trim() ? lightingLabel : safeLighting.label}
- Advanced Lighting Preset: ${safeAdvancedPreset.label}
- Aspect Ratio: ${normalizeAspectRatio(aspectRatio ?? recipe?.aspectRatio)}
- Tonal Recipe: monochrome=${Boolean(recipe?.monochrome)}, exposure=${typeof recipe?.exposure === 'number' ? recipe.exposure.toFixed(2) : '0.04'}, contrast=${typeof recipe?.contrast === 'number' ? recipe.contrast.toFixed(2) : '0.10'}, warmth=${typeof recipe?.warmth === 'number' ? recipe.warmth.toFixed(2) : '0.00'}, backdropBlur=${typeof recipe?.backdropBlur === 'number' ? recipe.backdropBlur : 6}px, rimLight=${typeof recipe?.rimLight === 'number' ? recipe.rimLight.toFixed(2) : '0.45'}, vignette=${typeof recipe?.vignette === 'number' ? recipe.vignette.toFixed(2) : '0.30'}, sharpen=${typeof recipe?.sharpen === 'number' ? recipe.sharpen.toFixed(2) : '0.00'}
${typeof retouchPrompt === 'string' && retouchPrompt.trim() ? `- Last Retouch Applied: "${retouchPrompt.trim()}"` : ''}
${typeof directorNote === 'string' && directorNote.trim() ? `- Darkroom Note: "${directorNote.trim()}"` : ''}
${avoidList.length > 0 ? `- Avoid repeating these previous suggestions: ${avoidList.map((s) => `"${s}"`).join(', ')}` : ''}

Requirements:
- Return exactly 4 distinct suggestions, each 3 to 8 words long, written as direct retouching commands (e.g., "Soften skin texture and shadow rolloff", "Increase background depth and bokeh", "Add warm golden rim separation", "Tighten crop to 85mm close-up").
- Tailor every suggestion to complement or elevate the current style, lighting, and recipe (do not suggest monochrome if monochrome is already true; do not suggest the exact current backdrop).
- Keep every suggestion realistic for darkroom lighting, tonal contrast, skin/shadow softness, bokeh depth, rim light, framing crop, wardrobe tone, or backdrop adjustments.`;

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: FREE_VISION_MODEL,
        contents: promptText,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['suggestions'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        suggestions?: unknown[];
      };

      const cleaned = Array.isArray(parsed.suggestions)
        ? Array.from(
            new Set(
              parsed.suggestions
                .filter((item): item is string => typeof item === 'string')
                .map((item) => item.trim().replace(/^["'•\-–\d.)\s]+|["']+$/g, ''))
                .filter((item) => item.length >= 6 && item.length <= 72)
            )
          ).slice(0, 4)
        : [];

      if (cleaned.length === 0) {
        throw new Error('Model returned no usable retouch suggestions.');
      }

      res.json({ suggestions: cleaned });
      return;
    } catch (err) {
      lastError = err;
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }
  }

  const rawMessage = lastError instanceof Error ? lastError.message : '';
  const lower = rawMessage.toLowerCase();
  if (lower.includes('403') || lower.includes('permission_denied') || lower.includes('api_key_invalid')) {
    res.status(403).json({
      error: 'Gemini API key was rejected. Check your API key in Settings > Secrets.',
    });
    return;
  }
  if (lower.includes('429') || lower.includes('resource_exhausted')) {
    res.status(429).json({
      error: 'Rate limit reached on the Gemini API. Wait a moment and try Auto-Suggest again.',
    });
    return;
  }
  res.status(502).json({
    error: 'Unable to generate retouch suggestions right now. Please try again.',
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sable Studio listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
