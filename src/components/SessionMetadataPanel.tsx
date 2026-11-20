import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Check, ChevronDown, ChevronUp, Clock, Layers, Palette } from 'lucide-react';
import {
  STUDIO_STYLES,
  formatApertureFromBlur,
  getStyleById,
  type GeneratedTake,
  type StyleId,
} from '../data/studioCatalog';

interface SessionMetadataPanelProps {
  takes: GeneratedTake[];
  activeTakeId: string | null;
  currentStyleId: StyleId;
  sessionStartedAt: number;
  totalGeneratedCount: number;
  onSelectTake: (id: string) => void;
}

interface StyleUsageStat {
  styleId: StyleId;
  styleName: string;
  lensSpec: string;
  count: number;
  percentage: number;
  latestTakeId: string;
  latestCreatedAt: number;
  isActiveStyle: boolean;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

function formatClock(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export const SessionMetadataPanel: React.FC<SessionMetadataPanelProps> = ({
  takes,
  activeTakeId,
  currentStyleId,
  sessionStartedAt,
  totalGeneratedCount,
  onSelectTake,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Tick live session duration once per second while mounted
  useEffect(() => {
    setNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const elapsedMs = Math.max(0, nowMs - sessionStartedAt);
  const elapsedLabel = formatDuration(elapsedMs);
  const startedClockLabel = useMemo(() => formatClock(sessionStartedAt), [sessionStartedAt]);

  const activeTake = useMemo(
    () => takes.find((take) => take.id === activeTakeId) ?? null,
    [takes, activeTakeId]
  );

  const resolvedActiveStyleId: StyleId = activeTake ? activeTake.styleId : currentStyleId;
  const resolvedActiveStyle = useMemo(
    () => getStyleById(resolvedActiveStyleId),
    [resolvedActiveStyleId]
  );

  const totalTakesGenerated = Math.max(totalGeneratedCount, takes.length);
  const retouchedCount = useMemo(
    () => takes.filter((take) => Boolean(take.retouchPrompt)).length,
    [takes]
  );
  const baseTakesCount = Math.max(0, takes.length - retouchedCount);
  const removedCount = Math.max(0, totalTakesGenerated - takes.length);

  const styleStats = useMemo<StyleUsageStat[]>(() => {
    if (takes.length === 0) return [];

    const grouped = new Map<
      StyleId,
      {
        styleName: string;
        count: number;
        latestTakeId: string;
        latestCreatedAt: number;
      }
    >();

    for (const take of takes) {
      const existing = grouped.get(take.styleId);
      if (!existing) {
        grouped.set(take.styleId, {
          styleName: take.styleName,
          count: 1,
          latestTakeId: take.id,
          latestCreatedAt: take.createdAt,
        });
      } else {
        existing.count += 1;
        if (take.createdAt >= existing.latestCreatedAt) {
          existing.latestTakeId = take.id;
          existing.latestCreatedAt = take.createdAt;
        }
      }
    }

    return Array.from(grouped.entries())
      .map(([styleId, entry]) => {
        const catalogStyle = getStyleById(styleId);
        return {
          styleId,
          styleName: entry.styleName || catalogStyle.name,
          lensSpec: catalogStyle.lensSpec,
          count: entry.count,
          percentage: Math.round((entry.count / takes.length) * 100),
          latestTakeId: entry.latestTakeId,
          latestCreatedAt: entry.latestCreatedAt,
          isActiveStyle: styleId === resolvedActiveStyleId,
        };
      })
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return b.latestCreatedAt - a.latestCreatedAt;
      });
  }, [takes, resolvedActiveStyleId]);

  const activeStyleStat = useMemo(
    () => styleStats.find((stat) => stat.styleId === resolvedActiveStyleId) ?? null,
    [styleStats, resolvedActiveStyleId]
  );

  const sessionSummary = useMemo(() => {
    if (takes.length === 0) return null;

    const lightingCounts = new Map<string, number>();
    let blurSum = 0;
    let firstTs = Number.POSITIVE_INFINITY;
    let lastTs = 0;

    for (const take of takes) {
      lightingCounts.set(take.lightingLabel, (lightingCounts.get(take.lightingLabel) ?? 0) + 1);
      blurSum += take.recipe.backdropBlur;
      if (take.createdAt < firstTs) firstTs = take.createdAt;
      if (take.createdAt > lastTs) lastTs = take.createdAt;
    }

    let topLighting = takes[0].lightingLabel;
    let topLightingCount = 0;
    for (const [label, count] of lightingCounts.entries()) {
      if (count > topLightingCount) {
        topLighting = label;
        topLightingCount = count;
      }
    }

    const avgAperture = formatApertureFromBlur(blurSum / takes.length);
    const captureSpanMs = Math.max(0, lastTs - firstTs);

    return {
      topLighting,
      avgAperture,
      captureSpanLabel: takes.length >= 2 ? formatDuration(captureSpanMs) : formatClock(lastTs),
      hasMultipleTakes: takes.length >= 2,
    };
  }, [takes]);

  return (
    <section
      aria-label="Session metadata and style usage statistics"
      className="rounded-lg border border-white/[0.08] bg-[#0B0B0C]/85"
    >
      {/* Collapsible Header */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] rounded cursor-pointer"
        >
          <BarChart3 className="h-3.5 w-3.5 shrink-0 text-[#D4A853]" aria-hidden="true" />
          <span className="text-xs font-semibold text-[#F5F1E8] whitespace-nowrap">
            Session Metadata
          </span>
          <span className="truncate font-mono text-[11px] tabular-nums text-[#9B968C]">
            {elapsedLabel}
            <span aria-hidden="true"> · </span>
            {totalTakesGenerated} {totalTakesGenerated === 1 ? 'take' : 'takes'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-label={isExpanded ? 'Collapse session metadata' : 'Expand session metadata'}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#9B968C] transition-colors hover:bg-white/[0.06] hover:text-[#F5F1E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
        >
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-3 border-t border-white/[0.07] px-3.5 py-3">
          {/* Core Aggregated Metrics Strip */}
          <dl className="grid grid-cols-3 divide-x divide-white/[0.07] rounded-md border border-white/[0.06] bg-[#141416]/75">
            <div className="px-2.5 py-2">
              <dt className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[#9B968C]">
                <Clock className="h-3 w-3 shrink-0 text-[#D4A853]" aria-hidden="true" />
                <span className="truncate">Session</span>
              </dt>
              <dd className="mt-1 font-mono text-sm font-semibold tabular-nums text-[#F5F1E8]">
                {elapsedLabel}
              </dd>
              <p className="mt-0.5 truncate font-mono text-[10px] tabular-nums text-[#9B968C]">
                {startedClockLabel ? `Since ${startedClockLabel}` : 'Active'}
              </p>
            </div>

            <div className="px-2.5 py-2">
              <dt className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[#9B968C]">
                <Layers className="h-3 w-3 shrink-0 text-[#D4A853]" aria-hidden="true" />
                <span className="truncate">Takes</span>
              </dt>
              <dd className="mt-1 font-mono text-sm font-semibold tabular-nums text-[#F5F1E8]">
                {totalTakesGenerated}
              </dd>
              <p className="mt-0.5 truncate font-mono text-[10px] tabular-nums text-[#9B968C]">
                {takes.length === 0
                  ? 'No frames yet'
                  : removedCount > 0
                    ? `${takes.length} kept · ${retouchedCount} edit`
                    : `${baseTakesCount} base · ${retouchedCount} edit`}
              </p>
            </div>

            <div className="px-2.5 py-2">
              <dt className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[#9B968C]">
                <Palette className="h-3 w-3 shrink-0 text-[#D4A853]" aria-hidden="true" />
                <span className="truncate">Active Style</span>
              </dt>
              <dd
                title={resolvedActiveStyle.name}
                className="mt-1 truncate text-xs font-semibold leading-5 text-[#F5F1E8]"
              >
                {resolvedActiveStyle.name}
              </dd>
              <p className="mt-0.5 truncate font-mono text-[10px] tabular-nums text-[#D4A853]">
                {activeStyleStat
                  ? `${activeStyleStat.count} ${
                      activeStyleStat.count === 1 ? 'take' : 'takes'
                    } · ${activeStyleStat.percentage}%`
                  : 'Armed'}
              </p>
            </div>
          </dl>

          {/* Active Style Usage Statistics Breakdown */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#9B968C]">
                Style Usage Statistics
              </span>
              <span className="font-mono text-[10px] tabular-nums text-[#9B968C] whitespace-nowrap">
                {styleStats.length}/{STUDIO_STYLES.length} styles used
              </span>
            </div>

            {styleStats.length === 0 ? (
              <div className="rounded-md border border-dashed border-white/[0.08] bg-[#141416]/50 px-3 py-2.5 text-[11px] leading-relaxed text-[#9B968C]">
                <span className="font-medium text-[#F5F1E8]">{resolvedActiveStyle.name}</span> is
                selected in Direction. Generate your first portrait to track style distribution.
              </div>
            ) : (
              <ul className="space-y-1.5" aria-label="Session style usage breakdown">
                {styleStats.map((stat) => (
                  <li key={stat.styleId}>
                    <button
                      type="button"
                      onClick={() => onSelectTake(stat.latestTakeId)}
                      title={`Jump to latest ${stat.styleName} take`}
                      className={`group w-full rounded-md border px-2.5 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer ${
                        stat.isActiveStyle
                          ? 'border-[#D4A853]/45 bg-[#141416]'
                          : 'border-white/[0.06] bg-[#141416]/55 hover:border-white/20 hover:bg-[#18181B]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={`truncate font-medium ${
                              stat.isActiveStyle ? 'text-[#F5F1E8]' : 'text-[#F5F1E8]/85'
                            }`}
                          >
                            {stat.styleName}
                          </span>
                          {stat.isActiveStyle && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#D4A853] whitespace-nowrap shrink-0">
                              <Check className="h-2.5 w-2.5 stroke-[2.5]" aria-hidden="true" />
                              <span>Active</span>
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[11px] tabular-nums text-[#9B968C] whitespace-nowrap shrink-0">
                          <span className="text-[#F5F1E8]">{stat.count}</span>
                          <span aria-hidden="true"> · </span>
                          <span className={stat.isActiveStyle ? 'text-[#D4A853]' : ''}>
                            {stat.percentage}%
                          </span>
                        </span>
                      </div>

                      {/* Proportion Bar (SVG avoids inline style attributes) */}
                      <svg
                        viewBox="0 0 100 4"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                        className="mt-1.5 h-1 w-full overflow-hidden rounded-full"
                      >
                        <rect x="0" y="0" width="100" height="4" rx="2" fill="#232328" />
                        <rect
                          x="0"
                          y="0"
                          width={Math.max(4, stat.percentage)}
                          height="4"
                          rx="2"
                          fill={stat.isActiveStyle ? '#D4A853' : '#9B968C'}
                          fillOpacity={stat.isActiveStyle ? 0.95 : 0.65}
                        />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Quiet Session Rig Summary */}
          {sessionSummary && (
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-white/[0.06] pt-2.5 text-[11px] text-[#9B968C]">
              <span className="truncate">
                Top light:{' '}
                <span className="font-medium text-[#F5F1E8]">{sessionSummary.topLighting}</span>
              </span>
              <span className="font-mono tabular-nums whitespace-nowrap">
                Avg <span className="text-[#F5F1E8]">{sessionSummary.avgAperture}</span>
                <span aria-hidden="true"> · </span>
                {sessionSummary.hasMultipleTakes
                  ? `${sessionSummary.captureSpanLabel} span`
                  : `Last ${sessionSummary.captureSpanLabel}`}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
