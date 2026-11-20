import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, X } from 'lucide-react';
import type { GeneratedTake } from '../data/studioCatalog';
import { buildTakeExifMetadata, copyPortraitToClipboard } from '../utils/imageProcessing';

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
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied'>('idle');
  const [copyError, setCopyError] = useState<string | null>(null);
  const resetTimerRef = useRef<number | null>(null);

  const clearResetTimer = () => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  };

  useEffect(() => {
    setShowOriginal(false);
    setCopyState('idle');
    setCopyError(null);
    clearResetTimer();
  }, [take?.id]);

  useEffect(() => {
    return () => {
      clearResetTimer();
    };
  }, []);

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

  const handleCopyToClipboard = async () => {
    if (copyState === 'copying') return;
    clearResetTimer();
    setCopyError(null);
    setCopyState('copying');
    try {
      await copyPortraitToClipboard(
        displayedSrc,
        showOriginal ? undefined : buildTakeExifMetadata(take)
      );
      setCopyState('copied');
      resetTimerRef.current = window.setTimeout(() => {
        setCopyState('idle');
        resetTimerRef.current = null;
      }, 2200);
    } catch (err) {
      setCopyState('idle');
      setCopyError(
        err instanceof Error
          ? err.message
          : 'Unable to copy image to clipboard. Use Download PNG instead.'
      );
    }
  };

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

          <div className="flex flex-wrap items-center gap-2">
            {take.sourceImageUrl && (
              <button
                type="button"
                onClick={() => {
                  setShowOriginal((prev) => !prev);
                  setCopyState('idle');
                  setCopyError(null);
                  clearResetTimer();
                }}
                className="min-h-[36px] rounded-md border border-white/12 bg-[#141416] px-3 py-1.5 text-xs font-medium text-[#F5F1E8] whitespace-nowrap shrink-0 transition-colors hover:border-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
              >
                {showOriginal ? 'Show Studio Portrait' : 'Show Original Selfie'}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleCopyToClipboard()}
              disabled={copyState === 'copying'}
              aria-live="polite"
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer ${
                copyState === 'copied'
                  ? 'border-[#D4A853] bg-[#D4A853]/15 text-[#F5F1E8]'
                  : 'border-white/12 bg-[#141416] text-[#F5F1E8] hover:border-white/25 hover:bg-[#1C1C1F]'
              }`}
            >
              {copyState === 'copied' ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[#D4A853] shrink-0" aria-hidden="true" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{copyState === 'copying' ? 'Copying...' : 'Copy to Clipboard'}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => onDownload(take)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md bg-[#F5F1E8] px-3.5 py-1.5 text-xs font-semibold text-[#0B0B0C] whitespace-nowrap shrink-0 transition-colors hover:bg-[#E7E0D0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Download PNG</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close inspection lightbox"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/12 text-[#F5F1E8] transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {copyError && (
          <div
            role="alert"
            className="border-b border-amber-400/25 bg-amber-950/35 px-5 py-2.5 text-xs text-amber-200"
          >
            {copyError}
          </div>
        )}

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
