import React, { useMemo, useState } from 'react';
import type { LightingQualityReport } from '../utils/lightingHeatmap';

interface LightingHistogramProps {
  report: LightingQualityReport;
}

const VIEW_W = 192;
const VIEW_H = 56;
const TOP_PAD = 4;
const PLOT_H = VIEW_H - TOP_PAD;

function getZoneMeta(normPos: number): { label: string; color: string } {
  if (normPos < 0.3) {
    return { label: 'Shadow', color: '#5A80C9' };
  }
  if (normPos <= 0.72) {
    return { label: 'Midtone', color: '#CFC9BC' };
  }
  if (normPos <= 0.88) {
    return { label: 'Highlight', color: '#D4A853' };
  }
  return { label: 'Peak', color: '#E07A5F' };
}

export const LightingHistogram: React.FC<LightingHistogramProps> = ({ report }) => {
  const [hoveredBin, setHoveredBin] = useState<number | null>(null);

  const bins = report.histogramBins;
  const binCount = bins.length;
  const stepX = binCount > 0 ? VIEW_W / binCount : 4;

  const { areaPath, linePath } = useMemo(() => {
    if (binCount === 0) {
      return { areaPath: '', linePath: '' };
    }
    const points = bins.map((val, idx) => {
      const x = (idx + 0.5) * stepX;
      const y = TOP_PAD + (1 - Math.max(0, Math.min(1, val))) * PLOT_H;
      return { x, y };
    });

    const line = points
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
      .join(' ');

    const area = `${line} L ${VIEW_W} ${VIEW_H} L 0 ${VIEW_H} Z`;
    return { areaPath: area, linePath: line };
  }, [bins, binCount, stepX]);

  const handlePointerMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (binCount === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const relX = Math.max(0, Math.min(0.9999, (e.clientX - rect.left) / rect.width));
    setHoveredBin(Math.floor(relX * binCount));
  };

  const hoveredInfo = useMemo(() => {
    if (hoveredBin === null || binCount === 0) return null;
    const safeIdx = Math.max(0, Math.min(binCount - 1, hoveredBin));
    const normCenter = (safeIdx + 0.5) / binCount;
    const lumLevel = Math.round(normCenter * 255);
    const pct = report.histogramBinPercents[safeIdx] ?? 0;
    const zone = getZoneMeta(normCenter);
    return {
      idx: safeIdx,
      lumLevel,
      pct,
      zone,
      cursorX: (safeIdx + 0.5) * stepX,
    };
  }, [hoveredBin, binCount, report.histogramBinPercents, stepX]);

  const p02X = (report.p02Percent / 100) * VIEW_W;
  const p98X = (report.p98Percent / 100) * VIEW_W;
  const meanX = (report.meanLuminancePercent / 100) * VIEW_W;
  const shadowDividerX = 0.3 * VIEW_W;
  const highlightDividerX = 0.72 * VIEW_W;

  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-[#F5F1E8] whitespace-nowrap">
          Luminance Histogram
        </span>
        {hoveredInfo ? (
          <span className="font-mono text-[11px] tabular-nums text-[#F5F1E8] whitespace-nowrap">
            <span style={{ color: hoveredInfo.zone.color }}>{hoveredInfo.zone.label}</span>{' '}
            <span>L{hoveredInfo.lumLevel}</span>
            <span aria-hidden="true" className="text-[#9B968C]">
              {' '}
              ·{' '}
            </span>
            <span className="text-[#D4A853]">{hoveredInfo.pct.toFixed(1)}%</span>
          </span>
        ) : (
          <span className="font-mono text-[11px] tabular-nums text-[#9B968C] whitespace-nowrap">
            S {report.shadowPercent}% · M {report.midtonePercent}% · H {report.highlightPercent}%
          </span>
        )}
      </div>

      {/* Interactive Real-Time Pixel Intensity Spread Chart */}
      <div className="relative mt-2.5 overflow-hidden rounded-md border border-white/[0.07] bg-[#0B0B0C] px-1.5 pt-1.5 pb-0.5">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Source portrait pixel intensity histogram: ${report.shadowPercent}% shadows, ${report.midtonePercent}% midtones, ${report.highlightPercent}% highlights, mean luminance ${report.meanLuminancePercent}%`}
          onMouseMove={handlePointerMove}
          onMouseLeave={() => setHoveredBin(null)}
          className="h-[62px] w-full cursor-crosshair select-none"
        >
          <defs>
            <linearGradient id="sable-hist-fill" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3B5BA8" stopOpacity="0.48" />
              <stop offset="30%" stopColor="#6D9B9E" stopOpacity="0.42" />
              <stop offset="68%" stopColor="#D4A853" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#E07A5F" stopOpacity="0.52" />
            </linearGradient>
            <linearGradient id="sable-hist-stroke" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6A8EDB" />
              <stop offset="32%" stopColor="#9BC5B0" />
              <stop offset="72%" stopColor="#D4A853" />
              <stop offset="100%" stopColor="#E07A5F" />
            </linearGradient>
          </defs>

          {/* Usable dynamic range span (2nd–98th percentile) */}
          <rect
            x={p02X}
            y={0}
            width={Math.max(1, p98X - p02X)}
            height={VIEW_H}
            fill="rgba(245, 241, 232, 0.03)"
          />

          {/* Subtle exposure zone guides (Shadow / Midtone / Highlight) */}
          <line
            x1={shadowDividerX}
            y1={0}
            x2={shadowDividerX}
            y2={VIEW_H}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="0.75"
            strokeDasharray="2 2"
          />
          <line
            x1={highlightDividerX}
            y1={0}
            x2={highlightDividerX}
            y2={VIEW_H}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="0.75"
            strokeDasharray="2 2"
          />

          {/* Mean luminance reference line */}
          <line
            x1={meanX}
            y1={0}
            x2={meanX}
            y2={VIEW_H}
            stroke="rgba(212,168,83,0.45)"
            strokeWidth="0.9"
          />

          {/* Micro-bars for crisp per-bin pixel spread */}
          {bins.map((val, idx) => {
            const h = Math.max(1, val * PLOT_H);
            const x = idx * stepX + 0.45;
            const y = VIEW_H - h;
            const normPos = (idx + 0.5) / binCount;
            const isHovered = hoveredInfo?.idx === idx;
            const zone = getZoneMeta(normPos);
            return (
              <rect
                key={idx}
                x={x}
                y={y}
                width={Math.max(1, stepX - 0.9)}
                height={h}
                fill={isHovered ? '#F5F1E8' : zone.color}
                fillOpacity={isHovered ? 0.95 : 0.36}
              />
            );
          })}

          {/* Smooth spectral luminance envelope */}
          {areaPath && <path d={areaPath} fill="url(#sable-hist-fill)" />}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="url(#sable-hist-stroke)"
              strokeWidth="1.25"
              strokeLinejoin="round"
            />
          )}

          {/* Hover inspection cursor */}
          {hoveredInfo && (
            <line
              x1={hoveredInfo.cursorX}
              y1={0}
              x2={hoveredInfo.cursorX}
              y2={VIEW_H}
              stroke="#F5F1E8"
              strokeWidth="0.9"
              strokeOpacity="0.85"
            />
          )}
        </svg>
      </div>

      {/* Axis Scale & Mean Luminance Footer */}
      <div className="mt-1.5 flex items-center justify-between gap-2 font-mono text-[10px] tabular-nums text-[#9B968C]">
        <span>0 · Shadows</span>
        <span className="text-[#F5F1E8]/80">Mean {report.meanLuminancePercent}%</span>
        <span>Highlights · 255</span>
      </div>
    </div>
  );
};
