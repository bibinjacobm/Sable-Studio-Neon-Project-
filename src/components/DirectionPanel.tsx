import React, { useState } from 'react';
import { Camera, Check, SlidersHorizontal, Sparkles } from 'lucide-react';
import {
  ASPECT_RATIO_OPTIONS,
  ATTIRE_OPTIONS,
  FRAMING_OPTIONS,
  LIGHTING_OPTIONS,
  STUDIO_STYLES,
  getAttireById,
  getFramingById,
  getLightingById,
  getStyleById,
  type AspectRatioOption,
  type AttireId,
  type FramingId,
  type LightingId,
  type SelfieCritique,
  type SourcePortrait,
  type StudioDirectionConfig,
  type StyleId,
} from '../data/studioCatalog';

interface DirectionPanelProps {
  config: StudioDirectionConfig;
  sourcePortrait: SourcePortrait | null;
  critique: SelfieCritique | null;
  isGenerating: boolean;
  isAnalyzing: boolean;
  onStyleSelect: (styleId: StyleId) => void;
  onAttireSelect: (attireId: AttireId) => void;
  onFramingSelect: (framingId: FramingId) => void;
  onLightingSelect: (lightingId: LightingId) => void;
  onAspectRatioSelect: (ratio: AspectRatioOption) => void;
  onExtraNotesChange: (notes: string) => void;
  onApplyCritique: () => void;
  onGenerate: () => void;
  onUploadClick: () => void;
}

export const DirectionPanel: React.FC<DirectionPanelProps> = ({
  config,
  sourcePortrait,
  critique,
  isGenerating,
  isAnalyzing,
  onStyleSelect,
  onAttireSelect,
  onFramingSelect,
  onLightingSelect,
  onAspectRatioSelect,
  onExtraNotesChange,
  onApplyCritique,
  onGenerate,
  onUploadClick,
}) => {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  return (
    <aside
      aria-label="Studio direction controls"
      className="flex flex-col gap-6 rounded-xl border border-white/[0.08] bg-[#141416] p-5 sm:p-6"
    >
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

      {/* 01. Backdrop & Style Lookbook Grid */}
      <div>
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

      {/* 03. Lens Framing & 04. Studio Lighting */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <div>
          <h3 className="mb-2.5 text-xs font-semibold text-[#F5F1E8]">03. Lens Framing</h3>
          <div className="flex flex-col gap-1.5">
            {FRAMING_OPTIONS.map((option) => {
              const active = config.framingId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onFramingSelect(option.id)}
                  aria-pressed={active}
                  className={`flex min-h-[38px] items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors duration-150 cursor-pointer ${
                    active
                      ? 'border-[#D4A853] bg-[#D4A853]/12 text-[#F5F1E8]'
                      : 'border-white/[0.08] bg-[#0B0B0C] text-[#9B968C] hover:border-white/20 hover:text-[#F5F1E8]'
                  }`}
                >
                  <span className="font-medium whitespace-nowrap truncate">{option.label}</span>
                  <span className="font-mono text-[11px] text-[#9B968C] whitespace-nowrap shrink-0">
                    {option.shortSpec}
                  </span>
                </button>
              );
            })}
          </div>
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
                  className={`flex min-h-[38px] items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors duration-150 cursor-pointer ${
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
        </div>
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
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md bg-[#F5F1E8] px-5 py-3 text-sm font-semibold text-[#0B0B0C] transition-colors duration-150 hover:bg-[#E7E0D0] cursor-pointer"
        >
          <Camera className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Upload Selfie to Begin</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md bg-[#F5F1E8] px-5 py-3 text-sm font-semibold text-[#0B0B0C] transition-colors duration-150 hover:bg-[#E7E0D0] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-[#9B968C] cursor-pointer"
        >
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{isGenerating ? 'Developing Portrait...' : 'Generate Studio Headshot'}</span>
        </button>
      )}
    </aside>
  );
};
