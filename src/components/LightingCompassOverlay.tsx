import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { LightingCompassAlignment } from '../utils/lightingHeatmap';

interface LightingCompassOverlayProps {
  alignment: LightingCompassAlignment;
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

function buildShortestArcPath(
  cx: number,
  cy: number,
  radius: number,
  startDeg: number,
  deltaDeg: number
): string {
  if (Math.abs(deltaDeg) < 6) return '';
  const clampedDelta = Math.max(-175, Math.min(175, deltaDeg));
  const endDeg = (startDeg + clampedDelta + 360) % 360;
  const start = polarToCartesian(cx, cy, radius, startDeg);
  const end = polarToCartesian(cx, cy, radius, endDeg);
  const sweepFlag = clampedDelta >= 0 ? 1 : 0;
  const largeArcFlag = Math.abs(clampedDelta) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

export const LightingCompassOverlay: React.FC<LightingCompassOverlayProps> = ({ alignment }) => {
  const [expanded, setExpanded] = useState(false);

  const cx = 28;
  const cy = 28;
  const outerR = 21;
  const arcR = 14.5;

  const detectedPt = polarToCartesian(cx, cy, outerR, alignment.detectedAngleDeg);
  const targetPt = polarToCartesian(cx, cy, outerR, alignment.targetAngleDeg);
  const arcPath = alignment.isEvenlyLit
    ? ''
    : buildShortestArcPath(cx, cy, arcR, alignment.detectedAngleDeg, alignment.deltaDeg);

  const statusColor =
    alignment.matchStatus === 'Aligned'
      ? 'text-[#6CC091]'
      : alignment.matchStatus === 'Minor Offset'
        ? 'text-[#D4A853]'
        : 'text-[#E07A5F]';

  const statusStroke =
    alignment.matchStatus === 'Aligned'
      ? '#6CC091'
      : alignment.matchStatus === 'Minor Offset'
        ? '#D4A853'
        : '#E07A5F';

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      role="region"
      aria-label={`Lighting direction compass: ${alignment.detectedLabel}, ${alignment.matchStatus}. ${alignment.shortAdjustment}`}
      className="absolute top-11 right-3 z-20 max-w-[248px] rounded-lg border border-white/[0.14] bg-[#0B0B0C]/86 text-left shadow-[0_12px_32px_rgba(0,0,0,0.68)] backdrop-blur-md"
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors duration-150 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D4A853] rounded-lg cursor-pointer"
      >
        {/* Precision Studio Light Direction Compass Dial */}
        <svg
          width="48"
          height="48"
          viewBox="0 0 56 56"
          aria-hidden="true"
          className="h-11 w-11 shrink-0"
        >
          {/* Outer compass ring */}
          <circle
            cx={cx}
            cy={cy}
            r={outerR}
            fill="rgba(20, 20, 22, 0.9)"
            stroke="rgba(255, 255, 255, 0.16)"
            strokeWidth="1"
          />

          {/* Cardinal ticks (Top / Right / Bottom / Left) */}
          {[0, 90, 180, 270].map((deg) => {
            const p1 = polarToCartesian(cx, cy, outerR - 3, deg);
            const p2 = polarToCartesian(cx, cy, outerR, deg);
            return (
              <line
                key={deg}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="rgba(245, 241, 232, 0.35)"
                strokeWidth="1"
              />
            );
          })}

          {/* Shortest angular adjustment arc from detected source light to studio key target */}
          {arcPath && (
            <path
              d={arcPath}
              fill="none"
              stroke={statusStroke}
              strokeWidth="1.4"
              strokeDasharray="2.5 2"
              strokeOpacity="0.85"
            />
          )}

          {/* Target Studio Light vector tick (subtle ivory-sage diamond/dot) */}
          <line
            x1={cx}
            y1={cy}
            x2={targetPt.x}
            y2={targetPt.y}
            stroke="rgba(245, 241, 232, 0.25)"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
          <circle
            cx={targetPt.x}
            cy={targetPt.y}
            r="2.4"
            fill="#0B0B0C"
            stroke="#F5F1E8"
            strokeWidth="1.2"
          />

          {/* Detected Source Light vector & glowing key node */}
          {alignment.isEvenlyLit ? (
            <circle
              cx={cx}
              cy={cy}
              r="8.5"
              fill="rgba(212, 168, 83, 0.16)"
              stroke="#D4A853"
              strokeWidth="1.2"
              strokeDasharray="2 2"
            />
          ) : (
            <>
              <line
                x1={cx}
                y1={cy}
                x2={detectedPt.x}
                y2={detectedPt.y}
                stroke="#D4A853"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <circle cx={detectedPt.x} cy={detectedPt.y} r="3.4" fill="#D4A853" />
            </>
          )}

          {/* Subject center anchor */}
          <circle
            cx={cx}
            cy={cy}
            r="3"
            fill="#141416"
            stroke="rgba(245, 241, 232, 0.7)"
            strokeWidth="1.1"
          />
        </svg>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] font-semibold text-[#F5F1E8] whitespace-nowrap">
              Light Compass
            </span>
            <span className={`font-mono text-[10px] font-semibold whitespace-nowrap ${statusColor}`}>
              {alignment.matchStatus}
            </span>
          </div>
          <p className="mt-0.5 truncate font-mono text-[10px] tabular-nums text-[#9B968C]">
            {alignment.isEvenlyLit
              ? 'Front · Even fill'
              : `${alignment.detectedAngleDeg}° · ${alignment.detectedLabel}`}
          </p>
          <div className="mt-0.5 flex items-center justify-between gap-1">
            <span className="truncate text-[11px] font-medium text-[#D4A853]">
              {alignment.shortAdjustment}
            </span>
            {expanded ? (
              <ChevronUp className="h-3 w-3 shrink-0 text-[#9B968C]" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3 w-3 shrink-0 text-[#9B968C]" aria-hidden="true" />
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/[0.08] px-3 py-2.5 text-[11px]">
          <div className="flex items-center justify-between gap-2 font-mono text-[10px] tabular-nums text-[#9B968C]">
            <span>
              <span className="text-[#D4A853]">●</span> Source{' '}
              {alignment.isEvenlyLit ? 'Even' : `${alignment.detectedAngleDeg}°`}
            </span>
            <span>
              <span className="text-[#F5F1E8]">○</span> Studio {alignment.targetAngleDeg}°
            </span>
          </div>
          <p className="mt-1.5 leading-relaxed text-[#F5F1E8]/90">{alignment.detailedSuggestion}</p>
        </div>
      )}
    </div>
  );
};
