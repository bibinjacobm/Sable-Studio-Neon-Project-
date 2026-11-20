import React from 'react';
import type { FacialSymmetryReport } from '../utils/facialSymmetry';

interface SymmetryAnalysisCardProps {
  report: FacialSymmetryReport | null;
  isAnalyzing: boolean;
  showAxis: boolean;
  onToggleAxis: () => void;
}

export const SymmetryAnalysisCard: React.FC<SymmetryAnalysisCardProps> = ({
  report,
  isAnalyzing,
  showAxis,
  onToggleAxis,
}) => {
  if (!report && !isAnalyzing) {
    return null;
  }

  const getScoreColorClass = (score: number) =>
    score >= 88 ? 'text-[#6CC091]' : score >= 76 ? 'text-[#D4A853]' : 'text-[#E07A5F]';

  const getBarColorClass = (score: number) =>
    score >= 88 ? 'bg-[#6CC091]' : score >= 76 ? 'bg-[#D4A853]' : 'bg-[#E07A5F]';

  return (
    <div
      aria-label={
        report
          ? `Facial symmetry analysis: ${report.overallScore}% ${report.rating}`
          : 'Analyzing facial landmarks for bilateral symmetry'
      }
      className="mt-3 rounded-lg border border-white/[0.08] bg-[#141416] px-4 py-3.5"
    >
      {report ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-center md:gap-5">
          {/* Left Column: Bilateral Score, Regional Sub-Meters & Portrait Quality Guidance */}
          <div className="flex flex-col justify-between md:col-span-8">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-[#F5F1E8] whitespace-nowrap">
                    Symmetry Analysis
                  </span>

                  {/* 3-segment darkroom balance level indicator */}
                  <span aria-hidden="true" className="inline-flex items-center gap-1">
                    {[1, 2, 3].map((level) => {
                      const activeLevel =
                        report.rating === 'Balanced' ? 3 : report.rating === 'Natural' ? 2 : 1;
                      const isLit = level <= activeLevel;
                      const litColor =
                        report.rating === 'Balanced'
                          ? 'bg-[#6CC091]'
                          : report.rating === 'Natural'
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
                    className={`font-mono text-xs font-semibold tabular-nums whitespace-nowrap ${getScoreColorClass(
                      report.overallScore
                    )}`}
                  >
                    {report.overallScore}%
                  </span>
                  <span aria-hidden="true" className="text-[#9B968C]">
                    ·
                  </span>
                  <span className={`font-medium whitespace-nowrap ${getScoreColorClass(report.overallScore)}`}>
                    {report.rating}
                  </span>
                  <span aria-hidden="true" className="text-[#9B968C]">
                    ·
                  </span>
                  <span className="text-[#9B968C] whitespace-nowrap">{report.poseLabel}</span>
                </div>

                <div className="flex items-center gap-2 text-xs text-[#9B968C]">
                  <span className="font-mono text-[11px] tabular-nums whitespace-nowrap">
                    {report.sourceMode === 'face-landmarks'
                      ? `${report.landmarkCount} landmarks`
                      : 'Contour mesh'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={onToggleAxis}
                    aria-pressed={showAxis}
                    className={`font-medium underline underline-offset-4 transition-colors whitespace-nowrap cursor-pointer ${
                      showAxis
                        ? 'text-[#D4A853] decoration-[#D4A853]/65 hover:text-[#F5F1E8]'
                        : 'text-[#F5F1E8] decoration-white/30 hover:text-[#D4A853] hover:decoration-[#D4A853]/60'
                    }`}
                  >
                    {showAxis ? 'Hide Axis' : 'Show Axis'}
                  </button>
                </div>
              </div>

              {/* 3 Anatomical Bilateral Sub-Meters */}
              <div className="mt-3 grid grid-cols-1 gap-3 border-t border-white/[0.06] pt-2.5 sm:grid-cols-3 sm:gap-4">
                {[
                  { label: 'Eyes & Brows', score: report.eyesBrowsScore },
                  { label: 'Nose & Mouth', score: report.noseMouthScore },
                  { label: 'Jaw & Cheeks', score: report.jawCheeksScore },
                ].map((metric) => (
                  <div key={metric.label}>
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-[#9B968C] whitespace-nowrap">{metric.label}</span>
                      <span className="font-mono tabular-nums text-[#F5F1E8]">
                        {metric.score}%
                      </span>
                    </div>
                    <div
                      aria-hidden="true"
                      className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.08]"
                    >
                      <div
                        className={`h-full w-full origin-left rounded-full transition-transform duration-200 motion-reduce:transition-none ${getBarColorClass(
                          metric.score
                        )}`}
                        style={{ transform: `scaleX(${metric.score / 100})` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-2.5 text-xs leading-relaxed text-[#9B968C]">{report.guidance}</p>
          </div>

          {/* Right Column: Bilateral Axis Schematic & Head Roll Readout */}
          <div className="flex items-center gap-3.5 border-t border-white/[0.07] pt-3.5 md:col-span-4 md:border-t-0 md:border-l md:pt-0 md:pl-5">
            <svg
              width="64"
              height="74"
              viewBox="0 0 64 74"
              aria-hidden="true"
              className="h-[70px] w-[60px] shrink-0"
            >
              {/* Subtle vertical plumb reference line */}
              <line
                x1="32"
                y1="5"
                x2="32"
                y2="69"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth="1"
              />

              {/* Tilted facial symmetry wireframe reflecting live headRollDeg */}
              <g transform={`rotate(${Math.max(-18, Math.min(18, report.headRollDeg))} 32 37)`}>
                {/* Minimal face contour ellipse */}
                <ellipse
                  cx="32"
                  cy="37"
                  rx="20"
                  ry="26"
                  fill="rgba(255,255,255,0.02)"
                  stroke="rgba(245,241,232,0.22)"
                  strokeWidth="1"
                />

                {/* Active midline axis */}
                <line
                  x1="32"
                  y1="8"
                  x2="32"
                  y2="66"
                  stroke={
                    report.rating === 'Balanced'
                      ? '#6CC091'
                      : report.rating === 'Natural'
                        ? '#D4A853'
                        : '#E07A5F'
                  }
                  strokeWidth="1.2"
                  strokeDasharray="2.5 2"
                />

                {/* Three bilateral parity bars: Eyes, Nose/Mouth, Jaw */}
                {[
                  { y: 27, span: 13, score: report.eyesBrowsScore },
                  { y: 40, span: 9, score: report.noseMouthScore },
                  { y: 52, span: 14, score: report.jawCheeksScore },
                ].map((tier) => {
                  const color =
                    tier.score >= 88 ? '#6CC091' : tier.score >= 76 ? '#D4A853' : '#E07A5F';
                  return (
                    <g key={tier.y}>
                      <line
                        x1={32 - tier.span}
                        y1={tier.y}
                        x2={32 + tier.span}
                        y2={tier.y}
                        stroke={color}
                        strokeWidth="1.1"
                        strokeOpacity="0.7"
                      />
                      <circle cx={32 - tier.span} cy={tier.y} r="2.1" fill={color} />
                      <circle cx={32 + tier.span} cy={tier.y} r="2.1" fill={color} />
                    </g>
                  );
                })}
              </g>
            </svg>

            <div className="min-w-0 flex-1 space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#9B968C] whitespace-nowrap">Bilateral Index</span>
                <span
                  className={`font-mono font-semibold tabular-nums ${getScoreColorClass(
                    report.overallScore
                  )}`}
                >
                  {report.overallScore}/100
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#9B968C] whitespace-nowrap">Head Roll</span>
                <span className="font-mono tabular-nums text-[#F5F1E8]">
                  {report.headRollDeg > 0 ? `+${report.headRollDeg.toFixed(1)}°` : `${report.headRollDeg.toFixed(1)}°`}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#9B968C] whitespace-nowrap">Axis Plane</span>
                <span className="truncate font-mono tabular-nums text-[#9B968C]">
                  {report.yawRatio < 0.13 ? 'Frontal' : report.yawRatio < 0.24 ? '3/4 Soft' : '3/4 Turn'}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 text-xs text-[#9B968C]">
          <span className="font-semibold text-[#F5F1E8]">Symmetry Analysis</span>
          <span>Mapping facial landmarks &amp; bilateral balance...</span>
        </div>
      )}
    </div>
  );
};
