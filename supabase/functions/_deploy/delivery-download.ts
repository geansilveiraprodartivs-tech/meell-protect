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
const MAX_ADVANCED_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB safety cap

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
// WEBP fingerprint (Camada A: custom RIFF chunk "MEEP" — pixel data untouched)
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
// PDF fingerprint (Camada A: XMP metadata + Camada B: invisible text overlay)
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

// Detect mime from file bytes (magic numbers) as fallback when header is missing.
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
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { createHash } from "node:crypto";

const COPIES_BUCKET = "delivery-copies";
const ORIGINALS_BUCKET = "protected-files";

interface WatermarkConfig {
  show_client_name?: boolean;
  show_email?: boolean;
  show_copy_id?: boolean;
  email_mask?: boolean;
}

function genCopyId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function sha256(data: ArrayBuffer | Uint8Array): string {
  const h = createHash("sha256");
  h.update(data instanceof Uint8Array ? data : new Uint8Array(data));
  return h.digest("hex");
}

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const maskedName = name.length > 2 ? name.slice(0, 2) + "*".repeat(Math.max(name.length - 2, 1)) : name;
  return `${maskedName}@${domain}`;
}

async function getDeliveryByToken(supabase: ReturnType<typeof createClient>, token: string) {
  const { data, error } = await supabase
    .from("deliveries")
    .select(`
      *,
      file:protected_files(*),
      client:clients(*),
      copy:delivery_copies(*)
    `)
    .eq("secure_token", token)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function recordEvent(
  supabase: ReturnType<typeof createClient>,
  deliveryId: string,
  eventType: string,
  actorId: string | null,
  meta: Record<string, unknown> = {},
) {
  try {
    await supabase.from("delivery_events").insert({
      delivery_id: deliveryId,
      event_type: eventType,
      actor_id: actorId,
      meta,
    });
  } catch {
    // best-effort
  }
}

// --- PDF watermarking with pdf-lib ---

async function watermarkPdf(
  originalBytes: Uint8Array,
  copyId: string,
  clientName: string | null,
  clientEmail: string | null,
  config: WatermarkConfig | null,
): Promise<Uint8Array> {
  const { PDFDocument, rgb, StandardFonts } = await import("npm:pdf-lib@1.17.1");
  const pdfDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  const footerText = `Protegido por Meell Protect • ID: ${copyId}`;

  for (const [pageIndex, page] of pages.entries()) {
    const { width } = page.getSize();
    const fontSize = 12;
    const yOffset = 12 + pageIndex * 50;
    const textWidth = font.widthOfTextAtSize(footerText, fontSize);
    page.drawText(footerText, {
      x: (width - textWidth) / 2,
      y: yOffset,
      size: fontSize,
      font,
      color: rgb(0.6, 0.6, 0.6),
      opacity: 0.15,
    });

    // Custom watermark if enabled
    if (config && (config.show_client_name || config.show_email || config.show_copy_id)) {
      const lines: string[] = [];
      if (config.show_client_name && clientName) lines.push(`Licenciado para: ${clientName}`);
      if (config.show_email && clientEmail) {
        lines.push(`E-mail: ${config.email_mask ? maskEmail(clientEmail) : clientEmail}`);
      }
      if (config.show_copy_id) lines.push(`ID: ${copyId}`);

      const wmFontSize = 12;
      let yOff = yOffset + fontSize + 4;
      for (const line of lines) {
        const lw = font.widthOfTextAtSize(line, wmFontSize);
        page.drawText(line, {
          x: (width - lw) / 2,
          y: yOff,
          size: wmFontSize,
          font,
          color: rgb(0.5, 0.5, 0.5),
          opacity: 0.15,
        });
        yOff += wmFontSize + 2;
      }
    }
  }

  return pdfDoc.save();
}

// --- Image watermarking ---

async function watermarkImage(
  originalBytes: Uint8Array,
  mimeType: string,
  copyId: string,
  clientName: string | null,
  clientEmail: string | null,
  config: WatermarkConfig | null,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const sharp = (await import("npm:sharp@0.33.5")).default;

  let pipeline = sharp(originalBytes);
  const meta = await pipeline.metadata();
  const width = meta.width ?? 800;
  const height = meta.height ?? 600;

  const fontSize = Math.max(10, Math.floor(width / 60));
  const footerText = `Protegido por Meell Protect • ${copyId}`;

  const svgParts: string[] = [
    `<svg width="${width}" height="${height}">`,
  ];

  // Footer text (discreet, bottom center)
  const footerY = height - fontSize - 6;
  svgParts.push(
    `<text x="${width / 2}" y="${footerY}" font-family="sans-serif" font-size="${fontSize}" fill="rgba(128,128,128,0.55)" text-anchor="middle">${escapeXml(footerText)}</text>`,
  );

  // Custom watermark
  if (config && (config.show_client_name || config.show_email || config.show_copy_id)) {
    const lines: string[] = [];
    if (config.show_client_name && clientName) lines.push(`Licenciado para: ${clientName}`);
    if (config.show_email && clientEmail) {
      lines.push(`E-mail: ${config.email_mask ? maskEmail(clientEmail) : clientEmail}`);
    }
    if (config.show_copy_id) lines.push(`ID: ${copyId}`);

    const wmFontSize = Math.max(11, Math.floor(width / 50));
    let yOff = fontSize + 10;
    for (const line of lines) {
      svgParts.push(
        `<text x="${width / 2}" y="${yOff}" font-family="sans-serif" font-size="${wmFontSize}" fill="rgba(128,128,128,0.5)" text-anchor="middle">${escapeXml(line)}</text>`,
      );
      yOff += wmFontSize + 4;
    }
  }

  svgParts.push("</svg>");
  const svgBuffer = Buffer.from(svgParts.join(""));

  const outputFormat = mimeType === "image/jpeg" ? "jpeg" : "png";

  const result = await sharp(originalBytes)
    .composite([{ input: svgBuffer, top: 0, left: 0, blend: "over" }])
    .toFormat(outputFormat)
    .toBuffer();

  return { bytes: new Uint8Array(result), mimeType: mimeType === "image/jpeg" ? "image/jpeg" : "image/png" };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function createServiceClient() {
  const url = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

// --- Main handler ---

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const rl = rateLimit(req, 30, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: `Rate limit exceeded. Try again in ${rl.retryAfter}s` }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = req.method === "POST" ? await req.json() : {};
    const token = req.method === "GET" ? new URL(req.url).searchParams.get("token") : (body as { token?: string }).token;

    if (!token) {
      return new Response(JSON.stringify({ error: "Missing delivery token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createServiceClient();

    // 1. Find delivery by token
    const delivery = await getDeliveryByToken(supabase, token);
    if (!delivery) {
      return new Response(JSON.stringify({ error: "Entrega não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const file = delivery.file;
    const client = delivery.client;
    if (!file || !client) {
      return new Response(JSON.stringify({ error: "Dados da entrega incompletos" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Validate delivery state (revoked/expired checked for both GET and POST)
    if (delivery.revoked) {
      await recordEvent(supabase, delivery.id, "blocked", null, { reason: "revoked" });
      return new Response(JSON.stringify({ error: "Esta entrega foi revogada" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expired = delivery.expires_at && new Date(delivery.expires_at) < new Date();
    if (expired) {
      await recordEvent(supabase, delivery.id, "blocked", null, { reason: "expired" });
      return new Response(JSON.stringify({ error: "Esta entrega expirou" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2b. GET only: return delivery metadata (no download, no limit check)
    if (req.method === "GET") {
      return new Response(JSON.stringify({ ok: true, delivery }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2c. POST only: check download limit before processing
    if (delivery.download_count >= delivery.download_limit) {
      await recordEvent(supabase, delivery.id, "blocked", null, { reason: "limit_reached" });
      return new Response(JSON.stringify({ error: "Limite de downloads atingido" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Determine protection mode
    const protectionMode = delivery.protection_mode ?? "default";
    const watermarkConfig = delivery.watermark_config as WatermarkConfig | null;

    // 4. Download original from protected-files (server-side, service role)
    const { data: originalData, error: downloadErr } = await supabase.storage
      .from(ORIGINALS_BUCKET)
      .download(file.storage_path);

    if (downloadErr || !originalData) {
      return new Response(JSON.stringify({ error: "Arquivo original não encontrado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const originalBytes = new Uint8Array(await originalData.arrayBuffer());
    const originalHash = sha256(originalBytes);

    // 5. Update original hash on protected_files if not set
    if (!file.original_hash) {
      await supabase.from("protected_files").update({ original_hash: originalHash }).eq("id", file.id);
    }

    // 6. If protection_mode is 'none' or unsupported format, serve original via signed URL
    const mimeType = file.mime_type ?? "application/octet-stream";
    const isPdf = mimeType === "application/pdf";
    const isImage = ["image/png", "image/jpeg", "image/jpg"].includes(mimeType);
    const isWebp =
      mimeType === "image/webp" ||
      (
        originalBytes.length >= 12 &&
        originalBytes[0] === 0x52 &&
        originalBytes[1] === 0x49 &&
        originalBytes[2] === 0x46 &&
        originalBytes[3] === 0x46 &&
        originalBytes[8] === 0x57 &&
        originalBytes[9] === 0x45 &&
        originalBytes[10] === 0x42 &&
        originalBytes[11] === 0x50
      );

    const canWatermark = isPdf || isImage || isWebp;

    if (protectionMode === "none" || !canWatermark) {
      // Serve original via short-lived signed URL (no copy generation)
      const { data: urlData, error: urlErr } = await supabase.storage
        .from(ORIGINALS_BUCKET)
        .createSignedUrl(file.storage_path, 30);

      if (urlErr || !urlData?.signedUrl) {
        return new Response(JSON.stringify({ error: "Falha ao gerar link de download" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Increment counters atomically via RPC
      await supabase.rpc("increment_download_count", { p_delivery_id: delivery.id });
      await supabase.rpc("increment_file_downloads", { p_file_id: file.id });

      await recordEvent(supabase, delivery.id, "downloaded", null, {
        copy_id: null,
        original_hash: originalHash,
        protection_mode: "none",
        reason: canWatermark ? "user_disabled" : "unsupported_format",
      });

      return new Response(JSON.stringify({
        ok: true,
        url: urlData.signedUrl,
        file_name: file.file_name,
        copy_id: null,
        protection_mode: "none",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7. Generate or retrieve derived copy
    let copyRecord = Array.isArray(delivery.copy) ? (delivery.copy[0] ?? null) : (delivery.copy ?? null);
    let copyId = copyRecord?.copy_id;
    let copyStoragePath = copyRecord?.copy_storage_path;

    // If no copy exists yet, generate one
    if (!copyRecord) {
      copyId = genCopyId();
      copyStoragePath = `${file.user_id}/${copyId}-${file.file_name}`;

      const fingerprintId = generateFingerprintId();

      let detectedMime = mimeType;

      if (
        originalBytes.length >= 12 &&
        originalBytes[0] === 0x52 &&
        originalBytes[1] === 0x49 &&
        originalBytes[2] === 0x46 &&
        originalBytes[3] === 0x46 &&
        originalBytes[8] === 0x57 &&
        originalBytes[9] === 0x45 &&
        originalBytes[10] === 0x42 &&
        originalBytes[11] === 0x50
      ) {
        detectedMime = "image/webp";
      } else if (
        originalBytes.length >= 8 &&
        originalBytes[0] === 0x89 &&
        originalBytes[1] === 0x50 &&
        originalBytes[2] === 0x4e &&
        originalBytes[3] === 0x47
      ) {
        detectedMime = "image/png";
      } else if (
        originalBytes.length >= 3 &&
        originalBytes[0] === 0xff &&
        originalBytes[1] === 0xd8 &&
        originalBytes[2] === 0xff
      ) {
        detectedMime = "image/jpeg";
      } else if (
        originalBytes.length >= 5 &&
        String.fromCharCode(...originalBytes.slice(0, 5)) === "%PDF-"
      ) {
        detectedMime = "application/pdf";
      }

      let derivedBytes: Uint8Array;
      let derivedMime = detectedMime;
      let protectionMethod: string;

      try {
        const embedded = await embedFingerprint(
          originalBytes,
          detectedMime,
          fingerprintId
        );

        if (!embedded.modified) {
          throw new Error(
            `Formato sem proteção binária disponível: ${embedded.method}`
          );
        }

        derivedBytes = embedded.bytes;
        protectionMethod = embedded.method;
      } catch (e) {
        await recordEvent(supabase, delivery.id, "blocked", null, {
          copy_id: copyId,
          fingerprint_id: fingerprintId,
          reason: "fingerprint_embedding_failed",
          error: e instanceof Error ? e.message : String(e),
        });

        return new Response(
          JSON.stringify({
            error:
              "Não foi possível gerar uma cópia protegida. Por segurança, o arquivo original não foi liberado.",
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      const copyHash = sha256(derivedBytes);

      // Upload derived copy to delivery-copies bucket
      const { error: uploadErr } = await supabase.storage
        .from(COPIES_BUCKET)
        .upload(copyStoragePath, derivedBytes, {
          contentType: derivedMime,
          upsert: false,
        });

      if (uploadErr) {
        await recordEvent(supabase, delivery.id, "blocked", null, {
          copy_id: copyId,
          original_hash: originalHash,
          protection_mode: protectionMode,
          reason: "protected_copy_upload_failed",
          error: uploadErr.message,
        });

        return new Response(
          JSON.stringify({
            error:
              "Falha ao salvar a cópia protegida. Por segurança, o arquivo original não foi liberado.",
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      // Insert delivery_copies record
      const { data: newCopy, error: copyErr } = await supabase.from("delivery_copies").insert({
        copy_id: copyId,
        delivery_id: delivery.id,
        protected_file_id: file.id,
        client_id: client.id,
        user_id: file.user_id,
        original_hash: originalHash,
        copy_hash: copyHash,
        copy_storage_path: copyStoragePath,
        copy_mime_type: derivedMime,
        copy_file_name: file.file_name,
        copy_size: derivedBytes.byteLength,
        protection_method: protectionMethod,
        protection_version: PROTECTION_VERSION,
        fingerprint_id: fingerprintId,
        recipient_type: "client",
        protection_mode: protectionMode,
        watermark_config: watermarkConfig,
        status: "ready",
      }).select("*").maybeSingle();

      if (copyErr || !newCopy) {
        // Remove a cópia órfã do Storage se o registro no banco falhar
        await supabase.storage
          .from(COPIES_BUCKET)
          .remove([copyStoragePath]);

        await recordEvent(supabase, delivery.id, "blocked", null, {
          copy_id: copyId,
          original_hash: originalHash,
          protection_mode: protectionMode,
          reason: "protected_copy_db_insert_failed",
          error: copyErr?.message ?? "Registro da cópia não criado",
        });

        return new Response(
          JSON.stringify({
            error:
              "Falha ao registrar a cópia protegida. Por segurança, nenhum arquivo foi liberado.",
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      } else {
        copyRecord = newCopy;

        await supabase
          .from("deliveries")
          .update({ copy_id: copyId })
          .eq("id", delivery.id);
      }
    }

    // 8. Generate signed URL for the derived copy
    if (!copyStoragePath) {
      return new Response(JSON.stringify({ error: "Caminho da cópia não encontrado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: copyUrlData, error: copyUrlErr } = await supabase.storage
      .from(COPIES_BUCKET)
      .createSignedUrl(copyStoragePath, 30);

    if (copyUrlErr || !copyUrlData?.signedUrl) {
      await recordEvent(supabase, delivery.id, "blocked", null, {
        copy_id: copyId,
        original_hash: originalHash,
        protection_mode: protectionMode,
        reason: "protected_copy_url_failed",
        error: copyUrlErr?.message ?? "Signed URL da cópia não disponível",
      });

      return new Response(
        JSON.stringify({
          error:
            "Falha ao liberar a cópia protegida. Por segurança, o arquivo original não foi liberado.",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // 9. Increment counters atomically via RPC and record event
    await supabase.rpc("increment_download_count", { p_delivery_id: delivery.id });
    await supabase.rpc("increment_file_downloads", { p_file_id: file.id });

    await recordEvent(supabase, delivery.id, "downloaded", null, {
      copy_id: copyId,
      original_hash: originalHash,
      copy_hash: copyRecord?.copy_hash,
      protection_mode: protectionMode,
    });

    return new Response(JSON.stringify({
      ok: true,
      url: copyUrlData.signedUrl,
      file_name: file.file_name,
      copy_id: copyId,
      protection_mode: protectionMode,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
