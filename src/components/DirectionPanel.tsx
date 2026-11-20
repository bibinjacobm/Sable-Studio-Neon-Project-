import React, { useState } from 'react';
import { Camera, Check, ChevronDown, RotateCcw, SlidersHorizontal, Sparkles } from 'lucide-react';
import {
  ADVANCED_LIGHTING_PRESETS,
  ASPECT_RATIO_OPTIONS,
  ATTIRE_OPTIONS,
  FRAMING_OPTIONS,
  LIGHTING_OPTIONS,
  STUDIO_MOOD_PRESETS,
  STUDIO_STYLES,
  SUBJECT_PROFILE_OPTIONS,
  formatApertureFromBlur,
  getAdvancedLightingPresetById,
  getAttireById,
  getFramingById,
  getLightingById,
  getStyleById,
  getSubjectProfileById,
  type AdvancedLightingPresetId,
  type AspectRatioOption,
  type AttireId,
  type FramingId,
  type LightingId,
  type SelfieCritique,
  type SmartCropSuggestion,
  type SourcePortrait,
  type StudioDirectionConfig,
  type StudioMoodPreset,
  type StyleId,
  type SubjectProfileId,
} from '../data/studioCatalog';

interface DirectionPanelProps {
  config: StudioDirectionConfig;
  sourcePortrait: SourcePortrait | null;
  critique: SelfieCritique | null;
  smartCropSuggestion: SmartCropSuggestion | null;
  isGenerating: boolean;
  isAnalyzing: boolean;
  isUpdatingBokeh: boolean;
  onStyleSelect: (styleId: StyleId) => void;
  onAttireSelect: (attireId: AttireId) => void;
  onFramingSelect: (framingId: FramingId) => void;
  onSmartCropToggle: (enabled: boolean) => void;
  onLightingSelect: (lightingId: LightingId) => void;
  onAdvancedLightingSelect: (presetId: AdvancedLightingPresetId) => void;
  onSubjectProfileSelect: (profileId: SubjectProfileId) => void;
  onBackdropBlurChange: (blurPx: number) => void;
  onAspectRatioSelect: (ratio: AspectRatioOption) => void;
  onExtraNotesChange: (notes: string) => void;
  onApplyMood: (mood: StudioMoodPreset) => void;
  onApplyCritique: () => void;
  onGenerate: () => void;
  onUploadClick: () => void;
}

interface FramingCropPreviewProps {
  framingId: FramingId;
  active: boolean;
}

/**
 * Precision darkroom viewfinder crop icon illustrating the relative portrait crop area
 * (Tight Headshot vs. Head & Shoulders vs. Mid-Chest Editorial).
 */
const FramingCropPreview: React.FC<FramingCropPreviewProps> = ({ framingId, active }) => {
  const bracketStroke = active ? '#D4A853' : 'rgba(245, 241, 232, 0.34)';
  const figureFill = active ? 'rgba(212, 168, 83, 0.24)' : 'rgba(245, 241, 232, 0.14)';
  const figureStroke = active ? '#F5F1E8' : 'rgba(245, 241, 232, 0.58)';
  const eyeLineStroke = active ? 'rgba(212, 168, 83, 0.48)' : 'rgba(255, 255, 255, 0.14)';

  const eyeLineY = framingId === 'tight-headshot' ? 16 : framingId === 'head-shoulders' ? 13.5 : 11;

  return (
    <span
      aria-hidden="true"
      className={`flex h-[38px] w-[30px] shrink-0 items-center justify-center overflow-hidden rounded-[4px] border transition-colors duration-150 ${
        active
          ? 'border-[#D4A853]/65 bg-[#111113]'
          : 'border-white/[0.1] bg-[#111113] group-hover/frame:border-white/25'
      }`}
    >
      <svg width="30" height="38" viewBox="0 0 32 40" className="h-full w-full">
        {/* Subtle horizontal eye-line reference guide */}
        <line
          x1="3"
          y1={eyeLineY}
          x2="29"
          y2={eyeLineY}
          stroke={eyeLineStroke}
          strokeWidth="0.7"
          strokeDasharray="1.8 1.8"
        />

        {/* Subject silhouette scaled accurately to each lens crop */}
        {framingId === 'tight-headshot' && (
          <g>
            <path
              d="M 3.5 40 Q 6.5 31.5 12.2 29.8 L 19.8 29.8 Q 25.5 31.5 28.5 40 Z"
              fill={figureFill}
              stroke={figureStroke}
              strokeWidth="1.05"
              strokeLinejoin="round"
            />
            <ellipse
              cx="16"
              cy="17"
              rx="7.1"
              ry="9.2"
              fill={figureFill}
              stroke={figureStroke}
              strokeWidth="1.05"
            />
          </g>
        )}

        {framingId === 'head-shoulders' && (
          <g>
            <path
              d="M 2.5 40 Q 4.2 27 12.4 24.4 L 19.6 24.4 Q 27.8 27 29.5 40 Z"
              fill={figureFill}
              stroke={figureStroke}
              strokeWidth="1.05"
              strokeLinejoin="round"
            />
            <ellipse
              cx="16"
              cy="14.2"
              rx="5.2"
              ry="6.7"
              fill={figureFill}
              stroke={figureStroke}
              strokeWidth="1.05"
            />
          </g>
        )}

        {framingId === 'mid-chest' && (
          <g>
            <path
              d="M 5 40 L 6.3 25.2 Q 7.4 20.5 13 19.6 L 19 19.6 Q 24.6 20.5 25.7 25.2 L 27 40 Z"
              fill={figureFill}
              stroke={figureStroke}
              strokeWidth="1.05"
              strokeLinejoin="round"
            />
            {/* Subtle collar/lapel V-line to communicate upper-torso depth */}
            <path
              d="M 13.4 20 L 16 25.5 L 18.6 20"
              fill="none"
              stroke={figureStroke}
              strokeWidth="0.85"
              strokeOpacity="0.65"
            />
            <ellipse
              cx="16"
              cy="11.4"
              rx="4"
              ry="5.1"
              fill={figureFill}
              stroke={figureStroke}
              strokeWidth="1.05"
            />
          </g>
        )}

        {/* Optical viewfinder corner crop brackets */}
        <path
          d="M 3 7.5 L 3 3 L 7.5 3 M 24.5 3 L 29 3 L 29 7.5 M 3 32.5 L 3 37 L 7.5 37 M 24.5 37 L 29 37 L 29 32.5"
          fill="none"
          stroke={bracketStroke}
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
};

export const DirectionPanel: React.FC<DirectionPanelProps> = ({
  config,
  sourcePortrait,
  critique,
  smartCropSuggestion,
  isGenerating,
  isAnalyzing,
  isUpdatingBokeh,
  onStyleSelect,
  onAttireSelect,
  onFramingSelect,
  onSmartCropToggle,
  onLightingSelect,
  onAdvancedLightingSelect,
  onSubjectProfileSelect,
  onBackdropBlurChange,
  onAspectRatioSelect,
  onExtraNotesChange,
  onApplyMood,
  onApplyCritique,
  onGenerate,
  onUploadClick,
}) => {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [hoveredMoodId, setHoveredMoodId] = useState<string | null>(null);
  const selectedStyle = getStyleById(config.styleId);
  const defaultStyleBlur = selectedStyle.defaultRecipe.backdropBlur ?? 6;
  const roundedBlur = Math.max(0, Math.min(20, Math.round(config.backdropBlur)));
  const apertureLabel = formatApertureFromBlur(roundedBlur);
  const selectedAdvancedPreset = getAdvancedLightingPresetById(config.advancedLightingPreset);
  const selectedSubjectProfile = getSubjectProfileById(config.subjectProfile);

  const activeMood =
    STUDIO_MOOD_PRESETS.find(
      (mood) =>
        mood.direction.styleId === config.styleId &&
        mood.direction.lightingId === config.lightingId &&
        mood.direction.advancedLightingPreset === config.advancedLightingPreset
    ) ?? null;

  const inspectedMood =
    (hoveredMoodId ? STUDIO_MOOD_PRESETS.find((m) => m.id === hoveredMoodId) : null) ??
    activeMood ??
    STUDIO_MOOD_PRESETS[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-white/[0.07] pb-4">
        <h2 className="font-serif text-2xl font-semibold text-[#F5F1E8]">Studio Direction</h2>
        <p className="mt-0.5 text-xs text-[#9B968C]">
          Configure backdrop, wardrobe tone, lens framing, and studio lighting
        </p>
      </div>

      {/* Optional Photographer's Lighting Critique Card */}
      {(critique || isAnalyzing) && (
        <div className="rounded-lg border border-[#D4A853]/30 bg-[#0B0B0C]/80 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#D4A853]">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Photographer’s Lighting Note</span>
            </span>
            {critique && (
              <button
                type="button"
                onClick={onApplyCritique}
                className="text-xs font-medium text-[#F5F1E8] underline decoration-[#D4A853]/60 underline-offset-4 transition-colors hover:text-[#D4A853] cursor-pointer whitespace-nowrap"
              >
                Apply Recommended
              </button>
            )}
          </div>
          {isAnalyzing ? (
            <p className="mt-2 text-xs text-[#9B968C]">
              Inspecting exposure balance, eye line, and framing...
            </p>
          ) : (
            critique && (
              <>
                <p className="mt-2 text-xs leading-relaxed text-[#F5F1E8]/90">
                  {critique.summary}
                </p>
                <p className="mt-1.5 text-xs text-[#9B968C]">{critique.lightingAssessment}</p>
                <p className="mt-2 text-xs text-[#9B968C]">
                  Suggested: {getStyleById(critique.recommendedStyleId).shortName}{' '}
                  <span aria-hidden="true">·</span>{' '}
                  {getAttireById(critique.recommendedAttireId).label}{' '}
                  <span aria-hidden="true">·</span>{' '}
                  {getFramingById(critique.recommendedFramingId).label}{' '}
                  <span aria-hidden="true">·</span>{' '}
                  {getLightingById(critique.recommendedLightingId).label}
                </p>
              </>
            )
          )}
        </div>
      )}

      {/* Studio Mood Visual Reference Collage */}
      <section aria-label="Studio Mood aesthetic reference collage">
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#F5F1E8] whitespace-nowrap">Studio Mood</h3>
          <span className="truncate text-[11px] text-[#9B968C]">
            {activeMood ? activeMood.name : 'Visual aesthetic presets'}
          </span>
        </div>

        <div className="grid grid-cols-12 gap-2">
          {/* Dominant Left Editorial Plate (Cinematic Editorial) */}
          {(() => {
            const leadMood = STUDIO_MOOD_PRESETS[0];
            const isMatched = activeMood?.id === leadMood.id;
            const failed = failedImages[`mood-${leadMood.id}`];
            return (
              <button
                type="button"
                onClick={() => onApplyMood(leadMood)}
                onMouseEnter={() => setHoveredMoodId(leadMood.id)}
                onMouseLeave={() => setHoveredMoodId(null)}
                onFocus={() => setHoveredMoodId(leadMood.id)}
                onBlur={() => setHoveredMoodId(null)}
                aria-pressed={isMatched}
                aria-label={`Apply ${leadMood.name} studio mood (${leadMood.aestheticCue})`}
                className={`group/mood relative col-span-5 h-[206px] overflow-hidden rounded-lg border text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer ${
                  isMatched
                    ? 'border-[#D4A853] ring-1 ring-[#D4A853]/50'
                    : 'border-white/[0.08] hover:border-white/25'
                }`}
              >
                {!failed ? (
                  <img
                    src={leadMood.imageUrl}
                    alt={`${leadMood.name} portrait aesthetic reference`}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setFailedImages((prev) => ({ ...prev, [`mood-${leadMood.id}`]: true }))
                    }
                    className={`h-full w-full object-cover ${leadMood.objectPositionClass} transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/mood:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover/mood:scale-100`}
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[#1C1C1F] px-2 text-center text-[#9B968C]">
                    <Camera className="h-4 w-4" aria-hidden="true" />
                    <span className="text-[10px]">{leadMood.shortLabel}</span>
                  </div>
                )}

                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-2.5 pt-7 pb-2">
                  <p className="truncate text-[11px] font-semibold leading-tight text-[#F5F1E8]">
                    {leadMood.name}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-[#D4A853]/90">
                    {leadMood.aestheticCue}
                  </p>
                </div>

                {isMatched && (
                  <span
                    aria-hidden="true"
                    className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-[#D4A853] text-[#0B0B0C]"
                  >
                    <Check className="h-2.5 w-2.5 stroke-[3]" />
                  </span>
                )}
              </button>
            );
          })()}

          {/* Right Collage Mosaic: 2 Upper Portraits + 1 Lower Wide Architectural Frame */}
          <div className="col-span-7 grid grid-cols-2 gap-2">
            {STUDIO_MOOD_PRESETS.slice(1).map((mood, idx) => {
              const isWideBottom = idx === 2;
              const isMatched = activeMood?.id === mood.id;
              const failed = failedImages[`mood-${mood.id}`];
              return (
                <button
                  key={mood.id}
                  type="button"
                  onClick={() => onApplyMood(mood)}
                  onMouseEnter={() => setHoveredMoodId(mood.id)}
                  onMouseLeave={() => setHoveredMoodId(null)}
                  onFocus={() => setHoveredMoodId(mood.id)}
                  onBlur={() => setHoveredMoodId(null)}
                  aria-pressed={isMatched}
                  aria-label={`Apply ${mood.name} studio mood (${mood.aestheticCue})`}
                  className={`group/mood relative overflow-hidden rounded-lg border text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer ${
                    isWideBottom ? 'col-span-2 h-[99px]' : 'h-[99px]'
                  } ${
                    isMatched
                      ? 'border-[#D4A853] ring-1 ring-[#D4A853]/50'
                      : 'border-white/[0.08] hover:border-white/25'
                  }`}
                >
                  {!failed ? (
                    <img
                      src={mood.imageUrl}
                      alt={`${mood.name} portrait aesthetic reference`}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setFailedImages((prev) => ({ ...prev, [`mood-${mood.id}`]: true }))
                      }
                      className={`h-full w-full object-cover ${mood.objectPositionClass} transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/mood:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover/mood:scale-100`}
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[#1C1C1F] px-2 text-center text-[#9B968C]">
                      <Camera className="h-4 w-4" aria-hidden="true" />
                      <span className="text-[10px]">{mood.shortLabel}</span>
                    </div>
                  )}

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-2 pt-5 pb-1.5">
                    <p className="truncate text-[11px] font-semibold leading-tight text-[#F5F1E8]">
                      {isWideBottom ? mood.name : mood.shortLabel}
                    </p>
                    {isWideBottom && (
                      <p className="mt-0.5 truncate text-[10px] text-[#D4A853]/90">
                        {mood.aestheticCue}
                      </p>
                    )}
                  </div>

                  {isMatched && (
                    <span
                      aria-hidden="true"
                      className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#D4A853] text-[#0B0B0C]"
                    >
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-[#9B968C]">
          <span className="font-medium text-[#F5F1E8]">{inspectedMood.name}</span>{' '}
          <span aria-hidden="true">·</span> {inspectedMood.description}
        </p>
      </section>

      {/* 01. Backdrop & Style Lookbook Grid */}
      <div className="border-t border-white/[0.07] pt-5">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#F5F1E8]">01. Backdrop & Style</h3>
          <span className="text-xs text-[#9B968C]">{getStyleById(config.styleId).name}</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {STUDIO_STYLES.map((style) => {
            const isSelected = config.styleId === style.id;
            const imgFailed = failedImages[style.id];
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => onStyleSelect(style.id)}
                aria-pressed={isSelected}
                className={`group relative aspect-[3/4] overflow-hidden rounded-lg border text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer ${
                  isSelected
                    ? 'border-[#D4A853] ring-1 ring-[#D4A853]/50'
                    : 'border-white/[0.08] hover:border-white/25'
                }`}
              >
                {!imgFailed ? (
                  <img
                    src={style.previewImage}
                    alt={`${style.name} reference headshot`}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setFailedImages((prev) => ({ ...prev, [style.id]: true }))
                    }
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[#1C1C1F] text-[#9B968C]">
                    <Camera className="h-5 w-5" aria-hidden="true" />
                  </div>
                )}

                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-2.5 pt-8 pb-2.5">
                  <p className="text-xs font-semibold leading-tight text-[#F5F1E8]">
                    {style.shortName}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[#D4A853]/90">
                    {style.lensSpec}
                  </p>
                </div>

                {isSelected && (
                  <span
                    aria-hidden="true"
                    className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#D4A853] text-[#0B0B0C]"
                  >
                    <Check className="h-3 w-3 stroke-[2.5]" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 02. Wardrobe Tone Styling */}
      <div>
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#F5F1E8]">02. Wardrobe & Attire Tone</h3>
          <span className="text-xs text-[#9B968C]">
            {getAttireById(config.attireId).shortSpec}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ATTIRE_OPTIONS.map((option) => {
            const active = config.attireId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onAttireSelect(option.id)}
                aria-pressed={active}
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors duration-150 cursor-pointer ${
                  active
                    ? 'border-[#D4A853] bg-[#D4A853]/15 text-[#F5F1E8]'
                    : 'border-white/[0.08] bg-[#0B0B0C] text-[#9B968C] hover:border-white/20 hover:text-[#F5F1E8]'
                }`}
              >
                {active && <Check className="h-3 w-3 text-[#D4A853]" aria-hidden="true" />}
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Target Subject Type Framing & Lighting Profile Dropdown */}
      <div className="border-t border-white/[0.07] pt-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <label
            htmlFor="target-subject-type"
            className="text-xs font-semibold text-[#F5F1E8] whitespace-nowrap"
          >
            Target Subject Type
          </label>
          <span className="truncate text-[11px] text-[#9B968C]">
            {selectedSubjectProfile.shortSpec}
          </span>
        </div>

        <div className="relative">
          <select
            id="target-subject-type"
            value={config.subjectProfile}
            onChange={(e) => onSubjectProfileSelect(e.target.value as SubjectProfileId)}
            className={`min-h-[42px] w-full appearance-none rounded-md border bg-[#0B0B0C] py-2 pr-9 pl-3 text-xs font-medium text-[#F5F1E8] transition-colors duration-150 focus:border-[#D4A853] focus:outline-none cursor-pointer ${
              config.subjectProfile !== 'androgynous'
                ? 'border-[#D4A853]/70'
                : 'border-white/[0.1] hover:border-white/25'
            }`}
          >
            {SUBJECT_PROFILE_OPTIONS.map((profile) => (
              <option
                key={profile.id}
                value={profile.id}
                className="bg-[#141416] text-[#F5F1E8]"
              >
                {profile.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-[#9B968C]"
            aria-hidden="true"
          />
        </div>

        <p className="mt-1.5 text-[11px] leading-relaxed text-[#9B968C]">
          {selectedSubjectProfile.description}
        </p>
      </div>

      {/* 03. Lens Framing & 04. Studio Lighting */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <div>
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-[#F5F1E8] whitespace-nowrap">
              03. Lens Framing
            </h3>
            <button
              type="button"
              role="switch"
              aria-checked={config.smartCrop}
              onClick={() => onSmartCropToggle(!config.smartCrop)}
              title="Automatically suggest optimal framing from detected facial alignment"
              className="inline-flex items-center gap-2 rounded py-0.5 text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer whitespace-nowrap shrink-0"
            >
              <span
                className={
                  config.smartCrop
                    ? 'font-medium text-[#D4A853]'
                    : 'text-[#9B968C] hover:text-[#F5F1E8]'
                }
              >
                Smart Crop
              </span>
              <span
                aria-hidden="true"
                className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors duration-150 ${
                  config.smartCrop
                    ? 'border-[#D4A853] bg-[#D4A853]/30'
                    : 'border-white/15 bg-[#0B0B0C]'
                }`}
              >
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full transition-transform duration-150 ${
                    config.smartCrop
                      ? 'translate-x-3.5 bg-[#D4A853]'
                      : 'translate-x-0.5 bg-[#9B968C]'
                  }`}
                />
              </span>
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {FRAMING_OPTIONS.map((option) => {
              const active = config.framingId === option.id;
              const isAutoSuggested =
                config.smartCrop && smartCropSuggestion?.framingId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onFramingSelect(option.id)}
                  aria-pressed={active}
                  className={`group/frame flex min-h-[50px] items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer ${
                    active
                      ? 'border-[#D4A853] bg-[#D4A853]/12 text-[#F5F1E8]'
                      : 'border-white/[0.08] bg-[#0B0B0C] text-[#9B968C] hover:border-white/20 hover:text-[#F5F1E8]'
                  }`}
                >
                  <FramingCropPreview framingId={option.id} active={active} />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium whitespace-nowrap">
                      {option.label}
                    </span>
                    <span
                      className={`mt-0.5 block truncate font-mono text-[10px] tabular-nums whitespace-nowrap ${
                        isAutoSuggested ? 'text-[#D4A853]' : 'text-[#9B968C]'
                      }`}
                    >
                      {isAutoSuggested ? `Auto · ${option.shortSpec}` : option.shortSpec}
                    </span>
                  </div>
                  {active && (
                    <Check
                      className="h-3.5 w-3.5 shrink-0 text-[#D4A853]"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
          {config.smartCrop && (
            <p className="mt-2 text-[11px] leading-relaxed text-[#9B968C]">
              {smartCropSuggestion ? (
                <>
                  <span className="font-medium text-[#D4A853]">Aligned:</span>{' '}
                  <span className="font-mono tabular-nums">
                    Eye {smartCropSuggestion.eyeLinePercent}%
                  </span>{' '}
                  <span aria-hidden="true">·</span>{' '}
                  <span className="font-mono tabular-nums">
                    Scale {smartCropSuggestion.faceScalePercent}%
                  </span>
                </>
              ) : (
                'Auto-suggests optimal crop from facial alignment once a selfie is uploaded.'
              )}
            </p>
          )}
        </div>

        <div>
          <h3 className="mb-2.5 text-xs font-semibold text-[#F5F1E8]">04. Lighting Setup</h3>
          <div className="flex flex-col gap-1.5">
            {LIGHTING_OPTIONS.map((option) => {
              const active = config.lightingId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onLightingSelect(option.id)}
                  aria-pressed={active}
                  className={`flex min-h-[38px] items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer ${
                    active
                      ? 'border-[#D4A853] bg-[#D4A853]/12 text-[#F5F1E8]'
                      : 'border-white/[0.08] bg-[#0B0B0C] text-[#9B968C] hover:border-white/20 hover:text-[#F5F1E8]'
                  }`}
                >
                  <span className="font-medium whitespace-nowrap truncate">{option.label}</span>
                  <span className="text-[11px] text-[#9B968C] whitespace-nowrap shrink-0">
                    {option.shortSpec}
                  </span>
                </button>
              );
            })}
          </div>
          {config.lightingId === 'professional-cinematic' && (
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-[#9B968C] tabular-nums">
              <span className="text-[#D4A853]">3-Source Rig:</span> 45° Warm Octabox{' '}
              <span aria-hidden="true">·</span> Cool Silk Fill <span aria-hidden="true">·</span>{' '}
              Dual Rim
            </p>
          )}
        </div>
      </div>

      {/* Advanced Lighting Creative Preset Dropdown */}
      <div className="border-t border-white/[0.07] pt-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <label
            htmlFor="advanced-lighting-preset"
            className="text-xs font-semibold text-[#F5F1E8]"
          >
            Advanced Lighting
          </label>
          <span className="text-[11px] text-[#9B968C]">
            {config.advancedLightingPreset === 'none' ? 'Optional override' : 'Preset active'}
          </span>
        </div>

        <div className="relative">
          <select
            id="advanced-lighting-preset"
            value={config.advancedLightingPreset}
            onChange={(e) =>
              onAdvancedLightingSelect(e.target.value as AdvancedLightingPresetId)
            }
            className={`min-h-[42px] w-full appearance-none rounded-md border bg-[#0B0B0C] py-2 pr-9 pl-3 text-xs font-medium text-[#F5F1E8] transition-colors duration-150 focus:border-[#D4A853] focus:outline-none cursor-pointer ${
              config.advancedLightingPreset !== 'none'
                ? 'border-[#D4A853]/70'
                : 'border-white/[0.1] hover:border-white/25'
            }`}
          >
            {ADVANCED_LIGHTING_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id} className="bg-[#141416] text-[#F5F1E8]">
                {preset.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-[#9B968C]"
            aria-hidden="true"
          />
        </div>

        <p className="mt-1.5 text-[11px] leading-relaxed text-[#9B968C]">
          {selectedAdvancedPreset.description}
        </p>
      </div>

      {/* Depth of Field Optical Bokeh Slider */}
      <div className="border-t border-white/[0.07] pt-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <label
            htmlFor="direction-depth-of-field"
            className="text-xs font-semibold text-[#F5F1E8] whitespace-nowrap"
          >
            Depth of Field
          </label>
          <span className="font-mono text-[11px] tabular-nums text-[#9B968C] whitespace-nowrap">
            {isUpdatingBokeh ? (
              <span className="text-[#D4A853]">Updating bokeh...</span>
            ) : (
              <>
                <span className="font-medium text-[#D4A853]">{apertureLabel}</span>{' '}
                <span aria-hidden="true">·</span> {roundedBlur}px blur
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-[11px] text-[#9B968C] whitespace-nowrap shrink-0">Sharp</span>
          <input
            id="direction-depth-of-field"
            type="range"
            min={0}
            max={20}
            step={1}
            value={roundedBlur}
            disabled={isGenerating}
            aria-label="Depth of Field background bokeh intensity"
            aria-valuetext={`${apertureLabel}, ${roundedBlur} pixels background blur`}
            onChange={(e) => onBackdropBlurChange(Number(e.target.value))}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-white/[0.12] accent-[#D4A853] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] focus-visible:ring-offset-2 focus-visible:ring-offset-[#141416] disabled:cursor-not-allowed disabled:opacity-45"
          />
          <span className="text-[11px] text-[#9B968C] whitespace-nowrap shrink-0">Bokeh</span>
          <button
            type="button"
            onClick={() => onBackdropBlurChange(defaultStyleBlur)}
            disabled={isGenerating || roundedBlur === defaultStyleBlur}
            aria-label={`Reset depth of field to ${defaultStyleBlur}px style default`}
            className="inline-flex min-h-[28px] items-center gap-1 rounded-md border border-white/[0.08] bg-[#0B0B0C] px-2 py-1 text-[11px] font-medium text-[#9B968C] whitespace-nowrap shrink-0 transition-colors duration-150 hover:border-white/20 hover:text-[#F5F1E8] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
          >
            <RotateCcw className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>Reset</span>
          </button>
        </div>

        <p className="mt-1.5 text-[11px] leading-relaxed text-[#9B968C]">
          Softens the background using your portrait segmentation mask while keeping your subject
          sharp.
        </p>
      </div>

      {/* 05. Output Format & Optional Art Direction */}
      <div className="space-y-4 border-t border-white/[0.07] pt-4">
        <div>
          <h3 className="mb-2 text-xs font-semibold text-[#F5F1E8]">05. Output Format</h3>
          <div className="grid grid-cols-3 gap-1.5">
            {ASPECT_RATIO_OPTIONS.map((ratio) => {
              const active = config.aspectRatio === ratio.id;
              return (
                <button
                  key={ratio.id}
                  type="button"
                  onClick={() => onAspectRatioSelect(ratio.id)}
                  aria-pressed={active}
                  className={`flex flex-col items-start rounded-md border px-2.5 py-2 text-left transition-colors duration-150 cursor-pointer ${
                    active
                      ? 'border-[#D4A853] bg-[#D4A853]/12 text-[#F5F1E8]'
                      : 'border-white/[0.08] bg-[#0B0B0C] text-[#9B968C] hover:border-white/20 hover:text-[#F5F1E8]'
                  }`}
                >
                  <span className="font-mono text-xs font-medium tabular-nums whitespace-nowrap">
                    {ratio.id}
                  </span>
                  <span className="mt-0.5 text-[11px] text-[#9B968C] truncate w-full">
                    {ratio.useCase}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label
            htmlFor="extra-direction-notes"
            className="mb-1.5 block text-xs font-medium text-[#9B968C]"
          >
            Optional lighting or mood note
          </label>
          <input
            id="extra-direction-notes"
            type="text"
            value={config.extraNotes}
            onChange={(e) => onExtraNotesChange(e.target.value)}
            placeholder="e.g., Slightly warmer tone, softer facial contrast"
            className="min-h-[40px] w-full rounded-md border border-white/[0.1] bg-[#0B0B0C] px-3 py-2 text-xs text-[#F5F1E8] placeholder:text-[#9B968C]/70 focus:border-[#D4A853] focus:outline-none"
          />
        </div>
      </div>

      {/* Primary Studio Expose CTA */}
      {!sourcePortrait ? (
        <button
          type="button"
          onClick={onUploadClick}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md bg-[#F5F1E8] px-5 py-3 text-sm font-semibold text-[#0B0B0C] whitespace-nowrap transition-colors duration-150 hover:bg-[#E7E0D0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] focus-visible:ring-offset-2 focus-visible:ring-offset-[#141416] cursor-pointer"
        >
          <Camera className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Upload Selfie to Begin</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating}
          aria-busy={isGenerating}
          title="Generate Studio Headshot (G)"
          className={`relative inline-flex min-h-[48px] w-full items-center justify-center gap-2 overflow-hidden rounded-md px-5 py-3 text-sm font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] focus-visible:ring-offset-2 focus-visible:ring-offset-[#141416] ${
            isGenerating
              ? 'cursor-wait border border-[#D4A853]/60 bg-[#1B1812] text-[#F5F1E8] shadow-[0_0_20px_rgba(212,168,83,0.16)]'
              : 'bg-[#F5F1E8] text-[#0B0B0C] hover:bg-[#E7E0D0] cursor-pointer'
          }`}
        >
          {isGenerating && (
            <span
              aria-hidden="true"
              className="darkroom-generate-pulse pointer-events-none absolute inset-0 rounded-md bg-[radial-gradient(ellipse_at_center,rgba(212,168,83,0.28)_0%,rgba(212,168,83,0.06)_62%,transparent_100%)]"
            />
          )}
          <Sparkles
            className={`relative z-10 h-4 w-4 shrink-0 ${
              isGenerating ? 'darkroom-icon-pulse text-[#D4A853]' : ''
            }`}
            aria-hidden="true"
          />
          <span className="relative z-10">
            {isGenerating ? 'Developing Portrait...' : 'Generate Studio Headshot'}
          </span>
        </button>
      )}
    </div>
  );
};
