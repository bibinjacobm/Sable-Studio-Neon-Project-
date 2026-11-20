import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  Layers,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import {
  RETOUCH_QUICK_CUES,
  type GeneratedTake,
  type SelfieCritique,
} from '../data/studioCatalog';

const MAX_BULK_VARIATIONS = 6;

interface RetouchPromptBarProps {
  activeTake: GeneratedTake | null;
  critique: SelfieCritique | null;
  promptValue: string;
  sharpenIntensity: number;
  autoSuggestions: string[];
  isGenerating: boolean;
  isSharpening: boolean;
  isSuggesting: boolean;
  bulkProgress: { completed: number; total: number } | null;
  suggestError: string | null;
  onPromptChange: (value: string) => void;
  onSubmitPrompt: (customPrompt?: string) => void;
  onRunBulkRetouch: (prompts: string[]) => Promise<boolean>;
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
  bulkProgress,
  suggestError,
  onPromptChange,
  onSubmitPrompt,
  onRunBulkRetouch,
  onAutoSuggest,
  onSharpenChange,
}) => {
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [queuedPrompts, setQueuedPrompts] = useState<string[]>([]);

  const isDisabled = isGenerating || !activeTake;
  const sharpenPercent = Math.round(Math.max(0, Math.min(1, sharpenIntensity)) * 100);
  const hasAutoSuggestions = autoSuggestions.length > 0;

  // Reset bulk mode cleanly if all takes are removed
  useEffect(() => {
    if (!activeTake && isBulkMode) {
      setIsBulkMode(false);
      setQueuedPrompts([]);
    }
  }, [activeTake, isBulkMode]);

  const suggestions = hasAutoSuggestions
    ? autoSuggestions
    : critique && critique.retouchIdeas.length > 0
      ? [...critique.retouchIdeas, ...RETOUCH_QUICK_CUES.slice(0, 3)]
      : RETOUCH_QUICK_CUES.slice(0, 4);

  const isPromptQueued = (text: string) => {
    const normalized = text.trim().toLowerCase();
    return queuedPrompts.some((item) => item.trim().toLowerCase() === normalized);
  };

  const addPromptToQueue = (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed) return;
    setQueuedPrompts((prev) => {
      if (prev.length >= MAX_BULK_VARIATIONS) return prev;
      const lower = trimmed.toLowerCase();
      if (prev.some((item) => item.trim().toLowerCase() === lower)) return prev;
      return [...prev, trimmed];
    });
  };

  const togglePromptInQueue = (cue: string) => {
    const lower = cue.trim().toLowerCase();
    setQueuedPrompts((prev) => {
      const exists = prev.some((item) => item.trim().toLowerCase() === lower);
      if (exists) {
        return prev.filter((item) => item.trim().toLowerCase() !== lower);
      }
      if (prev.length >= MAX_BULK_VARIATIONS) {
        return prev;
      }
      return [...prev, cue.trim()];
    });
  };

  const handleQueueAllSuggestions = () => {
    setQueuedPrompts((prev) => {
      const next = [...prev];
      for (const cue of suggestions) {
        if (next.length >= MAX_BULK_VARIATIONS) break;
        const lower = cue.trim().toLowerCase();
        if (!next.some((item) => item.trim().toLowerCase() === lower)) {
          next.push(cue.trim());
        }
      }
      return next;
    });
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = promptValue.trim();
    if (!trimmed || isDisabled) return;

    if (isBulkMode) {
      addPromptToQueue(trimmed);
      onPromptChange('');
      return;
    }

    onSubmitPrompt();
  };

  const handleExecuteBulk = async () => {
    if (isDisabled) return;
    const trimmedInput = promptValue.trim();
    const combined = [...queuedPrompts];
    if (
      trimmedInput &&
      combined.length < MAX_BULK_VARIATIONS &&
      !combined.some((item) => item.toLowerCase() === trimmedInput.toLowerCase())
    ) {
      combined.push(trimmedInput);
    }
    if (combined.length === 0) return;

    const succeeded = await onRunBulkRetouch(combined);
    if (succeeded) {
      setQueuedPrompts([]);
      onPromptChange('');
    }
  };

  const effectiveBulkCount = (() => {
    const trimmedInput = promptValue.trim();
    if (
      isBulkMode &&
      trimmedInput &&
      queuedPrompts.length < MAX_BULK_VARIATIONS &&
      !isPromptQueued(trimmedInput)
    ) {
      return queuedPrompts.length + 1;
    }
    return queuedPrompts.length;
  })();

  const isQueueFull = queuedPrompts.length >= MAX_BULK_VARIATIONS;

  return (
    <section
      aria-label="Darkroom text-prompt retouching"
      className="mt-5 rounded-xl border border-white/[0.08] bg-[#141416] p-4 sm:p-5"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h3 className="text-sm font-semibold text-[#F5F1E8]">Darkroom Retouching Prompt</h3>
          <span className="text-xs text-[#9B968C]">
            {activeTake
              ? `Frame ${String(activeTake.frameNumber).padStart(2, '0')} · ${
                  isBulkMode
                    ? 'Queue multiple variations to run in parallel'
                    : 'Adjust light, backdrop, wardrobe tone, or crop'
                }`
              : 'Generate a headshot first to unlock natural-language retouching'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsBulkMode((prev) => !prev)}
          disabled={isDisabled}
          aria-pressed={isBulkMode}
          title="Queue multiple retouching variations for this take and run them in parallel"
          className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer ${
            isBulkMode
              ? 'border-[#D4A853] bg-[#D4A853]/15 text-[#F5F1E8]'
              : 'border-white/[0.1] bg-[#0B0B0C] text-[#9B968C] hover:border-white/25 hover:text-[#F5F1E8]'
          }`}
        >
          <Layers
            className={`h-3.5 w-3.5 shrink-0 ${isBulkMode ? 'text-[#D4A853]' : ''}`}
            aria-hidden="true"
          />
          <span>Bulk Retouch</span>
          {isBulkMode && queuedPrompts.length > 0 && (
            <span className="font-mono text-[11px] tabular-nums text-[#D4A853]">
              {queuedPrompts.length}
            </span>
          )}
        </button>
      </div>

      <form onSubmit={handleFormSubmit} className="flex flex-col gap-2.5 sm:flex-row">
        <label htmlFor="studio-retouch-input" className="sr-only">
          {isBulkMode
            ? 'Add a retouching variation to the parallel queue'
            : 'Describe your retouching adjustment'}
        </label>
        <input
          id="studio-retouch-input"
          type="text"
          value={promptValue}
          onChange={(e) => onPromptChange(e.target.value)}
          disabled={isDisabled}
          placeholder={
            isBulkMode
              ? 'Type a variation and press Enter to queue (up to 6 parallel takes)...'
              : 'e.g., Soften skin texture, increase background depth, or add warm rim light...'
          }
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
              <Loader2
                className="h-3.5 w-3.5 animate-spin text-[#D4A853] shrink-0"
                aria-hidden="true"
              />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-[#D4A853] shrink-0" aria-hidden="true" />
            )}
            <span>{isSuggesting ? 'Suggesting...' : 'Auto-Suggest'}</span>
          </button>

          {isBulkMode ? (
            <button
              type="submit"
              disabled={isDisabled || !promptValue.trim() || isQueueFull}
              className="inline-flex min-h-[44px] flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-md border border-white/[0.15] bg-[#1C1C1F] px-4 py-2.5 text-xs font-semibold text-[#F5F1E8] whitespace-nowrap shrink-0 transition-colors duration-150 hover:border-[#D4A853] hover:bg-[#26262B] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 text-[#D4A853] shrink-0" aria-hidden="true" />
              <span>Add to Queue</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={isDisabled || !promptValue.trim()}
              className="inline-flex min-h-[44px] flex-1 sm:flex-initial items-center justify-center gap-2 rounded-md bg-[#F5F1E8] px-5 py-2.5 text-sm font-semibold text-[#0B0B0C] whitespace-nowrap shrink-0 transition-colors duration-150 hover:bg-[#E7E0D0] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-[#9B968C] cursor-pointer"
            >
              <span>Apply Retouch</span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </button>
          )}
        </div>
      </form>

      {suggestError && (
        <p role="alert" className="mt-2.5 text-xs text-amber-300">
          {suggestError}
        </p>
      )}

      {/* Quick clickable cue buttons (toggle into queue in Bulk mode, or apply immediately in Single mode) */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-[#9B968C] whitespace-nowrap">
          {hasAutoSuggestions && activeTake ? (
            <span className="font-medium text-[#D4A853]">
              Suggested for Frame {String(activeTake.frameNumber).padStart(2, '0')}:
            </span>
          ) : isBulkMode ? (
            'Click to queue:'
          ) : (
            'Quick cues:'
          )}
        </span>
        {suggestions.map((cue) => {
          const queued = isBulkMode && isPromptQueued(cue);
          const blockedByLimit = isBulkMode && !queued && isQueueFull;
          return (
            <button
              key={cue}
              type="button"
              disabled={isDisabled || blockedByLimit}
              aria-pressed={isBulkMode ? queued : undefined}
              onClick={() => {
                if (isBulkMode) {
                  togglePromptInQueue(cue);
                  return;
                }
                onPromptChange(cue);
                if (activeTake) {
                  onSubmitPrompt(cue);
                }
              }}
              className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer ${
                queued
                  ? 'border-[#D4A853] bg-[#D4A853]/15 text-[#F5F1E8]'
                  : hasAutoSuggestions
                    ? 'border-[#D4A853]/35 bg-[#0B0B0C] text-[#F5F1E8] hover:border-[#D4A853] hover:bg-[#1C1C1F]'
                    : 'border-white/[0.08] bg-[#1C1C1F] text-[#F5F1E8]/85 hover:border-[#D4A853]/60 hover:text-[#F5F1E8]'
              }`}
            >
              {isBulkMode && (
                <span aria-hidden="true" className="shrink-0">
                  {queued ? (
                    <Check className="h-3 w-3 text-[#D4A853]" />
                  ) : (
                    <Plus className="h-3 w-3 text-[#9B968C]" />
                  )}
                </span>
              )}
              <span className="truncate">{cue}</span>
            </button>
          );
        })}

        {isBulkMode && suggestions.length > 0 && !isQueueFull && (
          <button
            type="button"
            onClick={handleQueueAllSuggestions}
            disabled={isDisabled}
            className="ml-1 text-xs font-medium text-[#D4A853] underline decoration-[#D4A853]/50 underline-offset-4 transition-colors hover:text-[#F5F1E8] disabled:opacity-45 whitespace-nowrap cursor-pointer"
          >
            Queue all
          </button>
        )}
      </div>

      {/* Parallel Bulk Retouch Queue Drawer */}
      {isBulkMode && (
        <div className="mt-4 rounded-lg border border-[#D4A853]/30 bg-[#0B0B0C]/90 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-[#F5F1E8]">Parallel Variation Queue</span>
              <span aria-hidden="true" className="text-[#9B968C]">
                ·
              </span>
              <span className="font-mono tabular-nums text-[#D4A853]">
                {queuedPrompts.length}/{MAX_BULK_VARIATIONS} queued
              </span>
            </div>

            {queuedPrompts.length > 0 && (
              <button
                type="button"
                onClick={() => setQueuedPrompts([])}
                disabled={isGenerating}
                className="text-xs font-medium text-[#9B968C] transition-colors hover:text-[#F5F1E8] disabled:opacity-45 whitespace-nowrap cursor-pointer"
              >
                Clear Queue
              </button>
            )}
          </div>

          {queuedPrompts.length > 0 ? (
            <ol className="mt-2.5 divide-y divide-white/[0.06] border-t border-white/[0.06]">
              {queuedPrompts.map((item, idx) => (
                <li
                  key={`${item}-${idx}`}
                  className="flex items-center justify-between gap-3 py-2 text-xs"
                >
                  <div className="flex min-w-0 items-baseline gap-2.5">
                    <span className="font-mono text-[11px] tabular-nums text-[#D4A853] shrink-0">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="truncate text-[#F5F1E8]">{item}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setQueuedPrompts((prev) => prev.filter((_, i) => i !== idx))
                    }
                    disabled={isGenerating}
                    aria-label={`Remove variation ${idx + 1}: ${item}`}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#9B968C] transition-colors hover:bg-white/[0.08] hover:text-[#F5F1E8] disabled:opacity-40 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-xs text-[#9B968C]">
              Add custom prompts above or click cues to queue multiple retouch variations for{' '}
              {activeTake
                ? `Frame ${String(activeTake.frameNumber).padStart(2, '0')}`
                : 'this take'}
              .
            </p>
          )}

          <div className="mt-3 flex flex-col gap-2.5 border-t border-white/[0.07] pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-[#9B968C]">
              {bulkProgress ? (
                <span className="font-mono tabular-nums text-[#D4A853]">
                  Rendering {bulkProgress.completed}/{bulkProgress.total} variations in parallel...
                </span>
              ) : (
                'All queued variations render concurrently and appear in Session History.'
              )}
            </p>
            <button
              type="button"
              onClick={() => void handleExecuteBulk()}
              disabled={isDisabled || effectiveBulkCount === 0}
              className="inline-flex min-h-[38px] items-center justify-center gap-2 rounded-md bg-[#F5F1E8] px-4 py-2 text-xs font-semibold text-[#0B0B0C] whitespace-nowrap shrink-0 transition-colors duration-150 hover:bg-[#E7E0D0] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-[#9B968C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
            >
              {bulkProgress ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden="true" />
              ) : (
                <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>
                {bulkProgress
                  ? `Running (${bulkProgress.completed}/${bulkProgress.total})`
                  : effectiveBulkCount > 0
                    ? `Run Bulk Retouch (${effectiveBulkCount})`
                    : 'Run Bulk Retouch'}
              </span>
            </button>
          </div>
        </div>
      )}

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
