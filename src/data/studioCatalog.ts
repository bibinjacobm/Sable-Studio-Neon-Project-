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
  /** 0 to 16 px optical lens bokeh blur on backdrop */
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
}

export interface FramingAnchor {
  faceCenterX: number;
  faceCenterY: number;
  faceHeightRatio: number;
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
  lightingId: LightingId;
  aspectRatio: AspectRatioOption;
  extraNotes: string;
}

export interface GeneratedTake {
  id: string;
  frameNumber: number;
  imageUrl: string;
  sourceImageUrl: string;
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

export function buildDefaultRecipe(config: StudioDirectionConfig): DarkroomRecipe {
  const style = getStyleById(config.styleId);
  const base = style.defaultRecipe;
  return {
    styleId: config.styleId,
    attireId: config.attireId,
    framingId: config.framingId,
    lightingId: config.lightingId,
    aspectRatio: config.aspectRatio,
    exposure: base.exposure ?? 0.04,
    contrast: base.contrast ?? 0.1,
    warmth: base.warmth ?? 0,
    saturation: base.saturation ?? -0.04,
    monochrome: base.monochrome ?? false,
    backdropBlur: base.backdropBlur ?? 6,
    vignette: base.vignette ?? 0.3,
    rimLight: base.rimLight ?? 0.45,
    keyLightStrength: base.keyLightStrength ?? 0.5,
    grain: base.grain ?? 0.08,
    zoomAdjust: 1,
    verticalOffset: 0,
  };
}
