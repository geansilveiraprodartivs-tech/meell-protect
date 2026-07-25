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

// --- Original function code ---
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { createHmac } from "node:crypto";

// --- Cakto API configuration ------------------------------------------------

const CAKTO_API_BASE = "https://api.cakto.com.br/public_api";

// Price (in cents) -> plan_id. Used to match Cakto offers to Meell Protect plans
// when the offer id has not been stored yet.
const PRICE_TO_PLAN: Record<number, string> = {
  2900: "start",
  6900: "pro",
  9900: "business",
};

// --- Event normalization ---------------------------------------------------

const EVENT_ALIASES: Record<string, string> = {
  approved: "approved",
  paid: "approved",
  purchase_approved: "approved",
  "purchase.approved": "approved",
  payment_approved: "approved",
  "payment.approved": "approved",
  "order.paid": "approved",
  purchase: "approved",
  renewal: "renewal",
  renew: "renewal",
  subscription_renewed: "renewal",
  "subscription.renewed": "renewal",
  "payment.renewal": "renewal",
  canceled: "canceled",
  cancelled: "canceled",
  subscription_canceled: "canceled",
  "subscription.canceled": "canceled",
  "subscription.cancelled": "canceled",
  refunded: "refunded",
  refund: "refunded",
  chargeback: "refunded",
  "payment.refunded": "refunded",
  "order.refunded": "refunded",
};

function normalizeEventType(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return EVENT_ALIASES[key] ?? key;
}

// --- Defensive payload extraction ------------------------------------------

function pick<T>(...values: (T | null | undefined)[]): T | null {
  for (const v of values) {
    if (v !== null && v !== undefined && v !== "") return v as T;
  }
  return null;
}

function asString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() ? v.trim() : null;
  if (typeof v === "number") return String(v);
  return null;
}

function asNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function getEmail(payload: any): string | null {
  const e = asString(
    pick(
      payload?.data?.customer?.email,
      payload?.customer?.email,
      payload?.client?.email,
      payload?.buyer?.email,
      payload?.user?.email,
      payload?.email,
      payload?.data?.email,
      payload?.data?.buyer?.email,
    ),
  );
  return e ? e.toLowerCase() : null;
}

function getOfferId(payload: any): string | null {
  return asString(
    pick(
      payload?.data?.offer?.id,
      payload?.offer?.id,
      payload?.offer_id,
      payload?.offerId,
      payload?.plan_id,
      payload?.planId,
      payload?.product?.id,
      payload?.product_id,
      payload?.productId,
      payload?.data?.offer_id,
      payload?.data?.offerId,
    ),
  );
}

function getOfferName(payload: any): string | null {
  return asString(
    pick(
      payload?.data?.offer?.name,
      payload?.offer?.name,
      payload?.data?.offer_name,
    ),
  );
}

function getPriceCents(payload: any): number | null {
  const decimal = asNumber(
    pick(
      payload?.data?.offer?.price,
      payload?.offer?.price,
      payload?.price,
      payload?.amount,
      payload?.total,
      payload?.value,
      payload?.data?.price,
      payload?.data?.amount,
      payload?.data?.total,
    ),
  );
  if (decimal != null) {
    if (decimal >= 1000 && Number.isInteger(decimal)) return decimal;
    return Math.round(decimal * 100);
  }
  const cents = asNumber(
    pick(
      payload?.price_cents,
      payload?.priceCents,
      payload?.amount_cents,
      payload?.amountCents,
      payload?.total_cents,
      payload?.totalCents,
      payload?.data?.price_cents,
      payload?.data?.amount_cents,
    ),
  );
  return cents;
}

function getEventId(payload: any, headers: Headers): string | null {
  return asString(
    pick(
      payload?.data?.id,
      payload?.event_id,
      payload?.eventId,
      payload?.id,
      payload?.transaction_id,
      payload?.transactionId,
      payload?.order_id,
      payload?.orderId,
      payload?.data?.event_id,
      payload?.data?.transaction_id,
      headers.get("x-cakto-event-id"),
      headers.get("x-event-id"),
      headers.get("x-request-id"),
    ),
  );
}

function getRawEventType(payload: any, headers: Headers): string | null {
  return asString(
    pick(
      payload?.event,
      payload?.event_type,
      payload?.eventType,
      payload?.type,
      payload?.data?.event,
      payload?.data?.event_type,
      headers.get("x-cakto-event"),
      headers.get("x-event-type"),
    ),
  );
}

function getStatus(payload: any): string | null {
  return asString(pick(payload?.data?.status, payload?.status));
}

function getSubscriptionId(payload: any): string | null {
  return asString(
    pick(
      payload?.data?.subscription?.id,
      payload?.data?.subscription_id,
      payload?.subscription_id,
      payload?.subscriptionId,
      payload?.subscription?.id,
      payload?.recurring_id,
      payload?.recurringId,
    ),
  );
}

function getPeriodEnd(payload: any): string | null {
  return asString(
    pick(
      payload?.data?.subscription?.next_payment_date,
      payload?.current_period_end,
      payload?.currentPeriodEnd,
      payload?.expires_at,
      payload?.expiresAt,
      payload?.next_billing_date,
      payload?.nextBillingDate,
      payload?.valid_until,
      payload?.validUntil,
      payload?.data?.current_period_end,
      payload?.data?.expires_at,
      payload?.data?.next_billing_date,
    ),
  );
}

// --- Cakto API client -------------------------------------------------------

async function getCaktoToken(): Promise<string | null> {
  const clientId = Deno.env.get("CAKTO_CLIENT_ID");
  const clientSecret = Deno.env.get("CAKTO_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;

  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);

  try {
    const res = await fetch(`${CAKTO_API_BASE}/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.access_token ?? null;
  } catch {
    return null;
  }
}

interface CaktoOffer {
  id: string;
  name: string;
  price: number;
  status: string;
  product?: string;
}

async function listCaktoOffers(token: string): Promise<CaktoOffer[]> {
  const offers: CaktoOffer[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= 20) {
    const res = await fetch(`${CAKTO_API_BASE}/offers/?page=${page}&page_size=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) break;
    const data = await res.json();
    const results: CaktoOffer[] = data?.results ?? [];
    offers.push(...results);
    hasMore = !!data?.next;
    page += 1;
  }
  return offers;
}

// --- Supabase service client -----------------------------------------------

function createServiceClient() {
  const url = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Missing Supabase env vars (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// --- Offer-to-plan resolution ----------------------------------------------

async function resolvePlanByOfferId(
  supabase: ReturnType<typeof createServiceClient>,
  offerId: string | null,
): Promise<string | null> {
  if (!offerId) return null;
  const { data } = await supabase
    .from("plans")
    .select("id")
    .eq("cakto_offer_id", offerId)
    .maybeSingle();
  return data?.id ?? null;
}

async function resolvePlanByPrice(priceCents: number | null): Promise<string | null> {
  if (priceCents == null) return null;
  return PRICE_TO_PLAN[priceCents] ?? null;
}

async function syncOfferMapping(
  supabase: ReturnType<typeof createServiceClient>,
  offers: CaktoOffer[],
): Promise<Record<string, string>> {
  const mapping: Record<string, string> = {};
  for (const offer of offers) {
    const priceCents = offer.price >= 1000 && Number.isInteger(offer.price)
      ? offer.price
      : Math.round(offer.price * 100);
    const planId = PRICE_TO_PLAN[priceCents];
    if (!planId) continue;
    mapping[offer.id] = planId;
    await supabase
      .from("plans")
      .update({ cakto_offer_id: offer.id })
      .eq("id", planId);
  }
  return mapping;
}

async function resolvePlan(
  supabase: ReturnType<typeof createServiceClient>,
  offerId: string | null,
  priceCents: number | null,
): Promise<{ planId: string | null; synced: boolean }> {
  // 1. Try stored mapping (cakto_offer_id in plans table)
  let planId = await resolvePlanByOfferId(supabase, offerId);

  // 2. Try price fallback
  if (!planId) planId = await resolvePlanByPrice(priceCents);

  // 3. If we still don't have a plan and have an offer id, try the Cakto API
  //    to discover the real offer ids and sync them to the plans table.
  if (!planId && offerId) {
    const token = await getCaktoToken();
    if (token) {
      const offers = await listCaktoOffers(token);
      const mapping = await syncOfferMapping(supabase, offers);
      planId = mapping[offerId] ?? null;
      if (planId) return { planId, synced: true };
    }
  }

  return { planId, synced: false };
}

// --- Main handler ----------------------------------------------------------

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("action") === "sync") {
      const syncKey = url.searchParams.get("key");
      if (syncKey !== Deno.env.get("SYNC_SECRET")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supabase = createServiceClient();
      const token = await getCaktoToken();
      if (!token) {
        return new Response(JSON.stringify({ error: "Failed to authenticate with Cakto API" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const offers = await listCaktoOffers(token);
      const mapping = await syncOfferMapping(supabase, offers);
      return new Response(
        JSON.stringify({
          ok: true,
          service: "cakto-webhook",
          version: "2.0.0",
          synced: true,
          offers: offers.map((o) => ({
            id: o.id,
            name: o.name,
            price: o.price,
            status: o.status,
            product: o.product,
            mapped_plan: mapping[o.id] ?? null,
          })),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ ok: true, service: "cakto-webhook", version: "2.0.0" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const rawBody = await req.text();
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dataNode = payload?.data ?? payload?.payload ?? null;
    const source = dataNode && typeof dataNode === "object"
      ? { ...payload, ...dataNode, data: payload?.data ?? dataNode }
      : payload;

    const email = getEmail(source);
    const offerId = getOfferId(source);
    const offerName = getOfferName(source);
    const priceCents = getPriceCents(source);
    const eventId = getEventId(source, req.headers);
    const rawEventType = getRawEventType(source, req.headers);
    const eventType = normalizeEventType(rawEventType);
    const status = getStatus(source);
    const subscriptionId = getSubscriptionId(source);
    const periodEnd = getPeriodEnd(source);

    // Webhook secret validation (HMAC signature or shared secret header)
    const webhookSecret = Deno.env.get("CAKTO_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("CAKTO_WEBHOOK_SECRET env var is not set");
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify HMAC signature (x-cakto-signature header) if present
    const signatureHeader =
      req.headers.get("x-cakto-signature") ||
      req.headers.get("x-webhook-signature");
    if (signatureHeader) {
      const expectedSig = createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");
      // Support both hex and base64 signatures
      const sigParts = signatureHeader.split(",").reduce((acc: Record<string, string>, part: string) => {
        const [k, v] = part.split("=");
        if (k && v) acc[k.trim()] = v.trim();
        return acc;
      }, {} as Record<string, string>);
      const providedSig = sigParts["v1"] ?? sigParts["sha256"] ?? signatureHeader.trim();
      if (providedSig !== expectedSig) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Fallback: shared secret via header or body
      const headerSecret =
        req.headers.get("x-webhook-secret") ||
        req.headers.get("x-cakto-secret") ||
        (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      const bodySecret =
        typeof payload?.secret === "string" ? (payload.secret as string).trim() : null;
      const okHeader = headerSecret ? headerSecret === webhookSecret : false;
      const okBody = bodySecret ? bodySecret === webhookSecret : false;
      if (!okHeader && !okBody) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Missing buyer email in payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!eventType) {
      return new Response(
        JSON.stringify({ error: "Missing or unrecognized event type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Idempotency check
    const supabase = createServiceClient();
    if (eventId) {
      const { data: existing } = await supabase
        .from("cakto_webhook_events")
        .select("id")
        .eq("event_id", eventId)
        .maybeSingle();
      if (existing) {
        return new Response(
          JSON.stringify({ ok: true, duplicated: true, message: "Event already processed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Resolve plan from Cakto offer id / price, syncing from API if needed
    const { planId, synced } = await resolvePlan(supabase, offerId, priceCents);

    const result = await processEvent({
      email,
      offerId,
      offerName,
      priceCents,
      planId,
      eventType,
      rawEventType: rawEventType ?? eventType,
      status,
      subscriptionId,
      periodEnd,
      eventId,
      payload,
      synced,
    });

    return new Response(JSON.stringify({ ok: true, ...result }), {
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

// --- Event processing ------------------------------------------------------

interface EventInput {
  email: string;
  offerId: string | null;
  offerName: string | null;
  priceCents: number | null;
  planId: string | null;
  eventType: string;
  rawEventType: string;
  status: string | null;
  subscriptionId: string | null;
  periodEnd: string | null;
  eventId: string | null;
  payload: any;
  synced: boolean;
}

async function processEvent(input: EventInput) {
  const supabase = createServiceClient();

  // Find the user by email using admin API (paginated lookup)
  let matched: { id: string; email?: string } | null = null;
  let page = 1;
  const maxPages = 10;
  while (!matched && page <= maxPages) {
    const { data: authPage, error: userErr } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (userErr) throw new Error(`Failed to list users: ${userErr.message}`);
    const users = authPage?.users ?? [];
    if (users.length === 0) break;
    matched = users.find((u: any) => (u.email ?? "").toLowerCase() === input.email) as { id: string; email?: string } | undefined ?? null;
    if (!matched) page += 1;
  }
  if (!matched) {
    await recordEvent(supabase, input, "no_user", null);
    return { matched: false, reason: "no_user", email: input.email };
  }
  const userId = matched.id as string;

  let targetPlan: string | null = input.planId;
  let subscriptionStatus: string | null = null;

  switch (input.eventType) {
    case "approved":
      targetPlan = input.planId ?? "free";
      subscriptionStatus = "active";
      break;
    case "renewal":
      subscriptionStatus = "active";
      if (!targetPlan) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("plan_id")
          .eq("id", userId)
          .maybeSingle();
        targetPlan = prof?.plan_id ?? "free";
      }
      break;
    case "canceled":
      targetPlan = "free";
      subscriptionStatus = "canceled";
      break;
    case "refunded":
      targetPlan = "free";
      subscriptionStatus = "refunded";
      break;
    default:
      await recordEvent(supabase, input, "unknown_event", userId);
      return { matched: true, reason: "unknown_event", eventType: input.eventType };
  }

  if (!targetPlan) {
    await recordEvent(supabase, input, "no_plan_resolved", userId);
    return { matched: true, reason: "no_plan_resolved", email: input.email };
  }

  // Update profiles.plan_id
  const { error: profErr } = await supabase
    .from("profiles")
    .update({ plan_id: targetPlan, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (profErr) throw new Error(`Failed to update profile: ${profErr.message}`);

  // Upsert subscription row
  const now = new Date().toISOString();
  const subPayload: Record<string, unknown> = {
    user_id: userId,
    plan_id: targetPlan,
    status: subscriptionStatus ?? "active",
    provider: "cakto",
    updated_at: now,
    provider_event_id: input.eventId,
    event_type: input.eventType,
    raw_payload: input.payload,
  };
  if (input.subscriptionId) subPayload.provider_subscription_id = input.subscriptionId;
  if (input.periodEnd) subPayload.current_period_end = input.periodEnd;

  const { data: existingSub } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", "cakto")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingSub?.id) {
    const { error: updErr } = await supabase
      .from("subscriptions")
      .update(subPayload)
      .eq("id", existingSub.id);
    if (updErr) throw new Error(`Failed to update subscription: ${updErr.message}`);
  } else {
    const { error: insErr } = await supabase
      .from("subscriptions")
      .insert({ ...subPayload, created_at: now });
    if (insErr) throw new Error(`Failed to insert subscription: ${insErr.message}`);
  }

  // Activity log
  await supabase.from("activity_log").insert({
    user_id: userId,
    event: `cakto_${input.eventType}`,
    description: `Cakto event ${input.rawEventType} -> plan ${targetPlan}`,
    meta: {
      offer_id: input.offerId,
      offer_name: input.offerName,
      price_cents: input.priceCents,
      subscription_id: input.subscriptionId,
      status: input.status,
      offer_mapping_synced: input.synced,
    },
  });

  await recordEvent(supabase, input, "processed", userId);

  return {
    matched: true,
    userId,
    plan: targetPlan,
    eventType: input.eventType,
    subscriptionStatus,
    offerId: input.offerId,
    offerMappingSynced: input.synced,
  };
}

async function recordEvent(
  supabase: ReturnType<typeof createServiceClient>,
  input: EventInput,
  state: string,
  userId: string | null,
) {
  const eventId = input.eventId ?? `synth_${input.email}_${input.eventType}_${Date.now()}`;
  try {
    await supabase.from("cakto_webhook_events").upsert(
      {
        event_id: eventId,
        event_type: input.eventType,
        raw_event_type: input.rawEventType,
        email: input.email,
        plan_id: input.planId,
        payload: { ...input.payload, _state: state, _user_id: userId },
      },
      { onConflict: "event_id" },
    );
  } catch {
    // best-effort
  }
}
