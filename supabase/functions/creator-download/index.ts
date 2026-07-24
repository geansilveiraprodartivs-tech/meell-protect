import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

import {
  generateFingerprintId,
  sha256Hex,
  classifyProtectionMethod,
  embedFingerprint,
  PROTECTION_VERSION,
} from "../_shared/protection.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { fileId, mode } = await req.json();
    if (!fileId || !mode) {
      return new Response(JSON.stringify({ ok: false, error: "missing fileId or mode" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: file, error: fileErr } = await supabase
      .from("protected_files")
      .select("id, user_id, meell_id, file_name, mime_type, storage_path, original_hash")
      .eq("id", fileId)
      .maybeSingle();
    if (fileErr || !file) {
      return new Response(JSON.stringify({ ok: false, error: "file not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (file.user_id !== user.id) {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== mode=identical — UNTOUCHED, byte-a-byte original =====
    if (mode === "identical") {
      const { data: sign, error: signErr } = await supabase
        .storage.from("protected-files")
        .createSignedUrl(file.storage_path, 60);
      if (signErr || !sign?.signedUrl) {
        return new Response(JSON.stringify({ ok: false, error: "signed url failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: cur } = await supabase.from("protected_files").select("downloads_count").eq("id", fileId).maybeSingle();
      await supabase.from("protected_files")
        .update({ downloads_count: (cur?.downloads_count || 0) + 1 })
        .eq("id", fileId);
      return new Response(JSON.stringify({
        ok: true,
        mode: "identical",
        url: sign.signedUrl,
        file_name: file.file_name,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== mode=protected — real fingerprint =====
    if (mode !== "protected") {
      return new Response(JSON.stringify({ ok: false, error: "invalid mode" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const PROTECTION_VER = PROTECTION_VERSION;

    // Reuse: same file + owner + protection_version
    const { data: existing } = await supabase
      .from("delivery_copies")
      .select("copy_id, fingerprint_id, copy_storage_path, copy_file_name, protection_method, copy_mime_type")
      .eq("protected_file_id", fileId)
      .eq("recipient_type", "owner")
      .eq("protection_version", PROTECTION_VER)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing && existing.copy_storage_path) {
      const { data: sign, error: signErr } = await supabase
        .storage.from("delivery-copies")
        .createSignedUrl(existing.copy_storage_path, 60);
      if (!signErr && sign?.signedUrl) {
        return new Response(JSON.stringify({
          ok: true,
          mode: "protected",
          protection_mode: existing.protection_method,
          fingerprint_id: existing.fingerprint_id,
          copy_id: existing.copy_id,
          url: sign.signedUrl,
          file_name: existing.copy_file_name,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const { data: fileBlob, error: dlErr } = await supabase
      .storage.from("protected-files")
      .download(file.storage_path);
    if (dlErr || !fileBlob) {
      return new Response(JSON.stringify({ ok: false, error: "download failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const originalBytes = new Uint8Array(await fileBlob.arrayBuffer());
    const originalHash = file.original_hash || await sha256Hex(originalBytes);

    const fingerprintId = generateFingerprintId();
    const { bytes: protectedBytes, method, modified } = await embedFingerprint(originalBytes, file.mime_type, fingerprintId);

    if (!modified) {
      return new Response(JSON.stringify({
        ok: false,
        error: "Formato ou tamanho não suporta proteção binária. Utilize PNG, JPEG, WEBP ou PDF com menos de 50 MB.",
      }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const copyHash = await sha256Hex(protectedBytes);

    const shortFp = fingerprintId.replace(/-/g, "").substring(0, 8);
    const protectedName = `owner-${file.meell_id}-${shortFp}`;
    const storagePath = `protected/${protectedName}`;
    const finalName = modified ? protectedName : `owner-${file.meell_id}-${shortFp}`;

    const { error: upErr } = await supabase
      .storage.from("delivery-copies")
      .upload(storagePath, protectedBytes, { contentType: file.mime_type, upsert: true });
    if (upErr) {
      const { data: sign } = await supabase.storage.from("protected-files").createSignedUrl(file.storage_path, 60);
      return new Response(JSON.stringify({
        ok: true,
        mode: "protected",
        protection_mode: "tracking_only",
        fingerprint_id: fingerprintId,
        url: sign?.signedUrl,
        file_name: file.file_name,
        fallback: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const copyId = `owner-${file.meell_id}-${shortFp}`;
    const { error: insertErr } = await supabase.from("delivery_copies").insert({
      copy_id: copyId,
      delivery_id: null,
      protected_file_id: fileId,
      client_id: null,
      user_id: user.id,
      owner_id: user.id,
      original_hash: originalHash,
      copy_hash: copyHash,
      copy_storage_path: storagePath,
      copy_mime_type: file.mime_type,
      copy_file_name: finalName,
      copy_size: protectedBytes.length,
      protection_mode: "protected",
      protection_method: method,
      protection_version: PROTECTION_VER,
      recipient_type: "owner",
      fingerprint_id: fingerprintId,
      watermark_config: { layers: method === "tracking_only" ? [] : ["metadata", "content"] },
      status: "ready",
    });
    if (insertErr) {
      return new Response(JSON.stringify({ ok: false, error: "insert failed: " + String(insertErr.message || insertErr) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: sign, error: signErr } = await supabase
      .storage.from("delivery-copies")
      .createSignedUrl(storagePath, 60);
    if (signErr || !sign?.signedUrl) {
      return new Response(JSON.stringify({ ok: false, error: "signed url failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      mode: "protected",
      protection_mode: method,
      fingerprint_id: fingerprintId,
      copy_id: copyId,
      url: sign.signedUrl,
      file_name: finalName,
      modified: modified,
      original_hash: originalHash,
      copy_hash: copyHash,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
