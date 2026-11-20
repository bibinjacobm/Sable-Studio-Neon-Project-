import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import type { GeneratedTake } from '../data/studioCatalog';

interface PortraitLightboxProps {
  take: GeneratedTake | null;
  onClose: () => void;
  onDownload: (take: GeneratedTake) => void;
}

export const PortraitLightbox: React.FC<PortraitLightboxProps> = ({
  take,
  onClose,
  onDownload,
}) => {
  const [showOriginal, setShowOriginal] = useState(false);

  useEffect(() => {
    setShowOriginal(false);
  }, [take?.id]);

  useEffect(() => {
    if (!take) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [take, onClose]);

  if (!take) return null;

  const displayedSrc =
    showOriginal && (take.alignedSourceUrl || take.sourceImageUrl)
      ? take.alignedSourceUrl || take.sourceImageUrl
      : take.imageUrl;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Inspecting Frame ${take.frameNumber}`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#050506]/95 p-4 sm:p-8 backdrop-blur-md"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/[0.1] bg-[#0B0B0C]"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#9B968C]">
            <span className="font-mono tabular-nums text-[#F5F1E8]">
              Frame {String(take.frameNumber).padStart(2, '0')}
            </span>
            <span aria-hidden="true">·</span>
            <span>{take.styleName}</span>
            <span aria-hidden="true">·</span>
            <span>{take.attireLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{take.lightingLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{take.aspectRatio}</span>
          </div>

          <div className="flex items-center gap-2">
            {take.sourceImageUrl && (
              <button
                type="button"
                onClick={() => setShowOriginal((prev) => !prev)}
                className="min-h-[36px] rounded-md border border-white/12 bg-[#141416] px-3 py-1.5 text-xs font-medium text-[#F5F1E8] whitespace-nowrap transition-colors hover:border-white/25 cursor-pointer"
              >
                {showOriginal ? 'Show Studio Portrait' : 'Show Original Selfie'}
              </button>
            )}
            <button
              type="button"
              onClick={() => onDownload(take)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md bg-[#F5F1E8] px-3.5 py-1.5 text-xs font-semibold text-[#0B0B0C] whitespace-nowrap transition-colors hover:bg-[#E7E0D0] cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Download PNG</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close inspection lightbox"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-white/12 text-[#F5F1E8] transition-colors hover:bg-white/10 cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-auto bg-[#080809] p-4 sm:p-6">
          <img
            src={displayedSrc}
            alt={`${take.styleName} full-resolution studio headshot`}
            referrerPolicy="no-referrer"
            className="max-h-[74vh] w-auto rounded-md object-contain"
          />
        </div>

        {take.retouchPrompt && (
          <div className="border-t border-white/[0.08] px-5 py-3 text-xs text-[#9B968C]">
            Retouch note: <span className="text-[#F5F1E8]">{take.retouchPrompt}</span>
          </div>
        )}
      </div>
    </div>
  );
};
