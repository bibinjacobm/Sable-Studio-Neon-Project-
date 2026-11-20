import React from 'react';
import { ArrowRight } from 'lucide-react';
import {
  RETOUCH_QUICK_CUES,
  type GeneratedTake,
  type SelfieCritique,
} from '../data/studioCatalog';

interface RetouchPromptBarProps {
  activeTake: GeneratedTake | null;
  critique: SelfieCritique | null;
  promptValue: string;
  isGenerating: boolean;
  onPromptChange: (value: string) => void;
  onSubmitPrompt: (customPrompt?: string) => void;
}

export const RetouchPromptBar: React.FC<RetouchPromptBarProps> = ({
  activeTake,
  critique,
  promptValue,
  isGenerating,
  onPromptChange,
  onSubmitPrompt,
}) => {
  const isDisabled = isGenerating || !activeTake;

  const suggestions =
    critique && critique.retouchIdeas.length > 0
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

      <form onSubmit={handleFormSubmit} className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="studio-retouch-input" className="sr-only">
          Describe your retouching adjustment
        </label>
        <input
          id="studio-retouch-input"
          type="text"
          value={promptValue}
          onChange={(e) => onPromptChange(e.target.value)}
          disabled={isDisabled}
          placeholder="e.g., Convert to dramatic monochrome, add warm golden rim light, or switch to Modern Tech Office..."
          className="min-h-[44px] flex-1 rounded-md border border-white/[0.1] bg-[#0B0B0C] px-3.5 py-2.5 text-sm text-[#F5F1E8] placeholder:text-[#9B968C]/70 transition-colors duration-150 focus:border-[#D4A853] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isDisabled || !promptValue.trim()}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-[#F5F1E8] px-5 py-2.5 text-sm font-semibold text-[#0B0B0C] whitespace-nowrap shrink-0 transition-colors duration-150 hover:bg-[#E7E0D0] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-[#9B968C] cursor-pointer"
        >
          <span>Apply Retouch</span>
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
      </form>

      {/* Quick clickable cue buttons */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-[#9B968C]">Quick cues:</span>
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
            className="max-w-full truncate rounded-md border border-white/[0.08] bg-[#1C1C1F] px-2.5 py-1.5 text-left text-xs text-[#F5F1E8]/85 transition-colors duration-150 hover:border-[#D4A853]/60 hover:text-[#F5F1E8] disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
          >
            {cue}
          </button>
        ))}
      </div>
    </section>
  );
};
