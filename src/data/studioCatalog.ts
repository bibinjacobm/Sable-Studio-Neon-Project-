export type StyleId =
  | 'corporate-grey'
  | 'modern-tech'
  | 'outdoor-natural'
  | 'editorial-mono'
  | 'executive-lounge'
  | 'architectural-daylight';

export type AttireId =
  | 'keep-original'
  | 'charcoal-blazer'
  | 'crisp-oxford'
  | 'black-turtleneck'
  | 'smart-knit';

export type FramingId = 'tight-headshot' | 'head-shoulders' | 'mid-chest';

export type LightingId =
  | 'softbox-key'
  | 'rembrandt'
  | 'golden-rim'
  | 'diffused-window';

export type AdvancedLightingPresetId =
  | 'none'
  | 'golden-hour'
  | 'noir-high-contrast'
  | 'soft-diffused';

export type SubjectProfileId = 'androgynous' | 'masculine' | 'feminine';

export type AspectRatioOption = '3:4' | '1:1' | '4:3';

export interface DarkroomRecipe {
  styleId: StyleId;
  attireId: AttireId;
  framingId: FramingId;
  lightingId: LightingId;
  aspectRatio: AspectRatioOption;
  /** -0.35 to +0.35 exposure lift */
  exposure: number;
  /** -0.30 to +0.40 tonal contrast */
  contrast: number;
  /** -0.35 (cool) to +0.35 (warm) color temperature shift */
  warmth: number;
  /** -1.0 (monochrome) to +0.35 (rich) saturation delta */
  saturation: number;
  /** Full silver-gelatin black & white mode */
  monochrome: boolean;
  /** 0 to 20 px optical lens bokeh blur on backdrop */
  backdropBlur: number;
  /** 0 to 0.75 edge vignette strength */
  vignette: number;
  /** 0 to 1.0 directional rim light intensity */
  rimLight: number;
  /** 0 to 1.0 directional key light sculpting intensity */
  keyLightStrength: number;
  /** 0 to 0.35 subtle fine film grain */
  grain: number;
  /** 0.85 to 1.35 relative zoom multiplier on top of framing preset */
  zoomAdjust: number;
  /** -0.15 to +0.15 vertical framing nudge */
  verticalOffset: number;
  /** 0 to 1.0 local unsharp mask intensity */
  sharpen?: number;
  /** Optional creative lighting preset override */
  advancedLightingPreset?: AdvancedLightingPresetId;
  /** Target subject framing & lighting profile bias */
  subjectProfile?: SubjectProfileId;
  /** Whether framing was auto-selected via facial alignment Smart Crop */
  smartCrop?: boolean;
}

export interface FramingAnchor {
  faceCenterX: number;
  faceCenterY: number;
  faceHeightRatio: number;
}

export interface SmartCropSuggestion {
  framingId: FramingId;
  zoomAdjust: number;
  verticalOffset: number;
  eyeLinePercent: number;
  faceScalePercent: number;
  reason: string;
}

export interface StudioStylePreset {
  id: StyleId;
  name: string;
  shortName: string;
  subtitle: string;
  lensSpec: string;
  environmentSummary: string;
  previewImage: string;
  backdropImage: string;
  /** Center crop zoom into backdrop plate to hide studio edges where needed */
  backdropCropZoom: number;
  defaultLighting: LightingId;
  ambientRgb: [number, number, number];
  rimRgb: [number, number, number];
  defaultRecipe: Partial<DarkroomRecipe>;
}

export interface StudioControlOption<T extends string> {
  id: T;
  label: string;
  shortSpec: string;
}

export interface SourcePortrait {
  dataUrl: string;
  base64: string;
  mimeType: string;
  fileName: string;
  width: number;
  height: number;
}

export interface StudioDirectionConfig {
  styleId: StyleId;
  attireId: AttireId;
  framingId: FramingId;
  smartCrop: boolean;
  lightingId: LightingId;
  advancedLightingPreset: AdvancedLightingPresetId;
  subjectProfile: SubjectProfileId;
  aspectRatio: AspectRatioOption;
  /** 0 to 20 px optical background bokeh blur */
  backdropBlur: number;
  extraNotes: string;
}

export interface GeneratedTake {
  id: string;
  frameNumber: number;
  imageUrl: string;
  /** Unsharpened render preserved for non-destructive local unsharp mask slider adjustments */
  baseImageUrl?: string;
  sourceImageUrl: string;
  alignedSourceUrl?: string;
  styleId: StyleId;
  styleName: string;
  attireLabel: string;
  framingLabel: string;
  lightingLabel: string;
  aspectRatio: AspectRatioOption;
  recipe: DarkroomRecipe;
  anchor: FramingAnchor;
  retouchPrompt?: string;
  directorNote?: string;
  createdAt: number;
}

export interface SelfieCritique {
  summary: string;
  lightingAssessment: string;
  recommendedStyleId: StyleId;
  recommendedAttireId: AttireId;
  recommendedFramingId: FramingId;
  recommendedLightingId: LightingId;
  retouchIdeas: string[];
}

export const STUDIO_STYLES: StudioStylePreset[] = [
  {
    id: 'corporate-grey',
    name: 'Corporate Grey Backdrop',
    shortName: 'Corporate Grey',
    subtitle: 'Textured medium-slate seamless paper with balanced studio key light.',
    lensSpec: '85mm f/2.0',
    environmentSummary: 'Seamless Slate Studio',
    previewImage: '/src/assets/images/style_corporate_grey_1795109338362.jpg',
    backdropImage: '/src/assets/images/backdrop_corporate_grey_1795110377253.jpg',
    backdropCropZoom: 1.32,
    defaultLighting: 'softbox-key',
    ambientRgb: [96, 104, 112],
    rimRgb: [228, 232, 238],
    defaultRecipe: {
      exposure: 0.04,
      contrast: 0.1,
      warmth: -0.02,
      saturation: -0.08,
      monochrome: false,
      backdropBlur: 4,
      vignette: 0.34,
      rimLight: 0.42,
      keyLightStrength: 0.55,
      grain: 0.08,
    },
  },
  {
    id: 'modern-tech',
    name: 'Modern Tech Office',
    shortName: 'Tech Office',
    subtitle: 'Architectural glass, warm timber slats, and soft daylight bokeh.',
    lensSpec: '85mm f/1.8',
    environmentSummary: 'Glass & Wood Workspace',
    previewImage: '/src/assets/images/style_modern_tech_1795109267718.jpg',
    backdropImage: '/src/assets/images/backdrop_modern_tech_1795110377224.jpg',
    backdropCropZoom: 1.08,
    defaultLighting: 'diffused-window',
    ambientRgb: [134, 132, 124],
    rimRgb: [238, 244, 250],
    defaultRecipe: {
      exposure: 0.06,
      contrast: 0.08,
      warmth: 0.03,
      saturation: -0.04,
      monochrome: false,
      backdropBlur: 9,
      vignette: 0.24,
      rimLight: 0.48,
      keyLightStrength: 0.45,
      grain: 0.06,
    },
  },
  {
    id: 'outdoor-natural',
    name: 'Outdoor Natural Light',
    shortName: 'Outdoor Light',
    subtitle: 'Golden-hour courtyard foliage with organic stone depth and warm rim.',
    lensSpec: '85mm f/1.8',
    environmentSummary: 'Botanical Courtyard',
    previewImage: '/src/assets/images/style_outdoor_natural_1795109250024.jpg',
    backdropImage: '/src/assets/images/backdrop_outdoor_natural_1795110381632.jpg',
    backdropCropZoom: 1.08,
    defaultLighting: 'golden-rim',
    ambientRgb: [168, 146, 108],
    rimRgb: [255, 214, 145],
    defaultRecipe: {
      exposure: 0.06,
      contrast: 0.07,
      warmth: 0.14,
      saturation: 0.05,
      monochrome: false,
      backdropBlur: 10,
      vignette: 0.26,
      rimLight: 0.68,
      keyLightStrength: 0.42,
      grain: 0.07,
    },
  },
  {
    id: 'editorial-mono',
    name: 'Editorial Monochrome',
    shortName: 'Monochrome',
    subtitle: 'Silver-gelatin tonal contrast against a deep charcoal studio sweep.',
    lensSpec: '85mm f/2.0',
    environmentSummary: 'Obsidian Darkroom Sweep',
    previewImage: '/src/assets/images/style_editorial_mono_1795109252685.jpg',
    backdropImage: '/src/assets/images/backdrop_editorial_mono_1795110400735.jpg',
    backdropCropZoom: 1.32,
    defaultLighting: 'rembrandt',
    ambientRgb: [46, 46, 48],
    rimRgb: [235, 235, 235],
    defaultRecipe: {
      exposure: 0.03,
      contrast: 0.22,
      warmth: 0,
      saturation: -1,
      monochrome: true,
      backdropBlur: 3,
      vignette: 0.45,
      rimLight: 0.56,
      keyLightStrength: 0.72,
      grain: 0.14,
    },
  },
  {
    id: 'executive-lounge',
    name: 'Executive Warm Lounge',
    shortName: 'Warm Lounge',
    subtitle: 'Walnut paneling and subtle tungsten ambient depth for leadership bios.',
    lensSpec: '85mm f/2.0',
    environmentSummary: 'Walnut Architectural Study',
    previewImage: '/src/assets/images/style_executive_lounge_1795109272265.jpg',
    backdropImage: '/src/assets/images/backdrop_executive_lounge_1795110383619.jpg',
    backdropCropZoom: 1.06,
    defaultLighting: 'rembrandt',
    ambientRgb: [112, 82, 54],
    rimRgb: [255, 204, 136],
    defaultRecipe: {
      exposure: 0.02,
      contrast: 0.14,
      warmth: 0.12,
      saturation: 0.02,
      monochrome: false,
      backdropBlur: 8,
      vignette: 0.42,
      rimLight: 0.52,
      keyLightStrength: 0.62,
      grain: 0.09,
    },
  },
  {
    id: 'architectural-daylight',
    name: 'Architectural Daylight',
    shortName: 'Gallery Daylight',
    subtitle: 'Sunlit travertine stone walls with subtle diagonal gallery shadows.',
    lensSpec: '50mm f/2.0',
    environmentSummary: 'Travertine Gallery',
    previewImage: '/src/assets/images/style_architectural_daylight_1795109251611.jpg',
    backdropImage: '/src/assets/images/backdrop_architectural_daylight_1795110391655.jpg',
    backdropCropZoom: 1.08,
    defaultLighting: 'diffused-window',
    ambientRgb: [188, 178, 162],
    rimRgb: [252, 246, 234],
    defaultRecipe: {
      exposure: 0.08,
      contrast: 0.06,
      warmth: 0.05,
      saturation: -0.06,
      monochrome: false,
      backdropBlur: 7,
      vignette: 0.18,
      rimLight: 0.4,
      keyLightStrength: 0.4,
      grain: 0.06,
    },
  },
];

export const ATTIRE_OPTIONS: StudioControlOption<AttireId>[] = [
  { id: 'keep-original', label: 'Keep Original', shortSpec: 'Natural wardrobe' },
  { id: 'charcoal-blazer', label: 'Charcoal Suit Tone', shortSpec: 'Matte charcoal' },
  { id: 'crisp-oxford', label: 'Crisp Ivory Tone', shortSpec: 'Clean light shirt' },
  { id: 'black-turtleneck', label: 'Obsidian Knit Tone', shortSpec: 'Deep matte black' },
  { id: 'smart-knit', label: 'Executive Navy Tone', shortSpec: 'Tailored dark navy' },
];

export const FRAMING_OPTIONS: StudioControlOption<FramingId>[] = [
  { id: 'tight-headshot', label: 'Tight Headshot', shortSpec: '85mm close' },
  { id: 'head-shoulders', label: 'Head & Shoulders', shortSpec: '85mm classic' },
  { id: 'mid-chest', label: 'Mid-Chest Editorial', shortSpec: '50mm portrait' },
];

export const LIGHTING_OPTIONS: StudioControlOption<LightingId>[] = [
  { id: 'softbox-key', label: 'Softbox Studio Key', shortSpec: 'Balanced fill' },
  { id: 'rembrandt', label: 'Rembrandt Dramatic', shortSpec: 'Sculpted shadow' },
  { id: 'golden-rim', label: 'Golden Hour Rim', shortSpec: 'Warm backlit' },
  { id: 'diffused-window', label: 'Diffused Window', shortSpec: 'Natural directional' },
];

export interface AdvancedLightingPresetOption {
  id: AdvancedLightingPresetId;
  label: string;
  description: string;
  targetLightingId?: LightingId;
}

export const ADVANCED_LIGHTING_PRESETS: AdvancedLightingPresetOption[] = [
  {
    id: 'none',
    label: 'Default Studio Balance',
    description: 'Uses your selected style and lighting setup without extra tonal overrides.',
  },
  {
    id: 'golden-hour',
    label: 'Golden Hour',
    description: 'Warm amber sunset glow, luminous highlights, and golden hair-rim separation.',
    targetLightingId: 'golden-rim',
  },
  {
    id: 'noir-high-contrast',
    label: 'Noir High-Contrast',
    description: 'Deep silver-gelatin monochrome contrast, sculpted shadows, and fine editorial grain.',
    targetLightingId: 'rembrandt',
  },
  {
    id: 'soft-diffused',
    label: 'Soft Diffused',
    description: 'Airy beauty-dish diffusion with lifted midtones and gentle shadow rolloff.',
    targetLightingId: 'diffused-window',
  },
];

export interface SubjectProfileOption {
  id: SubjectProfileId;
  label: string;
  shortSpec: string;
  description: string;
  promptDirection: string;
  verticalBias: number;
}

export const SUBJECT_PROFILE_OPTIONS: SubjectProfileOption[] = [
  {
    id: 'androgynous',
    label: 'Androgynous',
    shortSpec: 'Balanced sculpting · Neutral fill',
    description:
      'Balanced editorial key-to-fill ratio with neutral highlight rolloff and centered eye-line poise.',
    promptDirection:
      'Androgynous editorial profile: maintain balanced key-to-fill contrast, neutral white balance, and clean centered eye-line framing.',
    verticalBias: 0,
  },
  {
    id: 'masculine',
    label: 'Masculine',
    shortSpec: 'Crisper contrast · Sculpted key',
    description:
      'Stronger directional key sculpting, crisper jawline micro-contrast, and grounded shoulder framing.',
    promptDirection:
      'Masculine portrait profile: favor slightly crisper tonal contrast, sculpted directional key lighting, and grounded shoulder framing.',
    verticalBias: -0.012,
  },
  {
    id: 'feminine',
    label: 'Feminine',
    shortSpec: 'Softer rolloff · Luminous fill',
    description:
      'Luminous beauty-dish fill, softer shadow transitions, warm skin midtones, and airy hair-rim glow.',
    promptDirection:
      'Feminine portrait profile: favor luminous midtone exposure, softer shadow contrast, warm flattering skin rolloff, and graceful headroom.',
    verticalBias: 0.012,
  },
];

export const ASPECT_RATIO_OPTIONS: { id: AspectRatioOption; label: string; useCase: string }[] = [
  { id: '3:4', label: '3:4 Portrait', useCase: 'Press & Bio' },
  { id: '1:1', label: '1:1 Square', useCase: 'LinkedIn & Avatar' },
  { id: '4:3', label: '4:3 Editorial', useCase: 'Website Feature' },
];

export const RETOUCH_QUICK_CUES: string[] = [
  'Convert to dramatic silver-gelatin monochrome',
  'Add warmer golden hour rim light and softer bokeh',
  'Brighten face exposure and soften shadows',
  'Switch wardrobe tone to deep executive navy',
  'Zoom into a tighter 85mm headshot crop',
  'Switch backdrop to Modern Tech Office daylight',
];

export function getStyleById(id: string): StudioStylePreset {
  return STUDIO_STYLES.find((s) => s.id === id) ?? STUDIO_STYLES[0];
}

export function getAttireById(id: string): StudioControlOption<AttireId> {
  return ATTIRE_OPTIONS.find((a) => a.id === id) ?? ATTIRE_OPTIONS[0];
}

export function getFramingById(id: string): StudioControlOption<FramingId> {
  return FRAMING_OPTIONS.find((f) => f.id === id) ?? FRAMING_OPTIONS[1];
}

export function getLightingById(id: string): StudioControlOption<LightingId> {
  return LIGHTING_OPTIONS.find((l) => l.id === id) ?? LIGHTING_OPTIONS[0];
}

export function getAdvancedLightingPresetById(id?: string): AdvancedLightingPresetOption {
  return (
    ADVANCED_LIGHTING_PRESETS.find((preset) => preset.id === id) ?? ADVANCED_LIGHTING_PRESETS[0]
  );
}

export function getSubjectProfileById(id?: string): SubjectProfileOption {
  return (
    SUBJECT_PROFILE_OPTIONS.find((profile) => profile.id === id) ?? SUBJECT_PROFILE_OPTIONS[0]
  );
}

export function applySubjectProfileBias(
  recipe: DarkroomRecipe,
  profileId?: SubjectProfileId
): DarkroomRecipe {
  const profile = getSubjectProfileById(profileId);
  if (profile.id === 'masculine') {
    return {
      ...recipe,
      subjectProfile: 'masculine',
      exposure: Math.max(-0.35, Math.min(0.35, recipe.exposure - 0.015)),
      contrast: Math.max(-0.3, Math.min(0.4, recipe.contrast + 0.05)),
      keyLightStrength: Math.max(0, Math.min(1, recipe.keyLightStrength + 0.1)),
      vignette: Math.max(0, Math.min(0.75, recipe.vignette + 0.04)),
      verticalOffset: Math.max(-0.15, Math.min(0.15, recipe.verticalOffset + profile.verticalBias)),
    };
  }
  if (profile.id === 'feminine') {
    return {
      ...recipe,
      subjectProfile: 'feminine',
      exposure: Math.max(-0.35, Math.min(0.35, recipe.exposure + 0.035)),
      contrast: Math.max(-0.3, Math.min(0.4, recipe.contrast - 0.05)),
      warmth: recipe.monochrome
        ? recipe.warmth
        : Math.max(-0.35, Math.min(0.35, recipe.warmth + 0.025)),
      keyLightStrength: Math.max(0, Math.min(1, recipe.keyLightStrength - 0.08)),
      rimLight: Math.max(0, Math.min(1, recipe.rimLight + 0.08)),
      verticalOffset: Math.max(-0.15, Math.min(0.15, recipe.verticalOffset + profile.verticalBias)),
    };
  }
  return {
    ...recipe,
    subjectProfile: 'androgynous',
  };
}

export function applyAdvancedLightingPreset(
  recipe: DarkroomRecipe,
  presetId?: AdvancedLightingPresetId
): DarkroomRecipe {
  const safePreset = getAdvancedLightingPresetById(presetId).id;
  if (safePreset === 'none') {
    return { ...recipe, advancedLightingPreset: 'none' };
  }

  switch (safePreset) {
    case 'golden-hour':
      return {
        ...recipe,
        advancedLightingPreset: 'golden-hour',
        lightingId: 'golden-rim',
        monochrome: false,
        exposure: Math.min(0.32, Math.max(0.08, recipe.exposure + 0.06)),
        warmth: Math.min(0.35, Math.max(0.22, recipe.warmth + 0.16)),
        saturation: Math.min(0.3, Math.max(0.08, recipe.saturation + 0.1)),
        contrast: Math.max(0.05, Math.min(0.24, recipe.contrast)),
        rimLight: Math.max(0.86, recipe.rimLight),
        vignette: Math.min(0.34, Math.max(0.2, recipe.vignette)),
      };
    case 'noir-high-contrast':
      return {
        ...recipe,
        advancedLightingPreset: 'noir-high-contrast',
        lightingId: 'rembrandt',
        monochrome: true,
        saturation: -1,
        warmth: 0,
        exposure: Math.max(-0.22, Math.min(0.04, recipe.exposure - 0.05)),
        contrast: Math.min(0.4, Math.max(0.32, recipe.contrast + 0.18)),
        vignette: Math.min(0.68, Math.max(0.52, recipe.vignette + 0.16)),
        rimLight: Math.max(0.7, recipe.rimLight),
        keyLightStrength: Math.max(0.82, recipe.keyLightStrength),
        grain: Math.max(0.16, recipe.grain),
      };
    case 'soft-diffused':
      return {
        ...recipe,
        advancedLightingPreset: 'soft-diffused',
        lightingId: 'diffused-window',
        monochrome: false,
        exposure: Math.min(0.32, Math.max(0.1, recipe.exposure + 0.08)),
        contrast: Math.max(-0.18, Math.min(-0.04, recipe.contrast - 0.12)),
        warmth: Math.max(-0.04, Math.min(0.1, recipe.warmth + 0.03)),
        saturation: Math.max(-0.08, Math.min(0.06, recipe.saturation)),
        vignette: Math.min(0.16, recipe.vignette),
        rimLight: Math.min(0.42, Math.max(0.28, recipe.rimLight)),
        keyLightStrength: Math.min(0.36, recipe.keyLightStrength),
        grain: Math.min(0.05, recipe.grain),
      };
  }
}

export function suggestSmartCrop(
  anchor: FramingAnchor,
  aspectRatio: AspectRatioOption
): SmartCropSuggestion {
  const faceX = Math.max(0.15, Math.min(0.85, anchor.faceCenterX));
  const faceY = Math.max(0.14, Math.min(0.72, anchor.faceCenterY));
  const faceRatio = Math.max(0.14, Math.min(0.65, anchor.faceHeightRatio));

  const estimatedCrownY = Math.max(0, faceY - faceRatio * 0.45);
  const estimatedShoulderRoom = Math.max(0, 1 - (faceY + faceRatio * 0.55));

  let framingId: FramingId = 'head-shoulders';
  let reason = 'Balanced facial scale and headroom suit classic 85mm head & shoulders.';

  if (faceRatio >= 0.41 || estimatedCrownY < 0.08 || faceY < 0.24) {
    framingId = 'tight-headshot';
    reason =
      faceRatio >= 0.41
        ? 'Close subject scale fits an 85mm tight headshot without cropping loss.'
        : 'Compact top headroom favors an 85mm tight headshot crop.';
  } else if (faceRatio <= 0.26 && faceY <= 0.46 && estimatedShoulderRoom >= 0.28) {
    framingId = 'mid-chest';
    reason = 'Generous headroom and shoulder margin suit a 50mm mid-chest editorial crop.';
  }

  // Subtle horizontal recentering margin when the face starts off-center
  const offCenterX = Math.abs(faceX - 0.5);
  let zoomAdjust = 1;
  if (offCenterX > 0.07) {
    zoomAdjust += Math.min(0.1, (offCenterX - 0.07) * 0.45);
  }
  if (framingId === 'tight-headshot' && faceRatio > 0.48) {
    zoomAdjust = Math.max(0.94, zoomAdjust - 0.05);
  }

  // Fine-tune eye-line height for aspect ratio and top headroom clearance
  let verticalOffset = 0;
  if (aspectRatio === '1:1') {
    verticalOffset += 0.02;
  } else if (aspectRatio === '4:3') {
    verticalOffset -= 0.02;
  }
  if (estimatedCrownY < 0.1) {
    verticalOffset -= 0.025;
  } else if (faceY > 0.48) {
    verticalOffset += 0.02;
  }

  zoomAdjust = Math.round(Math.max(0.94, Math.min(1.12, zoomAdjust)) * 100) / 100;
  verticalOffset = Math.round(Math.max(-0.06, Math.min(0.06, verticalOffset)) * 1000) / 1000;

  return {
    framingId,
    zoomAdjust,
    verticalOffset,
    eyeLinePercent: Math.round(faceY * 100),
    faceScalePercent: Math.round(faceRatio * 100),
    reason,
  };
}

export function formatApertureFromBlur(blurPx: number): string {
  const clamped = Math.max(0, Math.min(20, Math.round(blurPx)));
  if (clamped === 0) return 'f/11';
  if (clamped <= 2) return 'f/8.0';
  if (clamped <= 4) return 'f/5.6';
  if (clamped <= 7) return 'f/4.0';
  if (clamped <= 10) return 'f/2.8';
  if (clamped <= 13) return 'f/2.0';
  if (clamped <= 16) return 'f/1.8';
  return 'f/1.4';
}

export function buildDefaultRecipe(config: StudioDirectionConfig): DarkroomRecipe {
  const style = getStyleById(config.styleId);
  const base = style.defaultRecipe;
  const resolvedBlur =
    typeof config.backdropBlur === 'number' && Number.isFinite(config.backdropBlur)
      ? Math.max(0, Math.min(20, Math.round(config.backdropBlur)))
      : base.backdropBlur ?? 6;
  const baseRecipe: DarkroomRecipe = {
    styleId: config.styleId,
    attireId: config.attireId,
    framingId: config.framingId,
    smartCrop: Boolean(config.smartCrop),
    lightingId: config.lightingId,
    advancedLightingPreset: config.advancedLightingPreset ?? 'none',
    subjectProfile: getSubjectProfileById(config.subjectProfile).id,
    aspectRatio: config.aspectRatio,
    exposure: base.exposure ?? 0.04,
    contrast: base.contrast ?? 0.1,
    warmth: base.warmth ?? 0,
    saturation: base.saturation ?? -0.04,
    monochrome: base.monochrome ?? false,
    backdropBlur: resolvedBlur,
    vignette: base.vignette ?? 0.3,
    rimLight: base.rimLight ?? 0.45,
    keyLightStrength: base.keyLightStrength ?? 0.5,
    grain: base.grain ?? 0.08,
    zoomAdjust: 1,
    verticalOffset: 0,
    sharpen: 0,
  };
  const withSubjectBias = applySubjectProfileBias(baseRecipe, config.subjectProfile);
  return applyAdvancedLightingPreset(withSubjectBias, config.advancedLightingPreset);
}
