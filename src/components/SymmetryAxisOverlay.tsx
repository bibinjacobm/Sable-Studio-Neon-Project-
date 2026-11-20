import React from 'react';
import type { FacialSymmetryReport, SymmetryPoint } from '../utils/facialSymmetry';

interface SymmetryAxisOverlayProps {
  report: FacialSymmetryReport;
  containerAspect: number;
}

/**
 * Projects normalized image coordinates (0..1) into normalized container coordinates (0..100)
 * matching CSS `object-cover` framing so facial landmarks align pixel-accurately over the subject.
 */
function projectObjectCover(
  pt: SymmetryPoint,
  imageAspect: number,
  containerAspect: number
): { x: number; y: number } {
  if (imageAspect > containerAspect) {
    // Image is wider than container: left & right edges cropped symmetrically
    const scaleX = imageAspect / containerAspect;
    const offsetX = (scaleX - 1) * 0.5;
    return {
      x: (pt.x * scaleX - offsetX) * 100,
      y: pt.y * 100,
    };
  }
  // Image is taller than container: top & bottom edges cropped symmetrically
  const scaleY = containerAspect / imageAspect;
  const offsetY = (scaleY - 1) * 0.5;
  return {
    x: pt.x * 100,
    y: (pt.y * scaleY - offsetY) * 100,
  };
}

export const SymmetryAxisOverlay: React.FC<SymmetryAxisOverlayProps> = ({
  report,
  containerAspect,
}) => {
  const imageAspect = report.imageWidth / Math.max(1, report.imageHeight);
  const project = (pt: SymmetryPoint) => projectObjectCover(pt, imageAspect, containerAspect);

  const midTop = project(report.midlineTop);
  const midBot = project(report.midlineBottom);
  const eyeLeft = project(report.eyeLineLeft);
  const eyeRight = project(report.eyeLineRight);

  const accentStroke =
    report.rating === 'Balanced'
      ? '#6CC091'
      : report.rating === 'Natural'
        ? '#D4A853'
        : '#E07A5F';

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[15] h-full w-full"
    >
      {/* Subtle bilateral eye-level horizon line */}
      <line
        x1={eyeLeft.x}
        y1={eyeLeft.y}
        x2={eyeRight.x}
        y2={eyeRight.y}
        stroke="rgba(245, 241, 232, 0.52)"
        strokeWidth="0.32"
        strokeDasharray="1.2 1.2"
      />

      {/* Primary vertical facial symmetry midline axis */}
      <line
        x1={midTop.x}
        y1={midTop.y}
        x2={midBot.x}
        y2={midBot.y}
        stroke={accentStroke}
        strokeWidth="0.45"
        strokeDasharray="1.8 1.2"
        strokeOpacity="0.92"
      />

      {/* Midline crown & chin terminal ticks */}
      <circle cx={midTop.x} cy={midTop.y} r="0.65" fill={accentStroke} />
      <circle cx={midBot.x} cy={midBot.y} r="0.65" fill={accentStroke} />

      {/* Paired bilateral facial landmarks with hairline mirror chords */}
      {report.overlayPairs.map((pair) => {
        const left = project(pair.left);
        const right = project(pair.right);
        const dotColor =
          pair.pairScore >= 88 ? '#6CC091' : pair.pairScore >= 76 ? '#D4A853' : '#E07A5F';

        return (
          <g key={pair.label}>
            <line
              x1={left.x}
              y1={left.y}
              x2={right.x}
              y2={right.y}
              stroke={dotColor}
              strokeWidth="0.25"
              strokeOpacity="0.58"
            />
            <circle
              cx={left.x}
              cy={left.y}
              r="0.82"
              fill="#0B0B0C"
              stroke={dotColor}
              strokeWidth="0.38"
            />
            <circle
              cx={right.x}
              cy={right.y}
              r="0.82"
              fill="#0B0B0C"
              stroke={dotColor}
              strokeWidth="0.38"
            />
          </g>
        );
      })}
    </svg>
  );
};
