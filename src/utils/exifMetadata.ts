export interface PortraitExifMetadata {
  brand?: string;
  styleName: string;
  lightingLabel: string;
  framingLabel?: string;
  attireLabel?: string;
  aspectRatio?: string;
  frameNumber?: number;
  retouchPrompt?: string;
  createdAt?: number;
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const EXIF_APP1_PREFIX = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]); // "Exif\0\0"

// Precomputed IEEE 802.3 CRC-32 table for PNG chunk integrity
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function sanitizeAscii(input: string, maxLength = 512): string {
  const normalized = input
    .replace(/[—–]/g, '-')
    .replace(/[·•]/g, '|')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.slice(0, maxLength);
}

function encodeAsciiBytes(text: string, nullTerminate: boolean): Uint8Array {
  const clean = sanitizeAscii(text);
  const out = new Uint8Array(clean.length + (nullTerminate ? 1 : 0));
  for (let i = 0; i < clean.length; i++) {
    out[i] = clean.charCodeAt(i) & 0x7f;
  }
  if (nullTerminate) {
    out[clean.length] = 0;
  }
  return out;
}

function formatExifDateTime(timestamp?: number): string {
  const d = new Date(timestamp ?? Date.now());
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function buildDescriptionSummary(metadata: PortraitExifMetadata): string {
  const brand = sanitizeAscii(metadata.brand ?? 'Sable Studio', 64) || 'Sable Studio';
  const parts: string[] = [
    `${brand} Headshot`,
    `Style: ${sanitizeAscii(metadata.styleName, 80)}`,
    `Lighting: ${sanitizeAscii(metadata.lightingLabel, 80)}`,
  ];
  if (metadata.framingLabel) {
    parts.push(`Framing: ${sanitizeAscii(metadata.framingLabel, 60)}`);
  }
  if (metadata.attireLabel) {
    parts.push(`Attire: ${sanitizeAscii(metadata.attireLabel, 60)}`);
  }
  if (metadata.aspectRatio) {
    parts.push(`Aspect: ${sanitizeAscii(metadata.aspectRatio, 16)}`);
  }
  if (typeof metadata.frameNumber === 'number') {
    parts.push(`Frame: ${String(metadata.frameNumber).padStart(2, '0')}`);
  }
  if (metadata.retouchPrompt) {
    parts.push(`Retouch: ${sanitizeAscii(metadata.retouchPrompt, 140)}`);
  }
  return parts.join(' | ');
}

interface TiffEntrySpec {
  tag: number;
  type: 2 | 4 | 7; // 2 = ASCII, 4 = LONG, 7 = UNDEFINED
  count: number;
  bytes?: Uint8Array;
  longValue?: number;
}

function writeIfdBlock(
  view: DataView,
  out: Uint8Array,
  ifdOffset: number,
  entries: TiffEntrySpec[],
  dataCursorStart: number
): number {
  const sorted = [...entries].sort((a, b) => a.tag - b.tag);
  view.setUint16(ifdOffset, sorted.length, false);

  let entryPos = ifdOffset + 2;
  let dataCursor = dataCursorStart;

  for (const entry of sorted) {
    view.setUint16(entryPos, entry.tag, false);
    view.setUint16(entryPos + 2, entry.type, false);
    view.setUint32(entryPos + 4, entry.count, false);

    if (entry.type === 4) {
      view.setUint32(entryPos + 8, (entry.longValue ?? 0) >>> 0, false);
    } else {
      const payload = entry.bytes ?? new Uint8Array(0);
      if (payload.length <= 4) {
        for (let i = 0; i < 4; i++) {
          out[entryPos + 8 + i] = i < payload.length ? payload[i] : 0;
        }
      } else {
        // Align multi-byte TIFF values to even byte boundaries
        if ((dataCursor & 1) !== 0) {
          dataCursor += 1;
        }
        view.setUint32(entryPos + 8, dataCursor, false);
        out.set(payload, dataCursor);
        dataCursor += payload.length;
      }
    }

    entryPos += 12;
  }

  // Next IFD offset = 0 (single primary image IFD)
  view.setUint32(entryPos, 0, false);
  return dataCursor;
}

function measureExternalBytes(entries: TiffEntrySpec[], startCursor: number): number {
  let cursor = startCursor;
  for (const entry of entries) {
    if (entry.type !== 4 && entry.bytes && entry.bytes.length > 4) {
      if ((cursor & 1) !== 0) cursor += 1;
      cursor += entry.bytes.length;
    }
  }
  return cursor;
}

/**
 * Build a spec-compliant Big-Endian (MM) TIFF 6.0 / EXIF 2.32 binary payload
 * containing Sable Studio branding and style/lighting tags across IFD0 and Exif Sub-IFD.
 */
export function buildExifPayload(metadata: PortraitExifMetadata): Uint8Array {
  const brand = sanitizeAscii(metadata.brand ?? 'Sable Studio', 64) || 'Sable Studio';
  const styleText = sanitizeAscii(metadata.styleName, 80);
  const lightingText = sanitizeAscii(metadata.lightingLabel, 80);
  const description = buildDescriptionSummary(metadata);
  const modelText = `${brand} (${styleText} / ${lightingText})`;
  const dateTimeStr = formatExifDateTime(metadata.createdAt);

  const descriptionBytes = encodeAsciiBytes(description, true);
  const makeBytes = encodeAsciiBytes(brand, true);
  const modelBytes = encodeAsciiBytes(modelText, true);
  const softwareBytes = encodeAsciiBytes(`${brand} Editorial Darkroom`, true);
  const dateTimeBytes = encodeAsciiBytes(dateTimeStr, true);
  const artistBytes = encodeAsciiBytes(brand, true);
  const copyrightBytes = encodeAsciiBytes(brand, true);

  // EXIF UserComment (0x9286): 8-byte ASCII charset header + payload text
  const commentPayload = encodeAsciiBytes(description, false);
  const userCommentBytes = new Uint8Array(8 + commentPayload.length);
  userCommentBytes.set([0x41, 0x53, 0x43, 0x49, 0x49, 0x00, 0x00, 0x00], 0); // "ASCII\0\0\0"
  userCommentBytes.set(commentPayload, 8);

  const exifVersionBytes = new Uint8Array([0x30, 0x32, 0x33, 0x32]); // "0232"

  // Exif Sub-IFD entries (sorted by tag ID)
  const exifEntries: TiffEntrySpec[] = [
    { tag: 0x9000, type: 7, count: 4, bytes: exifVersionBytes }, // ExifVersion
    { tag: 0x9003, type: 2, count: dateTimeBytes.length, bytes: dateTimeBytes }, // DateTimeOriginal
    { tag: 0x9004, type: 2, count: dateTimeBytes.length, bytes: dateTimeBytes }, // DateTimeDigitized
    { tag: 0x9286, type: 7, count: userCommentBytes.length, bytes: userCommentBytes }, // UserComment
  ];

  // Placeholder IFD0 entries to compute exact byte offsets
  const ifd0Offset = 8;
  const ifd0EntryCount = 8;
  const ifd0Size = 2 + ifd0EntryCount * 12 + 4;

  const ifd0BaseEntries: TiffEntrySpec[] = [
    { tag: 0x010e, type: 2, count: descriptionBytes.length, bytes: descriptionBytes }, // ImageDescription
    { tag: 0x010f, type: 2, count: makeBytes.length, bytes: makeBytes }, // Make
    { tag: 0x0110, type: 2, count: modelBytes.length, bytes: modelBytes }, // Model
    { tag: 0x0131, type: 2, count: softwareBytes.length, bytes: softwareBytes }, // Software
    { tag: 0x0132, type: 2, count: dateTimeBytes.length, bytes: dateTimeBytes }, // DateTime
    { tag: 0x013b, type: 2, count: artistBytes.length, bytes: artistBytes }, // Artist
    { tag: 0x8298, type: 2, count: copyrightBytes.length, bytes: copyrightBytes }, // Copyright
  ];

  let exifIfdOffset = measureExternalBytes(ifd0BaseEntries, ifd0Offset + ifd0Size);
  if ((exifIfdOffset & 1) !== 0) {
    exifIfdOffset += 1;
  }

  const ifd0Entries: TiffEntrySpec[] = [
    ...ifd0BaseEntries,
    { tag: 0x8769, type: 4, count: 1, longValue: exifIfdOffset }, // ExifIFDPointer
  ];

  const exifIfdSize = 2 + exifEntries.length * 12 + 4;
  const totalSize = measureExternalBytes(exifEntries, exifIfdOffset + exifIfdSize);

  const buffer = new Uint8Array(totalSize);
  const view = new DataView(buffer.buffer);

  // TIFF Header: Big-Endian ("MM"), Magic 42, Offset to IFD0 = 8
  buffer[0] = 0x4d;
  buffer[1] = 0x4d;
  view.setUint16(2, 42, false);
  view.setUint32(4, ifd0Offset, false);

  writeIfdBlock(view, buffer, ifd0Offset, ifd0Entries, ifd0Offset + ifd0Size);
  writeIfdBlock(view, buffer, exifIfdOffset, exifEntries, exifIfdOffset + exifIfdSize);

  return buffer;
}

function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function makePngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) {
    chunk[4 + i] = type.charCodeAt(i) & 0x7f;
  }
  chunk.set(data, 8);
  const checksum = crc32(chunk.subarray(4, 8 + data.length));
  view.setUint32(8 + data.length, checksum, false);
  return chunk;
}

function makePngTextChunk(keyword: string, value: string): Uint8Array {
  const keyBytes = encodeAsciiBytes(keyword, true); // includes null separator
  const valBytes = encodeAsciiBytes(value, false);
  const payload = new Uint8Array(keyBytes.length + valBytes.length);
  payload.set(keyBytes, 0);
  payload.set(valBytes, keyBytes.length);
  return makePngChunk('tEXt', payload);
}

function injectIntoPng(bytes: Uint8Array, metadata: PortraitExifMetadata): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 33) return bytes;

  // Verify first chunk is IHDR
  const ihdrLen = view.getUint32(8, false);
  const ihdrEnd = 8 + 12 + ihdrLen;
  if (ihdrEnd > bytes.length) return bytes;

  const brand = sanitizeAscii(metadata.brand ?? 'Sable Studio', 64) || 'Sable Studio';
  const description = buildDescriptionSummary(metadata);
  const exifChunk = makePngChunk('eXIf', buildExifPayload(metadata));
  const textChunks = [
    makePngTextChunk('Software', `${brand} Editorial Darkroom`),
    makePngTextChunk('Artist', brand),
    makePngTextChunk('Description', description),
    makePngTextChunk('Comment', `Style=${sanitizeAscii(metadata.styleName, 80)}; Lighting=${sanitizeAscii(metadata.lightingLabel, 80)}`),
  ];

  // Collect existing non-eXIf chunks after IHDR to avoid duplicate eXIf chunks
  const trailingChunks: Uint8Array[] = [];
  let offset = ihdrEnd;
  while (offset + 12 <= bytes.length) {
    const chunkLen = view.getUint32(offset, false);
    const chunkEnd = offset + 12 + chunkLen;
    if (chunkEnd > bytes.length) {
      return bytes; // Malformed PNG; return untouched
    }
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );
    if (type !== 'eXIf') {
      trailingChunks.push(bytes.subarray(offset, chunkEnd));
    }
    offset = chunkEnd;
  }

  const parts: Uint8Array[] = [
    bytes.subarray(0, ihdrEnd),
    exifChunk,
    ...textChunks,
    ...trailingChunks,
  ];
  const totalLen = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLen);
  let cursor = 0;
  for (const part of parts) {
    result.set(part, cursor);
    cursor += part.length;
  }
  return result;
}

function injectIntoJpeg(bytes: Uint8Array, metadata: PortraitExifMetadata): Uint8Array {
  const exifPayload = buildExifPayload(metadata);
  const app1DataLen = EXIF_APP1_PREFIX.length + exifPayload.length;
  const app1Segment = new Uint8Array(4 + app1DataLen);
  app1Segment[0] = 0xff;
  app1Segment[1] = 0xe1;
  app1Segment[2] = ((app1DataLen + 2) >>> 8) & 0xff;
  app1Segment[3] = (app1DataLen + 2) & 0xff;
  app1Segment.set(EXIF_APP1_PREFIX, 4);
  app1Segment.set(exifPayload, 4 + EXIF_APP1_PREFIX.length);

  // Locate insertion point after SOI (and optional JFIF APP0), stripping any prior EXIF APP1
  let pos = 2;
  const prefixParts: Uint8Array[] = [bytes.subarray(0, 2)];

  while (pos + 4 <= bytes.length && bytes[pos] === 0xff) {
    const marker = bytes[pos + 1];
    if (marker === 0xda || marker === 0xd9) {
      break;
    }
    const segLen = (bytes[pos + 2] << 8) | bytes[pos + 3];
    const segEnd = pos + 2 + segLen;
    if (segLen < 2 || segEnd > bytes.length) {
      break;
    }

    if (marker === 0xe0) {
      // Preserve JFIF APP0 before APP1
      prefixParts.push(bytes.subarray(pos, segEnd));
      pos = segEnd;
    } else if (
      marker === 0xe1 &&
      segEnd - (pos + 4) >= 6 &&
      bytes[pos + 4] === 0x45 &&
      bytes[pos + 5] === 0x78 &&
      bytes[pos + 6] === 0x69 &&
      bytes[pos + 7] === 0x66 &&
      bytes[pos + 8] === 0x00 &&
      bytes[pos + 9] === 0x00
    ) {
      // Skip existing EXIF APP1 segment so it is cleanly replaced
      pos = segEnd;
    } else {
      break;
    }
  }

  const tail = bytes.subarray(pos);
  const totalLen =
    prefixParts.reduce((sum, p) => sum + p.length, 0) + app1Segment.length + tail.length;
  const result = new Uint8Array(totalLen);
  let cursor = 0;
  for (const part of prefixParts) {
    result.set(part, cursor);
    cursor += part.length;
  }
  result.set(app1Segment, cursor);
  cursor += app1Segment.length;
  result.set(tail, cursor);
  return result;
}

/**
 * Inject standard EXIF metadata (Sable Studio branding + style/lighting tags) directly into
 * PNG (eXIf + tEXt chunks) or JPEG (APP1 Exif segment) binary image bytes.
 */
export function injectExifIntoImageBytes(
  bytes: Uint8Array,
  metadata: PortraitExifMetadata
): Uint8Array {
  if (isPng(bytes)) {
    return injectIntoPng(bytes, metadata);
  }
  if (isJpeg(bytes)) {
    return injectIntoJpeg(bytes, metadata);
  }
  return bytes;
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decode a PNG or JPEG data URL and return binary bytes enriched with standard EXIF tags.
 */
export function injectExifIntoDataUrl(
  dataUrl: string,
  metadata: PortraitExifMetadata
): { bytes: Uint8Array; mimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = match ? match[1] : 'image/png';
  const base64 = match ? match[2] : dataUrl;
  const rawBytes = base64ToUint8Array(base64);
  return {
    bytes: injectExifIntoImageBytes(rawBytes, metadata),
    mimeType,
  };
}
