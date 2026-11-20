import type { GeneratedTake } from '../data/studioCatalog';
import { injectExifIntoDataUrl } from './exifMetadata';
import { buildPortraitFilename, buildTakeExifMetadata } from './imageProcessing';

export interface PermanentPortraitLink {
  id: string;
  imageUrl: string;
  pageUrl: string;
}

const permanentLinkCache = new Map<string, PermanentPortraitLink>();

function buildTakeCacheKey(take: GeneratedTake): string {
  const tail = take.imageUrl.slice(-48);
  return `${take.id}|${take.imageUrl.length}|${tail}`;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    parts.push(String.fromCharCode(...slice));
  }
  return btoa(parts.join(''));
}

function prepareExifPortraitBytes(take: GeneratedTake): {
  bytes: Uint8Array;
  mimeType: string;
  dataUrl: string;
} {
  try {
    const { bytes, mimeType } = injectExifIntoDataUrl(take.imageUrl, buildTakeExifMetadata(take));
    return {
      bytes,
      mimeType,
      dataUrl: `data:${mimeType};base64,${uint8ArrayToBase64(bytes)}`,
    };
  } catch {
    // Fallback to raw data URL if EXIF injection fails
    const match = take.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    const mimeType = match?.[1] ?? 'image/png';
    const rawBase64 = match?.[2] ?? '';
    const binary = atob(rawBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { bytes, mimeType, dataUrl: take.imageUrl };
  }
}

export function getCachedPermanentPortraitLink(take: GeneratedTake): PermanentPortraitLink | null {
  return permanentLinkCache.get(buildTakeCacheKey(take)) ?? null;
}

/**
 * Persists an EXIF-tagged copy of the portrait on the studio backend and returns
 * a permanent direct image URL + rich OpenGraph share card URL.
 */
export async function createPermanentPortraitLink(
  take: GeneratedTake
): Promise<PermanentPortraitLink> {
  const cacheKey = buildTakeCacheKey(take);
  const cached = permanentLinkCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const { dataUrl } = prepareExifPortraitBytes(take);

  let response: Response;
  try {
    response = await fetch('/api/shares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageDataUrl: dataUrl,
        styleName: take.styleName,
        lightingLabel: take.lightingLabel,
        framingLabel: take.framingLabel,
        aspectRatio: take.aspectRatio,
        frameNumber: take.frameNumber,
      }),
    });
  } catch {
    throw new Error(
      'Unable to reach the Sable Studio share server. You can still copy the image directly or download PNG.'
    );
  }

  if (!response.ok) {
    const errPayload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(
      errPayload?.error ||
        'Permanent link hosting is unavailable in this environment. Use Copy Image or Download PNG instead.'
    );
  }

  const data = (await response.json()) as {
    id?: string;
    imagePath?: string;
    sharePath?: string;
  };

  if (!data.id || !data.imagePath || !data.sharePath) {
    throw new Error('Unexpected response while creating permanent portrait link.');
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const result: PermanentPortraitLink = {
    id: data.id,
    imageUrl: `${origin}${data.imagePath}`,
    pageUrl: `${origin}${data.sharePath}`,
  };

  permanentLinkCache.set(cacheKey, result);
  return result;
}

/**
 * Copies plain text to the clipboard using the async Clipboard API with a
 * hidden-textarea execCommand fallback for sandboxed iframe environments.
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to legacy textarea selection copy
    }
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard access is unavailable in this environment.');
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.className = 'fixed -top-full left-0 opacity-0 pointer-events-none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }

  if (!copied) {
    throw new Error('Browser permissions blocked clipboard copy. Select the link above and press Ctrl/Cmd+C.');
  }
}

export function supportsNativeWebShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export function buildShareablePortraitFile(take: GeneratedTake): File {
  const { bytes, mimeType } = prepareExifPortraitBytes(take);
  const filename = buildPortraitFilename(take.frameNumber, take.styleName);
  return new File([bytes.buffer as ArrayBuffer], filename, { type: mimeType });
}

/**
 * Opens the platform's native share sheet (iOS, Android, macOS, Windows) with
 * the EXIF-tagged PNG attached when file sharing is supported, or falls back
 * to sharing the permanent image/card URL.
 */
export async function sharePortraitNatively(
  take: GeneratedTake,
  permanentLink?: PermanentPortraitLink | null
): Promise<'shared' | 'cancelled'> {
  if (!supportsNativeWebShare()) {
    throw new Error(
      'Native share sheet is not available in this browser context. Copy the permanent image link or copy the image instead.'
    );
  }

  const paddedFrame = String(take.frameNumber).padStart(2, '0');
  const title = `Sable Studio — Frame ${paddedFrame} · ${take.styleName}`;
  const text = `${take.styleName} studio headshot · ${take.lightingLabel} · ${take.framingLabel}`;
  const file = buildShareablePortraitFile(take);

  const canAttachFile =
    typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  try {
    if (canAttachFile) {
      const payloadWithUrl: ShareData = {
        files: [file],
        title,
        text,
        ...(permanentLink?.pageUrl ? { url: permanentLink.pageUrl } : {}),
      };
      try {
        await navigator.share(payloadWithUrl);
        return 'shared';
      } catch (innerErr) {
        if (innerErr instanceof DOMException && innerErr.name === 'AbortError') {
          return 'cancelled';
        }
        // Some mobile browsers reject combining `files` and `url`; retry with files + text only
        await navigator.share({ files: [file], title, text });
        return 'shared';
      }
    }

    const shareUrl = permanentLink?.pageUrl || permanentLink?.imageUrl;
    await navigator.share({
      title,
      text,
      ...(shareUrl ? { url: shareUrl } : {}),
    });
    return 'shared';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return 'cancelled';
    }
    throw new Error(
      'Unable to open the native share sheet in this browser context. Copy the permanent image link below instead.'
    );
  }
}
