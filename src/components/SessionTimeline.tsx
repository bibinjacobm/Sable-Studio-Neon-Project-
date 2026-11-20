import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ChevronDown, ChevronUp, Pause, Play } from 'lucide-react';
import {
  formatApertureFromBlur,
  getAdvancedLightingPresetById,
  getStyleById,
  getSubjectProfileById,
  type GeneratedTake,
} from '../data/studioCatalog';

type TimelineMetricId = 'exposure' | 'contrast' | 'bokeh' | 'warmth';

interface SessionTimelineProps {
  takes: GeneratedTake[];
  activeTakeId: string | null;
  onSelectTake: (id: string) => void;
}

interface MetricConfig {
  id: TimelineMetricId;
  label: string;
  min: number;
  max: number;
  baseline: number;
  getValue: (take: GeneratedTake) => number;
  formatValue: (value: number) => string;
  axisTopLabel: string;
  axisBottomLabel: string;
}

const METRIC_CONFIGS: Record<TimelineMetricId, MetricConfig> = {
  exposure: {
    id: 'exposure',
    label: 'Exposure',
    min: -0.35,
    max: 0.35,
    baseline: 0,
    getValue: (take) => take.recipe.exposure,
    formatValue: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} EV`,
    axisTopLabel: '+0.35',
    axisBottomLabel: '-0.35',
  },
  contrast: {
    id: 'contrast',
    label: 'Contrast',
    min: -0.3,
    max: 0.4,
    baseline: 0,
    getValue: (take) => take.recipe.contrast,
    formatValue: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`,
    axisTopLabel: '+40%',
    axisBottomLabel: '-30%',
  },
  bokeh: {
    id: 'bokeh',
    label: 'Bokeh',
    min: 0,
    max: 20,
    baseline: 6,
    getValue: (take) => Math.round(take.recipe.backdropBlur),
    formatValue: (v) => `${formatApertureFromBlur(v)} (${Math.round(v)}px)`,
    axisTopLabel: 'f/1.4',
    axisBottomLabel: 'f/11',
  },
  warmth: {
    id: 'warmth',
    label: 'Warmth',
    min: -0.35,
    max: 0.35,
    baseline: 0,
    getValue: (take) => (take.recipe.monochrome ? 0 : take.recipe.warmth),
    formatValue: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}K`,
    axisTopLabel: 'Warm',
    axisBottomLabel: 'Cool',
  },
};

const METRIC_LIST: MetricConfig[] = [
  METRIC_CONFIGS.exposure,
  METRIC_CONFIGS.contrast,
  METRIC_CONFIGS.bokeh,
  METRIC_CONFIGS.warmth,
];

interface ParameterChange {
  field: string;
  from: string;
  to: string;
}

function formatClockTime(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

function formatShortTime(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function formatElapsedSpan(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  if (totalSec < 60) return `${totalSec}s span`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return secs > 0 ? `${mins}m ${secs}s span` : `${mins}m span`;
}

function computeParameterDelta(
  prev: GeneratedTake | null,
  curr: GeneratedTake
): ParameterChange[] {
  if (!prev) return [];
  const changes: ParameterChange[] = [];

  if (prev.styleId !== curr.styleId) {
    changes.push({
      field: 'Backdrop',
      from: getStyleById(prev.styleId).shortName,
      to: getStyleById(curr.styleId).shortName,
    });
  }
  if (prev.lightingLabel !== curr.lightingLabel) {
    changes.push({
      field: 'Lighting',
      from: prev.lightingLabel,
      to: curr.lightingLabel,
    });
  }
  if (prev.attireLabel !== curr.attireLabel) {
    changes.push({
      field: 'Wardrobe',
      from: prev.attireLabel,
      to: curr.attireLabel,
    });
  }
  if (prev.framingLabel !== curr.framingLabel) {
    changes.push({
      field: 'Framing',
      from: prev.framingLabel,
      to: curr.framingLabel,
    });
  }
  const prevProfile = getSubjectProfileById(prev.recipe.subjectProfile);
  const currProfile = getSubjectProfileById(curr.recipe.subjectProfile);
  if (prevProfile.id !== currProfile.id) {
    changes.push({
      field: 'Subject',
      from: prevProfile.label,
      to: currProfile.label,
    });
  }
  if (prev.recipe.monochrome !== curr.recipe.monochrome) {
    changes.push({
      field: 'Color',
      from: prev.recipe.monochrome ? 'Monochrome' : 'Color',
      to: curr.recipe.monochrome ? 'Monochrome' : 'Color',
    });
  }
  if (Math.round(prev.recipe.backdropBlur) !== Math.round(curr.recipe.backdropBlur)) {
    changes.push({
      field: 'Bokeh',
      from: formatApertureFromBlur(prev.recipe.backdropBlur),
      to: formatApertureFromBlur(curr.recipe.backdropBlur),
    });
  }
  if (Math.abs(prev.recipe.exposure - curr.recipe.exposure) >= 0.025) {
    changes.push({
      field: 'Exposure',
      from: `${prev.recipe.exposure > 0 ? '+' : ''}${prev.recipe.exposure.toFixed(2)}`,
      to: `${curr.recipe.exposure > 0 ? '+' : ''}${curr.recipe.exposure.toFixed(2)}`,
    });
  }
  if (Math.abs(prev.recipe.contrast - curr.recipe.contrast) >= 0.03) {
    changes.push({
      field: 'Contrast',
      from: `${prev.recipe.contrast > 0 ? '+' : ''}${Math.round(prev.recipe.contrast * 100)}%`,
      to: `${curr.recipe.contrast > 0 ? '+' : ''}${Math.round(curr.recipe.contrast * 100)}%`,
    });
  }
  if (
    !curr.recipe.monochrome &&
    Math.abs(prev.recipe.warmth - curr.recipe.warmth) >= 0.03
  ) {
    changes.push({
      field: 'Warmth',
      from: `${prev.recipe.warmth > 0 ? '+' : ''}${Math.round(prev.recipe.warmth * 100)}`,
      to: `${curr.recipe.warmth > 0 ? '+' : ''}${Math.round(curr.recipe.warmth * 100)}`,
    });
  }
  const prevSharp = Math.round((prev.recipe.sharpen ?? 0) * 100);
  const currSharp = Math.round((curr.recipe.sharpen ?? 0) * 100);
  if (Math.abs(prevSharp - currSharp) >= 5) {
    changes.push({
      field: 'Sharpen',
      from: `${prevSharp}%`,
      to: `${currSharp}%`,
    });
  }

  return changes;
}

const SVG_W = 360;
const SVG_H = 104;
const PAD_LEFT = 36;
const PAD_RIGHT = 14;
const PAD_TOP = 14;
const PAD_BOTTOM = 22;
const PLOT_W = SVG_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = SVG_H - PAD_TOP - PAD_BOTTOM;

export const SessionTimeline: React.FC<SessionTimelineProps> = ({
  takes,
  activeTakeId,
  onSelectTake,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeMetric, setActiveMetric] = useState<TimelineMetricId>('exposure');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Chronological oldest -> newest sequence for creative timeline progression
  const orderedTakes = useMemo(
    () =>
      [...takes].sort((a, b) =>
        a.frameNumber !== b.frameNumber
          ? a.frameNumber - b.frameNumber
          : a.createdAt - b.createdAt
      ),
    [takes]
  );

  const activeIndex = useMemo(() => {
    if (orderedTakes.length === 0) return -1;
    const found = orderedTakes.findIndex((t) => t.id === activeTakeId);
    return found >= 0 ? found : orderedTakes.length - 1;
  }, [orderedTakes, activeTakeId]);

  const activeTake = activeIndex >= 0 ? orderedTakes[activeIndex] : null;
  const previousTake = activeIndex > 0 ? orderedTakes[activeIndex - 1] : null;

  const metric = METRIC_CONFIGS[activeMetric];

  // Stop playback when session shrinks or user scrubs manually
  useEffect(() => {
    if (orderedTakes.length < 2 && isPlaying) {
      setIsPlaying(false);
    }
  }, [orderedTakes.length, isPlaying]);

  useEffect(() => {
    if (!isPlaying || orderedTakes.length < 2) return;
    const timer = window.setInterval(() => {
      const nextIdx = (activeIndex + 1) % orderedTakes.length;
      onSelectTake(orderedTakes[nextIdx].id);
    }, 1250);
    return () => window.clearInterval(timer);
  }, [isPlaying, activeIndex, orderedTakes, onSelectTake]);

  // Compute proportional time-blended coordinates for every take node
  const plottedPoints = useMemo(() => {
    if (orderedTakes.length === 0) return [];
    const minTime = orderedTakes[0].createdAt;
    const maxTime = orderedTakes[orderedTakes.length - 1].createdAt;
    const timeSpan = Math.max(0, maxTime - minTime);
    const useTimeBlend = orderedTakes.length > 1 && timeSpan >= 2000;

    return orderedTakes.map((take, idx) => {
      const ordinalFrac =
        orderedTakes.length === 1 ? 0.5 : idx / (orderedTakes.length - 1);
      const timeFrac = useTimeBlend ? (take.createdAt - minTime) / timeSpan : ordinalFrac;
      // Blend proportional elapsed time with ordinal spacing so rapid bulk takes never overlap
      const xFrac = useTimeBlend ? timeFrac * 0.62 + ordinalFrac * 0.38 : ordinalFrac;
      const x = PAD_LEFT + xFrac * PLOT_W;

      const rawVal = metric.getValue(take);
      const normY = Math.max(
        0,
        Math.min(1, (rawVal - metric.min) / Math.max(0.0001, metric.max - metric.min))
      );
      const y = PAD_TOP + (1 - normY) * PLOT_H;

      return {
        take,
        index: idx,
        x,
        y,
        value: rawVal,
        isRetouch: Boolean(take.retouchPrompt),
      };
    });
  }, [orderedTakes, metric]);

  const baselineY = useMemo(() => {
    const norm = Math.max(
      0,
      Math.min(1, (metric.baseline - metric.min) / Math.max(0.0001, metric.max - metric.min))
    );
    return PAD_TOP + (1 - norm) * PLOT_H;
  }, [metric]);

  const polylinePath = useMemo(() => {
    if (plottedPoints.length < 2) return '';
    return plottedPoints
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
      .join(' ');
  }, [plottedPoints]);

  const areaPath = useMemo(() => {
    if (plottedPoints.length < 2) return '';
    const first = plottedPoints[0];
    const last = plottedPoints[plottedPoints.length - 1];
    const bottomY = PAD_TOP + PLOT_H;
    return `${polylinePath} L ${last.x.toFixed(1)} ${bottomY.toFixed(1)} L ${first.x.toFixed(1)} ${bottomY.toFixed(1)} Z`;
  }, [plottedPoints, polylinePath]);

  const activePoint = activeIndex >= 0 ? plottedPoints[activeIndex] : null;
  const parameterChanges = useMemo(
    () => (activeTake ? computeParameterDelta(previousTake, activeTake) : []),
    [previousTake, activeTake]
  );

  const sessionSpanLabel = useMemo(() => {
    if (orderedTakes.length < 2) return 'Single frame';
    const spanMs =
      orderedTakes[orderedTakes.length - 1].createdAt - orderedTakes[0].createdAt;
    return formatElapsedSpan(spanMs);
  }, [orderedTakes]);

  const selectNearestToClientX = (clientX: number) => {
    const svgEl = svgRef.current;
    if (!svgEl || plottedPoints.length === 0) return;
    const rect = svgEl.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((clientX - rect.left) / rect.width) * SVG_W;

    let nearest = plottedPoints[0];
    let bestDist = Math.abs(nearest.x - svgX);
    for (let i = 1; i < plottedPoints.length; i++) {
      const dist = Math.abs(plottedPoints[i].x - svgX);
      if (dist < bestDist) {
        bestDist = dist;
        nearest = plottedPoints[i];
      }
    }
    if (nearest.take.id !== activeTakeId) {
      onSelectTake(nearest.take.id);
    }
  };

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (orderedTakes.length === 0) return;
    setIsPlaying(false);
    setIsScrubbing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    selectNearestToClientX(e.clientX);
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isScrubbing) return;
    selectNearestToClientX(e.clientX);
  };

  const handleSvgPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isScrubbing) return;
    setIsScrubbing(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  if (orderedTakes.length === 0 || !activeTake) {
    return null;
  }

  const activeFrameStr = String(activeTake.frameNumber).padStart(2, '0');
  const activeAdvanced = getAdvancedLightingPresetById(activeTake.recipe.advancedLightingPreset);
  const activeProfile = getSubjectProfileById(activeTake.recipe.subjectProfile);

  return (
    <section
      aria-label="Session Timeline"
      className="rounded-lg border border-white/[0.08] bg-[#0B0B0C]/90"
    >
      {/* Header Strip */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Activity className="h-3.5 w-3.5 shrink-0 text-[#D4A853]" aria-hidden="true" />
          <h3 className="text-xs font-semibold text-[#F5F1E8] whitespace-nowrap">
            Session Timeline
          </h3>
          <span aria-hidden="true" className="text-xs text-[#9B968C]">
            ·
          </span>
          <span className="truncate font-mono text-[11px] tabular-nums text-[#9B968C]">
            {sessionSpanLabel}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isExpanded && orderedTakes.length > 1 && (
            <button
              type="button"
              onClick={() => setIsPlaying((prev) => !prev)}
              aria-pressed={isPlaying}
              aria-label={isPlaying ? 'Pause timeline playback' : 'Play session timeline'}
              className={`inline-flex min-h-[28px] items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer ${
                isPlaying
                  ? 'border-[#D4A853] bg-[#D4A853]/15 text-[#D4A853]'
                  : 'border-white/[0.1] bg-[#141416] text-[#9B968C] hover:border-white/25 hover:text-[#F5F1E8]'
              }`}
            >
              {isPlaying ? (
                <Pause className="h-3 w-3 shrink-0" aria-hidden="true" />
              ) : (
                <Play className="h-3 w-3 shrink-0" aria-hidden="true" />
              )}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setIsPlaying(false);
              setIsExpanded((prev) => !prev);
            }}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Collapse session timeline' : 'Expand session timeline'}
            className="inline-flex min-h-[28px] items-center gap-1 rounded border border-white/[0.08] bg-[#141416] px-2 py-0.5 text-[11px] font-medium text-[#9B968C] whitespace-nowrap shrink-0 transition-colors duration-150 hover:border-white/20 hover:text-[#F5F1E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
          >
            <span>{isExpanded ? 'Hide' : 'Show'}</span>
            {isExpanded ? (
              <ChevronUp className="h-3 w-3 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-white/[0.06] px-3 pt-2.5 pb-3">
          {/* Metric Curve Selector & Live Active Value */}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div
              role="group"
              aria-label="Select parameter curve to plot"
              className="inline-flex items-center rounded border border-white/[0.08] bg-[#141416] p-0.5"
            >
              {METRIC_LIST.map((item) => {
                const selected = activeMetric === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveMetric(item.id)}
                    aria-pressed={selected}
                    className={`rounded-[3px] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer ${
                      selected
                        ? 'bg-[#26262B] text-[#F5F1E8]'
                        : 'text-[#9B968C] hover:text-[#F5F1E8]'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            {activePoint && (
              <span className="font-mono text-[11px] font-medium tabular-nums text-[#D4A853] whitespace-nowrap">
                {metric.formatValue(activePoint.value)}
              </span>
            )}
          </div>

          {/* Interactive SVG Timeline Plot */}
          <div className="relative overflow-hidden rounded border border-white/[0.07] bg-[#111113]">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              role="img"
              aria-label={`Session timeline plotting ${metric.label} across ${orderedTakes.length} takes. Drag or click to scrub.`}
              onPointerDown={handleSvgPointerDown}
              onPointerMove={handleSvgPointerMove}
              onPointerUp={handleSvgPointerUp}
              onPointerCancel={handleSvgPointerUp}
              className={`block h-[108px] w-full touch-none select-none ${
                orderedTakes.length > 1
                  ? isScrubbing
                    ? 'cursor-grabbing'
                    : 'cursor-ew-resize'
                  : 'cursor-default'
              }`}
            >
              <defs>
                <linearGradient id="sableTimelineAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D4A853" stopOpacity="0.24" />
                  <stop offset="100%" stopColor="#D4A853" stopOpacity="0.01" />
                </linearGradient>
              </defs>

              {/* Horizontal Plot Frame Hairlines */}
              <line
                x1={PAD_LEFT}
                y1={PAD_TOP}
                x2={SVG_W - PAD_RIGHT}
                y2={PAD_TOP}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="0.75"
              />
              <line
                x1={PAD_LEFT}
                y1={baselineY}
                x2={SVG_W - PAD_RIGHT}
                y2={baselineY}
                stroke="rgba(245,241,232,0.14)"
                strokeWidth="0.75"
                strokeDasharray="2.5 2.5"
              />
              <line
                x1={PAD_LEFT}
                y1={PAD_TOP + PLOT_H}
                x2={SVG_W - PAD_RIGHT}
                y2={PAD_TOP + PLOT_H}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="0.85"
              />

              {/* Y-Axis Scale Labels */}
              <text
                x={PAD_LEFT - 5}
                y={PAD_TOP + 3}
                textAnchor="end"
                fill="#9B968C"
                fontSize="8"
                fontFamily="IBM Plex Mono, monospace"
              >
                {metric.axisTopLabel}
              </text>
              <text
                x={PAD_LEFT - 5}
                y={PAD_TOP + PLOT_H + 2}
                textAnchor="end"
                fill="#9B968C"
                fontSize="8"
                fontFamily="IBM Plex Mono, monospace"
              >
                {metric.axisBottomLabel}
              </text>

              {/* Area Fill & Parameter Evolution Polyline */}
              {areaPath && <path d={areaPath} fill="url(#sableTimelineAreaGrad)" />}
              {polylinePath && (
                <path
                  d={polylinePath}
                  fill="none"
                  stroke="#D4A853"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Active Brass Playhead Hairline */}
              {activePoint && (
                <line
                  x1={activePoint.x}
                  y1={PAD_TOP - 4}
                  x2={activePoint.x}
                  y2={PAD_TOP + PLOT_H + 4}
                  stroke="#D4A853"
                  strokeOpacity="0.65"
                  strokeWidth="1"
                />
              )}

              {/* Plotted Take Nodes (Circle = Exposure, Diamond = Retouch) */}
              {plottedPoints.map((pt) => {
                const isCurrent = pt.index === activeIndex;
                return (
                  <g key={pt.take.id}>
                    {isCurrent && (
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={8}
                        fill="rgba(212,168,83,0.18)"
                        stroke="#D4A853"
                        strokeWidth="1"
                      />
                    )}
                    {pt.isRetouch ? (
                      <rect
                        x={pt.x - (isCurrent ? 3.8 : 3)}
                        y={pt.y - (isCurrent ? 3.8 : 3)}
                        width={isCurrent ? 7.6 : 6}
                        height={isCurrent ? 7.6 : 6}
                        transform={`rotate(45 ${pt.x} ${pt.y})`}
                        fill={isCurrent ? '#D4A853' : '#141416'}
                        stroke={isCurrent ? '#F5F1E8' : '#D4A853'}
                        strokeWidth={isCurrent ? 1.2 : 1.15}
                      />
                    ) : (
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isCurrent ? 4.3 : 3.2}
                        fill={isCurrent ? '#F5F1E8' : '#141416'}
                        stroke="#D4A853"
                        strokeWidth={isCurrent ? 1.5 : 1.2}
                      />
                    )}
                  </g>
                );
              })}

              {/* X-Axis Start / Active / End Time & Take Markers */}
              <text
                x={PAD_LEFT}
                y={SVG_H - 6}
                textAnchor="start"
                fill="#9B968C"
                fontSize="8"
                fontFamily="IBM Plex Mono, monospace"
              >
                T{String(orderedTakes[0].frameNumber).padStart(2, '0')} ·{' '}
                {formatShortTime(orderedTakes[0].createdAt)}
              </text>
              {orderedTakes.length > 1 && (
                <text
                  x={SVG_W - PAD_RIGHT}
                  y={SVG_H - 6}
                  textAnchor="end"
                  fill="#9B968C"
                  fontSize="8"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  T{String(orderedTakes[orderedTakes.length - 1].frameNumber).padStart(2, '0')} ·{' '}
                  {formatShortTime(orderedTakes[orderedTakes.length - 1].createdAt)}
                </text>
              )}
            </svg>
          </div>

          {/* Precision Timeline Scrubber Range + Legend */}
          <div className="mt-2.5 flex items-center gap-2.5">
            <label htmlFor="session-timeline-scrubber" className="sr-only">
              Scrub through session takes chronologically
            </label>
            <span className="font-mono text-[10px] tabular-nums text-[#9B968C] whitespace-nowrap shrink-0">
              {activeIndex + 1}/{orderedTakes.length}
            </span>
            <input
              id="session-timeline-scrubber"
              type="range"
              min={0}
              max={Math.max(0, orderedTakes.length - 1)}
              step={1}
              value={Math.max(0, activeIndex)}
              disabled={orderedTakes.length < 2}
              aria-valuetext={`Take ${activeFrameStr}, ${activeTake.styleName}, ${formatClockTime(activeTake.createdAt)}`}
              onChange={(e) => {
                setIsPlaying(false);
                const idx = Number(e.target.value);
                const target = orderedTakes[idx];
                if (target) {
                  onSelectTake(target.id);
                }
              }}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/[0.12] accent-[#D4A853] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0B0C] disabled:cursor-not-allowed disabled:opacity-40"
            />
            <div
              aria-hidden="true"
              className="flex items-center gap-2 text-[10px] text-[#9B968C] whitespace-nowrap shrink-0"
            >
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full border border-[#D4A853] bg-[#F5F1E8]" />
                <span>Base</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rotate-45 border border-[#D4A853] bg-[#D4A853]" />
                <span>Retouch</span>
              </span>
            </div>
          </div>

          {/* Scrubbed Take Snapshot & Parameter Evolution Diff */}
          <div className="mt-2.5 border-t border-white/[0.06] pt-2.5 text-[11px]">
            <div className="flex flex-wrap items-baseline justify-between gap-1.5">
              <p className="font-medium text-[#F5F1E8]">
                <span className="font-mono tabular-nums text-[#D4A853]">
                  Take {activeFrameStr}
                </span>
                <span aria-hidden="true" className="mx-1.5 text-[#9B968C]">
                  ·
                </span>
                <span>{getStyleById(activeTake.styleId).shortName}</span>
                <span aria-hidden="true" className="mx-1.5 text-[#9B968C]">
                  ·
                </span>
                <span className="text-[#9B968C]">
                  {activeTake.retouchPrompt ? 'Retouch pass' : 'Studio exposure'}
                </span>
              </p>
              <span className="font-mono text-[10px] tabular-nums text-[#9B968C] whitespace-nowrap">
                {formatClockTime(activeTake.createdAt)}
              </span>
            </div>

            <p className="mt-1 truncate text-[#9B968C]">
              <span>{activeTake.lightingLabel}</span>
              {activeAdvanced.id !== 'none' && activeTake.lightingLabel !== activeAdvanced.label && (
                <span> ({activeAdvanced.label})</span>
              )}
              <span aria-hidden="true"> · </span>
              <span>{activeProfile.label}</span>
              <span aria-hidden="true"> · </span>
              <span>{activeTake.framingLabel}</span>
              <span aria-hidden="true"> · </span>
              <span className="font-mono tabular-nums">
                {formatApertureFromBlur(activeTake.recipe.backdropBlur)}
              </span>
            </p>

            {/* Evolution Diff vs. Previous Take */}
            <div className="mt-2 border-t border-white/[0.05] pt-2">
              {orderedTakes.length === 1 ? (
                <p className="text-[11px] text-[#9B968C]">
                  Initial session baseline — develop or retouch another take to trace how styling
                  parameters evolve over time.
                </p>
              ) : !previousTake ? (
                <p className="text-[11px] text-[#9B968C]">
                  Session starting point{' '}
                  <span aria-hidden="true">·</span>{' '}
                  <span className="font-mono tabular-nums text-[#F5F1E8]/80">
                    Exp {activeTake.recipe.exposure > 0 ? '+' : ''}
                    {activeTake.recipe.exposure.toFixed(2)} · Ctr{' '}
                    {activeTake.recipe.contrast > 0 ? '+' : ''}
                    {Math.round(activeTake.recipe.contrast * 100)}%
                  </span>
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold tracking-wide text-[#9B968C]">
                    Changed from Take {String(previousTake.frameNumber).padStart(2, '0')}
                  </p>
                  {parameterChanges.length > 0 ? (
                    <ul className="space-y-0.5 text-[11px] leading-snug text-[#F5F1E8]/90">
                      {parameterChanges.slice(0, 4).map((change) => (
                        <li key={change.field} className="truncate">
                          <span className="text-[#9B968C]">{change.field}:</span>{' '}
                          <span className="text-[#9B968C]">{change.from}</span>{' '}
                          <span aria-hidden="true" className="text-[#D4A853]">
                            →
                          </span>{' '}
                          <span className="font-medium text-[#F5F1E8]">{change.to}</span>
                        </li>
                      ))}
                      {parameterChanges.length > 4 && (
                        <li className="font-mono text-[10px] tabular-nums text-[#9B968C]">
                          +{parameterChanges.length - 4} more recipe adjustment
                          {parameterChanges.length - 4 === 1 ? '' : 's'}
                        </li>
                      )}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-[#9B968C]">
                      Same base parameters re-exposed with refreshed framing calibration.
                    </p>
                  )}
                  {activeTake.retouchPrompt && (
                    <p className="truncate pt-0.5 text-[11px] italic text-[#D4A853]/90">
                      “{activeTake.retouchPrompt}”
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
