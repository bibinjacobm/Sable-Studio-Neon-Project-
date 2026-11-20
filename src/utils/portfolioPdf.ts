import { jsPDF } from 'jspdf';
import {
  formatApertureFromBlur,
  getAdvancedLightingPresetById,
  getSubjectProfileById,
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
 * Normalizes a portrait data URL into a crisp JPEG sized for print/screen PDF
 * while preserving its exact natural aspect ratio and keeping PDF file sizes compact.
 */
async function preparePortraitForPdf(imageUrl: string): Promise<PreparedImage> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Unable to load portrait frame for PDF portfolio.'));
    el.src = imageUrl;
  });

  const srcW = Math.max(1, img.naturalWidth || img.width);
  const srcH = Math.max(1, img.naturalHeight || img.height);

  const maxDim = 960;
  let outW = srcW;
  let outH = srcH;
  if (Math.max(outW, outH) > maxDim) {
    const scale = maxDim / Math.max(outW, outH);
    outW = Math.max(64, Math.round(outW * scale));
    outH = Math.max(64, Math.round(outH * scale));
  }

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

function drawContainedImage(
  doc: jsPDF,
  prepared: PreparedImage,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number
): void {
  const imgAspect = prepared.width / Math.max(1, prepared.height);
  const boxAspect = boxW / Math.max(1, boxH);
  let drawW = boxW;
  let drawH = boxH;
  let drawX = boxX;
  let drawY = boxY;

  if (imgAspect > boxAspect) {
    drawW = boxW;
    drawH = boxW / imgAspect;
    drawY = boxY + (boxH - drawH) / 2;
  } else {
    drawH = boxH;
    drawW = boxH * imgAspect;
    drawX = boxX + (boxW - drawW) / 2;
  }

  doc.addImage(prepared.dataUrl, 'JPEG', drawX, drawY, drawW, drawH, undefined, 'FAST');
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
 * featuring side-by-side Before (Original Selfie) vs. After (Studio Portrait) comparison plates
 * paired with full generation metadata and styling specifications.
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
    options?.subtitle?.trim() ||
    'Before & After Darkroom Comparison · Generation & Styling Specifications';

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  doc.setProperties({
    title: `Sable Studio — ${portfolioTitle}`,
    subject: 'Before & After Editorial Headshot Portfolio & Styling Parameters',
    author: 'Sable Studio',
    creator: 'Sable Studio Editorial Darkroom',
  });

  // Palette constants (Editorial Darkroom Print Edition)
  const BG_OBSIDIAN: [number, number, number] = [12, 12, 14];
  const CARD_SURFACE: [number, number, number] = [21, 21, 24];
  const PHOTO_WELL: [number, number, number] = [10, 10, 12];
  const BORDER_HAIRLINE: [number, number, number] = [44, 44, 50];
  const BORDER_SUBTLE: [number, number, number] = [36, 36, 42];
  const BORDER_BRASS_SOFT: [number, number, number] = [122, 98, 52];
  const TEXT_IVORY: [number, number, number] = [245, 241, 232];
  const TEXT_MUTED: [number, number, number] = [155, 150, 140];
  const TEXT_DIM: [number, number, number] = [115, 110, 102];
  const ACCENT_BRASS: [number, number, number] = [212, 168, 83];

  const pageW = 210;
  const pageH = 297;
  const marginX = 14;
  const contentW = pageW - marginX * 2; // 182mm
  const rowGap = 7;

  // 2 full-width Before/After diptych comparison spreads per A4 page
  const takesPerPage = 2;
  const totalPages = Math.ceil(orderedTakes.length / takesPerPage);
  const exportDateStr = formatSessionDate(Date.now());
  const uniqueStyles = Array.from(new Set(orderedTakes.map((t) => t.styleName)));
  const uniqueRatios = Array.from(new Set(orderedTakes.map((t) => t.aspectRatio)));

  // Deduplicate image encoding by URL so shared source selfies encode once cleanly
  const imageMemo = new Map<string, Promise<PreparedImage | null>>();
  const getPreparedImage = (url: string | undefined): Promise<PreparedImage | null> => {
    if (!url) return Promise.resolve(null);
    const existing = imageMemo.get(url);
    if (existing) return existing;
    const task = preparePortraitForPdf(url).catch(() => null);
    imageMemo.set(url, task);
    return task;
  };

  const preparedPairs = await Promise.all(
    orderedTakes.map(async (take) => {
      const sourceUrl = take.alignedSourceUrl || take.sourceImageUrl;
      const [resultImg, sourceImg] = await Promise.all([
        getPreparedImage(take.imageUrl),
        getPreparedImage(sourceUrl),
      ]);
      if (!resultImg) {
        throw new Error(`Unable to encode take ${take.frameNumber} for PDF export.`);
      }
      return { resultImg, sourceImg };
    })
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

    let gridTopY = 38;

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

      const stylesSummary = `BEFORE / AFTER · ${uniqueStyles.length} ${
        uniqueStyles.length === 1 ? 'STYLE' : 'STYLES'
      }`;
      doc.text(truncateLine(doc, stylesSummary, 64), pageW - marginX, 28, { align: 'right' });

      // Signature brass hairline divider
      doc.setDrawColor(...ACCENT_BRASS);
      doc.setLineWidth(0.35);
      doc.line(marginX, 32.5, pageW - marginX, 32.5);

      gridTopY = 38;
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
      const { resultImg, sourceImg } = preparedPairs[globalIdx];

      const x = marginX;
      const y = gridTopY + localIdx * (cardH + rowGap);
      const cardW = contentW;

      // Plate container
      doc.setFillColor(...CARD_SURFACE);
      doc.setDrawColor(...BORDER_HAIRLINE);
      doc.setLineWidth(0.25);
      doc.roundedRect(x, y, cardW, cardH, 2.2, 2.2, 'FD');

      const pad = 4.5;
      const innerW = cardW - pad * 2; // 173mm
      const frameNum = String(take.frameNumber).padStart(2, '0');
      const timeStr = formatTakeTimestamp(take.createdAt);

      // Top Plate Header Strip
      const headerBaselineY = y + 7.2;
      doc.setFont('courier', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...ACCENT_BRASS);
      const takeTag = `TAKE ${frameNum}`;
      doc.text(takeTag, x + pad, headerBaselineY);

      const takeTagW = doc.getTextWidth(takeTag);
      doc.setFont('times', 'bold');
      doc.setFontSize(11.5);
      doc.setTextColor(...TEXT_IVORY);
      const titleX = x + pad + takeTagW + 3.2;
      const rightMetaStr = [
        take.retouchPrompt ? 'RETOUCHED' : null,
        take.aspectRatio,
        timeStr || null,
      ]
        .filter(Boolean)
        .join(' · ');

      doc.setFont('courier', 'normal');
      doc.setFontSize(7.2);
      const rightMetaW = doc.getTextWidth(rightMetaStr);

      doc.setFont('times', 'bold');
      doc.setFontSize(11.5);
      const maxStyleW = Math.max(40, innerW - takeTagW - rightMetaW - 10);
      doc.text(`·  ${truncateLine(doc, take.styleName, maxStyleW)}`, titleX, headerBaselineY);

      // Right-aligned format / timestamp / retouch tag
      doc.setFont('courier', take.retouchPrompt ? 'bold' : 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(...(take.retouchPrompt ? ACCENT_BRASS : TEXT_MUTED));
      doc.text(rightMetaStr, x + cardW - pad, headerBaselineY, { align: 'right' });

      // Hairline under plate header
      const ruleY = y + 10.2;
      doc.setDrawColor(...BORDER_SUBTLE);
      doc.setLineWidth(0.2);
      doc.line(x + pad, ruleY, x + cardW - pad, ruleY);

      // Main 2-Zone Body: Left Before/After Diptych (108mm) + Right Specifications Column (60mm)
      const bodyTopY = ruleY + 3.2;
      const bodyBottomY = y + cardH - pad;
      const bodyH = bodyBottomY - bodyTopY;

      const diptychW = 108;
      const colDividerGap = 5;
      const specX = x + pad + diptychW + colDividerGap;
      const specW = innerW - diptychW - colDividerGap;

      // Left Zone: Side-by-side Original vs. Studio Result comparison
      const labelBandH = 4.2;
      const imgBoxY = bodyTopY + labelBandH;
      const imgBoxH = bodyH - labelBandH;

      if (sourceImg) {
        const wellGap = 3.5;
        const wellW = (diptychW - wellGap) / 2;
        const beforeX = x + pad;
        const afterX = beforeX + wellW + wellGap;

        // Micro labels directly above each plate well
        doc.setFont('courier', 'normal');
        doc.setFontSize(6.4);
        doc.setTextColor(...TEXT_MUTED);
        doc.text('BEFORE · ORIGINAL', beforeX, bodyTopY + 2.6);

        doc.setFont('courier', 'bold');
        doc.setFontSize(6.4);
        doc.setTextColor(...ACCENT_BRASS);
        doc.text('AFTER · STUDIO', afterX, bodyTopY + 2.6);

        // Before well (Original input selfie)
        doc.setFillColor(...PHOTO_WELL);
        doc.setDrawColor(...BORDER_SUBTLE);
        doc.setLineWidth(0.22);
        doc.rect(beforeX, imgBoxY, wellW, imgBoxH, 'FD');
        drawContainedImage(doc, sourceImg, beforeX + 0.6, imgBoxY + 0.6, wellW - 1.2, imgBoxH - 1.2);

        // After well (Generated studio portrait with refined brass accent border)
        doc.setFillColor(...PHOTO_WELL);
        doc.setDrawColor(...BORDER_BRASS_SOFT);
        doc.setLineWidth(0.3);
        doc.rect(afterX, imgBoxY, wellW, imgBoxH, 'FD');
        drawContainedImage(doc, resultImg, afterX + 0.6, imgBoxY + 0.6, wellW - 1.2, imgBoxH - 1.2);
      } else {
        // Fallback single full-bay portrait when no source photo is attached
        doc.setFont('courier', 'bold');
        doc.setFontSize(6.4);
        doc.setTextColor(...ACCENT_BRASS);
        doc.text('STUDIO PORTRAIT', x + pad, bodyTopY + 2.6);

        doc.setFillColor(...PHOTO_WELL);
        doc.setDrawColor(...BORDER_BRASS_SOFT);
        doc.setLineWidth(0.3);
        doc.rect(x + pad, imgBoxY, diptychW, imgBoxH, 'FD');
        drawContainedImage(doc, resultImg, x + pad + 0.6, imgBoxY + 0.6, diptychW - 1.2, imgBoxH - 1.2);
      }

      // Vertical hairline separating imagery from specification sheet
      doc.setDrawColor(...BORDER_SUBTLE);
      doc.setLineWidth(0.2);
      doc.line(specX - colDividerGap / 2, bodyTopY, specX - colDividerGap / 2, bodyBottomY);

      // Right Zone: Styling & Generation Specifications
      let cursorY = bodyTopY + 2.6;
      doc.setFont('courier', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...ACCENT_BRASS);
      doc.text('STYLING & GENERATION SPECS', specX, cursorY);

      const recipe = take.recipe;
      const advancedPreset = getAdvancedLightingPresetById(recipe.advancedLightingPreset);
      const subjectProfile = getSubjectProfileById(recipe.subjectProfile);
      const aperture = formatApertureFromBlur(recipe.backdropBlur);
      const lightingBase =
        advancedPreset.id !== 'none' && take.lightingLabel !== advancedPreset.label
          ? `${take.lightingLabel} (${advancedPreset.label})`
          : take.lightingLabel;
      const lightingSpec = `${lightingBase} · ${subjectProfile.label}`;
      const framingSpec = recipe.smartCrop
        ? `${take.framingLabel} · Smart Crop · ${recipe.zoomAdjust.toFixed(2)}x`
        : `${take.framingLabel} · Zoom ${recipe.zoomAdjust.toFixed(2)}x`;

      const specs: Array<{ label: string; value: string; mono?: boolean }> = [
        { label: 'WARDROBE', value: take.attireLabel },
        { label: 'FRAMING', value: framingSpec },
        { label: 'LIGHTING', value: lightingSpec },
        {
          label: 'OPTICS',
          value: `DoF ${aperture} (${Math.round(recipe.backdropBlur)}px) · Key ${formatPct(
            recipe.keyLightStrength
          )} · Rim ${formatPct(recipe.rimLight)}`,
          mono: true,
        },
        {
          label: 'TONE',
          value: recipe.monochrome
            ? `Mono · Exp ${formatSigned(recipe.exposure)} · Ctr ${formatSigned(
                recipe.contrast
              )}`
            : `Exp ${formatSigned(recipe.exposure)} · Ctr ${formatSigned(
                recipe.contrast
              )} · Warm ${formatSigned(recipe.warmth)}`,
          mono: true,
        },
        {
          label: 'FINISH',
          value: `Sat ${formatSigned(recipe.saturation)} · Vig ${formatPct(
            recipe.vignette
          )} · Sharp ${formatPct(recipe.sharpen ?? 0)}`,
          mono: true,
        },
      ];

      cursorY += 5;
      for (const spec of specs) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.9);
        doc.setTextColor(...TEXT_DIM);
        doc.text(spec.label, specX, cursorY);

        cursorY += 3.2;
        doc.setFont(spec.mono ? 'courier' : 'helvetica', 'normal');
        doc.setFontSize(spec.mono ? 6.5 : 7.2);
        doc.setTextColor(...TEXT_IVORY);
        doc.text(truncateLine(doc, spec.value, specW), specX, cursorY);

        cursorY += 5.1;
      }

      // Bottom Notes Block (Retouch instruction / Director note / Facial anchor)
      const notesDividerY = Math.min(bodyBottomY - 19, cursorY - 0.8);
      doc.setDrawColor(...BORDER_SUBTLE);
      doc.setLineWidth(0.18);
      doc.line(specX, notesDividerY, specX + specW, notesDividerY);

      let noteCursorY = notesDividerY + 4;
      if (take.retouchPrompt) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.9);
        doc.setTextColor(...ACCENT_BRASS);
        doc.text('RETOUCH DIRECTION', specX, noteCursorY);
        noteCursorY += 3.2;

        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6.7);
        doc.setTextColor(...TEXT_IVORY);
        const lines = (doc.splitTextToSize(`"${take.retouchPrompt}"`, specW) as string[]).slice(
          0,
          3
        );
        doc.text(lines, specX, noteCursorY);
        noteCursorY += lines.length * 3.1 + 1.5;
      } else if (take.directorNote) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.9);
        doc.setTextColor(...TEXT_DIM);
        doc.text('DARKROOM NOTE', specX, noteCursorY);
        noteCursorY += 3.2;

        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6.6);
        doc.setTextColor(...TEXT_MUTED);
        const lines = (doc.splitTextToSize(take.directorNote, specW) as string[]).slice(0, 3);
        doc.text(lines, specX, noteCursorY);
        noteCursorY += lines.length * 3.1 + 1.5;
      }

      // Quiet Anchor Spec at the bottom of the spec column
      doc.setFont('courier', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...TEXT_DIM);
      const anchorLine = `ANCHOR X ${formatPct(take.anchor.faceCenterX)} · EYE Y ${formatPct(
        take.anchor.faceCenterY
      )} · SCALE ${formatPct(take.anchor.faceHeightRatio)}`;
      doc.text(truncateLine(doc, anchorLine, specW), specX, bodyBottomY - 0.6);
    });

    // Running Footer
    doc.setDrawColor(...BORDER_HAIRLINE);
    doc.setLineWidth(0.25);
    doc.line(marginX, footerY - 3.5, pageW - marginX, footerY - 3.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(
      'Sable Studio · Editorial Darkroom Before & After Headshot Portfolio',
      marginX,
      footerY + 1
    );

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
