import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Link2,
  Loader2,
  Share2,
  Smartphone,
  X,
} from 'lucide-react';
import type { GeneratedTake } from '../data/studioCatalog';
import { buildTakeExifMetadata, copyPortraitToClipboard } from '../utils/imageProcessing';
import {
  copyTextToClipboard,
  createPermanentPortraitLink,
  getCachedPermanentPortraitLink,
  sharePortraitNatively,
  supportsNativeWebShare,
  type PermanentPortraitLink,
} from '../utils/sharePortrait';

interface SharePortraitPopoverProps {
  take: GeneratedTake;
}

type ShareFeedback = {
  kind: 'success' | 'error' | 'info';
  message: string;
} | null;

export const SharePortraitPopover: React.FC<SharePortraitPopoverProps> = ({ take }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [permanentLink, setPermanentLink] = useState<PermanentPortraitLink | null>(() =>
    getCachedPermanentPortraitLink(take)
  );
  const [busyAction, setBusyAction] = useState<'link' | 'page' | 'native' | 'image' | null>(null);
  const [copiedTarget, setCopiedTarget] = useState<'image-link' | 'page-link' | 'image' | null>(
    null
  );
  const [feedback, setFeedback] = useState<ShareFeedback>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const clearStatusTimerRef = useRef<number | null>(null);
  const dialogId = useId();
  const titleId = useId();

  const nativeShareAvailable = supportsNativeWebShare();
  const paddedFrame = String(take.frameNumber).padStart(2, '0');

  const clearPendingTimer = useCallback(() => {
    if (clearStatusTimerRef.current !== null) {
      window.clearTimeout(clearStatusTimerRef.current);
      clearStatusTimerRef.current = null;
    }
  }, []);

  const scheduleCopiedReset = useCallback(() => {
    clearPendingTimer();
    clearStatusTimerRef.current = window.setTimeout(() => {
      setCopiedTarget(null);
      clearStatusTimerRef.current = null;
    }, 2800);
  }, [clearPendingTimer]);

  // Keep link state synchronized when switching frames or re-developing the active take
  useEffect(() => {
    setPermanentLink(getCachedPermanentPortraitLink(take));
    setCopiedTarget(null);
    setFeedback(null);
    setIsOpen(false);
  }, [take.id, take.imageUrl]);

  useEffect(() => {
    return () => {
      clearPendingTimer();
    };
  }, [clearPendingTimer]);

  // Dismiss on outside click or Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const ensurePermanentLink = useCallback(async (): Promise<PermanentPortraitLink> => {
    if (permanentLink) {
      return permanentLink;
    }
    const created = await createPermanentPortraitLink(take);
    setPermanentLink(created);
    return created;
  }, [permanentLink, take]);

  const handleCopyPermanentImageLink = async () => {
    setBusyAction('link');
    setFeedback(null);
    try {
      const link = await ensurePermanentLink();
      await copyTextToClipboard(link.imageUrl);
      setCopiedTarget('image-link');
      setFeedback({
        kind: 'success',
        message: 'Permanent PNG image link copied to clipboard.',
      });
      scheduleCopiedReset();
    } catch (err) {
      setFeedback({
        kind: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Unable to create or copy the permanent image link.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopyShareCardLink = async () => {
    setBusyAction('page');
    setFeedback(null);
    try {
      const link = await ensurePermanentLink();
      await copyTextToClipboard(link.pageUrl);
      setCopiedTarget('page-link');
      setFeedback({
        kind: 'success',
        message: 'Social preview page link copied to clipboard.',
      });
      scheduleCopiedReset();
    } catch (err) {
      setFeedback({
        kind: 'error',
        message:
          err instanceof Error ? err.message : 'Unable to copy the social preview link.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleNativeShare = async () => {
    setBusyAction('native');
    setFeedback(null);
    try {
      let resolvedLink = permanentLink;
      if (!resolvedLink) {
        try {
          resolvedLink = await createPermanentPortraitLink(take);
          setPermanentLink(resolvedLink);
        } catch {
          // Proceed with file-only native share if server persistence is unreachable
        }
      }

      const outcome = await sharePortraitNatively(take, resolvedLink);
      if (outcome === 'shared') {
        setFeedback({
          kind: 'success',
          message: 'Shared via your device share sheet.',
        });
      }
    } catch (err) {
      setFeedback({
        kind: nativeShareAvailable ? 'error' : 'info',
        message:
          err instanceof Error
            ? err.message
            : 'Native share sheet is unavailable in this browser.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopyImageBinary = async () => {
    setBusyAction('image');
    setFeedback(null);
    try {
      await copyPortraitToClipboard(take.imageUrl, buildTakeExifMetadata(take));
      setCopiedTarget('image');
      setFeedback({
        kind: 'success',
        message: 'High-res PNG copied to clipboard — ready to paste.',
      });
      scheduleCopiedReset();
    } catch (err) {
      setFeedback({
        kind: 'error',
        message:
          err instanceof Error ? err.message : 'Could not copy portrait image to clipboard.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const isBusy = busyAction !== null;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? dialogId : undefined}
        title="Share portrait link or open native share sheet"
        className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer ${
          isOpen
            ? 'border-[#D4A853] bg-[#D4A853]/15 text-[#F5F1E8]'
            : 'border-white/[0.09] bg-[#141416] text-[#F5F1E8] hover:border-white/25 hover:bg-[#1C1C1F]'
        }`}
      >
        <Share2
          className={`h-3.5 w-3.5 shrink-0 ${isOpen ? 'text-[#D4A853]' : ''}`}
          aria-hidden="true"
        />
        <span>Share</span>
      </button>

      {isOpen && (
        <div
          id={dialogId}
          role="dialog"
          aria-labelledby={titleId}
          className="absolute right-0 top-full z-30 mt-2 w-[332px] max-w-[calc(100vw-2rem)] rounded-lg border border-white/[0.12] bg-[#141416] p-4 shadow-2xl shadow-black/75"
        >
          {/* Caret pointer */}
          <span
            aria-hidden="true"
            className="absolute -top-1.5 right-6 h-2.5 w-2.5 rotate-45 border-t border-l border-white/[0.14] bg-[#141416]"
          />

          {/* Popover Header */}
          <div className="flex items-start justify-between gap-2 border-b border-white/[0.07] pb-3">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#D4A853]">
                Share Portrait
              </p>
              <h3
                id={titleId}
                className="mt-0.5 truncate text-xs font-semibold text-[#F5F1E8]"
              >
                <span className="font-mono tabular-nums text-[#D4A853]">Frame {paddedFrame}</span>
                <span className="mx-1.5 text-[#9B968C]" aria-hidden="true">
                  ·
                </span>
                <span>{take.styleName}</span>
              </h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                triggerRef.current?.focus();
              }}
              aria-label="Close share menu"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#9B968C] transition-colors hover:bg-white/[0.08] hover:text-[#F5F1E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          {/* Primary Share Actions */}
          <div className="mt-3 space-y-2">
            {/* Option 1: Permanent Image Link */}
            <button
              type="button"
              onClick={handleCopyPermanentImageLink}
              disabled={isBusy}
              className={`group flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] disabled:opacity-60 cursor-pointer ${
                copiedTarget === 'image-link'
                  ? 'border-[#D4A853]/70 bg-[#D4A853]/12'
                  : 'border-white/[0.09] bg-[#0F0F11] hover:border-[#D4A853]/45 hover:bg-[#19191C]'
              }`}
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-[#141416] text-[#D4A853]">
                {busyAction === 'link' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : copiedTarget === 'image-link' ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-[#F5F1E8]">
                  {copiedTarget === 'image-link'
                    ? 'Permanent Link Copied'
                    : 'Copy Permanent Image Link'}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-[#9B968C]">
                  Direct hosted PNG URL for profiles, bios, and embeds
                </span>
              </span>
            </button>

            {/* Option 2: Platform Native Share Sheet */}
            <button
              type="button"
              onClick={handleNativeShare}
              disabled={isBusy}
              className="group flex w-full items-start gap-3 rounded-md border border-white/[0.09] bg-[#0F0F11] px-3 py-2.5 text-left transition-colors duration-150 hover:border-[#D4A853]/45 hover:bg-[#19191C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] disabled:opacity-60 cursor-pointer"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-[#141416] text-[#F5F1E8] group-hover:text-[#D4A853]">
                {busyAction === 'native' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#D4A853]" aria-hidden="true" />
                ) : (
                  <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-[#F5F1E8]">
                  Open Native Share Sheet
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-[#9B968C]">
                  {nativeShareAvailable
                    ? 'Send portrait directly to social apps, Messages & AirDrop'
                    : 'Uses your OS share sheet when supported by the browser'}
                </span>
              </span>
            </button>
          </div>

          {/* Generated Permanent URL Preview */}
          {permanentLink && (
            <div className="mt-3 rounded-md border border-white/[0.08] bg-[#0B0B0C] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#9B968C]">
                  Permanent Image URL
                </span>
                <button
                  type="button"
                  onClick={handleCopyShareCardLink}
                  disabled={isBusy}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#D4A853] underline decoration-[#D4A853]/45 underline-offset-4 transition-colors hover:text-[#F5F1E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] whitespace-nowrap cursor-pointer"
                >
                  {copiedTarget === 'page-link' ? (
                    <>
                      <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>Card Link Copied</span>
                    </>
                  ) : (
                    <>
                      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>Copy Social Card</span>
                    </>
                  )}
                </button>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <input
                  type="text"
                  readOnly
                  value={permanentLink.imageUrl}
                  aria-label="Permanent portrait image URL"
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded border border-white/[0.08] bg-[#141416] px-2 py-1.5 font-mono text-[11px] text-[#F5F1E8] focus:border-[#D4A853] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyPermanentImageLink}
                  disabled={isBusy}
                  aria-label="Copy permanent image URL"
                  title="Copy URL"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-white/[0.09] bg-[#141416] text-[#F5F1E8] transition-colors hover:border-[#D4A853] hover:text-[#D4A853] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
                >
                  {copiedTarget === 'image-link' ? (
                    <Check className="h-3.5 w-3.5 text-[#D4A853]" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Secondary Utility Row: Copy Raw PNG Image */}
          <div className="mt-3 flex items-center justify-between border-t border-white/[0.07] pt-2.5">
            <button
              type="button"
              onClick={handleCopyImageBinary}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#9B968C] transition-colors hover:text-[#F5F1E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              {busyAction === 'image' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#D4A853]" aria-hidden="true" />
              ) : copiedTarget === 'image' ? (
                <Check className="h-3.5 w-3.5 text-[#D4A853]" aria-hidden="true" />
              ) : (
                <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>
                {copiedTarget === 'image' ? 'Image Copied' : 'Copy PNG Image to Clipboard'}
              </span>
            </button>
            <span className="font-mono text-[10px] tabular-nums text-[#9B968C] whitespace-nowrap">
              {take.aspectRatio} · EXIF
            </span>
          </div>

          {/* Inline Live Status Feedback */}
          {feedback && (
            <div
              role="status"
              aria-live="polite"
              className={`mt-2.5 flex items-start gap-2 rounded-md border px-2.5 py-2 text-[11px] leading-snug ${
                feedback.kind === 'success'
                  ? 'border-[#D4A853]/35 bg-[#D4A853]/10 text-[#F5F1E8]'
                  : feedback.kind === 'info'
                    ? 'border-white/[0.12] bg-[#0F0F11] text-[#D8D3C9]'
                    : 'border-red-400/35 bg-red-950/35 text-red-200'
              }`}
            >
              {feedback.kind === 'success' ? (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#D4A853]" aria-hidden="true" />
              ) : (
                <AlertCircle
                  className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                    feedback.kind === 'info' ? 'text-[#D4A853]' : 'text-red-300'
                  }`}
                  aria-hidden="true"
                />
              )}
              <span>{feedback.message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
