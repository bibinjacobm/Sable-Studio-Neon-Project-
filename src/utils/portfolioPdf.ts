import { jsPDF } from 'jspdf';
import {
  formatApertureFromBlur,
  getAdvancedLightingPresetById,
  type GeneratedTake,
} from '../data/studioCatalog';

export interface PortfolioPdfOptions {
  title?: string;
  subtitle?: string;
}

interface PreparedImage {
  dataUrl: string;
  width: number;
  height: number;
}

function formatSigned(value: number, decimals = 2): string {
  const rounded = Number(value.toFixed(decimals));
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(decimals)}`;
}

function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatSessionDate(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function formatTakeTimestamp(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * Normalizes a portrait data URL into a clean high-resolution JPEG sized for print/screen PDF
 * so multi-take portfolios remain crisp while keeping PDF file sizes compact.
 */
async function preparePortraitForPdf(
  imageUrl: string,
  targetBoxAspect: number
): Promise<PreparedImage> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Unable to load portrait frame for PDF portfolio.'));
    el.src = imageUrl;
  });

  const srcW = Math.max(1, img.naturalWidth || img.width);
  const srcH = Math.max(1, img.naturalHeight || img.height);
  const srcAspect = srcW / srcH;

  // Preserve full portrait framing without distorting aspect ratio; cap resolution to 960px longest edge
  const maxDim = 960;
  let outW = srcW;
  let outH = srcH;
  if (Math.max(outW, outH) > maxDim) {
    const scale = maxDim / Math.max(outW, outH);
    outW = Math.max(64, Math.round(outW * scale));
    outH = Math.max(64, Math.round(outH * scale));
  }

  // If image aspect is close to target box, preserve exact framing; otherwise keep natural aspect
  // and let PDF layout center-contain cleanly inside the darkroom matte window.
  void targetBoxAspect;
  void srcAspect;

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { dataUrl: imageUrl, width: srcW, height: srcH };
  }

  ctx.fillStyle = '#0B0B0C';
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(img, 0, 0, outW, outH);

  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
    width: outW,
    height: outH,
  };
}

function slugifyFilename(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 48) || 'sable-studio-portfolio'
  );
}

function truncateLine(doc: jsPDF, text: string, maxWidthMm: number): string {
  if (doc.getTextWidth(text) <= maxWidthMm) {
    return text;
  }
  let trimmed = text;
  while (trimmed.length > 3 && doc.getTextWidth(`${trimmed}…`) > maxWidthMm) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed.trimEnd()}…`;
}

/**
 * Generates and downloads a branded Sable Studio editorial darkroom PDF contact sheet
 * aggregating the selected takes alongside their full generation metadata and styling parameters.
 */
export async function exportPortfolioPdf(
  takes: GeneratedTake[],
  options?: PortfolioPdfOptions
): Promise<void> {
  if (takes.length === 0) {
    throw new Error('Select at least one take to export a portfolio contact sheet.');
  }

  const orderedTakes = [...takes].sort((a, b) => a.frameNumber - b.frameNumber);
  const customTitle = options?.title?.trim();
  const portfolioTitle = customTitle || 'Editorial Portrait Contact Sheet';
  const portfolioSubtitle =
    options?.subtitle?.trim() || 'Curated Darkroom Portfolio · Generation & Styling Specifications';

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  doc.setProperties({
    title: `Sable Studio — ${portfolioTitle}`,
    subject: 'Editorial Headshot Contact Sheet & Styling Parameters',
    author: 'Sable Studio',
    creator: 'Sable Studio Editorial Darkroom',
  });

  // Palette constants (Editorial Darkroom Print Edition)
  const BG_OBSIDIAN: [number, number, number] = [12, 12, 14];
  const CARD_SURFACE: [number, number, number] = [21, 21, 24];
  const PHOTO_WELL: [number, number, number] = [10, 10, 12];
  const BORDER_HAIRLINE: [number, number, number] = [44, 44, 50];
  const TEXT_IVORY: [number, number, number] = [245, 241, 232];
  const TEXT_MUTED: [number, number, number] = [155, 150, 140];
  const TEXT_DIM: [number, number, number] = [115, 110, 102];
  const ACCENT_BRASS: [number, number, number] = [212, 168, 83];

  const pageW = 210;
  const pageH = 297;
  const marginX = 14;
  const contentW = pageW - marginX * 2; // 182mm
  const colGap = 6;
  const rowGap = 6;
  const cardW = (contentW - colGap) / 2; // 88mm

  const takesPerPage = 4;
  const totalPages = Math.ceil(orderedTakes.length / takesPerPage);
  const exportDateStr = formatSessionDate(Date.now());
  const uniqueStyles = Array.from(new Set(orderedTakes.map((t) => t.styleName)));
  const uniqueRatios = Array.from(new Set(orderedTakes.map((t) => t.aspectRatio)));

  // Pre-encode all selected frames cleanly before drawing pages
  const preparedImages = await Promise.all(
    orderedTakes.map((take) => preparePortraitForPdf(take.imageUrl, 82 / 64))
  );

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    if (pageIdx > 0) {
      doc.addPage('a4', 'portrait');
    }

    // Full-bleed darkroom obsidian sheet background
    doc.setFillColor(...BG_OBSIDIAN);
    doc.rect(0, 0, pageW, pageH, 'F');

    const startTakeIndex = pageIdx * takesPerPage;
    const endTakeIndex = Math.min(orderedTakes.length, startTakeIndex + takesPerPage);
    const pageTakes = orderedTakes.slice(startTakeIndex, endTakeIndex);

    let gridTopY = 39;

    if (pageIdx === 0) {
      // Branded Cover Masthead
      doc.setFont('times', 'bold');
      doc.setFontSize(19);
      doc.setTextColor(...TEXT_IVORY);
      doc.text('Sable Studio', marginX, 18.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...ACCENT_BRASS);
      doc.text(truncateLine(doc, portfolioTitle, 115), marginX, 24);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...TEXT_MUTED);
      doc.text(truncateLine(doc, portfolioSubtitle, 118), marginX, 28.5);

      // Right-aligned session metadata block
      doc.setFont('courier', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...TEXT_IVORY);
      doc.text(
        `${orderedTakes.length} ${orderedTakes.length === 1 ? 'TAKE' : 'TAKES'} · ${exportDateStr.toUpperCase()}`,
        pageW - marginX,
        18,
        { align: 'right' }
      );

      doc.setTextColor(...TEXT_MUTED);
      const ratiosSummary = `FORMATS: ${uniqueRatios.join(' / ')}`;
      doc.text(truncateLine(doc, ratiosSummary, 64), pageW - marginX, 23, { align: 'right' });

      const stylesSummary = `${uniqueStyles.length} ${
        uniqueStyles.length === 1 ? 'ENVIRONMENT' : 'ENVIRONMENTS'
      }`;
      doc.text(stylesSummary, pageW - marginX, 28, { align: 'right' });

      // Signature brass hairline divider
      doc.setDrawColor(...ACCENT_BRASS);
      doc.setLineWidth(0.35);
      doc.line(marginX, 32.5, pageW - marginX, 32.5);

      gridTopY = 37.5;
    } else {
      // Compact Continuation Running Header
      doc.setFont('times', 'bold');
      doc.setFontSize(11.5);
      doc.setTextColor(...TEXT_IVORY);
      doc.text('Sable Studio', marginX, 15.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...TEXT_MUTED);
      doc.text(`·  ${truncateLine(doc, portfolioTitle, 95)}`, marginX + 25.5, 15.5);

      doc.setFont('courier', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...ACCENT_BRASS);
      const firstFrame = String(pageTakes[0].frameNumber).padStart(2, '0');
      const lastFrame = String(pageTakes[pageTakes.length - 1].frameNumber).padStart(2, '0');
      const rangeLabel =
        firstFrame === lastFrame ? `TAKE ${firstFrame}` : `TAKES ${firstFrame}–${lastFrame}`;
      doc.text(rangeLabel, pageW - marginX, 15.5, { align: 'right' });

      doc.setDrawColor(...BORDER_HAIRLINE);
      doc.setLineWidth(0.25);
      doc.line(marginX, 19.5, pageW - marginX, 19.5);

      gridTopY = 25;
    }

    const footerY = pageH - 13;
    const availableGridH = footerY - 6 - gridTopY;
    const cardH = Math.min(118, (availableGridH - rowGap) / 2);

    pageTakes.forEach((take, localIdx) => {
      const globalIdx = startTakeIndex + localIdx;
      const prepared = preparedImages[globalIdx];
      const col = localIdx % 2;
      const row = Math.floor(localIdx / 2);

      const x = marginX + col * (cardW + colGap);
      const y = gridTopY + row * (cardH + rowGap);

      // Card container plate
      doc.setFillColor(...CARD_SURFACE);
      doc.setDrawColor(...BORDER_HAIRLINE);
      doc.setLineWidth(0.25);
      doc.roundedRect(x, y, cardW, cardH, 2, 2, 'FD');

      const pad = 3.5;
      const innerW = cardW - pad * 2;
      const frameNum = String(take.frameNumber).padStart(2, '0');
      const timeStr = formatTakeTimestamp(take.createdAt);

      // Card Top Metadata Strip (Take # + Format + Timestamp)
      doc.setFont('courier', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...ACCENT_BRASS);
      doc.text(`TAKE ${frameNum}`, x + pad, y + 5.6);

      doc.setFont('courier', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...TEXT_MUTED);
      const topRightMeta = [take.aspectRatio, timeStr].filter(Boolean).join(' · ');
      doc.text(topRightMeta, x + cardW - pad, y + 5.6, { align: 'right' });

      // Portrait Image Well (preserving aspect ratio without distortion)
      const imgBoxX = x + pad;
      const imgBoxY = y + 7.8;
      const imgBoxW = innerW;
      const imgBoxH = Math.max(52, cardH - 55);

      doc.setFillColor(...PHOTO_WELL);
      doc.setDrawColor(34, 34, 40);
      doc.setLineWidth(0.2);
      doc.rect(imgBoxX, imgBoxY, imgBoxW, imgBoxH, 'FD');

      const imgAspect = prepared.width / Math.max(1, prepared.height);
      const boxAspect = imgBoxW / imgBoxH;
      let drawW = imgBoxW;
      let drawH = imgBoxH;
      let drawX = imgBoxX;
      let drawY = imgBoxY;

      if (imgAspect > boxAspect) {
        drawW = imgBoxW;
        drawH = imgBoxW / imgAspect;
        drawY = imgBoxY + (imgBoxH - drawH) / 2;
      } else {
        drawH = imgBoxH;
        drawW = imgBoxH * imgAspect;
        drawX = imgBoxX + (imgBoxW - drawW) / 2;
      }

      doc.addImage(prepared.dataUrl, 'JPEG', drawX, drawY, drawW, drawH, undefined, 'FAST');

      // Style Heading & Retouch Indicator
      let cursorY = imgBoxY + imgBoxH + 5.2;
      doc.setFont('times', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...TEXT_IVORY);
      const titleMaxW = take.retouchPrompt ? innerW - 19 : innerW;
      doc.text(truncateLine(doc, take.styleName, titleMaxW), x + pad, cursorY);

      if (take.retouchPrompt) {
        doc.setFont('courier', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...ACCENT_BRASS);
        doc.text('RETOUCHED', x + cardW - pad, cursorY - 0.3, { align: 'right' });
      }

      // Subtle hairline below style heading
      cursorY += 2.2;
      doc.setDrawColor(38, 38, 44);
      doc.setLineWidth(0.2);
      doc.line(x + pad, cursorY, x + cardW - pad, cursorY);

      // Styling & Generation Parameters
      const recipe = take.recipe;
      const advancedPreset = getAdvancedLightingPresetById(recipe.advancedLightingPreset);
      const aperture = formatApertureFromBlur(recipe.backdropBlur);
      const lightingSpec =
        advancedPreset.id !== 'none'
          ? `${take.lightingLabel} (${advancedPreset.label})`
          : take.lightingLabel;
      const framingSpec = recipe.smartCrop
        ? `${take.framingLabel} · Smart Crop`
        : take.framingLabel;

      const labelColW = 16.5;
      const valueX = x + pad + labelColW;
      const valueMaxW = innerW - labelColW;

      const rows: Array<{ label: string; value: string; mono?: boolean }> = [
        {
          label: 'Wardrobe',
          value: take.attireLabel,
        },
        {
          label: 'Framing',
          value: `${framingSpec} · Zoom ${recipe.zoomAdjust.toFixed(2)}x`,
        },
        {
          label: 'Lighting',
          value: lightingSpec,
        },
        {
          label: 'Optics',
          value: `DoF ${aperture} (${Math.round(recipe.backdropBlur)}px) · Key ${formatPct(
            recipe.keyLightStrength
          )} · Rim ${formatPct(recipe.rimLight)}`,
          mono: true,
        },
        {
          label: 'Tone',
          value: recipe.monochrome
            ? `Mono · Exp ${formatSigned(recipe.exposure)} · Ctr ${formatSigned(
                recipe.contrast
              )} · Grain ${formatPct(recipe.grain)}`
            : `Exp ${formatSigned(recipe.exposure)} · Ctr ${formatSigned(
                recipe.contrast
              )} · Warm ${formatSigned(recipe.warmth)} · Sat ${formatSigned(recipe.saturation)}`,
          mono: true,
        },
        {
          label: 'Finish',
          value: `Vig ${formatPct(recipe.vignette)} · Grain ${formatPct(
            recipe.grain
          )} · Sharp ${formatPct(recipe.sharpen ?? 0)}`,
          mono: true,
        },
      ];

      cursorY += 3.8;
      const lineStep = 4.1;

      for (const spec of rows) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.6);
        doc.setTextColor(...TEXT_DIM);
        doc.text(spec.label, x + pad, cursorY);

        doc.setFont(spec.mono ? 'courier' : 'helvetica', 'normal');
        doc.setFontSize(spec.mono ? 6.4 : 6.9);
        doc.setTextColor(...TEXT_IVORY);
        doc.text(truncateLine(doc, spec.value, valueMaxW), valueX, cursorY);
        cursorY += lineStep;
      }

      // Retouch prompt or director note caption at bottom of plate
      const noteText = take.retouchPrompt
        ? `Retouch: "${take.retouchPrompt}"`
        : take.directorNote
          ? `Note: ${take.directorNote}`
          : `Anchor: Face X ${formatPct(take.anchor.faceCenterX)} · Eye Y ${formatPct(
              take.anchor.faceCenterY
            )} · Scale ${formatPct(take.anchor.faceHeightRatio)}`;

      const bottomCapY = y + cardH - 3.6;
      doc.setDrawColor(34, 34, 40);
      doc.setLineWidth(0.18);
      doc.line(x + pad, bottomCapY - 3.6, x + cardW - pad, bottomCapY - 3.6);

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6.5);
      doc.setTextColor(...(take.retouchPrompt ? ACCENT_BRASS : TEXT_MUTED));
      doc.text(truncateLine(doc, noteText, innerW), x + pad, bottomCapY);
    });

    // Running Footer
    doc.setDrawColor(...BORDER_HAIRLINE);
    doc.setLineWidth(0.25);
    doc.line(marginX, footerY - 3.5, pageW - marginX, footerY - 3.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Sable Studio · Editorial Darkroom Headshot Portfolio', marginX, footerY + 1);

    doc.setFont('courier', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...TEXT_IVORY);
    doc.text(`PAGE ${pageIdx + 1} OF ${totalPages}`, pageW - marginX, footerY + 1, {
      align: 'right',
    });
  }

  const baseName = customTitle
    ? `sable-studio-${slugifyFilename(customTitle)}`
    : 'sable-studio-portfolio';
  const unit = orderedTakes.length === 1 ? 'take' : 'takes';
  doc.save(`${baseName}-${orderedTakes.length}-${unit}.pdf`);
}
