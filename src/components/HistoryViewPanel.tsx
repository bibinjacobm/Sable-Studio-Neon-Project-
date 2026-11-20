import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowDownUp,
  Camera,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  FileText,
  History,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import type { GeneratedTake } from '../data/studioCatalog';
import {
  downloadAllPortraitsZip,
  downloadBatchPortraitsZip,
} from '../utils/imageProcessing';
import { exportPortfolioPdf } from '../utils/portfolioPdf';

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
  const [peekingSourceById, setPeekingSourceById] = useState<Record<string, boolean>>({});
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [portfolioTitle, setPortfolioTitle] = useState('');
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const isBusyExporting = isExportingZip || isExportingPdf;

  const takeIdSet = useMemo(() => new Set(takes.map((take) => take.id)), [takes]);

  const validSelectedIdSet = useMemo(
    () => new Set(selectedIds.filter((id) => takeIdSet.has(id))),
    [selectedIds, takeIdSet]
  );

  const selectedTakes = useMemo(
    () => takes.filter((take) => validSelectedIdSet.has(take.id)),
    [takes, validSelectedIdSet]
  );

  useEffect(() => {
    if (takes.length === 0 && isBatchMode) {
      setIsBatchMode(false);
      setSelectedIds([]);
    }
  }, [takes.length, isBatchMode]);

  useEffect(() => {
    if (!exportSuccess) return;
    const timer = window.setTimeout(() => setExportSuccess(null), 4000);
    return () => window.clearTimeout(timer);
  }, [exportSuccess]);

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

  const allVisibleSelected = useMemo(
    () =>
      visibleTakes.length > 0 && visibleTakes.every((take) => validSelectedIdSet.has(take.id)),
    [visibleTakes, validSelectedIdSet]
  );

  const handleToggleBatchMode = () => {
    setExportError(null);
    setExportSuccess(null);
    setIsBatchMode((prev) => {
      const next = !prev;
      if (!next) {
        setSelectedIds([]);
      }
      return next;
    });
  };

  const handleStartPortfolioExport = () => {
    setExportError(null);
    setExportSuccess(null);
    setIsBatchMode(true);
    setSelectedIds((prev) => {
      const valid = prev.filter((id) => takeIdSet.has(id));
      if (valid.length > 0) return valid;
      const defaults = visibleTakes.length > 0 ? visibleTakes : takes;
      return defaults.map((take) => take.id);
    });
  };

  const handleToggleSelectTake = (id: string) => {
    setExportError(null);
    setExportSuccess(null);
    setSelectedIds((prev) => {
      const cleaned = prev.filter((itemId) => takeIdSet.has(itemId));
      return cleaned.includes(id)
        ? cleaned.filter((itemId) => itemId !== id)
        : [...cleaned, id];
    });
  };

  const handleSelectAllVisible = () => {
    setExportError(null);
    setExportSuccess(null);
    setSelectedIds((prev) => {
      const merged = new Set(prev.filter((id) => takeIdSet.has(id)));
      for (const take of visibleTakes) {
        merged.add(take.id);
      }
      return Array.from(merged);
    });
  };

  const handleClearSelection = () => {
    setExportError(null);
    setExportSuccess(null);
    setSelectedIds([]);
  };

  const handleDownloadAll = async () => {
    if (takes.length === 0 || isBusyExporting) return;
    setExportError(null);
    setExportSuccess(null);
    setIsExportingZip(true);
    try {
      await downloadAllPortraitsZip(takes);
      setExportSuccess(
        `Exported all ${takes.length} ${takes.length === 1 ? 'take' : 'takes'} with summary notes.`
      );
    } catch (err) {
      setExportError(
        err instanceof Error
          ? err.message
          : 'Unable to create compressed ZIP archive. Please try again.'
      );
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleExportBatch = async () => {
    if (selectedTakes.length === 0 || isBusyExporting) return;
    setExportError(null);
    setExportSuccess(null);
    setIsExportingZip(true);
    try {
      await downloadBatchPortraitsZip(selectedTakes);
      setExportSuccess(
        `Bundled ${selectedTakes.length} ${
          selectedTakes.length === 1 ? 'take' : 'takes'
        } + generation parameters summary.`
      );
    } catch (err) {
      setExportError(
        err instanceof Error
          ? err.message
          : 'Unable to bundle selected takes into a ZIP archive. Please try again.'
      );
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleExportPortfolioPdf = async () => {
    if (selectedTakes.length === 0 || isBusyExporting) return;
    setExportError(null);
    setExportSuccess(null);
    setIsExportingPdf(true);
    try {
      await exportPortfolioPdf(selectedTakes, { title: portfolioTitle });
      setExportSuccess(
        `Exported branded PDF contact sheet for ${selectedTakes.length} ${
          selectedTakes.length === 1 ? 'take' : 'takes'
        }.`
      );
    } catch (err) {
      setExportError(
        err instanceof Error
          ? err.message
          : 'Unable to generate PDF portfolio contact sheet. Please try again.'
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

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
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-baseline gap-2.5">
            <h2 className="font-serif text-2xl font-semibold text-[#F5F1E8]">Session History</h2>
            <span className="font-mono text-xs tabular-nums text-[#9B968C] whitespace-nowrap shrink-0">
              {takes.length} {takes.length === 1 ? 'take' : 'takes'}
            </span>
          </div>

          {takes.length > 0 && (
            <div className="flex items-center gap-1.5">
              {isBatchMode ? (
                <button
                  type="button"
                  onClick={handleToggleBatchMode}
                  aria-pressed={isBatchMode}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-[#D4A853] bg-[#D4A853]/15 px-2.5 py-1.5 text-xs font-semibold text-[#F5F1E8] whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
                >
                  <X className="h-3.5 w-3.5 text-[#D4A853] shrink-0" aria-hidden="true" />
                  <span>Exit Selection</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleDownloadAll()}
                  disabled={isBusyExporting}
                  aria-label={`Download all ${takes.length} session takes as a compressed ZIP archive`}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-white/[0.12] bg-[#0B0B0C] px-2.5 py-1.5 text-xs font-semibold text-[#F5F1E8] whitespace-nowrap shrink-0 transition-colors duration-150 hover:border-white/25 hover:bg-[#1C1C1F] disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
                >
                  <Archive className="h-3.5 w-3.5 text-[#D4A853] shrink-0" aria-hidden="true" />
                  <span>{isExportingZip ? 'Compressing...' : 'Download All'}</span>
                </button>
              )}
            </div>
          )}
        </div>
        <p className="mt-1 text-xs text-[#9B968C]">
          {isBatchMode
            ? 'Select takes below to export a branded PDF portfolio contact sheet or ZIP bundle'
            : 'Click any generated headshot to toggle it immediately on the portrait stage'}
        </p>

        {takes.length > 0 && !isBatchMode && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleStartPortfolioExport}
              disabled={isBusyExporting}
              className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-md border border-[#D4A853]/55 bg-[#0B0B0C] px-3 py-1.5 text-xs font-semibold text-[#F5F1E8] whitespace-nowrap shrink-0 transition-colors duration-150 hover:border-[#D4A853] hover:bg-[#1C1C1F] disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
            >
              <FileText className="h-3.5 w-3.5 text-[#D4A853] shrink-0" aria-hidden="true" />
              <span>Export Portfolio</span>
            </button>

            <button
              type="button"
              onClick={handleToggleBatchMode}
              disabled={isBusyExporting}
              className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-md border border-white/[0.12] bg-[#0B0B0C] px-3 py-1.5 text-xs font-semibold text-[#F5F1E8] whitespace-nowrap shrink-0 transition-colors duration-150 hover:border-white/25 hover:bg-[#1C1C1F] disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
            >
              <CheckSquare className="h-3.5 w-3.5 text-[#D4A853] shrink-0" aria-hidden="true" />
              <span>Batch Export</span>
            </button>
          </div>
        )}

        {exportError && (
          <p role="alert" className="mt-2.5 text-xs text-amber-300">
            {exportError}
          </p>
        )}
        {exportSuccess && !exportError && (
          <p role="status" className="mt-2.5 text-xs text-[#D4A853]">
            {exportSuccess}
          </p>
        )}
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
          {/* Portfolio & Batch Export Selection Bar */}
          {isBatchMode && (
            <div className="flex flex-col gap-3 rounded-lg border border-[#D4A853]/35 bg-[#0B0B0C]/90 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono font-medium tabular-nums text-[#F5F1E8]">
                    {selectedTakes.length} of {takes.length} selected
                  </span>
                  <span aria-hidden="true" className="text-[#9B968C]">
                    ·
                  </span>
                  <span className="text-[#9B968C]">Full styling metadata</span>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={handleSelectAllVisible}
                    disabled={visibleTakes.length === 0 || allVisibleSelected}
                    className="font-medium text-[#F5F1E8] underline decoration-[#D4A853]/60 underline-offset-4 transition-colors hover:text-[#D4A853] disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap cursor-pointer"
                  >
                    {filter === 'retouched' ? 'Select Visible' : 'Select All'}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    disabled={selectedTakes.length === 0}
                    className="font-medium text-[#9B968C] transition-colors hover:text-[#F5F1E8] disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="portfolio-sheet-title" className="sr-only">
                  Optional portfolio title for PDF cover header
                </label>
                <input
                  id="portfolio-sheet-title"
                  type="text"
                  value={portfolioTitle}
                  onChange={(e) => setPortfolioTitle(e.target.value)}
                  maxLength={72}
                  placeholder="Portfolio title (optional, e.g. Executive Press Kit)"
                  className="w-full rounded-md border border-white/[0.1] bg-[#141416] px-3 py-2 text-xs text-[#F5F1E8] placeholder:text-[#9B968C]/70 focus:border-[#D4A853] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void handleExportPortfolioPdf()}
                  disabled={selectedTakes.length === 0 || isBusyExporting}
                  className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-md bg-[#F5F1E8] px-3 py-2 text-xs font-semibold text-[#0B0B0C] whitespace-nowrap transition-colors duration-150 hover:bg-[#E7E0D0] disabled:cursor-not-allowed disabled:bg-white/12 disabled:text-[#9B968C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {isExportingPdf
                      ? 'Building PDF...'
                      : selectedTakes.length > 0
                        ? `Export Portfolio (${selectedTakes.length})`
                        : 'Export Portfolio PDF'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleExportBatch()}
                  disabled={selectedTakes.length === 0 || isBusyExporting}
                  className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-md border border-[#D4A853]/50 bg-[#141416] px-3 py-2 text-xs font-semibold text-[#F5F1E8] whitespace-nowrap transition-colors duration-150 hover:border-[#D4A853] hover:bg-[#1C1C1F] disabled:cursor-not-allowed disabled:border-white/[0.08] disabled:text-[#9B968C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
                >
                  <Archive className="h-3.5 w-3.5 text-[#D4A853] shrink-0" aria-hidden="true" />
                  <span>
                    {isExportingZip
                      ? 'Bundling ZIP...'
                      : selectedTakes.length > 0
                        ? `Download ZIP (${selectedTakes.length})`
                        : 'Download ZIP'}
                  </span>
                </button>
              </div>
            </div>
          )}

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

              {!isBatchMode && visibleTakes.length > 1 && (
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
            <div className="grid max-h-[600px] grid-cols-2 gap-3 overflow-y-auto p-1">
              {visibleTakes.map((take) => {
                const isActive = take.id === activeTakeId;
                const isSelected = validSelectedIdSet.has(take.id);
                const sourceThumbUrl = take.alignedSourceUrl || take.sourceImageUrl;
                const hasSource = Boolean(sourceThumbUrl);
                const isShowingSource = hasSource && Boolean(peekingSourceById[take.id]);
                const activeThumbUrl = isShowingSource ? sourceThumbUrl : take.imageUrl;
                const imgErrorKey = `${take.id}:${isShowingSource ? 'source' : 'result'}`;
                const imgFailed = failedImages[imgErrorKey];
                const frameLabel = String(take.frameNumber).padStart(2, '0');
                const timeLabel = formatTakeTime(take.createdAt);
                const isHighlighted = isBatchMode ? isSelected : isActive;

                return (
                  <article
                    key={take.id}
                    className={`group relative flex flex-col overflow-hidden rounded-lg border transition-[transform,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform hover:z-10 hover:scale-[1.025] hover:shadow-[0_12px_28px_rgba(0,0,0,0.48)] focus-within:z-10 focus-within:scale-[1.015] motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:focus-within:scale-100 ${
                      isHighlighted
                        ? 'border-[#D4A853] bg-[#18181B] ring-1 ring-[#D4A853]/45'
                        : 'border-white/[0.08] bg-[#0B0B0C] hover:border-[#D4A853]/55'
                    }`}
                  >
                    <button
                      type="button"
                      role={isBatchMode ? 'checkbox' : undefined}
                      aria-checked={isBatchMode ? isSelected : undefined}
                      aria-pressed={!isBatchMode ? isActive : undefined}
                      onClick={() =>
                        isBatchMode ? handleToggleSelectTake(take.id) : onSelectTake(take.id)
                      }
                      aria-label={
                        isBatchMode
                          ? `${isSelected ? 'Deselect' : 'Select'} take ${frameLabel}, ${
                              take.styleName
                            } for batch export`
                          : `Select take ${frameLabel}, ${take.styleName}${
                              isActive ? ' (currently active)' : ''
                            }`
                      }
                      className="relative aspect-[3/4] w-full overflow-hidden bg-[#111113] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D4A853] cursor-pointer"
                    >
                      {!imgFailed ? (
                        <img
                          src={activeThumbUrl}
                          alt={
                            isShowingSource
                              ? `Take ${frameLabel} — Original input selfie`
                              : `Take ${frameLabel} — ${take.styleName}`
                          }
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setFailedImages((prev) => ({ ...prev, [imgErrorKey]: true }))
                          }
                          className="h-full w-full object-cover transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform group-hover:scale-[1.05] group-focus-within:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100 motion-reduce:group-focus-within:scale-100"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#1C1C1F] px-2 text-center text-[#9B968C]">
                          <Camera className="h-5 w-5" aria-hidden="true" />
                          <span className="text-[11px]">
                            {isShowingSource ? 'Original Source' : take.styleName}
                          </span>
                        </div>
                      )}

                      {/* Top Contrast Scrim: Frame index + Selection / Active indicator */}
                      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/35 to-transparent px-2.5 pt-2 pb-6">
                        <span className="font-mono text-xs font-medium tabular-nums text-[#F5F1E8]">
                          Take {frameLabel}
                        </span>
                        {isBatchMode ? (
                          <span className="inline-flex items-center gap-1.5">
                            {isSelected && (
                              <span className="text-[11px] font-semibold text-[#D4A853]">
                                Selected
                              </span>
                            )}
                            <span
                              aria-hidden="true"
                              className={`flex h-4 w-4 items-center justify-center rounded-[4px] border transition-colors duration-150 ${
                                isSelected
                                  ? 'border-[#D4A853] bg-[#D4A853] text-[#0B0B0C]'
                                  : 'border-white/50 bg-black/55 text-transparent'
                              }`}
                            >
                              <Check className="h-3 w-3 stroke-[3]" />
                            </span>
                          </span>
                        ) : (
                          isActive && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#D4A853]">
                              <Check className="h-3 w-3 stroke-[2.5]" aria-hidden="true" />
                              <span>Active</span>
                            </span>
                          )
                        )}
                      </div>

                      {/* Bottom Contrast Scrim: Source peek indicator, Retouch note, or timestamp */}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2.5 pt-6 pb-2">
                        <p className="truncate text-[11px] text-[#F5F1E8]/90">
                          {isShowingSource ? (
                            <span className="font-medium text-[#D4A853]">Original source</span>
                          ) : take.retouchPrompt ? (
                            <span className="text-[#D4A853]">Retouched</span>
                          ) : (
                            <span>Studio result</span>
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

                    {/* Per-Card Source vs. Result Quick Peek Toggle */}
                    {hasSource && (
                      <div
                        role="group"
                        aria-label={`Toggle Source or Result preview for take ${frameLabel}`}
                        className="grid grid-cols-2 gap-0.5 border-y border-white/[0.06] bg-[#111113] p-1"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setPeekingSourceById((prev) => ({ ...prev, [take.id]: true }))
                          }
                          aria-pressed={isShowingSource}
                          className={`min-h-[26px] rounded-[4px] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer ${
                            isShowingSource
                              ? 'bg-[#D4A853]/18 text-[#D4A853]'
                              : 'text-[#9B968C] hover:bg-white/[0.04] hover:text-[#F5F1E8]'
                          }`}
                        >
                          Source
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPeekingSourceById((prev) => ({ ...prev, [take.id]: false }))
                          }
                          aria-pressed={!isShowingSource}
                          className={`min-h-[26px] rounded-[4px] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer ${
                            !isShowingSource
                              ? 'bg-[#26262B] text-[#F5F1E8]'
                              : 'text-[#9B968C] hover:bg-white/[0.04] hover:text-[#F5F1E8]'
                          }`}
                        >
                          Result
                        </button>
                      </div>
                    )}

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
                          {isBatchMode && isActive && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span className="text-[#D4A853]">On stage</span>
                            </>
                          )}
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
                        {!isBatchMode && (
                          <>
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
                          </>
                        )}
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
