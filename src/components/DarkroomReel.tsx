import React, { useState } from 'react';
import { Archive, Download, Trash2 } from 'lucide-react';
import type { GeneratedTake } from '../data/studioCatalog';
import { downloadAllPortraitsZip } from '../utils/imageProcessing';

interface DarkroomReelProps {
  takes: GeneratedTake[];
  activeTakeId: string | null;
  onSelectTake: (id: string) => void;
  onDownloadTake: (take: GeneratedTake) => void;
  onRemoveTake: (id: string) => void;
}

export const DarkroomReel: React.FC<DarkroomReelProps> = ({
  takes,
  activeTakeId,
  onSelectTake,
  onDownloadTake,
  onRemoveTake,
}) => {
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleDownloadAll = async () => {
    if (takes.length === 0 || isExportingZip) return;
    setExportError(null);
    setIsExportingZip(true);
    try {
      await downloadAllPortraitsZip(takes);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Unable to create ZIP archive. Please try again.'
      );
    } finally {
      setIsExportingZip(false);
    }
  };

  return (
    <section
      id="reel"
      aria-label="Darkroom contact strip"
      className="mt-12 border-t border-white/[0.08] pt-10"
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl font-semibold text-[#F5F1E8]">Darkroom Reel</h2>
          <p className="mt-1 text-sm text-[#9B968C]">
            Every developed exposure and retouch pass from your current session
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <p className="font-mono text-xs tabular-nums text-[#9B968C]">
            {takes.length} {takes.length === 1 ? 'frame' : 'frames'} exposed
          </p>

          {takes.length > 0 && (
            <button
              type="button"
              onClick={() => void handleDownloadAll()}
              disabled={isExportingZip}
              className="inline-flex min-h-[38px] items-center gap-2 rounded-md border border-[#D4A853]/50 bg-[#141416] px-4 py-2 text-xs font-semibold text-[#F5F1E8] whitespace-nowrap shrink-0 transition-colors duration-150 hover:border-[#D4A853] hover:bg-[#1C1C1F] disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0B0C] cursor-pointer"
            >
              <Archive className="h-3.5 w-3.5 text-[#D4A853] shrink-0" aria-hidden="true" />
              <span>{isExportingZip ? 'Packing ZIP...' : 'Download All (ZIP)'}</span>
            </button>
          )}
        </div>
      </div>

      {exportError && (
        <p role="alert" className="mb-4 text-xs text-amber-300">
          {exportError}
        </p>
      )}

      {takes.length === 0 ? (
        <div className="flex flex-col items-start justify-between gap-2 rounded-xl border border-dashed border-white/[0.09] bg-[#111113] px-6 py-8 sm:flex-row sm:items-center">
          <p className="text-sm text-[#9B968C]">
            Your contact strip is empty. Upload a selfie and generate your first studio headshot to
            begin collecting frames.
          </p>
          <span className="font-mono text-xs tabular-nums text-[#9B968C]/70 whitespace-nowrap">
            00 / Frames
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {takes.map((take) => {
            const isActive = take.id === activeTakeId;
            return (
              <div
                key={take.id}
                className={`group flex flex-col overflow-hidden rounded-lg border transition-colors duration-150 ${
                  isActive
                    ? 'border-[#D4A853] bg-[#18181B]'
                    : 'border-white/[0.08] bg-[#141416] hover:border-white/20'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectTake(take.id)}
                  className="relative aspect-[3/4] w-full overflow-hidden bg-[#0B0B0C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D4A853] cursor-pointer"
                >
                  <img
                    src={take.imageUrl}
                    alt={`Frame ${take.frameNumber} — ${take.styleName}`}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/75 to-transparent px-2.5 pt-2 pb-5">
                    <span className="font-mono text-xs font-medium tabular-nums text-[#F5F1E8]">
                      {String(take.frameNumber).padStart(2, '0')}
                    </span>
                    {take.retouchPrompt && (
                      <span className="text-[11px] font-medium text-[#D4A853]">Retouch</span>
                    )}
                  </div>
                </button>

                <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-[#F5F1E8]">{take.styleName}</p>
                    <p className="mt-0.5 truncate text-[11px] text-[#9B968C]">
                      {take.attireLabel} <span aria-hidden="true">·</span>{' '}
                      <span className="font-mono tabular-nums">{take.aspectRatio}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onDownloadTake(take)}
                      aria-label={`Download frame ${take.frameNumber}`}
                      className="flex h-7 w-7 items-center justify-center rounded text-[#9B968C] transition-colors hover:bg-white/[0.06] hover:text-[#F5F1E8] cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveTake(take.id)}
                      aria-label={`Remove frame ${take.frameNumber}`}
                      className="flex h-7 w-7 items-center justify-center rounded text-[#9B968C] transition-colors hover:bg-white/[0.06] hover:text-[#F5F1E8] cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
