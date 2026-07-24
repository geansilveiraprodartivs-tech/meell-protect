import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

import { extractFingerprint, detectMime, sha256Hex } from "../_shared/protection.ts";

const MAX_VERIFY_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Receive file as multipart form
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ ok: false, error: "no file provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Size check
    if (file.size > MAX_VERIFY_FILE_SIZE) {
      return new Response(JSON.stringify({ ok: false, error: "file too large (max 20MB)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const declaredMime = file.type || "";
    const detectedMime = detectMime(fileBytes);
    const mime = declaredMime || detectedMime;

    // Compute hash of uploaded file for reference
    const uploadedHash = await sha256Hex(fileBytes);

    // Extract fingerprint from file
    const extraction = await extractFingerprint(fileBytes, mime);
    const fingerprintId = extraction.fingerprintId;

    let result: {
      status: "identified" | "not_found" | "invalid";
      fingerprint_id?: string;
      layer?: string;
      method?: string;
      copy?: any;
      file_hash: string;
    };

    if (!fingerprintId) {
      result = { status: "not_found", file_hash: uploadedHash };
    } else {
      // Validate fingerprint against DB
      const { data: copy, error: copyErr } = await supabase
        .from("delivery_copies")
        .select(`
          id, copy_id, fingerprint_id, protection_method, protection_version,
          recipient_type, original_hash, copy_hash, created_at,
          protected_file_id,
          delivery_id,
          client_id,
          owner_id,
          user_id,
          parent_copy_id,
          shared_by_client_id
        `)
        .eq("fingerprint_id", fingerprintId)
        .maybeSingle();

      if (copyErr || !copy) {
        result = { status: "invalid", fingerprint_id: fingerprintId, layer: extraction.layer, method: extraction.method, file_hash: uploadedHash };
      } else {
        // Authorization: only the owner of the protected file can see full details.
        // If the verifier is the owner, show everything. Otherwise, show limited info.
        const isOwner = copy.owner_id === user.id || copy.user_id === user.id;

        // Fetch related data (only if authorized)
        let fileInfo: any = null;
        let clientInfo: any = null;
        let deliveryInfo: any = null;
        let ownerInfo: any = null;

        if (isOwner) {
          const { data: pf } = await supabase
            .from("protected_files")
            .select("id, meell_id, title, file_name, mime_type, original_hash, downloads_count, created_at, user_id")
            .eq("id", copy.protected_file_id)
            .maybeSingle();
          fileInfo = pf;

          if (copy.client_id) {
            const { data: cl } = await supabase
              .from("clients")
              .select("id, name, email, created_at")
              .eq("id", copy.client_id)
              .maybeSingle();
            clientInfo = cl ? { id: cl.id, name: cl.name, created_at: cl.created_at } : null;
          }

          if (copy.delivery_id) {
            const { data: dl } = await supabase
              .from("deliveries")
              .select("id, created_at, download_count, last_downloaded_at")
              .eq("id", copy.delivery_id)
              .maybeSingle();
            deliveryInfo = dl;
          }

          if (copy.owner_id) {
            const { data: ow } = await supabase
              .from("profiles")
              .select("id, display_name, account_type")
              .eq("id", copy.owner_id)
              .maybeSingle();
            ownerInfo = ow ? { id: ow.id, display_name: ow.display_name, account_type: ow.account_type } : null;
          }
        }

        // Chain-of-custody traversal — follow parent_copy_id upward (owner view only, max 10 hops)
        const chain: any[] = [];
        if (isOwner && copy.parent_copy_id) {
          let currentParentId: string | null = copy.parent_copy_id;
          let hops = 0;
          while (currentParentId && hops < 10) {
            const { data: parentCopy } = await supabase
              .from("delivery_copies")
              .select(`copy_id, fingerprint_id, protection_method, recipient_type, created_at, parent_copy_id, shared_by_client_id, client_id`)
              .eq("copy_id", currentParentId)
              .maybeSingle();
            if (!parentCopy) break;
            let nodeClient: any = null;
            if (parentCopy.client_id) {
              const { data: cl } = await supabase.from("clients").select("id, name").eq("id", parentCopy.client_id).maybeSingle();
              nodeClient = cl ? { id: cl.id, name: cl.name } : null;
            }
            chain.push({
              copy_id: parentCopy.copy_id,
              fingerprint_id: parentCopy.fingerprint_id,
              protection_method: parentCopy.protection_method,
              recipient_type: parentCopy.recipient_type,
              created_at: parentCopy.created_at,
              client: nodeClient,
              shared_by_client_id: parentCopy.shared_by_client_id,
            });
            currentParentId = parentCopy.parent_copy_id;
            hops++;
          }
          chain.reverse(); // oldest ancestor first
        }

        result = {
          status: "identified",
          fingerprint_id: fingerprintId,
          layer: extraction.layer,
          method: copy.protection_method,
          file_hash: uploadedHash,
          copy: {
            copy_id: copy.copy_id,
            fingerprint_id: copy.fingerprint_id,
            protection_method: copy.protection_method,
            protection_version: copy.protection_version,
            recipient_type: copy.recipient_type,
            original_hash: copy.original_hash,
            copy_hash: copy.copy_hash,
            created_at: copy.created_at,
            is_owner_view: isOwner,
            parent_copy_id: copy.parent_copy_id ?? null,
            shared_by_client_id: copy.shared_by_client_id ?? null,
            chain: chain.length > 0 ? chain : undefined,
            file: fileInfo ? {
              meell_id: fileInfo.meell_id,
              title: fileInfo.title,
              file_name: fileInfo.file_name,
              mime_type: fileInfo.mime_type,
              downloads_count: fileInfo.downloads_count,
              created_at: fileInfo.created_at,
            } : null,
            owner: ownerInfo,
            client: clientInfo,
            delivery: deliveryInfo ? {
              id: deliveryInfo.id,
              created_at: deliveryInfo.created_at,
              download_count: deliveryInfo.download_count,
              last_downloaded_at: deliveryInfo.last_downloaded_at,
            } : null,
          },
        };
      }
    }

    // Log verification to activity_log
    await supabase.from("activity_log").insert({
      user_id: user.id,
      event: "file_verified",
      description: `Verificação de arquivo: ${result.status}`,
      meta: {
        fingerprint_id: fingerprintId || null,
        result: result.status,
        file_hash: uploadedHash,
        mime,
        file_name: file.name,
        layer: extraction.layer,
        method: extraction.method,
      },
    });

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
