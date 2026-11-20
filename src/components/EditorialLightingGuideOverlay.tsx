import React, { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import type { EditorialLightingGuide } from '../utils/lightingHeatmap';

interface EditorialLightingGuideOverlayProps {
  guide: EditorialLightingGuide;
  onHide?: () => void;
}

export const EditorialLightingGuideOverlay: React.FC<EditorialLightingGuideOverlayProps> = ({
  guide,
  onHide,
}) => {
  const [expanded, setExpanded] = useState(false);

  const ratingColor =
    guide.rating === 'High'
      ? 'text-[#6CC091]'
      : guide.rating === 'Med'
        ? 'text-[#D4A853]'
        : 'text-[#E07A5F]';

  const priorityColor = (priority: 'Priority' | 'Adjust' | 'Refine') =>
    priority === 'Priority'
      ? 'text-[#E07A5F]'
      : priority === 'Adjust'
        ? 'text-[#D4A853]'
        : 'text-[#6CC091]';

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      role="region"
      aria-label={`Editorial Lighting Guide: ${guide.rating} lighting quality. Primary tip: ${guide.primaryCue}`}
      className={`absolute top-11 left-3 rounded-lg border border-white/[0.14] bg-[#0B0B0C]/88 text-left shadow-[0_12px_32px_rgba(0,0,0,0.72)] backdrop-blur-md ${
        expanded ? 'z-30 w-[264px] sm:w-[292px]' : 'z-20 w-[204px] sm:w-[224px]'
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D4A853] cursor-pointer"
      >
        <div
          aria-hidden="true"
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/[0.1] bg-[#141416] text-[#D4A853]"
        >
          <BookOpen className="h-3.5 w-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] font-semibold text-[#F5F1E8] whitespace-nowrap">
              Editorial Guide
            </span>
            <span className={`font-mono text-[10px] font-semibold tabular-nums whitespace-nowrap ${ratingColor}`}>
              {guide.rating} · {guide.score}
            </span>
          </div>

          <div className="mt-0.5 flex items-center justify-between gap-1">
            <span className="truncate text-[11px] font-medium text-[#D4A853]">
              {guide.primaryCue}
            </span>
            {expanded ? (
              <ChevronUp className="h-3 w-3 shrink-0 text-[#9B968C]" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3 w-3 shrink-0 text-[#9B968C]" aria-hidden="true" />
            )}
          </div>

          <p className="mt-0.5 truncate text-[10px] text-[#9B968C]">
            Posture <span aria-hidden="true">·</span> Light Source <span aria-hidden="true">·</span>{' '}
            Exposure
          </p>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/[0.08] px-3 py-2.5">
          <p className="text-[11px] leading-relaxed text-[#9B968C]">{guide.summary}</p>

          <ol className="mt-2.5 space-y-2.5 border-t border-white/[0.06] pt-2.5">
            {guide.tips.map((tip, index) => (
              <li
                key={tip.id}
                className={index > 0 ? 'border-t border-white/[0.06] pt-2' : undefined}
              >
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="font-mono tabular-nums text-[#9B968C]">
                    {String(index + 1).padStart(2, '0')}. {tip.category}
                  </span>
                  <span className={`font-medium whitespace-nowrap ${priorityColor(tip.priority)}`}>
                    {tip.priority}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] font-semibold text-[#F5F1E8]">{tip.headline}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[#9B968C]">{tip.detail}</p>
              </li>
            ))}
          </ol>

          {onHide && (
            <div className="mt-2.5 flex items-center justify-between border-t border-white/[0.06] pt-2 text-[10px] text-[#9B968C]">
              <span>Live from Lighting Quality</span>
              <button
                type="button"
                onClick={onHide}
                className="font-medium text-[#F5F1E8] underline decoration-white/30 underline-offset-4 transition-colors hover:text-[#D4A853] hover:decoration-[#D4A853]/60 whitespace-nowrap cursor-pointer"
              >
                Hide Guide
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
