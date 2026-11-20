import React, { useMemo, useState } from 'react';
import {
  ArrowDownUp,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  History,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import type { GeneratedTake } from '../data/studioCatalog';

type HistoryFilter = 'all' | 'retouched';
type HistorySortOrder = 'newest' | 'oldest';

interface HistoryViewPanelProps {
  takes: GeneratedTake[];
  activeTakeId: string | null;
  hasSourcePortrait: boolean;
  onSelectTake: (id: string) => void;
  onInspectTake: (id: string) => void;
  onDownloadTake: (take: GeneratedTake) => void;
  onRemoveTake: (id: string) => void;
  onReturnToDirection: () => void;
  onUploadClick: () => void;
}

function formatTakeTime(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export const HistoryViewPanel: React.FC<HistoryViewPanelProps> = ({
  takes,
  activeTakeId,
  hasSourcePortrait,
  onSelectTake,
  onInspectTake,
  onDownloadTake,
  onRemoveTake,
  onReturnToDirection,
  onUploadClick,
}) => {
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [sortOrder, setSortOrder] = useState<HistorySortOrder>('newest');
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const retouchedCount = useMemo(
    () => takes.filter((take) => Boolean(take.retouchPrompt)).length,
    [takes]
  );

  const visibleTakes = useMemo(() => {
    const filtered =
      filter === 'retouched' ? takes.filter((take) => Boolean(take.retouchPrompt)) : takes;
    return [...filtered].sort((a, b) =>
      sortOrder === 'newest' ? b.frameNumber - a.frameNumber : a.frameNumber - b.frameNumber
    );
  }, [takes, filter, sortOrder]);

  const activeVisibleIndex = useMemo(
    () => visibleTakes.findIndex((take) => take.id === activeTakeId),
    [visibleTakes, activeTakeId]
  );

  const handleStepTake = (delta: -1 | 1) => {
    if (visibleTakes.length === 0) return;
    if (activeVisibleIndex === -1) {
      onSelectTake(visibleTakes[0].id);
      return;
    }
    const nextIndex = (activeVisibleIndex + delta + visibleTakes.length) % visibleTakes.length;
    onSelectTake(visibleTakes[nextIndex].id);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Panel Header */}
      <div className="border-b border-white/[0.07] pb-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-2xl font-semibold text-[#F5F1E8]">Session History</h2>
          <span className="font-mono text-xs tabular-nums text-[#9B968C] whitespace-nowrap shrink-0">
            {takes.length} {takes.length === 1 ? 'take' : 'takes'}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-[#9B968C]">
          Click any generated headshot to toggle it immediately on the portrait stage
        </p>
      </div>

      {takes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/[0.1] bg-[#0B0B0C]/60 px-6 py-12 text-center">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-[#1C1C1F] text-[#D4A853]">
            <History className="h-5 w-5" aria-hidden="true" />
          </div>
          <h3 className="font-serif text-xl font-semibold text-[#F5F1E8]">No takes recorded yet</h3>
          <p className="mt-2 max-w-[34ch] text-xs leading-relaxed text-[#9B968C]">
            Every headshot and retouch pass you develop in this session appears here so you can
            switch between takes side-by-side.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            {hasSourcePortrait ? (
              <button
                type="button"
                onClick={onReturnToDirection}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-md bg-[#F5F1E8] px-4 py-2 text-xs font-semibold text-[#0B0B0C] whitespace-nowrap shrink-0 transition-colors duration-150 hover:bg-[#E7E0D0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Open Studio Direction</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onUploadClick}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-md bg-[#F5F1E8] px-4 py-2 text-xs font-semibold text-[#0B0B0C] whitespace-nowrap shrink-0 transition-colors duration-150 hover:bg-[#E7E0D0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
              >
                <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Upload Selfie to Begin</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Filter, Sort & Quick Take Stepper Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div
              role="group"
              aria-label="Filter session takes"
              className="inline-flex items-center rounded-md border border-white/[0.08] bg-[#0B0B0C] p-0.5"
            >
              <button
                type="button"
                onClick={() => setFilter('all')}
                aria-pressed={filter === 'all'}
                className={`rounded-[5px] px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer ${
                  filter === 'all'
                    ? 'bg-[#26262B] text-[#F5F1E8]'
                    : 'text-[#9B968C] hover:text-[#F5F1E8]'
                }`}
              >
                All <span className="font-mono tabular-nums opacity-75">{takes.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setFilter('retouched')}
                aria-pressed={filter === 'retouched'}
                disabled={retouchedCount === 0}
                className={`rounded-[5px] px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer ${
                  filter === 'retouched'
                    ? 'bg-[#26262B] text-[#F5F1E8]'
                    : 'text-[#9B968C] hover:text-[#F5F1E8]'
                }`}
              >
                Retouched{' '}
                <span className="font-mono tabular-nums opacity-75">{retouchedCount}</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setSortOrder((prev) => (prev === 'newest' ? 'oldest' : 'newest'))
                }
                aria-label={`Sort order: ${sortOrder}. Click to reverse`}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#0B0B0C] px-2.5 py-1.5 text-xs font-medium text-[#9B968C] whitespace-nowrap shrink-0 transition-colors duration-150 hover:border-white/20 hover:text-[#F5F1E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
              >
                <ArrowDownUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{sortOrder === 'newest' ? 'Newest' : 'Oldest'}</span>
              </button>

              {visibleTakes.length > 1 && (
                <div
                  role="group"
                  aria-label="Step between takes"
                  className="inline-flex items-center rounded-md border border-white/[0.08] bg-[#0B0B0C]"
                >
                  <button
                    type="button"
                    onClick={() => handleStepTake(-1)}
                    aria-label="Previous take"
                    className="flex h-[34px] w-8 items-center justify-center text-[#9B968C] transition-colors hover:text-[#F5F1E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D4A853] cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span className="h-4 w-px bg-white/[0.08]" aria-hidden="true" />
                  <button
                    type="button"
                    onClick={() => handleStepTake(1)}
                    aria-label="Next take"
                    className="flex h-[34px] w-8 items-center justify-center text-[#9B968C] transition-colors hover:text-[#F5F1E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D4A853] cursor-pointer"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Thumbnail Grid */}
          {visibleTakes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/[0.09] bg-[#0B0B0C]/60 px-4 py-8 text-center">
              <p className="text-xs text-[#9B968C]">
                No retouched takes match this filter yet.
              </p>
              <button
                type="button"
                onClick={() => setFilter('all')}
                className="mt-3 text-xs font-medium text-[#F5F1E8] underline decoration-[#D4A853]/60 underline-offset-4 hover:text-[#D4A853] cursor-pointer"
              >
                Show all takes
              </button>
            </div>
          ) : (
            <div className="grid max-h-[600px] grid-cols-2 gap-3 overflow-y-auto pr-1">
              {visibleTakes.map((take) => {
                const isActive = take.id === activeTakeId;
                const imgFailed = failedImages[take.id];
                const frameLabel = String(take.frameNumber).padStart(2, '0');
                const timeLabel = formatTakeTime(take.createdAt);

                return (
                  <article
                    key={take.id}
                    className={`group flex flex-col overflow-hidden rounded-lg border transition-colors duration-150 ${
                      isActive
                        ? 'border-[#D4A853] bg-[#18181B] ring-1 ring-[#D4A853]/40'
                        : 'border-white/[0.08] bg-[#0B0B0C] hover:border-white/25'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectTake(take.id)}
                      aria-pressed={isActive}
                      aria-label={`Select take ${frameLabel}, ${take.styleName}${isActive ? ' (currently active)' : ''}`}
                      className="relative aspect-[3/4] w-full overflow-hidden bg-[#111113] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D4A853] cursor-pointer"
                    >
                      {!imgFailed ? (
                        <img
                          src={take.imageUrl}
                          alt={`Take ${frameLabel} — ${take.styleName}`}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setFailedImages((prev) => ({ ...prev, [take.id]: true }))
                          }
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#1C1C1F] px-2 text-center text-[#9B968C]">
                          <Camera className="h-5 w-5" aria-hidden="true" />
                          <span className="text-[11px]">{take.styleName}</span>
                        </div>
                      )}

                      {/* Top Contrast Scrim: Frame index + Active indicator */}
                      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/35 to-transparent px-2.5 pt-2 pb-6">
                        <span className="font-mono text-xs font-medium tabular-nums text-[#F5F1E8]">
                          Take {frameLabel}
                        </span>
                        {isActive && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#D4A853]">
                            <Check className="h-3 w-3 stroke-[2.5]" aria-hidden="true" />
                            <span>Active</span>
                          </span>
                        )}
                      </div>

                      {/* Bottom Contrast Scrim: Retouch note or timestamp */}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2.5 pt-6 pb-2">
                        <p className="truncate text-[11px] text-[#F5F1E8]/90">
                          {take.retouchPrompt ? (
                            <span className="text-[#D4A853]">Retouched</span>
                          ) : (
                            <span>Original pass</span>
                          )}
                          {timeLabel && (
                            <>
                              <span aria-hidden="true" className="mx-1 text-[#9B968C]">
                                ·
                              </span>
                              <span className="font-mono tabular-nums text-[#F5F1E8]/75">
                                {timeLabel}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                    </button>

                    {/* Clean Unboxed Metadata & Quick Frame Actions */}
                    <div className="flex items-center justify-between gap-1.5 px-2.5 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-[#F5F1E8]">
                          {take.styleName}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-[#9B968C]">
                          <span className="font-mono tabular-nums">{take.aspectRatio}</span>
                          <span aria-hidden="true"> · </span>
                          <span>{take.lightingLabel}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onInspectTake(take.id)}
                          aria-label={`Inspect take ${frameLabel} fullscreen`}
                          className="flex h-7 w-7 items-center justify-center rounded text-[#9B968C] transition-colors hover:bg-white/[0.06] hover:text-[#F5F1E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
                        >
                          <Expand className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDownloadTake(take)}
                          aria-label={`Download take ${frameLabel}`}
                          className="flex h-7 w-7 items-center justify-center rounded text-[#9B968C] transition-colors hover:bg-white/[0.06] hover:text-[#F5F1E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveTake(take.id)}
                          aria-label={`Remove take ${frameLabel}`}
                          className="flex h-7 w-7 items-center justify-center rounded text-[#9B968C] transition-colors hover:bg-white/[0.06] hover:text-[#F5F1E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Footer Action to Jump Back to Controls */}
          <div className="border-t border-white/[0.07] pt-4">
            <button
              type="button"
              onClick={onReturnToDirection}
              className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-md border border-white/[0.1] bg-[#0B0B0C] px-4 py-2 text-xs font-medium text-[#F5F1E8] whitespace-nowrap transition-colors duration-150 hover:border-white/25 hover:bg-[#1C1C1F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-[#D4A853] shrink-0" aria-hidden="true" />
              <span>Adjust Direction for Next Take</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
