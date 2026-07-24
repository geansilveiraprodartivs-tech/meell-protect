// Meell Protect — fingerprint embedding & extraction utilities.
// Used by creator-download, delivery-download, and verify-file edge functions.
//
// Design:
// - fingerprint_id is a pseudonymous UUID. It NEVER carries personal data (name/email/CPF/...).
// - Resolution fingerprint -> owner/delivery/recipient happens ONLY in the backend DB.
// - Two layers per image/PDF when possible: metadata (Camada A) + content fingerprint (Camada B).
// - For formats we cannot safely modify, classify as 'tracking_only' (no binary change).

import { PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Fingerprint id generation
// ---------------------------------------------------------------------------

export function generateFingerprintId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export type ProtectionMethod =
  | "image_png_lsb"
  | "image_jpeg_meta"
  | "image_webp_riff"
  | "pdf_xmp_overlay"
  | "metadata_only"
  | "tracking_only";

export const PROTECTION_VERSION = 1;
export const MAX_ADVANCED_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB safety cap

export function classifyProtectionMethod(mime: string, sizeBytes: number): ProtectionMethod {
  const m = (mime || "").toLowerCase();
  if (m === "image/png") {
    return sizeBytes <= MAX_ADVANCED_IMAGE_BYTES ? "image_png_lsb" : "metadata_only";
  }
  if (m === "image/jpeg" || m === "image/jpg") {
    return sizeBytes <= MAX_ADVANCED_IMAGE_BYTES ? "image_jpeg_meta" : "metadata_only";
  }
  if (m === "image/webp") {
    return "image_webp_riff";
  }
  if (m === "application/pdf") {
    return sizeBytes <= MAX_ADVANCED_IMAGE_BYTES ? "pdf_xmp_overlay" : "metadata_only";
  }
  return "tracking_only";
}

export function modifiesBinary(method: ProtectionMethod): boolean {
  return method === "image_png_lsb" || method === "image_jpeg_meta" || method === "image_webp_riff" || method === "pdf_xmp_overlay";
}

// ---------------------------------------------------------------------------
// PNG fingerprint (Camada A: tEXt chunk + Camada B: LSB in pixels)
// ---------------------------------------------------------------------------

const MEELL_TAG = "MEELL_COPY_ID";
const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function readU32BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3];
}
function writeU32BE(buf: Uint8Array, off: number, val: number) {
  buf[off] = (val >>> 24) & 0xff;
  buf[off + 1] = (val >>> 16) & 0xff;
  buf[off + 2] = (val >>> 8) & 0xff;
  buf[off + 3] = val & 0xff;
}

interface PngChunk { type: string; data: Uint8Array; }

function parseChunks(bytes: Uint8Array): PngChunk[] {
  const chunks: PngChunk[] = [];
  let off = 8;
  while (off < bytes.length) {
    const len = readU32BE(bytes, off);
    const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    const data = bytes.subarray(off + 8, off + 8 + len);
    chunks.push({ type, data: new Uint8Array(data) });
    off += 8 + len + 4;
  }
  return chunks;
}

function crc32(buf: Uint8Array): number {
  let c: number;
  const table = (crc32 as any).table as number[] | undefined;
  let t: number[];
  if (!table) {
    t = new Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    (crc32 as any).table = t;
  } else {
    t = table;
  }
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function buildChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length + 4);
  writeU32BE(out, 0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcInput = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) crcInput[i] = type.charCodeAt(i);
  crcInput.set(data, 4);
  writeU32BE(out, 8 + data.length, crc32(crcInput));
  return out;
}

async function inflateZlib(compressed: Uint8Array): Promise<Uint8Array> {
  const ds = new (globalThis as any).DecompressionStream("deflate");
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(compressed);
      controller.close();
    },
  });
  const inflated = await new Response(stream.pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(inflated);
}

async function deflateZlib(data: Uint8Array): Promise<Uint8Array> {
  const cs = new (globalThis as any).CompressionStream("deflate");
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  const deflated = await new Response(stream.pipeThrough(cs)).arrayBuffer();
  return new Uint8Array(deflated);
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilter(pixels: Uint8Array, width: number, height: number, channels: number): Uint8Array {
  const stride = width * channels;
  const raw = new Uint8Array(stride * height);
  let prevRow: Int8Array | null = null;
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = pixels[src++];
    const row = new Int8Array(pixels.buffer, pixels.byteOffset + src, stride);
    const out = new Int8Array(raw.buffer, raw.byteOffset + y * stride, stride);
    if (filter === 0) {
      out.set(row);
    } else if (filter === 1) {
      for (let i = 0; i < stride; i++) {
        const left = i >= channels ? out[i - channels] : 0;
        out[i] = (row[i] + left) & 0xff;
      }
    } else if (filter === 2) {
      const up = prevRow;
      for (let i = 0; i < stride; i++) out[i] = (row[i] + (up ? up[i] : 0)) & 0xff;
    } else if (filter === 3) {
      for (let i = 0; i < stride; i++) {
        const left = i >= channels ? out[i - channels] : 0;
        const up = prevRow ? prevRow[i] : 0;
        // & 0xff converts signed Int8Array values to unsigned (0-255) before Average
        out[i] = (row[i] + (((left & 0xff) + (up & 0xff)) >> 1)) & 0xff;
      }
    } else if (filter === 4) {
      for (let i = 0; i < stride; i++) {
        const left = i >= channels ? out[i - channels] : 0;
        const up = prevRow ? prevRow[i] : 0;
        const upLeft = prevRow && i >= channels ? prevRow[i - channels] : 0;
        // & 0xff converts signed Int8Array values to unsigned (0-255) before Paeth predictor
        out[i] = (row[i] + paethPredictor(left & 0xff, up & 0xff, upLeft & 0xff)) & 0xff;
      }
    }
    prevRow = out;
    src += stride;
  }
  return raw;
}

function refilterNone(raw: Uint8Array, width: number, height: number, channels: number): Uint8Array {
  const stride = width * channels;
  const out = new Uint8Array(height * (1 + stride));
  let dst = 0;
  for (let y = 0; y < height; y++) {
    out[dst++] = 0;
    out.set(raw.subarray(y * stride, y * stride + stride), dst);
    dst += stride;
  }
  return out;
}

function buildLsbPayload(fingerprintId: string): Uint8Array {
  const fpBytes = new TextEncoder().encode(fingerprintId);
  const payload = new Uint8Array(4 + fpBytes.length + 1);
  payload[0] = 0x4d; // 'M'
  payload[1] = 0x45; // 'E'
  payload[2] = PROTECTION_VERSION & 0xff;
  payload[3] = fpBytes.length & 0xff;
  payload.set(fpBytes, 4);
  let checksum = 0;
  for (let i = 0; i < fpBytes.length; i++) checksum = (checksum + fpBytes[i]) & 0xff;
  payload[4 + fpBytes.length] = checksum & 0xff;
  return payload;
}

function bitsToBytes(bits: number[]): Uint8Array {
  const out = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) {
    out[i >> 3] |= (bits[i] & 1) << (7 - (i & 7));
  }
  return out;
}

function bytesToBits(bytes: Uint8Array): number[] {
  const bits: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    for (let b = 7; b >= 0; b--) bits.push((bytes[i] >> b) & 1);
  }
  return bits;
}

function embedLsb(raw: Uint8Array, channels: number, payload: Uint8Array): void {
  const bits = bytesToBits(payload);
  let bitIdx = 0;
  for (let i = 0; i < raw.length && bitIdx < bits.length; i += channels) {
    for (let c = 0; c < channels - 1 && bitIdx < bits.length; c++) {
      raw[i + c] = (raw[i + c] & 0xfe) | (bits[bitIdx] & 1);
      bitIdx++;
    }
  }
}

function extractLsb(raw: Uint8Array, channels: number): string | null {
  const maxBits = (4 + 64 + 1) * 8;
  const bits: number[] = [];
  for (let i = 0; i < raw.length && bits.length < maxBits; i += channels) {
    for (let c = 0; c < channels - 1 && bits.length < maxBits; c++) {
      bits.push(raw[i + c] & 1);
    }
  }
  const bytes = bitsToBytes(bits);
  if (bytes[0] !== 0x4d || bytes[1] !== 0x45) return null;
  const len = bytes[3];
  if (len === 0 || len > 64) return null;
  const fp = bytes.subarray(4, 4 + len);
  const checksum = bytes[4 + len];
  let calc = 0;
  for (let i = 0; i < fp.length; i++) calc = (calc + fp[i]) & 0xff;
  if (checksum !== calc) return null;
  return new TextDecoder().decode(fp);
}

function withTextChunk(chunks: PngChunk[], key: string, value: string): PngChunk[] {
  const filtered = chunks.filter((c) => !(c.type === "tEXt" && startsWithKey(c.data, key)));
  const kv = new TextEncoder().encode(key + "\0" + value);
  filtered.push({ type: "tEXt", data: kv });
  return filtered;
}

function startsWithKey(data: Uint8Array, key: string): boolean {
  const kb = new TextEncoder().encode(key);
  if (data.length < kb.length + 1) return false;
  for (let i = 0; i < kb.length; i++) if (data[i] !== kb[i]) return false;
  return data[kb.length] === 0;
}

function readTextChunk(data: Uint8Array): { key: string; value: string } | null {
  let nul = -1;
  for (let i = 0; i < data.length; i++) if (data[i] === 0) { nul = i; break; }
  if (nul < 0) return null;
  const key = new TextDecoder().decode(data.subarray(0, nul));
  const value = new TextDecoder().decode(data.subarray(nul + 1));
  return { key, value };
}

export async function embedPngFingerprint(bytes: Uint8Array, fingerprintId: string): Promise<Uint8Array> {
  const chunks = parseChunks(bytes);
  const ihdr = chunks.find((c) => c.type === "IHDR")!.data;
  const width = readU32BE(ihdr, 0);
  const height = readU32BE(ihdr, 4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  if (bitDepth !== 8) throw new Error("PNG bit depth other than 8 not supported");
  if (colorType !== 2 && colorType !== 6) throw new Error("PNG color type not supported (only RGB/RGBA)");

  const idatChunks = chunks.filter((c) => c.type === "IDAT");
  let total = 0;
  for (const c of idatChunks) total += c.data.length;
  const compressed = new Uint8Array(total);
  let off = 0;
  for (const c of idatChunks) { compressed.set(c.data, off); off += c.data.length; }
  const filtered = await inflateZlib(compressed);
  const channels = colorType === 6 ? 4 : 3;
  const raw = unfilter(filtered, width, height, channels);

  const payload = buildLsbPayload(fingerprintId);
  embedLsb(raw, channels, payload);

  const refiltered = refilterNone(raw, width, height, channels);
  const newCompressed = await deflateZlib(refiltered);

  const kept = chunks.filter((c) => c.type !== "IDAT" && !(c.type === "tEXt" && startsWithKey(c.data, MEELL_TAG)));
  const withText = withTextChunk(kept, MEELL_TAG, fingerprintId);
  const ordered = withText.filter((c) => c.type !== "IEND");
  ordered.push({ type: "IDAT", data: newCompressed });
  ordered.push({ type: "IEND", data: new Uint8Array(0) });

  const parts: Uint8Array[] = [PNG_SIG];
  for (const c of ordered) parts.push(buildChunk(c.type, c.data));
  let totalLen = 0;
  for (const p of parts) totalLen += p.length;
  const out = new Uint8Array(totalLen);
  off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

export async function extractPngFingerprint(bytes: Uint8Array): Promise<{ fingerprintId: string | null; layer: "metadata" | "lsb" | "none" }> {
  try {
    const chunks = parseChunks(bytes);
    for (const c of chunks) {
      if (c.type === "tEXt") {
        const kv = readTextChunk(c.data);
        if (kv && kv.key === MEELL_TAG) return { fingerprintId: kv.value, layer: "metadata" };
      }
    }
    const ihdr = chunks.find((c) => c.type === "IHDR")!.data;
    const colorType = ihdr[9];
    if (ihdr[8] !== 8 || (colorType !== 2 && colorType !== 6)) return { fingerprintId: null, layer: "none" };
    const idatChunks = chunks.filter((c) => c.type === "IDAT");
    let total = 0;
    for (const c of idatChunks) total += c.data.length;
    const compressed = new Uint8Array(total);
    let off = 0;
    for (const c of idatChunks) { compressed.set(c.data, off); off += c.data.length; }
    const filtered = await inflateZlib(compressed);
    const width = readU32BE(ihdr, 0);
    const height = readU32BE(ihdr, 4);
    const channels = colorType === 6 ? 4 : 3;
    const raw = unfilter(filtered, width, height, channels);
    const fp = extractLsb(raw, channels);
    return { fingerprintId: fp, layer: fp ? "lsb" : "none" };
  } catch {
    return { fingerprintId: null, layer: "none" };
  }
}

// ---------------------------------------------------------------------------
// JPEG fingerprint (Camada A: signed EXIF UserComment only)
// ---------------------------------------------------------------------------

function concat(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function buildExifUserCommentSegment(fingerprintId: string): Uint8Array {
  const comment = `${MEELL_TAG}=${fingerprintId}`;
  const commentBytes = new TextEncoder().encode(comment);
  const prefix = new TextEncoder().encode("ASCII\0\0\0");
  const userComment = new Uint8Array(prefix.length + commentBytes.length);
  userComment.set(prefix, 0);
  userComment.set(commentBytes, prefix.length);

  const tiffHeader = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
  const ifdCount = new Uint8Array([0x01, 0x00]);
  const entryCount = userComment.length;
  const entryCountBytes = new Uint8Array(4);
  entryCountBytes[0] = entryCount & 0xff;
  entryCountBytes[1] = (entryCount >>> 8) & 0xff;
  entryCountBytes[2] = (entryCount >>> 16) & 0xff;
  entryCountBytes[3] = (entryCount >>> 24) & 0xff;
  const valueOffset = 26;
  const valueOffsetBytes = new Uint8Array([valueOffset & 0xff, (valueOffset >>> 8) & 0xff, 0x00, 0x00]);
  const entry = new Uint8Array([
    0x86, 0x92, 0x07, 0x00, ...entryCountBytes, ...valueOffsetBytes,
  ]);
  const nextIfd = new Uint8Array([0x00, 0x00, 0x00, 0x00]);

  const exifBody = concat(tiffHeader, ifdCount, entry, nextIfd, userComment);
  const exifHeader = new TextEncoder().encode("Exif\0\0");
  const payload = concat(exifHeader, exifBody);
  const len = payload.length + 2;
  const lenBytes = new Uint8Array([(len >>> 8) & 0xff, len & 0xff]);
  const marker = new Uint8Array([0xff, 0xe1]);
  return concat(marker, lenBytes, payload);
}

function findJpegInsertOffset(bytes: Uint8Array): number {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Not a JPEG");
  return 2;
}

function removeExistingApp1Exif(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    if (i + 3 < bytes.length && bytes[i] === 0xff && bytes[i + 1] === 0xe1) {
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      const isExif = bytes[i + 4] === 0x45 && bytes[i + 5] === 0x78 && bytes[i + 6] === 0x69 && bytes[i + 7] === 0x66;
      if (isExif) { i += 2 + len; continue; }
    }
    out.push(bytes[i]);
    i++;
  }
  return new Uint8Array(out);
}

export function embedJpegFingerprint(bytes: Uint8Array, fingerprintId: string): Uint8Array {
  const cleaned = removeExistingApp1Exif(bytes);
  const seg = buildExifUserCommentSegment(fingerprintId);
  const off = findJpegInsertOffset(cleaned);
  return concat(cleaned.subarray(0, off), seg, cleaned.subarray(off));
}

export function extractJpegFingerprint(bytes: Uint8Array): { fingerprintId: string | null; layer: "metadata" | "none" } {
  try {
    let i = 0;
    while (i + 4 < bytes.length) {
      if (bytes[i] === 0xff && bytes[i + 1] === 0xe1) {
        const len = (bytes[i + 2] << 8) | bytes[i + 3];
        const seg = bytes.subarray(i + 4, i + 2 + len);
        if (seg[0] === 0x45 && seg[1] === 0x78 && seg[2] === 0x69 && seg[3] === 0x66 && seg[4] === 0 && seg[5] === 0) {
          const text = new TextDecoder("utf-8", { fatal: false }).decode(seg);
          const idx = text.indexOf(`${MEELL_TAG}=`);
          if (idx >= 0) {
            const start = idx + MEELL_TAG.length + 1;
            let end = start;
            while (end < text.length && text.charCodeAt(end) >= 32 && text.charCodeAt(end) < 127) end++;
            const fp = text.substring(start, end);
            if (fp.length > 0) return { fingerprintId: fp, layer: "metadata" };
          }
        }
        i += 2 + len;
      } else {
        i++;
      }
    }
  } catch {
    // ignore
  }
  return { fingerprintId: null, layer: "none" };
}

// ---------------------------------------------------------------------------
// WEBP fingerprint (Camada A: custom RIFF chunk "MEEP" — pixel data untouched)
// ---------------------------------------------------------------------------
// WEBP uses the RIFF container. Unknown chunk types are silently skipped by
// all conforming decoders (browsers, image viewers, editing tools), so a
// custom "MEEP" chunk does NOT corrupt the image or alter any pixel data.

function readU32LE(buf: Uint8Array, off: number): number {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | ((buf[off + 3] & 0x7f) << 24)) >>> 0;
}
function writeU32LE(buf: Uint8Array, off: number, val: number): void {
  buf[off] = val & 0xff;
  buf[off + 1] = (val >> 8) & 0xff;
  buf[off + 2] = (val >> 16) & 0xff;
  buf[off + 3] = (val >> 24) & 0xff;
}

interface WebpChunk { type: string; data: Uint8Array; }

function parseWebpChunks(bytes: Uint8Array): WebpChunk[] {
  const chunks: WebpChunk[] = [];
  let off = 12; // skip: "RIFF"(4) + size(4) + "WEBP"(4)
  while (off + 8 <= bytes.length) {
    const type = String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
    const size = readU32LE(bytes, off + 4);
    const dataEnd = off + 8 + size;
    if (dataEnd > bytes.length) break; // truncated chunk — stop safely
    chunks.push({ type, data: bytes.slice(off + 8, dataEnd) });
    off = dataEnd + (size & 1); // pad to even boundary per RIFF spec
  }
  return chunks;
}

function assembleWebp(chunks: WebpChunk[]): Uint8Array {
  let dataLen = 4; // "WEBP"
  for (const c of chunks) dataLen += 8 + c.data.length + (c.data.length & 1);
  const out = new Uint8Array(8 + dataLen); // "RIFF"(4) + size(4) + data
  out[0] = 0x52; out[1] = 0x49; out[2] = 0x46; out[3] = 0x46; // RIFF
  writeU32LE(out, 4, dataLen);
  out[8] = 0x57; out[9] = 0x45; out[10] = 0x42; out[11] = 0x50; // WEBP
  let off = 12;
  for (const c of chunks) {
    for (let i = 0; i < 4; i++) out[off + i] = c.type.charCodeAt(i);
    writeU32LE(out, off + 4, c.data.length);
    out.set(c.data, off + 8);
    off += 8 + c.data.length;
    if (c.data.length & 1) out[off++] = 0; // RIFF padding byte
  }
  return out;
}

export function embedWebpFingerprint(bytes: Uint8Array, fingerprintId: string): Uint8Array {
  if (
    bytes.length < 12 ||
    bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46 ||
    bytes[8] !== 0x57 || bytes[9] !== 0x45 || bytes[10] !== 0x42 || bytes[11] !== 0x50
  ) {
    throw new Error("Arquivo não é um WEBP válido");
  }
  const chunks = parseWebpChunks(bytes);
  const filtered = chunks.filter((c) => c.type !== "MEEP");
  filtered.push({ type: "MEEP", data: new TextEncoder().encode(fingerprintId) });
  return assembleWebp(filtered);
}

export function extractWebpFingerprint(bytes: Uint8Array): { fingerprintId: string | null; layer: "metadata" | "none" } {
  try {
    if (bytes.length < 12) return { fingerprintId: null, layer: "none" };
    const chunks = parseWebpChunks(bytes);
    for (const c of chunks) {
      if (c.type === "MEEP" && c.data.length >= 10) {
        const fp = new TextDecoder().decode(c.data).trim();
        if (fp.length >= 10) return { fingerprintId: fp, layer: "metadata" };
      }
    }
  } catch {
    // ignore parse errors
  }
  return { fingerprintId: null, layer: "none" };
}

// ---------------------------------------------------------------------------
// PDF fingerprint (Camada A: XMP metadata + Camada B: invisible text overlay)
// ---------------------------------------------------------------------------

export async function embedPdfFingerprint(bytes: Uint8Array, fingerprintId: string): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes, { updateMetadata: true });
  pdfDoc.setSubject(`MEELL_COPY_ID=${fingerprintId}`);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  for (const page of pages.slice(0, Math.min(2, pages.length))) {
    const { width } = page.getSize();
    page.drawText(`MEELL:${fingerprintId}`, {
      x: width - 2,
      y: 1,
      size: 1,
      font,
      color: rgb(0.99, 0.99, 0.99),
      opacity: 0.02,
    });
  }
  pdfDoc.setProducer("Meell Protect");
  pdfDoc.setKeywords(["MEELL_COPY_ID=" + fingerprintId]);
  const out = await pdfDoc.save({ useObjectStreams: false });
  return out as Uint8Array;
}

export async function extractPdfFingerprint(bytes: Uint8Array): Promise<{ fingerprintId: string | null; layer: "metadata" | "overlay" | "none" }> {
  try {
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const subject = pdfDoc.getSubject();
    if (subject && subject.includes("MEELL_COPY_ID=")) {
      const fp = subject.split("MEELL_COPY_ID=")[1]?.trim();
      if (fp) return { fingerprintId: fp, layer: "metadata" };
    }
    const keywords = pdfDoc.getKeywords();
    if (keywords && keywords.includes("MEELL_COPY_ID=")) {
      const fp = keywords.split("MEELL_COPY_ID=")[1]?.trim();
      if (fp) return { fingerprintId: fp, layer: "metadata" };
    }
    return { fingerprintId: null, layer: "none" };
  } catch {
    return { fingerprintId: null, layer: "none" };
  }
}

// ---------------------------------------------------------------------------
// Generic dispatcher
// ---------------------------------------------------------------------------

export interface EmbedResult {
  bytes: Uint8Array;
  method: ProtectionMethod;
  modified: boolean;
}

export async function embedFingerprint(
  bytes: Uint8Array,
  mime: string,
  fingerprintId: string
): Promise<EmbedResult> {
  const method = classifyProtectionMethod(mime, bytes.length);
  switch (method) {
    case "image_png_lsb":
      return { bytes: await embedPngFingerprint(bytes, fingerprintId), method, modified: true };
    case "image_jpeg_meta":
      return { bytes: embedJpegFingerprint(bytes, fingerprintId), method, modified: true };
    case "image_webp_riff":
      return { bytes: embedWebpFingerprint(bytes, fingerprintId), method, modified: true };
    case "pdf_xmp_overlay":
      return { bytes: await embedPdfFingerprint(bytes, fingerprintId), method, modified: true };
    case "metadata_only":
      return { bytes, method: "tracking_only", modified: false };
    default:
      return { bytes, method: "tracking_only", modified: false };
  }
}

export async function extractFingerprint(
  bytes: Uint8Array,
  mime: string
): Promise<{ fingerprintId: string | null; layer: string; method: string }> {
  const m = (mime || "").toLowerCase();
  if (m === "image/png") {
    const r = await extractPngFingerprint(bytes);
    return { fingerprintId: r.fingerprintId, layer: r.layer, method: "image_png_lsb" };
  }
  if (m === "image/jpeg" || m === "image/jpg") {
    const r = extractJpegFingerprint(bytes);
    return { fingerprintId: r.fingerprintId, layer: r.layer, method: "image_jpeg_meta" };
  }
  if (m === "image/webp") {
    const r = extractWebpFingerprint(bytes);
    return { fingerprintId: r.fingerprintId, layer: r.layer, method: "image_webp_riff" };
  }
  if (m === "application/pdf") {
    const r = await extractPdfFingerprint(bytes);
    return { fingerprintId: r.fingerprintId, layer: r.layer, method: "pdf_xmp_overlay" };
  }
  return { fingerprintId: null, layer: "none", method: "tracking_only" };
}

// Detect mime from file bytes (magic numbers) as fallback when header is missing.
export function detectMime(bytes: Uint8Array): string {
  if (bytes.length < 4) return "application/octet-stream";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return "application/pdf";
  return "application/octet-stream";
}
