import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  Download,
  Expand,
  History,
  MoveHorizontal,
  RefreshCw,
  SlidersHorizontal,
  SunMedium,
  Upload,
  X,
} from 'lucide-react';
import {
  getStyleById,
  type AdvancedLightingPresetId,
  type FramingAnchor,
  type GeneratedTake,
  type LightingId,
  type SelfieCritique,
  type SourcePortrait,
  type StudioStylePreset,
} from '../data/studioCatalog';
import {
  analyzeLightingQuality,
  evaluateLightingCompassAlignment,
  generateLightingHeatmap,
  type LightingHeatmapAnalysis,
  type LightingQualityReport,
} from '../utils/lightingHeatmap';
import { LightingCompassOverlay } from './LightingCompassOverlay';
import { LightingHistogram } from './LightingHistogram';

interface ComparisonStageProps {
  sourcePortrait: SourcePortrait | null;
  activeTake: GeneratedTake | null;
  selectedStyle: StudioStylePreset;
  critique: SelfieCritique | null;
  detectedAnchor: FramingAnchor | null;
  currentLightingId: LightingId;
  currentAdvancedLightingPreset: AdvancedLightingPresetId;
  sliderPosition: number;
  isGenerating: boolean;
  generationPhase: string;
  isAnalyzing: boolean;
  elapsedSeconds: number;
  takesCount: number;
  isHistoryOpen: boolean;
  onSliderChange: (position: number) => void;
  onToggleHistory: () => void;
  onFileSelected: (file: File) => void;
  onOpenFilePicker: () => void;
  onAnalyzeSelfie: () => void;
  onApplyRecommendedLighting: (
    lightingId: LightingId,
    advancedPreset: AdvancedLightingPresetId
  ) => void;
  onInspect: () => void;
  onDownload: (take: GeneratedTake) => void;
}

export const ComparisonStage: React.FC<ComparisonStageProps> = ({
  sourcePortrait,
  activeTake,
  selectedStyle,
  critique,
  detectedAnchor,
  currentLightingId,
  currentAdvancedLightingPreset,
  sliderPosition,
  isGenerating,
  generationPhase,
  isAnalyzing,
  elapsedSeconds,
  takesCount,
  isHistoryOpen,
  onSliderChange,
  onToggleHistory,
  onFileSelected,
  onOpenFilePicker,
  onAnalyzeSelfie,
  onApplyRecommendedLighting,
  onInspect,
  onDownload,
}) => {
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showCompass, setShowCompass] = useState(true);
  const [heatmapAnalysis, setHeatmapAnalysis] = useState<LightingHeatmapAnalysis | null>(null);
  const [lightingQuality, setLightingQuality] = useState<LightingQualityReport | null>(null);
  const [isAnalyzingQuality, setIsAnalyzingQuality] = useState(false);
  const [isCompareTooltipOpen, setIsCompareTooltipOpen] = useState(false);
  const sliderContainerRef = useRef<HTMLDivElement | null>(null);
  const isPointerDownRef = useRef(false);
  const tooltipCloseTimerRef = useRef<number | null>(null);

  const openCompareTooltip = useCallback(() => {
    if (tooltipCloseTimerRef.current !== null) {
      window.clearTimeout(tooltipCloseTimerRef.current);
      tooltipCloseTimerRef.current = null;
    }
    setIsCompareTooltipOpen(true);
  }, []);

  const scheduleCloseCompareTooltip = useCallback(() => {
    if (tooltipCloseTimerRef.current !== null) {
      window.clearTimeout(tooltipCloseTimerRef.current);
    }
    tooltipCloseTimerRef.current = window.setTimeout(() => {
      tooltipCloseTimerRef.current = null;
      setIsCompareTooltipOpen(false);
    }, 150);
  }, []);

  const closeCompareTooltipNow = useCallback(() => {
    if (tooltipCloseTimerRef.current !== null) {
      window.clearTimeout(tooltipCloseTimerRef.current);
      tooltipCloseTimerRef.current = null;
    }
    setIsCompareTooltipOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      if (tooltipCloseTimerRef.current !== null) {
        window.clearTimeout(tooltipCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isCompareTooltipOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeCompareTooltipNow();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isCompareTooltipOpen, closeCompareTooltipNow]);

  const inputSelfieUrl = sourcePortrait?.dataUrl ?? activeTake?.sourceImageUrl ?? null;
  const effectiveAnchor = activeTake?.anchor ?? detectedAnchor;
  const beforeSourceUrl = activeTake
    ? activeTake.alignedSourceUrl || activeTake.sourceImageUrl
    : sourcePortrait?.dataUrl ?? null;

  const canCompare = Boolean(activeTake && activeTake.sourceImageUrl);
  const isBeforeViewVisible = Boolean(
    beforeSourceUrl && (!activeTake || sliderPosition > 0.5)
  );
  const isHeatmapActive = showHeatmap && isBeforeViewVisible;

  const compassAlignment = useMemo(() => {
    if (!lightingQuality) return null;
    const targetLighting = activeTake ? activeTake.recipe.lightingId : currentLightingId;
    const targetAdvanced = activeTake
      ? activeTake.recipe.advancedLightingPreset ?? 'none'
      : currentAdvancedLightingPreset;
    return evaluateLightingCompassAlignment(lightingQuality, targetLighting, targetAdvanced);
  }, [lightingQuality, activeTake, currentLightingId, currentAdvancedLightingPreset]);

  useEffect(() => {
    if (!inputSelfieUrl) {
      setLightingQuality(null);
      setIsAnalyzingQuality(false);
      return;
    }

    let cancelled = false;
    setIsAnalyzingQuality(true);
    void analyzeLightingQuality(inputSelfieUrl, effectiveAnchor)
      .then((report) => {
        if (!cancelled) {
          setLightingQuality(report);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLightingQuality(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsAnalyzingQuality(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [inputSelfieUrl, effectiveAnchor]);

  useEffect(() => {
    if (!beforeSourceUrl) {
      setShowHeatmap(false);
      setHeatmapAnalysis(null);
      return;
    }
    if (!showHeatmap) return;

    let cancelled = false;
    void generateLightingHeatmap(beforeSourceUrl)
      .then((result) => {
        if (!cancelled) {
          setHeatmapAnalysis(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHeatmapAnalysis(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [beforeSourceUrl, showHeatmap]);

  const handleToggleHeatmap = () => {
    if (!beforeSourceUrl) return;
    if (activeTake && sliderPosition < 25) {
      onSliderChange(60);
      setShowHeatmap(true);
      return;
    }
    setShowHeatmap((prev) => !prev);
  };

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
    if (!canCompare) return;
    isPointerDownRef.current = true;
    setIsDraggingSlider(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    updateSliderFromClientX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current || !canCompare) return;
    updateSliderFromClientX(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current) return;
    isPointerDownRef.current = false;
    setIsDraggingSlider(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleDoubleClickSlider = () => {
    if (!canCompare) return;
    onSliderChange(sliderPosition > 5 && sliderPosition < 95 ? 0 : 50);
  };

  const handleSliderKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canCompare) return;
    const step = e.shiftKey ? 1 : 5;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onSliderChange(Math.max(0, sliderPosition - step));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onSliderChange(Math.min(100, sliderPosition + step));
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

  const roundedBeforePct = Math.round(sliderPosition);
  const roundedAfterPct = 100 - roundedBeforePct;

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
              className="relative inline-flex"
              onMouseEnter={openCompareTooltip}
              onMouseLeave={scheduleCloseCompareTooltip}
              onFocus={openCompareTooltip}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  closeCompareTooltipNow();
                }
              }}
            >
              <button
                type="button"
                onClick={handleDoubleClickSlider}
                aria-describedby={isCompareTooltipOpen ? 'compare-toggle-tooltip' : undefined}
                aria-label={`Swipe comparison divider at ${roundedBeforePct}% original and ${roundedAfterPct}% studio portrait. Click to snap`}
                className="inline-flex min-h-[34px] items-center gap-2 rounded-md border border-[#D4A853]/35 bg-[#141416] px-3 py-1.5 text-xs font-medium text-[#F5F1E8] whitespace-nowrap shrink-0 transition-colors duration-150 hover:border-[#D4A853] hover:bg-[#1C1C1F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
              >
                <MoveHorizontal className="h-3.5 w-3.5 text-[#D4A853] shrink-0" aria-hidden="true" />
                <span>Swipe</span>
                <span className="font-mono text-[11px] tabular-nums text-[#D4A853]">
                  {roundedBeforePct}/{roundedAfterPct}
                </span>
              </button>

              {/* Floating Interactive Tooltip with seamless hover bridge */}
              {isCompareTooltipOpen && (
                <div
                  id="compare-toggle-tooltip"
                  role="tooltip"
                  onMouseEnter={openCompareTooltip}
                  onMouseLeave={scheduleCloseCompareTooltip}
                  className="absolute top-full left-0 z-30 w-72 pt-2.5 sm:w-80"
                >
                  <div className="relative rounded-lg border border-[#D4A853]/35 bg-[#141416]/98 p-3.5 text-left shadow-[0_16px_40px_rgba(0,0,0,0.72)] backdrop-blur-md">
                    <span
                      aria-hidden="true"
                      className="absolute -top-1.5 left-6 h-2.5 w-2.5 rotate-45 border-t border-l border-[#D4A853]/35 bg-[#141416]"
                    />
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-[#F5F1E8]">
                        Before / After Swipe Verification
                      </p>
                      <button
                        type="button"
                        onClick={closeCompareTooltipNow}
                        aria-label="Dismiss comparison tip"
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[#9B968C] transition-colors hover:bg-white/[0.08] hover:text-[#F5F1E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-[#9B968C]">
                      Drag the brass overlay divider directly across the portrait for side-by-side
                      verification of studio-grade enhancements against your original input selfie.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-2.5 text-[11px]">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSliderChange(50)}
                          className="font-medium text-[#D4A853] underline decoration-[#D4A853]/50 underline-offset-4 transition-colors hover:text-[#F5F1E8] whitespace-nowrap cursor-pointer"
                        >
                          Center 50/50
                        </button>
                        <span aria-hidden="true" className="text-[#9B968C]">
                          ·
                        </span>
                        <button
                          type="button"
                          onClick={() => onSliderChange(0)}
                          className="font-medium text-[#F5F1E8]/85 transition-colors hover:text-[#D4A853] whitespace-nowrap cursor-pointer"
                        >
                          Full Studio
                        </button>
                        <span aria-hidden="true" className="text-[#9B968C]">
                          ·
                        </span>
                        <button
                          type="button"
                          onClick={() => onSliderChange(100)}
                          className="font-medium text-[#F5F1E8]/85 transition-colors hover:text-[#D4A853] whitespace-nowrap cursor-pointer"
                        >
                          Original
                        </button>
                      </div>
                      <span className="font-mono tabular-nums text-[#9B968C] whitespace-nowrap">
                        Space · B
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {beforeSourceUrl && (
            <>
              <button
                type="button"
                onClick={handleToggleHeatmap}
                aria-pressed={isHeatmapActive}
                title="Toggle lighting intensity & shadow distribution heat-map on Before view"
                className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer ${
                  isHeatmapActive
                    ? 'border-[#D4A853] bg-[#D4A853]/15 text-[#F5F1E8]'
                    : 'border-white/[0.09] bg-[#141416] text-[#9B968C] hover:border-white/25 hover:text-[#F5F1E8]'
                }`}
              >
                <SunMedium
                  className={`h-3.5 w-3.5 shrink-0 ${isHeatmapActive ? 'text-[#D4A853]' : ''}`}
                  aria-hidden="true"
                />
                <span>Light Map</span>
              </button>

              {compassAlignment && (
                <button
                  type="button"
                  onClick={() => setShowCompass((prev) => !prev)}
                  aria-pressed={showCompass}
                  title="Toggle Lighting Direction Compass overlay"
                  className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer ${
                    showCompass
                      ? 'border-[#D4A853] bg-[#D4A853]/15 text-[#F5F1E8]'
                      : 'border-white/[0.09] bg-[#141416] text-[#9B968C] hover:border-white/25 hover:text-[#F5F1E8]'
                  }`}
                >
                  <Compass
                    className={`h-3.5 w-3.5 shrink-0 ${showCompass ? 'text-[#D4A853]' : ''}`}
                    aria-hidden="true"
                  />
                  <span>Compass</span>
                </button>
              )}
            </>
          )}

          {takesCount > 0 && (
            <button
              type="button"
              onClick={onToggleHistory}
              aria-pressed={isHistoryOpen}
              title="Toggle Session History (H)"
              className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer ${
                isHistoryOpen
                  ? 'border-[#D4A853] bg-[#D4A853]/15 text-[#F5F1E8]'
                  : 'border-white/[0.09] bg-[#141416] text-[#F5F1E8] hover:border-white/25 hover:bg-[#1C1C1F]'
              }`}
            >
              <History
                className={`h-3.5 w-3.5 shrink-0 ${isHistoryOpen ? 'text-[#D4A853]' : ''}`}
                aria-hidden="true"
              />
              <span>History</span>
              <span className="font-mono text-[11px] tabular-nums text-[#D4A853]">
                {takesCount}
              </span>
            </button>
          )}

          {activeTake && (
            <>
              <button
                type="button"
                onClick={onInspect}
                title="Inspect Fullscreen (I)"
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-white/[0.09] bg-[#141416] px-3 py-1.5 text-xs font-medium text-[#F5F1E8] whitespace-nowrap shrink-0 transition-colors duration-150 hover:border-white/25 hover:bg-[#1C1C1F] cursor-pointer"
              >
                <Expand className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Inspect</span>
              </button>
              <button
                type="button"
                onClick={() => onDownload(activeTake)}
                title="Download PNG (D)"
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
            onDoubleClick={handleDoubleClickSlider}
            onKeyDown={handleSliderKeyDown}
            tabIndex={canCompare ? 0 : undefined}
            role={canCompare ? 'slider' : undefined}
            aria-label={
              canCompare
                ? 'Draggable before and after portrait comparison overlay slider'
                : undefined
            }
            aria-valuemin={canCompare ? 0 : undefined}
            aria-valuemax={canCompare ? 100 : undefined}
            aria-valuenow={canCompare ? roundedBeforePct : undefined}
            aria-valuetext={
              canCompare
                ? `${roundedBeforePct}% original selfie, ${roundedAfterPct}% generated studio portrait`
                : undefined
            }
            className={`group/swipe relative w-full ${aspectClass} select-none overflow-hidden rounded-lg bg-[#0B0B0C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] ${
              canCompare
                ? isDraggingSlider
                  ? 'cursor-grabbing touch-none'
                  : 'cursor-ew-resize touch-none'
                : ''
            }`}
          >
            {/* Base layer: Generated studio portrait */}
            <img
              src={activeTake.imageUrl}
              alt={`${activeTake.styleName} studio headshot frame ${activeTake.frameNumber}`}
              referrerPolicy="no-referrer"
              draggable={false}
              className="h-full w-full object-cover"
            />

            {/* Dynamic Draggable Overlay Layer: Pixel-Aligned Original Selfie (+ optional Light Map) */}
            {canCompare && (
              <>
                <div
                  className="pointer-events-none absolute inset-0 overflow-hidden"
                  style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
                >
                  <img
                    src={activeTake.alignedSourceUrl || activeTake.sourceImageUrl}
                    alt="Original uploaded selfie"
                    referrerPolicy="no-referrer"
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                  {showHeatmap && heatmapAnalysis && (
                    <img
                      src={heatmapAnalysis.overlayDataUrl}
                      alt="False-color lighting intensity heat-map on original selfie"
                      draggable={false}
                      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                </div>

                {/* Dynamic Brass Curtain Line & Tactile Draggable Handle */}
                <div
                  className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-[#D4A853] shadow-[0_0_14px_rgba(0,0,0,0.85)]"
                  style={{ left: `${sliderPosition}%` }}
                >
                  <div
                    className={`absolute top-1/2 left-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[#D4A853] bg-[#0B0B0C]/95 text-[#F5F1E8] shadow-[0_6px_22px_rgba(0,0,0,0.75)] transition-transform duration-150 motion-reduce:transition-none ${
                      isDraggingSlider
                        ? 'scale-110 ring-4 ring-[#D4A853]/25'
                        : 'group-hover/swipe:scale-105'
                    }`}
                  >
                    <MoveHorizontal className="h-4 w-4 text-[#D4A853]" aria-hidden="true" />
                  </div>
                </div>

                {/* Top Corner Labels with adaptive opacity near frame edges */}
                <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/35 to-transparent px-4 pt-3 pb-7 text-xs font-medium text-[#F5F1E8]">
                  <span
                    className={`transition-opacity duration-150 ${
                      sliderPosition <= 10 ? 'opacity-0' : 'opacity-100'
                    }`}
                  >
                    {showHeatmap ? 'Before · Light Map' : 'Before · Original'}
                  </span>
                  <span
                    className={`transition-opacity duration-150 ${
                      sliderPosition >= 90 ? 'opacity-0' : 'opacity-100'
                    }`}
                  >
                    After · Studio
                  </span>
                </div>

                {/* Lighting Direction Compass Overlay */}
                {showCompass && compassAlignment && (
                  <LightingCompassOverlay alignment={compassAlignment} />
                )}

                {/* Bottom Scrim: Heat-map ramp when Light Map active, otherwise live swipe readout */}
                {showHeatmap && heatmapAnalysis && sliderPosition >= 15 ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/92 via-black/75 to-transparent px-4 pt-10 pb-3.5">
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-[#F5F1E8]/90">
                      <span>Shadow</span>
                      <span className="font-mono tabular-nums text-[#9B968C]">
                        S {heatmapAnalysis.shadowPercent}% · M {heatmapAnalysis.midtonePercent}% · H{' '}
                        {heatmapAnalysis.highlightPercent}%
                      </span>
                      <span className="font-mono tabular-nums text-[#D4A853]">
                        {roundedBeforePct}% / {roundedAfterPct}%
                      </span>
                    </div>
                    <div
                      aria-hidden="true"
                      className="h-1.5 w-full rounded-full bg-[linear-gradient(to_right,#182260_0%,#284EA8_20%,#2E90A6_40%,#4EA67C_58%,#D4A853_76%,#E87236_90%,#E03A3A_100%)]"
                    />
                    <p className="mt-2 text-[11px] leading-relaxed text-[#F5F1E8]/90">
                      {critique ? (
                        <>
                          <span className="font-semibold text-[#D4A853]">
                            Suggested · {getStyleById(critique.recommendedStyleId).shortName}:
                          </span>{' '}
                          {critique.lightingAssessment}
                        </>
                      ) : (
                        heatmapAnalysis.exposureSummary
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/82 via-black/35 to-transparent px-4 pt-8 pb-3 text-xs text-[#F5F1E8]/90">
                    <span>
                      {roundedBeforePct === 0
                        ? 'Full Studio Portrait · Drag right to reveal original'
                        : roundedBeforePct === 100
                          ? 'Full Original Selfie · Drag left to reveal studio'
                          : 'Swipe divider to compare · Double-click to snap'}
                    </span>
                    <span className="font-mono tabular-nums text-[#D4A853] whitespace-nowrap shrink-0">
                      {roundedBeforePct}% / {roundedAfterPct}%
                    </span>
                  </div>
                )}
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
              {showCompass && compassAlignment && (
                <LightingCompassOverlay alignment={compassAlignment} />
              )}
              {showHeatmap && heatmapAnalysis ? (
                <>
                  <img
                    src={heatmapAnalysis.overlayDataUrl}
                    alt="False-color lighting intensity and shadow distribution heat-map overlay"
                    draggable={false}
                    className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/85 via-black/45 to-transparent px-4 pt-3 pb-7 text-xs font-medium text-[#F5F1E8]">
                    <span>Source · Light Intensity Map</span>
                    <span className="font-mono text-[11px] tabular-nums text-[#D4A853]">
                      {heatmapAnalysis.contrastLabel} · Key{' '}
                      {heatmapAnalysis.keyBias === 'balanced'
                        ? 'Even'
                        : heatmapAnalysis.keyBias === 'left'
                          ? 'Left'
                          : 'Right'}
                    </span>
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/92 via-black/75 to-transparent px-4 pt-10 pb-3.5">
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-[#F5F1E8]/90">
                      <span>Shadow</span>
                      <span className="font-mono tabular-nums text-[#9B968C]">
                        S {heatmapAnalysis.shadowPercent}% · M {heatmapAnalysis.midtonePercent}% · H{' '}
                        {heatmapAnalysis.highlightPercent}%
                      </span>
                      <span>Peak</span>
                    </div>
                    <div
                      aria-hidden="true"
                      className="h-1.5 w-full rounded-full bg-[linear-gradient(to_right,#182260_0%,#284EA8_20%,#2E90A6_40%,#4EA67C_58%,#D4A853_76%,#E87236_90%,#E03A3A_100%)]"
                    />
                    <p className="mt-2 text-[11px] leading-relaxed text-[#F5F1E8]/90">
                      {critique ? (
                        <>
                          <span className="font-semibold text-[#D4A853]">
                            Suggested · {getStyleById(critique.recommendedStyleId).shortName}:
                          </span>{' '}
                          {critique.lightingAssessment}
                        </>
                      ) : (
                        heatmapAnalysis.exposureSummary
                      )}
                    </p>
                  </div>
                </>
              ) : (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-4 pt-10 pb-4">
                  <p className="text-xs text-[#F5F1E8]">
                    Source frame loaded · Ready for {selectedStyle.name}
                  </p>
                </div>
              )}
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

      {/* Input Selfie Lighting Quality Meter & Real-Time Luminance Distribution Histogram */}
      {(lightingQuality || isAnalyzingQuality) && (
        <div
          aria-label={
            lightingQuality
              ? `Input selfie lighting quality: ${lightingQuality.rating}`
              : 'Analyzing input selfie lighting quality'
          }
          className="mt-3 rounded-lg border border-white/[0.08] bg-[#141416] px-4 py-3.5"
        >
          {lightingQuality ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-stretch md:gap-5">
              {/* Left Column: Lighting Quality Rating, Sub-Meters & Actionable Guidance */}
              <div className="flex flex-col justify-between md:col-span-7">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-[#F5F1E8] whitespace-nowrap">
                        Lighting Quality
                      </span>
                      <span aria-hidden="true" className="inline-flex items-center gap-1">
                        {[1, 2, 3].map((level) => {
                          const activeLevel =
                            lightingQuality.rating === 'High'
                              ? 3
                              : lightingQuality.rating === 'Med'
                                ? 2
                                : 1;
                          const isLit = level <= activeLevel;
                          const litColor =
                            lightingQuality.rating === 'High'
                              ? 'bg-[#6CC091]'
                              : lightingQuality.rating === 'Med'
                                ? 'bg-[#D4A853]'
                                : 'bg-[#E07A5F]';
                          return (
                            <span
                              key={level}
                              className={`h-1.5 w-3 rounded-[1px] ${
                                isLit ? litColor : 'bg-white/[0.12]'
                              }`}
                            />
                          );
                        })}
                      </span>
                      <span
                        className={`font-mono text-xs font-semibold tabular-nums whitespace-nowrap ${
                          lightingQuality.rating === 'High'
                            ? 'text-[#6CC091]'
                            : lightingQuality.rating === 'Med'
                              ? 'text-[#D4A853]'
                              : 'text-[#E07A5F]'
                        }`}
                      >
                        {lightingQuality.rating}
                      </span>
                      <span aria-hidden="true" className="text-[#9B968C]">
                        ·
                      </span>
                      <span className="text-[#9B968C] whitespace-nowrap">
                        {lightingQuality.correctionLevel}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#9B968C]">
                      {(() => {
                        const isRecommendedApplied =
                          currentLightingId === lightingQuality.recommendedLightingId &&
                          currentAdvancedLightingPreset ===
                            lightingQuality.recommendedAdvancedPreset;
                        return isRecommendedApplied ? (
                          <span className="text-[#6CC091] whitespace-nowrap">
                            Active · {lightingQuality.recommendedPresetLabel}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              onApplyRecommendedLighting(
                                lightingQuality.recommendedLightingId,
                                lightingQuality.recommendedAdvancedPreset
                              )
                            }
                            disabled={isGenerating}
                            className="font-medium text-[#D4A853] underline decoration-[#D4A853]/55 underline-offset-4 transition-colors hover:text-[#F5F1E8] disabled:opacity-50 whitespace-nowrap cursor-pointer"
                          >
                            Apply {lightingQuality.recommendedPresetLabel}
                          </button>
                        );
                      })()}
                      {beforeSourceUrl && (
                        <>
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            onClick={handleToggleHeatmap}
                            className="font-medium text-[#F5F1E8] underline decoration-white/30 underline-offset-4 transition-colors hover:text-[#D4A853] hover:decoration-[#D4A853]/60 whitespace-nowrap cursor-pointer"
                          >
                            {isHeatmapActive ? 'Hide Light Map' : 'Light Map'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Dynamic Range & Shadow Harshness Photometric Sub-Meters */}
                  <div className="mt-3 grid grid-cols-1 gap-3 border-t border-white/[0.06] pt-2.5 sm:grid-cols-2 sm:gap-4">
                    <div>
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-[#9B968C]">Dynamic Range</span>
                        <span className="font-mono tabular-nums text-[#F5F1E8]">
                          {lightingQuality.dynamicRangeLabel} · {lightingQuality.dynamicRangeScore}%
                          {lightingQuality.clippedPercent >= 2 && (
                            <span className="text-[#9B968C]">
                              {' '}
                              · {lightingQuality.clippedPercent}% clip
                            </span>
                          )}
                        </span>
                      </div>
                      <div
                        aria-hidden="true"
                        className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.08]"
                      >
                        <div
                          className={`h-full w-full origin-left rounded-full transition-transform duration-200 ${
                            lightingQuality.dynamicRangeScore >= 72
                              ? 'bg-[#6CC091]'
                              : lightingQuality.dynamicRangeScore >= 50
                                ? 'bg-[#D4A853]'
                                : 'bg-[#E07A5F]'
                          }`}
                          style={{ transform: `scaleX(${lightingQuality.dynamicRangeScore / 100})` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-[#9B968C]">Shadow Harshness</span>
                        <span className="font-mono tabular-nums text-[#F5F1E8]">
                          {lightingQuality.shadowHarshnessLabel} ·{' '}
                          {lightingQuality.shadowHarshnessScore}%
                        </span>
                      </div>
                      <div
                        aria-hidden="true"
                        className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.08]"
                      >
                        <div
                          className={`h-full w-full origin-left rounded-full transition-transform duration-200 ${
                            lightingQuality.shadowHarshnessLabel === 'Soft'
                              ? 'bg-[#6CC091]'
                              : lightingQuality.shadowHarshnessLabel === 'Moderate'
                                ? 'bg-[#D4A853]'
                                : 'bg-[#E07A5F]'
                          }`}
                          style={{
                            transform: `scaleX(${lightingQuality.shadowHarshnessScore / 100})`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <p className="mt-2.5 text-xs leading-relaxed text-[#9B968C]">
                  {lightingQuality.correctionGuidance}
                </p>
              </div>

              {/* Right Column: Real-Time Lighting Distribution Histogram */}
              <div className="border-t border-white/[0.07] pt-3.5 md:col-span-5 md:border-t-0 md:border-l md:pt-0 md:pl-5">
                <LightingHistogram report={lightingQuality} />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 text-xs text-[#9B968C]">
              <span className="font-semibold text-[#F5F1E8]">Lighting Quality &amp; Histogram</span>
              <span>Measuring pixel intensity spread &amp; shadow harshness...</span>
            </div>
          )}
        </div>
      )}

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
