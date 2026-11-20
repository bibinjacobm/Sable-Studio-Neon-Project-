import React from 'react';
import { ArrowRight, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import {
  RETOUCH_QUICK_CUES,
  type GeneratedTake,
  type SelfieCritique,
} from '../data/studioCatalog';

interface RetouchPromptBarProps {
  activeTake: GeneratedTake | null;
  critique: SelfieCritique | null;
  promptValue: string;
  sharpenIntensity: number;
  autoSuggestions: string[];
  isGenerating: boolean;
  isSharpening: boolean;
  isSuggesting: boolean;
  suggestError: string | null;
  onPromptChange: (value: string) => void;
  onSubmitPrompt: (customPrompt?: string) => void;
  onAutoSuggest: () => void;
  onSharpenChange: (intensity: number) => void;
}

export const RetouchPromptBar: React.FC<RetouchPromptBarProps> = ({
  activeTake,
  critique,
  promptValue,
  sharpenIntensity,
  autoSuggestions,
  isGenerating,
  isSharpening,
  isSuggesting,
  suggestError,
  onPromptChange,
  onSubmitPrompt,
  onAutoSuggest,
  onSharpenChange,
}) => {
  const isDisabled = isGenerating || !activeTake;
  const sharpenPercent = Math.round(Math.max(0, Math.min(1, sharpenIntensity)) * 100);
  const hasAutoSuggestions = autoSuggestions.length > 0;

  const suggestions = hasAutoSuggestions
    ? autoSuggestions
    : critique && critique.retouchIdeas.length > 0
      ? [...critique.retouchIdeas, ...RETOUCH_QUICK_CUES.slice(0, 3)]
      : RETOUCH_QUICK_CUES.slice(0, 4);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptValue.trim() || isDisabled) return;
    onSubmitPrompt();
  };

  return (
    <section
      aria-label="Darkroom text-prompt retouching"
      className="mt-5 rounded-xl border border-white/[0.08] bg-[#141416] p-4 sm:p-5"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#F5F1E8]">Darkroom Retouching Prompt</h3>
        <span className="text-xs text-[#9B968C]">
          {activeTake
            ? `Refining Frame ${String(activeTake.frameNumber).padStart(2, '0')} · Adjust light, backdrop, wardrobe tone, or crop`
            : 'Generate a headshot first to unlock natural-language retouching'}
        </span>
      </div>

      <form onSubmit={handleFormSubmit} className="flex flex-col gap-2.5 sm:flex-row">
        <label htmlFor="studio-retouch-input" className="sr-only">
          Describe your retouching adjustment
        </label>
        <input
          id="studio-retouch-input"
          type="text"
          value={promptValue}
          onChange={(e) => onPromptChange(e.target.value)}
          disabled={isDisabled}
          placeholder="e.g., Soften skin texture, increase background depth, or add warm rim light..."
          className="min-h-[44px] flex-1 rounded-md border border-white/[0.1] bg-[#0B0B0C] px-3.5 py-2.5 text-sm text-[#F5F1E8] placeholder:text-[#9B968C]/70 transition-colors duration-150 focus:border-[#D4A853] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onAutoSuggest}
            disabled={isDisabled || isSuggesting}
            title="Generate context-aware retouching suggestions based on this portrait's style settings"
            className="inline-flex min-h-[44px] flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-md border border-[#D4A853]/45 bg-[#0B0B0C] px-3.5 py-2.5 text-xs font-semibold text-[#F5F1E8] whitespace-nowrap shrink-0 transition-colors duration-150 hover:border-[#D4A853] hover:bg-[#1C1C1F] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
          >
            {isSuggesting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#D4A853] shrink-0" aria-hidden="true" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-[#D4A853] shrink-0" aria-hidden="true" />
            )}
            <span>{isSuggesting ? 'Suggesting...' : 'Auto-Suggest'}</span>
          </button>
          <button
            type="submit"
            disabled={isDisabled || !promptValue.trim()}
            className="inline-flex min-h-[44px] flex-1 sm:flex-initial items-center justify-center gap-2 rounded-md bg-[#F5F1E8] px-5 py-2.5 text-sm font-semibold text-[#0B0B0C] whitespace-nowrap shrink-0 transition-colors duration-150 hover:bg-[#E7E0D0] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-[#9B968C] cursor-pointer"
          >
            <span>Apply Retouch</span>
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </button>
        </div>
      </form>

      {suggestError && (
        <p role="alert" className="mt-2.5 text-xs text-amber-300">
          {suggestError}
        </p>
      )}

      {/* Quick clickable cue buttons (context-aware AI suggestions when generated) */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-[#9B968C] whitespace-nowrap">
          {hasAutoSuggestions && activeTake ? (
            <span className="font-medium text-[#D4A853]">
              Suggested for Frame {String(activeTake.frameNumber).padStart(2, '0')}:
            </span>
          ) : (
            'Quick cues:'
          )}
        </span>
        {suggestions.map((cue) => (
          <button
            key={cue}
            type="button"
            disabled={isDisabled}
            onClick={() => {
              onPromptChange(cue);
              if (activeTake) {
                onSubmitPrompt(cue);
              }
            }}
            className={`max-w-full truncate rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer ${
              hasAutoSuggestions
                ? 'border-[#D4A853]/35 bg-[#0B0B0C] text-[#F5F1E8] hover:border-[#D4A853] hover:bg-[#1C1C1F]'
                : 'border-white/[0.08] bg-[#1C1C1F] text-[#F5F1E8]/85 hover:border-[#D4A853]/60 hover:text-[#F5F1E8]'
            }`}
          >
            {cue}
          </button>
        ))}
      </div>

      {/* Local Canvas Unsharp Masking Slider */}
      <div className="mt-4 flex flex-col gap-2.5 border-t border-white/[0.07] pt-3.5 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center justify-between gap-2 sm:w-44 sm:shrink-0">
          <label
            htmlFor="studio-sharpen-slider"
            className="text-xs font-medium text-[#F5F1E8] whitespace-nowrap"
          >
            Sharpen
          </label>
          <span className="text-[11px] text-[#9B968C] whitespace-nowrap">
            {isSharpening ? 'Updating...' : 'Unsharp mask'}
          </span>
        </div>

        <div className="flex flex-1 items-center gap-3">
          <input
            id="studio-sharpen-slider"
            type="range"
            min={0}
            max={100}
            step={5}
            value={sharpenPercent}
            disabled={isDisabled}
            aria-label="Sharpen intensity percentage"
            aria-valuetext={`${sharpenPercent} percent`}
            onChange={(e) => onSharpenChange(Number(e.target.value) / 100)}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-white/[0.12] accent-[#D4A853] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] focus-visible:ring-offset-2 focus-visible:ring-offset-[#141416] disabled:cursor-not-allowed disabled:opacity-45"
          />

          <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-[#F5F1E8]">
            {sharpenPercent}%
          </span>

          <button
            type="button"
            onClick={() => onSharpenChange(0)}
            disabled={isDisabled || sharpenPercent === 0}
            aria-label="Reset sharpen intensity to 0 percent"
            className="inline-flex min-h-[30px] items-center gap-1 rounded-md border border-white/[0.08] bg-[#0B0B0C] px-2.5 py-1 text-[11px] font-medium text-[#9B968C] whitespace-nowrap shrink-0 transition-colors duration-150 hover:border-white/20 hover:text-[#F5F1E8] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
          >
            <RotateCcw className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>Reset</span>
          </button>
        </div>
      </div>
    </section>
  );
};
