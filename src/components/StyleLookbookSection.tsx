import React, { useState } from 'react';
import { ArrowUpRight, Camera } from 'lucide-react';
import {
  STUDIO_STYLES,
  getLightingById,
  type StyleId,
} from '../data/studioCatalog';

interface StyleLookbookSectionProps {
  selectedStyleId: StyleId;
  onSelectStyleFromLookbook: (styleId: StyleId) => void;
}

const CAPTURE_TIPS = [
  {
    index: '01.',
    title: 'Face a soft light source',
    body: 'Stand facing an open window or diffused indoor light so both sides of your face are evenly illuminated without deep under-eye shadows.',
  },
  {
    index: '02.',
    title: 'Hold the lens at eye level',
    body: 'Position your camera straight on at eye height rather than angled downward. Keep shoulders relaxed and leave slight breathing room above your head.',
  },
  {
    index: '03.',
    title: 'Keep features unobstructed',
    body: 'Avoid sunglasses, hats, or heavy beauty filters. Clear natural skin texture and unobstructed eyes allow the darkroom engine to preserve your true likeness.',
  },
];

export const StyleLookbookSection: React.FC<StyleLookbookSectionProps> = ({
  selectedStyleId,
  onSelectStyleFromLookbook,
}) => {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  return (
    <div className="mt-20 space-y-20 border-t border-white/[0.08] pt-16">
      {/* Editorial Style Lookbook */}
      <section id="lookbook" aria-label="Style Lookbook">
        <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-[#D4A853]">Studio Lookbook</p>
            <h2 className="mt-2 font-serif text-4xl font-semibold tracking-tight text-[#F5F1E8]">
              Six curated lighting & backdrop recipes
            </h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-[#9B968C]">
            Select any reference plate below to load its backdrop, optical depth, and default
            lighting setup directly into your studio workbench.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {STUDIO_STYLES.map((style, idx) => {
            const isActive = style.id === selectedStyleId;
            const lighting = getLightingById(style.defaultLighting);
            const imgFailed = failedImages[style.id];
            return (
              <article
                key={style.id}
                className="group flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#141416] transition-colors duration-200 hover:border-white/20"
              >
                <div className="relative aspect-[3/4] w-full overflow-hidden bg-[#0B0B0C]">
                  {!imgFailed ? (
                    <img
                      src={style.previewImage}
                      alt={`${style.name} editorial portrait reference`}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setFailedImages((prev) => ({ ...prev, [style.id]: true }))
                      }
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[#1C1C1F] text-[#9B968C]">
                      <Camera className="h-8 w-8" aria-hidden="true" />
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-5 pt-12 pb-4">
                    <p className="font-mono text-xs tabular-nums text-[#D4A853]">
                      Plate {String(idx + 1).padStart(2, '0')} · {style.lensSpec}
                    </p>
                    <h3 className="mt-1 font-serif text-2xl font-semibold text-[#F5F1E8]">
                      {style.name}
                    </h3>
                  </div>
                </div>

                <div className="flex flex-1 flex-col justify-between p-5">
                  <div>
                    <p className="text-sm leading-relaxed text-[#9B968C]">{style.subtitle}</p>
                    <p className="mt-3 text-xs text-[#9B968C]/85">
                      {style.environmentSummary} <span aria-hidden="true">·</span> {lighting.label}
                    </p>
                  </div>

                  <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between">
                    <span className="text-xs text-[#9B968C]">
                      {isActive ? 'Loaded in studio' : 'Ready to load'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectStyleFromLookbook(style.id)}
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                        isActive
                          ? 'text-[#D4A853]'
                          : 'text-[#F5F1E8] hover:text-[#D4A853]'
                      }`}
                    >
                      <span>{isActive ? 'Use This Style' : 'Load Style'}</span>
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Capture Guide */}
      <section
        id="guide"
        aria-label="Selfie Capture Guide"
        className="border-t border-white/[0.08] pt-16"
      >
        <div className="mb-10 max-w-2xl">
          <p className="text-xs font-medium text-[#D4A853]">Capture Guide</p>
          <h2 className="mt-2 font-serif text-4xl font-semibold tracking-tight text-[#F5F1E8]">
            How to get the most lifelike studio portrait
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {CAPTURE_TIPS.map((tip) => (
            <div
              key={tip.index}
              className="border-t border-white/[0.1] pt-6"
            >
              <p className="font-mono text-xs tabular-nums text-[#D4A853]">{tip.index}</p>
              <h3 className="mt-2 font-serif text-2xl font-semibold text-[#F5F1E8]">
                {tip.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[#9B968C]">{tip.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
