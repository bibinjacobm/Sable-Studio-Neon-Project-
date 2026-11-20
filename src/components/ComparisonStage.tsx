import React, { useCallback, useRef, useState } from 'react';
import {
  Download,
  Expand,
  MoveHorizontal,
  RefreshCw,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import type {
  GeneratedTake,
  SourcePortrait,
  StudioStylePreset,
} from '../data/studioCatalog';

export type CompareViewMode = 'split' | 'after' | 'before';

interface ComparisonStageProps {
  sourcePortrait: SourcePortrait | null;
  activeTake: GeneratedTake | null;
  selectedStyle: StudioStylePreset;
  compareMode: CompareViewMode;
  sliderPosition: number;
  isGenerating: boolean;
  generationPhase: string;
  isAnalyzing: boolean;
  elapsedSeconds: number;
  onCompareModeChange: (mode: CompareViewMode) => void;
  onSliderChange: (position: number) => void;
  onFileSelected: (file: File) => void;
  onOpenFilePicker: () => void;
  onAnalyzeSelfie: () => void;
  onInspect: () => void;
  onDownload: (take: GeneratedTake) => void;
}

export const ComparisonStage: React.FC<ComparisonStageProps> = ({
  sourcePortrait,
  activeTake,
  selectedStyle,
  compareMode,
  sliderPosition,
  isGenerating,
  generationPhase,
  isAnalyzing,
  elapsedSeconds,
  onCompareModeChange,
  onSliderChange,
  onFileSelected,
  onOpenFilePicker,
  onAnalyzeSelfie,
  onInspect,
  onDownload,
}) => {
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const sliderContainerRef = useRef<HTMLDivElement | null>(null);
  const isPointerDownRef = useRef(false);

  const updateSliderFromClientX = useCallback(
    (clientX: number) => {
      const container = sliderContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      const pct = ((clientX - rect.left) / rect.width) * 100;
      onSliderChange(Math.max(0, Math.min(100, pct)));
    },
    [onSliderChange]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (compareMode !== 'split') return;
    isPointerDownRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateSliderFromClientX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current || compareMode !== 'split') return;
    updateSliderFromClientX(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current) return;
    isPointerDownRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleSliderKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (compareMode !== 'split') return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onSliderChange(Math.max(0, sliderPosition - 5));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onSliderChange(Math.min(100, sliderPosition + 5));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onSliderChange(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      onSliderChange(100);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onFileSelected(file);
    }
  };

  const canCompare = Boolean(activeTake && activeTake.sourceImageUrl);

  const aspectClass =
    activeTake?.aspectRatio === '1:1'
      ? 'aspect-square max-w-[580px]'
      : activeTake?.aspectRatio === '4:3'
        ? 'aspect-[4/3] max-w-[660px]'
        : 'aspect-[3/4] max-w-[500px]';

  return (
    <section aria-label="Portrait Stage" className="flex flex-col">
      {/* Stage Top Bar: Unboxed specs + interactive view controls */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#9B968C]">
          {activeTake ? (
            <>
              <span className="font-mono tabular-nums text-[#F5F1E8]">
                Frame {String(activeTake.frameNumber).padStart(2, '0')}
              </span>
              <span aria-hidden="true">·</span>
              <span>{activeTake.styleName}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{activeTake.aspectRatio}</span>
              {activeTake.retouchPrompt && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#D4A853]">Retouched</span>
                </>
              )}
            </>
          ) : sourcePortrait ? (
            <>
              <span className="text-[#F5F1E8]">Original Source</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {sourcePortrait.width} × {sourcePortrait.height}
              </span>
              <span aria-hidden="true">·</span>
              <span className="max-w-[180px] truncate">{sourcePortrait.fileName}</span>
            </>
          ) : (
            <>
              <span className="text-[#F5F1E8]">Darkroom Stage</span>
              <span aria-hidden="true">·</span>
              <span>{selectedStyle.name}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{selectedStyle.lensSpec}</span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canCompare && (
            <div
              role="group"
              aria-label="Comparison view mode"
              className="inline-flex items-center rounded-md border border-white/[0.08] bg-[#141416] p-0.5"
            >
              {(
                [
                  { id: 'split', label: 'Split Compare' },
                  { id: 'after', label: 'Final' },
                  { id: 'before', label: 'Original' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onCompareModeChange(tab.id)}
                  className={`rounded-[5px] px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer ${
                    compareMode === tab.id
                      ? 'bg-[#26262B] text-[#F5F1E8]'
                      : 'text-[#9B968C] hover:text-[#F5F1E8]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {activeTake && (
            <>
              <button
                type="button"
                onClick={onInspect}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-white/[0.09] bg-[#141416] px-3 py-1.5 text-xs font-medium text-[#F5F1E8] whitespace-nowrap shrink-0 transition-colors duration-150 hover:border-white/25 hover:bg-[#1C1C1F] cursor-pointer"
              >
                <Expand className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Inspect</span>
              </button>
              <button
                type="button"
                onClick={() => onDownload(activeTake)}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md bg-[#F5F1E8] px-3 py-1.5 text-xs font-semibold text-[#0B0B0C] whitespace-nowrap shrink-0 transition-colors duration-150 hover:bg-[#E7E0D0] cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Download</span>
              </button>
            </>
          )}

          {sourcePortrait && (
            <>
              {!activeTake && (
                <button
                  type="button"
                  onClick={onAnalyzeSelfie}
                  disabled={isAnalyzing || isGenerating}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-[#D4A853]/40 bg-[#141416] px-3 py-1.5 text-xs font-medium text-[#F5F1E8] whitespace-nowrap shrink-0 transition-colors duration-150 hover:border-[#D4A853] hover:bg-[#1C1C1F] disabled:opacity-50 cursor-pointer"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-[#D4A853]" aria-hidden="true" />
                  <span>{isAnalyzing ? 'Analyzing...' : 'Critique Lighting'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={onOpenFilePicker}
                disabled={isGenerating}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-white/[0.09] bg-[#141416] px-3 py-1.5 text-xs font-medium text-[#9B968C] whitespace-nowrap shrink-0 transition-colors duration-150 hover:text-[#F5F1E8] hover:border-white/20 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Replace</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Darkroom Frame */}
      <div className="relative flex min-h-[480px] lg:min-h-[580px] w-full items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-[#111113] p-4 sm:p-6">
        {activeTake ? (
          <div
            ref={sliderContainerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleSliderKeyDown}
            tabIndex={canCompare && compareMode === 'split' ? 0 : undefined}
            role={canCompare && compareMode === 'split' ? 'slider' : undefined}
            aria-label={
              canCompare && compareMode === 'split'
                ? 'Before and after headshot comparison slider'
                : undefined
            }
            aria-valuemin={canCompare && compareMode === 'split' ? 0 : undefined}
            aria-valuemax={canCompare && compareMode === 'split' ? 100 : undefined}
            aria-valuenow={
              canCompare && compareMode === 'split' ? Math.round(sliderPosition) : undefined
            }
            className={`relative w-full ${aspectClass} select-none overflow-hidden rounded-lg bg-[#0B0B0C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] ${
              canCompare && compareMode === 'split' ? 'cursor-ew-resize touch-none' : ''
            }`}
          >
            {/* Base layer: Generated studio portrait (or original when 'before' mode) */}
            <img
              src={
                compareMode === 'before' && activeTake.sourceImageUrl
                  ? activeTake.sourceImageUrl
                  : activeTake.imageUrl
              }
              alt={`${activeTake.styleName} studio headshot frame ${activeTake.frameNumber}`}
              referrerPolicy="no-referrer"
              draggable={false}
              className="h-full w-full object-cover"
            />

            {/* Clipped overlay layer: Original Selfie on left side in Split mode */}
            {canCompare && compareMode === 'split' && activeTake.sourceImageUrl && (
              <>
                <div
                  className="pointer-events-none absolute inset-0 overflow-hidden"
                  style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
                >
                  <img
                    src={activeTake.sourceImageUrl}
                    alt="Original uploaded selfie"
                    referrerPolicy="no-referrer"
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                </div>

                {/* Brass Vertical Curtain Line & Tactile Handle */}
                <div
                  className="pointer-events-none absolute inset-y-0 z-10 w-px bg-[#D4A853]"
                  style={{ left: `${sliderPosition}%` }}
                >
                  <div className="absolute top-1/2 left-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#D4A853] bg-[#0B0B0C]/90 text-[#F5F1E8] shadow-lg backdrop-blur-sm">
                    <MoveHorizontal className="h-4 w-4 text-[#D4A853]" aria-hidden="true" />
                  </div>
                </div>

                {/* Measured Scrim Corner Labels */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/75 via-black/30 to-transparent px-4 pt-8 pb-3 text-xs font-medium text-[#F5F1E8]">
                  <span>Original Selfie</span>
                  <span className="font-mono tabular-nums text-[#D4A853]">
                    {Math.round(sliderPosition)}% / {100 - Math.round(sliderPosition)}%
                  </span>
                  <span>Studio Portrait</span>
                </div>
              </>
            )}
          </div>
        ) : sourcePortrait ? (
          <div className="relative flex w-full max-w-[480px] flex-col items-center">
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg border border-white/[0.08] bg-[#0B0B0C]">
              <img
                src={sourcePortrait.dataUrl}
                alt="Uploaded casual selfie ready for studio lighting"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-4 pt-10 pb-4">
                <p className="text-xs text-[#F5F1E8]">
                  Source frame loaded · Ready for {selectedStyle.name}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingFile(true);
            }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={handleDrop}
            className={`flex w-full max-w-[520px] flex-col items-center justify-center rounded-lg border border-dashed px-8 py-14 text-center transition-colors duration-150 ${
              isDraggingFile
                ? 'border-[#D4A853] bg-[#D4A853]/[0.06]'
                : 'border-white/15 bg-[#141416]/60 hover:border-white/25'
            }`}
          >
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-white/12 bg-[#1C1C1F] text-[#D4A853]">
              <Upload className="h-5 w-5" aria-hidden="true" />
            </div>

            <h2 className="font-serif text-3xl font-semibold tracking-tight text-[#F5F1E8]">
              Upload a casual selfie
            </h2>
            <p className="mt-2.5 max-w-[40ch] text-sm leading-relaxed text-[#9B968C]">
              Drop any smartphone portrait here. Sable Studio isolates your silhouette on-device,
              places you onto your chosen backdrop, and relights the frame for free.
            </p>

            <div className="mt-7 flex items-center justify-center">
              <button
                type="button"
                onClick={onOpenFilePicker}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[#F5F1E8] px-6 py-2.5 text-sm font-semibold text-[#0B0B0C] whitespace-nowrap transition-colors duration-150 hover:bg-[#E7E0D0] cursor-pointer"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                <span>Choose Photograph</span>
              </button>
            </div>

            <p className="mt-7 text-xs text-[#9B968C]">
              Front-facing <span aria-hidden="true">·</span> Even light{' '}
              <span aria-hidden="true">·</span> No sunglasses{' '}
              <span aria-hidden="true">·</span> JPEG, PNG, WebP
            </p>
          </div>
        )}

        {/* Restrained Darkroom Exposure Overlay while Developing */}
        {isGenerating && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0B0B0C]/82 backdrop-blur-sm"
          >
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="exposure-sweep h-24 w-full bg-gradient-to-b from-transparent via-[#D4A853]/25 to-transparent" />
            </div>
            <div className="relative z-10 flex flex-col items-center px-6 text-center">
              <p className="font-serif text-2xl font-semibold text-[#F5F1E8]">
                {generationPhase || 'Developing studio plate'}
              </p>
              <p className="mt-2 text-xs text-[#9B968C]">
                {selectedStyle.name} <span aria-hidden="true">·</span>{' '}
                <span className="font-mono tabular-nums text-[#D4A853]">
                  {elapsedSeconds.toFixed(1)}s
                </span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Quiet Director Note under active frame */}
      {activeTake?.directorNote && (
        <p className="mt-3 text-xs leading-relaxed text-[#9B968C]">
          <span className="font-medium text-[#F5F1E8]">Darkroom note:</span>{' '}
          {activeTake.directorNote}
        </p>
      )}
    </section>
  );
};
