import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  generateFingerprintId,
  sha256Hex,
  classifyProtectionMethod,
  embedFingerprint,
  PROTECTION_VERSION,
} from "../_shared/protection.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { rateLimit } from "../_shared/rate-limit.ts";
import { sanitizeInput } from "../_shared/sanitize.ts";

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
