import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { createHash } from "node:crypto";

import {
  generateFingerprintId,
  embedFingerprint,
  PROTECTION_VERSION,
} from "../_shared/protection.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { rateLimit } from "../_shared/rate-limit.ts";

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


