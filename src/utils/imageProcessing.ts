import type { SourcePortrait } from '../data/studioCatalog';

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_RAW_BYTES = 20 * 1024 * 1024;
const MAX_DIMENSION = 1536;

export function parseDataUrl(dataUrl: string): { base64: string; mimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return { base64: dataUrl, mimeType: 'image/png' };
  }
  return { mimeType: match[1], base64: match[2] };
}

export async function processSelfieFile(file: File): Promise<SourcePortrait> {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new Error('Please upload a JPEG, PNG, or WebP photograph.');
  }
  if (file.size > MAX_RAW_BYTES) {
    throw new Error('Image exceeds the 20 MB upload limit. Please select a smaller file.');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The selected file does not appear to be a valid image.'));
    image.src = rawDataUrl;
  });

  let targetWidth = img.naturalWidth;
  let targetHeight = img.naturalHeight;

  if (Math.max(targetWidth, targetHeight) > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(targetWidth, targetHeight);
    targetWidth = Math.round(targetWidth * scale);
    targetHeight = Math.round(targetHeight * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const parsed = parseDataUrl(rawDataUrl);
    return {
      dataUrl: rawDataUrl,
      base64: parsed.base64,
      mimeType: parsed.mimeType,
      fileName: file.name,
      width: img.naturalWidth,
      height: img.naturalHeight,
    };
  }

  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  const outputMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const normalizedDataUrl = canvas.toDataURL(outputMime, 0.92);
  const { base64, mimeType } = parseDataUrl(normalizedDataUrl);

  return {
    dataUrl: normalizedDataUrl,
    base64,
    mimeType,
    fileName: file.name,
    width: targetWidth,
    height: targetHeight,
  };
}

export function downloadPortrait(imageUrl: string, frameNumber: number, styleName: string): void {
  const slug = styleName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const padded = String(frameNumber).padStart(2, '0');
  const link = document.createElement('a');
  link.href = imageUrl;
  link.download = `sable-studio-frame-${padded}-${slug}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
