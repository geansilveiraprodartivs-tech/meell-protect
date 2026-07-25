// --- Inlined: _shared/cors.ts ---
const ALLOWED_ORIGINS = [
  "https://geansilveiraprodartivs-tech.github.io",
  "https://meell-protect--geansilveira.replit.app",
  "https://unykxswtuosarguhiflh.supabase.co",
  "http://localhost:5173",
  "http://localhost:5000",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  };
}

// --- Inlined: _shared/rate-limit.ts ---
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanupRateLimit(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(key);
  }
}

function rateLimit(
  req: Request,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  cleanupRateLimit(now);
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  const entry = rateLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  entry.count += 1;
  if (entry.count > maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }
  return { allowed: true };
}

// --- Inlined: _shared/sanitize.ts ---
function sanitizeInput(input: string): string {
  return input.replace(/[<>]/g, '').trim().slice(0, 500);
}

// --- Inlined: _shared/protection.ts ---
// Meell Protect — fingerprint embedding & extraction utilities.

import { PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Fingerprint id generation
// ---------------------------------------------------------------------------

function generateFingerprintId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

type ProtectionMethod =
  | "image_png_lsb"
  | "image_jpeg_meta"
  | "image_webp_riff"
  | "pdf_xmp_overlay"
  | "metadata_only"
  | "tracking_only";

const PROTECTION_VERSION = 1;
const MAX_ADVANCED_IMAGE_BYTES = 15 * 1024 * 1024;

function classifyProtectionMethod(mime: string, sizeBytes: number): ProtectionMethod {
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

function modifiesBinary(method: ProtectionMethod): boolean {
  return method === "image_png_lsb" || method === "image_jpeg_meta" || method === "image_webp_riff" || method === "pdf_xmp_overlay";
}

// ---------------------------------------------------------------------------
// PNG fingerprint
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
        out[i] = (row[i] + (((left & 0xff) + (up & 0xff)) >> 1)) & 0xff;
      }
    } else if (filter === 4) {
      for (let i = 0; i < stride; i++) {
        const left = i >= channels ? out[i - channels] : 0;
        const up = prevRow ? prevRow[i] : 0;
        const upLeft = prevRow && i >= channels ? prevRow[i - channels] : 0;
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
  payload[0] = 0x4d;
  payload[1] = 0x45;
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

async function embedPngFingerprint(bytes: Uint8Array, fingerprintId: string): Promise<Uint8Array> {
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

async function extractPngFingerprint(bytes: Uint8Array): Promise<{ fingerprintId: string | null; layer: "metadata" | "lsb" | "none" }> {
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
// JPEG fingerprint
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

function embedJpegFingerprint(bytes: Uint8Array, fingerprintId: string): Uint8Array {
  const cleaned = removeExistingApp1Exif(bytes);
  const seg = buildExifUserCommentSegment(fingerprintId);
  const off = findJpegInsertOffset(cleaned);
  return concat(cleaned.subarray(0, off), seg, cleaned.subarray(off));
}

function extractJpegFingerprint(bytes: Uint8Array): { fingerprintId: string | null; layer: "metadata" | "none" } {
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
// WEBP fingerprint
// ---------------------------------------------------------------------------

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
  let off = 12;
  while (off + 8 <= bytes.length) {
    const type = String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
    const size = readU32LE(bytes, off + 4);
    const dataEnd = off + 8 + size;
    if (dataEnd > bytes.length) break;
    chunks.push({ type, data: bytes.slice(off + 8, dataEnd) });
    off = dataEnd + (size & 1);
  }
  return chunks;
}

function assembleWebp(chunks: WebpChunk[]): Uint8Array {
  let dataLen = 4;
  for (const c of chunks) dataLen += 8 + c.data.length + (c.data.length & 1);
  const out = new Uint8Array(8 + dataLen);
  out[0] = 0x52; out[1] = 0x49; out[2] = 0x46; out[3] = 0x46;
  writeU32LE(out, 4, dataLen);
  out[8] = 0x57; out[9] = 0x45; out[10] = 0x42; out[11] = 0x50;
  let off = 12;
  for (const c of chunks) {
    for (let i = 0; i < 4; i++) out[off + i] = c.type.charCodeAt(i);
    writeU32LE(out, off + 4, c.data.length);
    out.set(c.data, off + 8);
    off += 8 + c.data.length;
    if (c.data.length & 1) out[off++] = 0;
  }
  return out;
}

function embedWebpFingerprint(bytes: Uint8Array, fingerprintId: string): Uint8Array {
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

function extractWebpFingerprint(bytes: Uint8Array): { fingerprintId: string | null; layer: "metadata" | "none" } {
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
// PDF fingerprint
// ---------------------------------------------------------------------------

async function embedPdfFingerprint(bytes: Uint8Array, fingerprintId: string): Promise<Uint8Array> {
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

async function extractPdfFingerprint(bytes: Uint8Array): Promise<{ fingerprintId: string | null; layer: "metadata" | "overlay" | "none" }> {
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

interface EmbedResult {
  bytes: Uint8Array;
  method: ProtectionMethod;
  modified: boolean;
}

async function embedFingerprint(
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

async function extractFingerprint(
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

function detectMime(bytes: Uint8Array): string {
  if (bytes.length < 4) return "application/octet-stream";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return "application/pdf";
  return "application/octet-stream";
}

// --- Original function code ---
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

function genToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const rl = rateLimit(req, 10, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ ok: false, error: `Rate limit exceeded. Try again in ${rl.retryAfter}s` }), {
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { token, recipient_name, recipient_email } = await req.json();

    if (!token || !recipient_name || !recipient_email) {
      return new Response(JSON.stringify({ ok: false, error: "Campos obrigatórios: token, recipient_name, recipient_email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safeName = sanitizeInput(recipient_name);
    const safeEmail = sanitizeInput(recipient_email);

    // Use service role — all operations are owner-initiated via authenticated endpoint
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Find and validate source delivery
    const { data: delivery, error: dlErr } = await supabase
      .from("deliveries")
      .select("*, file:protected_files(*), client:clients(*)")
      .eq("secure_token", token)
      .maybeSingle();

    if (dlErr || !delivery) {
      return new Response(JSON.stringify({ ok: false, error: "Entrega não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (delivery.revoked) {
      return new Response(JSON.stringify({ ok: false, error: "Esta entrega foi revogada e não pode ser compartilhada" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (delivery.expires_at && new Date(delivery.expires_at) < new Date()) {
      return new Response(JSON.stringify({ ok: false, error: "Esta entrega expirou" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (delivery.allow_resharing === false) {
      return new Response(JSON.stringify({ ok: false, error: "O reenvio foi desativado pelo criador para esta entrega" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check resharing depth (max 3 levels)
    let depth = 0;
    let currentId: string | null = delivery.id;
    while (currentId && depth < 4) {
      const { data: parent } = await supabase
        .from("deliveries")
        .select("parent_delivery_id")
        .eq("id", currentId)
        .maybeSingle();
      if (!parent?.parent_delivery_id) break;
      depth++;
      currentId = parent.parent_delivery_id;
    }
    if (depth >= 3) {
      return new Response(JSON.stringify({ ok: false, error: "Limite de compartilhamentos atingido (máximo 3 níveis)" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const file = delivery.file;
    const sharer = delivery.client; // the person doing the resharing
    if (!file || !sharer) {
      return new Response(JSON.stringify({ ok: false, error: "Dados da entrega incompletos" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ownerUserId: string = file.user_id;

    // 2. Find or create recipient client under file owner
    const recipientEmailNorm = safeEmail.toLowerCase();
    let recipientClient: any = null;

    const { data: existingClient } = await supabase
      .from("clients")
      .select("*")
      .eq("user_id", ownerUserId)
      .eq("email", recipientEmailNorm)
      .maybeSingle();

    if (existingClient) {
      recipientClient = existingClient;
    } else {
      const { data: newClient, error: clientErr } = await supabase
        .from("clients")
        .insert({
          user_id: ownerUserId,
          name: safeName,
          email: recipientEmailNorm,
          notes: `Adicionado automaticamente via compartilhamento por ${sharer.name}`,
        })
        .select("*")
        .maybeSingle();

      if (clientErr || !newClient) {
        return new Response(JSON.stringify({ ok: false, error: "Falha ao criar destinatário: " + (clientErr?.message ?? "erro desconhecido") }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      recipientClient = newClient;
    }

    // 3. Get source copy_id from this delivery (most recent copy)
    const { data: sourceCopy } = await supabase
      .from("delivery_copies")
      .select("copy_id")
      .eq("delivery_id", delivery.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const parentCopyId: string | null = sourceCopy?.copy_id ?? delivery.copy_id ?? null;

    // 4. Create new delivery for the recipient
    const newToken = genToken();
    const { data: newDelivery, error: newDlErr } = await supabase
      .from("deliveries")
      .insert({
        file_id: file.id,
        client_id: recipientClient.id,
        secure_token: newToken,
        download_limit: delivery.download_limit,
        expires_at: delivery.expires_at,
        revoked: false,
        protection_mode: delivery.protection_mode ?? "default",
        watermark_config: delivery.watermark_config,
        parent_delivery_id: delivery.id,
        allow_resharing: true,
      })
      .select("*")
      .maybeSingle();

    if (newDlErr || !newDelivery) {
      return new Response(JSON.stringify({ ok: false, error: "Falha ao criar entrega: " + (newDlErr?.message ?? "erro") }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Download original file
    const { data: fileBlob, error: blobErr } = await supabase.storage
      .from("protected-files")
      .download(file.storage_path);

    if (blobErr || !fileBlob) {
      return new Response(JSON.stringify({ ok: false, error: "Arquivo original não encontrado no storage" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const originalBytes = new Uint8Array(await fileBlob.arrayBuffer());
    const originalHash = file.original_hash || await sha256Hex(originalBytes);
    const method = classifyProtectionMethod(file.mime_type, originalBytes.length);

    // For non-binary-fingerprint formats, create delivery but skip copy
    if (method === "tracking_only" || method === "metadata_only") {
      await supabase.from("delivery_events").insert({
        delivery_id: delivery.id,
        event_type: "shared",
        actor_id: null,
        meta: {
          shared_by_client_id: sharer.id,
          shared_by_name: sharer.name,
          shared_with_client_id: recipientClient.id,
          shared_with_name: recipientClient.name,
          new_delivery_id: newDelivery.id,
          note: "format_not_fingerprinted",
        },
      });
      return new Response(JSON.stringify({
        ok: true,
        new_token: newToken,
        new_copy_id: null,
        recipient_name: recipientClient.name,
        warning: "Este formato não suporta fingerprint binário. A entrega foi criada sem cópia protegida individualizada.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 6. Embed new fingerprint into the original file
    const fingerprintId = generateFingerprintId();
    const { bytes: protectedBytes, modified } = await embedFingerprint(originalBytes, file.mime_type, fingerprintId);

    if (!modified) {
      await supabase.from("delivery_events").insert({
        delivery_id: delivery.id,
        event_type: "shared",
        actor_id: null,
        meta: {
          shared_by_client_id: sharer.id,
          shared_by_name: sharer.name,
          shared_with_client_id: recipientClient.id,
          shared_with_name: recipientClient.name,
          new_delivery_id: newDelivery.id,
          note: "fingerprint_embed_failed",
        },
      });
      return new Response(JSON.stringify({
        ok: true,
        new_token: newToken,
        new_copy_id: null,
        recipient_name: recipientClient.name,
        warning: "Proteção não pôde ser incorporada neste arquivo específico.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const copyHash = await sha256Hex(protectedBytes);
    const shortFp = fingerprintId.replace(/-/g, "").substring(0, 8);
    const copyId = `share-${sharer.id.substring(0, 8)}-${shortFp}`;
    const storagePath = `shared/${copyId}-${file.file_name}`;

    // 7. Upload protected copy to delivery-copies bucket
    const { error: upErr } = await supabase.storage
      .from("delivery-copies")
      .upload(storagePath, protectedBytes, { contentType: file.mime_type, upsert: true });

    if (upErr) {
      return new Response(JSON.stringify({ ok: false, error: "Falha ao salvar cópia protegida: " + upErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 8. Insert delivery_copy with parent_copy_id (chain link)
    await supabase.from("delivery_copies").insert({
      copy_id: copyId,
      delivery_id: newDelivery.id,
      protected_file_id: file.id,
      client_id: recipientClient.id,
      user_id: ownerUserId,
      owner_id: ownerUserId,
      original_hash: originalHash,
      copy_hash: copyHash,
      copy_storage_path: storagePath,
      copy_mime_type: file.mime_type,
      copy_file_name: file.file_name,
      copy_size: protectedBytes.length,
      protection_mode: "protected",
      protection_method: method,
      protection_version: PROTECTION_VERSION,
      recipient_type: "client",
      fingerprint_id: fingerprintId,
      watermark_config: null,
      status: "ready",
      parent_copy_id: parentCopyId,
      shared_by_client_id: sharer.id,
    });

    // Link copy_id to new delivery
    await supabase.from("deliveries").update({ copy_id: copyId }).eq("id", newDelivery.id);

    // 9. Record 'shared' event on source delivery (full audit trail)
    await supabase.from("delivery_events").insert({
      delivery_id: delivery.id,
      event_type: "shared",
      actor_id: null,
      meta: {
        shared_by_client_id: sharer.id,
        shared_by_name: sharer.name,
        shared_by_email: sharer.email,
        shared_with_client_id: recipientClient.id,
        shared_with_name: recipientClient.name,
        shared_with_email: recipientClient.email,
        parent_copy_id: parentCopyId,
        new_copy_id: copyId,
        new_delivery_id: newDelivery.id,
        fingerprint_id: fingerprintId,
      },
    });

    // Record 'created' event on new delivery
    await supabase.from("delivery_events").insert({
      delivery_id: newDelivery.id,
      event_type: "created",
      actor_id: null,
      meta: {
        created_by: "share-protected",
        shared_by_client_id: sharer.id,
        shared_by_name: sharer.name,
        parent_copy_id: parentCopyId,
      },
    });

    return new Response(JSON.stringify({
      ok: true,
      new_token: newToken,
      new_copy_id: copyId,
      fingerprint_id: fingerprintId,
      parent_copy_id: parentCopyId,
      recipient_name: recipientClient.name,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
