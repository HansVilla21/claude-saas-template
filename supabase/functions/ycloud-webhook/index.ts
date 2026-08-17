// ycloud-webhook — Edge Function v0.3.0
//
// Receives webhooks from YCloud, verifies HMAC signature (Stripe-style scheme),
// logs the raw payload to public.webhook_events_raw, and (when signature is
// valid) processes the event into public.leads / conversations / messages.
//
// Signature scheme (confirmed against real YCloud payloads):
//   Header: `ycloud-signature: t=<unix_seconds>,s=<hmac_sha256_hex>`
//   HMAC = HMAC-SHA256(secret, `${t}.${rawBody}`) in hex
//   Secret is used as-is, including any `whsec_` prefix.
//
// Replay protection: rejects requests with timestamp older than TOLERANCE_SECONDS.
//
// Processing rules:
//   - `whatsapp.inbound_message.received`: resolve agency by `to` phone,
//     UPSERT lead by (agency_id, ycloud_user_id), UPSERT conversation by
//     (agency_id, lead_id), INSERT message (idempotent on wa_message_id).
//   - `whatsapp.message.updated`: resolve agency by `from` phone (outbound
//     side, `from` is the agency), UPSERT message by wa_message_id (UPDATE
//     status timestamps if exists, INSERT outbound message if missing).
//   - All errors are caught and written to webhook_events_raw.processing_error.
//     We always return 200 to YCloud (the raw log is already persisted).
//
// Auth: verify_jwt is DISABLED. Auth is via HMAC signature.
//
// Env vars expected:
//   - SUPABASE_URL (auto-injected)
//   - SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//   - YCLOUD_WEBHOOK_SECRET (manual: set via dashboard)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const YCLOUD_WEBHOOK_SECRET = Deno.env.get("YCLOUD_WEBHOOK_SECRET") ?? "";

const TOLERANCE_SECONDS = 5 * 60; // 5 minutes
const FN_VERSION = "0.3.0";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Signature verification (UNCHANGED from v0.2)
// ---------------------------------------------------------------------------

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

type ParsedSig = { t: string; s: string } | null;

function parseSignatureHeader(header: string | null): ParsedSig {
  if (!header) return null;
  const parts = header.split(",").map((p) => p.trim());
  let t: string | null = null;
  let s: string | null = null;
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim().toLowerCase();
    const v = part.slice(eq + 1).trim();
    if (k === "t") t = v;
    else if (k === "s" || k === "v1") s = v;
  }
  if (!t || !s) return null;
  return { t, s };
}

async function verifyYCloudSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<{ valid: boolean; reason?: string }> {
  if (!secret) return { valid: false, reason: "server_secret_not_configured" };
  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return { valid: false, reason: "missing_or_malformed_signature_header" };

  const t = Number.parseInt(parsed.t, 10);
  if (Number.isNaN(t)) return { valid: false, reason: "invalid_timestamp" };
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > TOLERANCE_SECONDS) {
    return { valid: false, reason: "timestamp_outside_tolerance" };
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signedPayload = `${parsed.t}.${rawBody}`;
  const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  const computed = toHex(sigBuf);

  if (constantTimeEqual(computed, parsed.s)) {
    return { valid: true };
  }
  return { valid: false, reason: "signature_mismatch" };
}

function extractEventType(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  for (const key of ["type", "event_type", "event", "eventType"]) {
    const v = obj[key];
    if (typeof v === "string") return v;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Processing helpers (NEW in v0.3)
// ---------------------------------------------------------------------------

type ProcessOutcome = {
  processed: boolean;
  reason?: string;
  error?: string;
  details?: Record<string, unknown>;
};

/**
 * Map YCloud's `type` field to our message_kind enum.
 * Unknown types fall back to 'text' (caller will stuff the payload in body).
 */
function mapMessageKind(ycloudType: string | undefined): string {
  switch (ycloudType) {
    case "text":
    case "image":
    case "audio":
    case "video":
    case "document":
    case "location":
    case "template":
    case "interactive":
    case "sticker":
      return ycloudType;
    default:
      return "text";
  }
}

/**
 * Extract body / media_url / media_mime / media_metadata from a YCloud message
 * sub-object (either `whatsappInboundMessage` or `whatsappMessage`).
 */
function extractMessageContent(msg: Record<string, unknown>): {
  body: string | null;
  media_url: string | null;
  media_mime: string | null;
  media_metadata: Record<string, unknown> | null;
} {
  const type = typeof msg.type === "string" ? msg.type : "text";
  const result = {
    body: null as string | null,
    media_url: null as string | null,
    media_mime: null as string | null,
    media_metadata: null as Record<string, unknown> | null,
  };

  const sub = (key: string): Record<string, unknown> | null => {
    const v = msg[key];
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  };

  switch (type) {
    case "text": {
      const t = sub("text");
      if (t && typeof t.body === "string") result.body = t.body;
      break;
    }
    case "image":
    case "audio":
    case "video":
    case "document":
    case "sticker": {
      const media = sub(type);
      if (media) {
        if (typeof media.link === "string") result.media_url = media.link;
        if (typeof media.mime_type === "string") result.media_mime = media.mime_type;
        if (typeof media.caption === "string") result.body = media.caption;
        if (type === "document") {
          const meta: Record<string, unknown> = {};
          if (typeof media.filename === "string") meta.filename = media.filename;
          if (typeof media.sha256 === "string") meta.sha256 = media.sha256;
          if (Object.keys(meta).length > 0) result.media_metadata = meta;
        }
      }
      break;
    }
    case "location": {
      const loc = sub("location");
      if (loc) {
        const lat = loc.latitude;
        const lng = loc.longitude;
        if (typeof lat === "number" && typeof lng === "number") {
          result.body = `📍 https://maps.google.com/?q=${lat},${lng}`;
          result.media_metadata = {
            latitude: lat,
            longitude: lng,
            name: typeof loc.name === "string" ? loc.name : undefined,
            address: typeof loc.address === "string" ? loc.address : undefined,
          };
        }
      }
      break;
    }
    default: {
      // Unknown / interactive / template — stash the full payload
      result.body = JSON.stringify(msg);
      break;
    }
  }
  return result;
}

/**
 * Resolve agency_id + whatsapp_number row by phone_number (E.164).
 * Returns null if no row matches.
 */
async function resolveAgencyByPhone(
  sb: SupabaseClient,
  phone: string,
): Promise<{ agency_id: string; whatsapp_number_id: string } | null> {
  const { data, error } = await sb
    .from("whatsapp_numbers")
    .select("id, agency_id")
    .eq("phone_number", phone)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("resolveAgencyByPhone error:", error);
    return null;
  }
  if (!data) return null;
  return { agency_id: data.agency_id, whatsapp_number_id: data.id };
}

/**
 * UPSERT a lead by (agency_id, ycloud_user_id).
 * If exists: refresh display_name & phone_e164 (cheap idempotent updates).
 * If not: insert with sensible defaults for an inbound lead.
 *
 * Returns the lead id.
 */
async function upsertLead(
  sb: SupabaseClient,
  args: {
    agency_id: string;
    ycloud_user_id: string;
    from_phone: string;
    customer_name: string | null;
    waba_id: string | null;
    event_id: string | null;
  },
): Promise<string> {
  const { agency_id, ycloud_user_id, from_phone, customer_name, waba_id, event_id } = args;

  const { data: existing, error: selErr } = await sb
    .from("leads")
    .select("id")
    .eq("agency_id", agency_id)
    .eq("ycloud_user_id", ycloud_user_id)
    .maybeSingle();
  if (selErr) throw new Error(`lead lookup failed: ${selErr.message}`);

  if (existing) {
    const updates: Record<string, unknown> = {};
    if (customer_name) updates.display_name = customer_name;
    if (from_phone) {
      updates.phone_e164 = from_phone;
      updates.whatsapp_id = from_phone;
    }
    if (Object.keys(updates).length > 0) {
      const { error: updErr } = await sb.from("leads").update(updates).eq("id", existing.id);
      if (updErr) throw new Error(`lead update failed: ${updErr.message}`);
    }
    return existing.id as string;
  }

  const metadata: Record<string, unknown> = {};
  if (event_id) metadata.first_message_event_id = event_id;
  if (waba_id) metadata.wabaId = waba_id;

  const { data: inserted, error: insErr } = await sb
    .from("leads")
    .insert({
      agency_id,
      full_name: customer_name ?? "Lead sin nombre",
      display_name: customer_name,
      phone_e164: from_phone,
      whatsapp_id: from_phone,
      ycloud_user_id,
      source: "whatsapp",
      status: "nuevo",
      metadata,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(`lead insert failed: ${insErr.message}`);
  return inserted.id as string;
}

/**
 * UPSERT conversation by (agency_id, lead_id) — one per lead forever.
 */
async function upsertConversation(
  sb: SupabaseClient,
  args: { agency_id: string; lead_id: string; whatsapp_number_id: string },
): Promise<string> {
  const { agency_id, lead_id, whatsapp_number_id } = args;

  const { data: existing, error: selErr } = await sb
    .from("conversations")
    .select("id")
    .eq("agency_id", agency_id)
    .eq("lead_id", lead_id)
    .maybeSingle();
  if (selErr) throw new Error(`conversation lookup failed: ${selErr.message}`);

  if (existing) return existing.id as string;

  const { data: inserted, error: insErr } = await sb
    .from("conversations")
    .insert({
      agency_id,
      lead_id,
      whatsapp_number_id,
      channel: "whatsapp",
      handler: "bot",
    })
    .select("id")
    .single();
  if (insErr) throw new Error(`conversation insert failed: ${insErr.message}`);
  return inserted.id as string;
}

/**
 * Insert inbound message if not already present by wa_message_id.
 * Returns { inserted: true, id } on insert, { inserted: false } on duplicate.
 */
async function insertInboundMessageIdempotent(
  sb: SupabaseClient,
  args: {
    agency_id: string;
    conversation_id: string;
    lead_id: string;
    wamid: string;
    ycloud_message_id: string | null;
    kind: string;
    body: string | null;
    media_url: string | null;
    media_mime: string | null;
    media_metadata: Record<string, unknown> | null;
    sent_at: string | null;
  },
): Promise<{ inserted: boolean; id?: string }> {
  const { data: existing, error: selErr } = await sb
    .from("messages")
    .select("id")
    .eq("wa_message_id", args.wamid)
    .maybeSingle();
  if (selErr) throw new Error(`message dedup lookup failed: ${selErr.message}`);
  if (existing) return { inserted: false };

  const { data: inserted, error: insErr } = await sb
    .from("messages")
    .insert({
      agency_id: args.agency_id,
      conversation_id: args.conversation_id,
      lead_id: args.lead_id,
      direction: "inbound",
      sender_kind: "lead",
      kind: args.kind,
      body: args.body,
      media_url: args.media_url,
      media_mime: args.media_mime,
      media_metadata: args.media_metadata,
      wa_message_id: args.wamid,
      ycloud_message_id: args.ycloud_message_id,
      status: "delivered",
      sent_at: args.sent_at,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(`message insert failed: ${insErr.message}`);
  return { inserted: true, id: inserted.id as string };
}

// ---------------------------------------------------------------------------
// Event handlers (NEW in v0.3)
// ---------------------------------------------------------------------------

async function handleInboundMessage(
  sb: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<ProcessOutcome> {
  const m = payload.whatsappInboundMessage as Record<string, unknown> | undefined;
  if (!m || typeof m !== "object") {
    return { processed: false, reason: "missing_whatsappInboundMessage" };
  }

  const to = typeof m.to === "string" ? m.to : null;
  const from = typeof m.from === "string" ? m.from : null;
  const wamid = typeof m.wamid === "string" ? m.wamid : null;
  const ycloudMsgId = typeof m.id === "string" ? m.id : null;
  const fromUserId = typeof m.fromUserId === "string" ? m.fromUserId : null;
  const sendTime = typeof m.sendTime === "string" ? m.sendTime : null;
  const wabaId = typeof m.wabaId === "string" ? m.wabaId : null;
  const ycloudType = typeof m.type === "string" ? m.type : "text";
  const eventId = typeof payload.id === "string" ? payload.id : null;

  if (!to || !from || !wamid || !fromUserId) {
    return {
      processed: false,
      reason: "missing_required_inbound_fields",
      details: { to, from, wamid, fromUserId },
    };
  }

  const profile = m.customerProfile as Record<string, unknown> | undefined;
  const customerName =
    profile && typeof profile.name === "string" && profile.name.length > 0
      ? profile.name
      : null;

  // 1. Resolve agency
  const agencyCtx = await resolveAgencyByPhone(sb, to);
  if (!agencyCtx) {
    return {
      processed: false,
      reason: "unknown_agency_for_phone",
      details: { to },
    };
  }

  // 2. UPSERT lead
  const leadId = await upsertLead(sb, {
    agency_id: agencyCtx.agency_id,
    ycloud_user_id: fromUserId,
    from_phone: from,
    customer_name: customerName,
    waba_id: wabaId,
    event_id: eventId,
  });

  // 3. UPSERT conversation
  const conversationId = await upsertConversation(sb, {
    agency_id: agencyCtx.agency_id,
    lead_id: leadId,
    whatsapp_number_id: agencyCtx.whatsapp_number_id,
  });

  // 4. INSERT message (idempotent by wa_message_id)
  const content = extractMessageContent(m);
  const result = await insertInboundMessageIdempotent(sb, {
    agency_id: agencyCtx.agency_id,
    conversation_id: conversationId,
    lead_id: leadId,
    wamid,
    ycloud_message_id: ycloudMsgId,
    kind: mapMessageKind(ycloudType),
    body: content.body,
    media_url: content.media_url,
    media_mime: content.media_mime,
    media_metadata: content.media_metadata,
    sent_at: sendTime,
  });

  return {
    processed: true,
    details: {
      agency_id: agencyCtx.agency_id,
      lead_id: leadId,
      conversation_id: conversationId,
      message_inserted: result.inserted,
      message_id: result.id ?? null,
      duplicate: !result.inserted,
    },
  };
}

async function handleMessageUpdated(
  sb: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<ProcessOutcome> {
  const m = payload.whatsappMessage as Record<string, unknown> | undefined;
  if (!m || typeof m !== "object") {
    return { processed: false, reason: "missing_whatsappMessage" };
  }

  const to = typeof m.to === "string" ? m.to : null;
  const from = typeof m.from === "string" ? m.from : null;
  const wamid = typeof m.wamid === "string" ? m.wamid : null;
  const ycloudMsgId = typeof m.id === "string" ? m.id : null;
  const status = typeof m.status === "string" ? m.status : null;
  const recipientUserId = typeof m.recipientUserId === "string" ? m.recipientUserId : null;
  const sendTime = typeof m.sendTime === "string" ? m.sendTime : null;
  const deliverTime = typeof m.deliverTime === "string" ? m.deliverTime : null;
  const readTime = typeof m.readTime === "string" ? m.readTime : null;
  const pricingCategory = typeof m.pricingCategory === "string" ? m.pricingCategory : null;
  const totalPrice = typeof m.totalPrice === "number" ? m.totalPrice : null;
  const errorCode = typeof m.errorCode === "string" ? m.errorCode : null;
  const errorMessage = typeof m.errorMessage === "string" ? m.errorMessage : null;
  const ycloudType = typeof m.type === "string" ? m.type : "text";

  if (!from || !wamid || !status) {
    return {
      processed: false,
      reason: "missing_required_update_fields",
      details: { from, wamid, status },
    };
  }

  // 1. Resolve agency by `from` (outbound: from = agency number)
  const agencyCtx = await resolveAgencyByPhone(sb, from);
  if (!agencyCtx) {
    return {
      processed: false,
      reason: "unknown_agency_for_phone",
      details: { from },
    };
  }

  // 2. Lookup existing message by wamid
  const { data: existing, error: selErr } = await sb
    .from("messages")
    .select("id, sent_at, delivered_at, read_at, status")
    .eq("wa_message_id", wamid)
    .maybeSingle();
  if (selErr) throw new Error(`message status lookup failed: ${selErr.message}`);

  // Normalize status to our enum (queued|sent|delivered|read|failed)
  const normalizedStatus = ["queued", "sent", "delivered", "read", "failed"].includes(status)
    ? status
    : "sent";

  if (existing) {
    // UPDATE timestamps idempotently
    const updates: Record<string, unknown> = { status: normalizedStatus };
    if (pricingCategory !== null) updates.pricing_category = pricingCategory;
    if (totalPrice !== null) updates.total_price = totalPrice;
    if (sendTime && !existing.sent_at) updates.sent_at = sendTime;
    if (deliverTime && !existing.delivered_at) updates.delivered_at = deliverTime;
    if (readTime && !existing.read_at) updates.read_at = readTime;
    if (errorCode) updates.error_code = errorCode;
    if (errorMessage) updates.error_message = errorMessage;

    const { error: updErr } = await sb.from("messages").update(updates).eq("id", existing.id);
    if (updErr) throw new Error(`message update failed: ${updErr.message}`);

    return {
      processed: true,
      details: {
        agency_id: agencyCtx.agency_id,
        message_id: existing.id,
        action: "updated",
        new_status: normalizedStatus,
      },
    };
  }

  // 3. Message doesn't exist — INSERT outbound (N8N sent it without registering it locally)
  if (!recipientUserId) {
    return {
      processed: false,
      reason: "outbound_status_with_no_existing_message_and_no_recipientUserId",
      details: { wamid },
    };
  }

  // Find the lead by (agency_id, ycloud_user_id = recipientUserId)
  const { data: lead, error: leadErr } = await sb
    .from("leads")
    .select("id")
    .eq("agency_id", agencyCtx.agency_id)
    .eq("ycloud_user_id", recipientUserId)
    .maybeSingle();
  if (leadErr) throw new Error(`lead lookup for outbound failed: ${leadErr.message}`);
  if (!lead) {
    return {
      processed: false,
      reason: "outbound_status_for_unknown_lead",
      details: { recipientUserId, wamid },
    };
  }

  // Conversation for that lead
  const { data: conv, error: convErr } = await sb
    .from("conversations")
    .select("id")
    .eq("agency_id", agencyCtx.agency_id)
    .eq("lead_id", lead.id)
    .maybeSingle();
  if (convErr) throw new Error(`conversation lookup for outbound failed: ${convErr.message}`);
  if (!conv) {
    return {
      processed: false,
      reason: "outbound_status_for_lead_with_no_conversation",
      details: { lead_id: lead.id },
    };
  }

  const content = extractMessageContent(m);

  const insertRow: Record<string, unknown> = {
    agency_id: agencyCtx.agency_id,
    conversation_id: conv.id,
    lead_id: lead.id,
    direction: "outbound",
    sender_kind: "bot",
    kind: mapMessageKind(ycloudType),
    body: content.body,
    media_url: content.media_url,
    media_mime: content.media_mime,
    media_metadata: content.media_metadata,
    wa_message_id: wamid,
    ycloud_message_id: ycloudMsgId,
    status: normalizedStatus,
    pricing_category: pricingCategory,
    total_price: totalPrice,
    sent_at: sendTime,
    delivered_at: deliverTime,
    read_at: readTime,
    error_code: errorCode,
    error_message: errorMessage,
    is_bot_generated: true,
  };

  // Race-safe insert: another concurrent update webhook could have inserted the
  // same wamid between our SELECT and INSERT. Catch unique violation and retry
  // as an UPDATE.
  const { data: inserted, error: insErr } = await sb
    .from("messages")
    .insert(insertRow)
    .select("id")
    .single();

  if (insErr) {
    // 23505 = unique_violation on uq_messages_wa_id
    if (insErr.code === "23505") {
      const { data: existing2 } = await sb
        .from("messages")
        .select("id")
        .eq("wa_message_id", wamid)
        .maybeSingle();
      if (existing2) {
        const updates: Record<string, unknown> = { status: normalizedStatus };
        if (pricingCategory !== null) updates.pricing_category = pricingCategory;
        if (totalPrice !== null) updates.total_price = totalPrice;
        if (sendTime) updates.sent_at = sendTime;
        if (deliverTime) updates.delivered_at = deliverTime;
        if (readTime) updates.read_at = readTime;
        await sb.from("messages").update(updates).eq("id", existing2.id);
        return {
          processed: true,
          details: {
            agency_id: agencyCtx.agency_id,
            message_id: existing2.id,
            action: "updated_after_race",
            new_status: normalizedStatus,
          },
        };
      }
    }
    throw new Error(`outbound message insert failed: ${insErr.message}`);
  }

  return {
    processed: true,
    details: {
      agency_id: agencyCtx.agency_id,
      lead_id: lead.id,
      conversation_id: conv.id,
      message_id: inserted.id,
      action: "inserted_outbound_backfill",
      new_status: normalizedStatus,
    },
  };
}

async function processEvent(
  sb: SupabaseClient,
  eventType: string | null,
  payload: unknown,
): Promise<ProcessOutcome> {
  if (!payload || typeof payload !== "object") {
    return { processed: false, reason: "non_object_payload" };
  }
  const p = payload as Record<string, unknown>;

  switch (eventType) {
    case "whatsapp.inbound_message.received":
      return await handleInboundMessage(sb, p);
    case "whatsapp.message.updated":
      return await handleMessageUpdated(sb, p);
    default:
      return { processed: false, reason: "unknown_event_type" };
  }
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // Health check
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        status: "ok",
        function: "ycloud-webhook",
        version: FN_VERSION,
        secret_configured: YCLOUD_WEBHOOK_SECRET.length > 0,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Read raw body for byte-exact HMAC verification
  const rawBody = await req.text();

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const signatureHeader =
    req.headers.get("ycloud-signature") ??
    req.headers.get("x-ycloud-signature") ??
    req.headers.get("x-signature") ??
    req.headers.get("signature") ??
    null;

  const sigResult = await verifyYCloudSignature(rawBody, signatureHeader, YCLOUD_WEBHOOK_SECRET);

  // Parse JSON best-effort
  let payload: unknown = null;
  let eventType: string | null = null;
  try {
    payload = JSON.parse(rawBody);
    eventType = extractEventType(payload);
  } catch {
    // Not JSON — still log
  }

  // 1. Always log the raw event first
  const { data: rawRow, error: insertError } = await supabase
    .from("webhook_events_raw")
    .insert({
      provider: "ycloud",
      event_type: eventType,
      signature_header: signatureHeader,
      signature_valid: sigResult.valid,
      http_method: req.method,
      request_path: url.pathname,
      remote_ip: req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? null,
      headers,
      payload: payload as object | null,
      payload_text: rawBody,
      notes: sigResult.valid ? null : `sig_invalid: ${sigResult.reason}`,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("webhook_events_raw insert failed:", insertError);
    return new Response(
      JSON.stringify({ error: "log_failed", detail: insertError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const rawId = rawRow.id as string;

  // 2. If signature is invalid, do NOT process — return 200 (raw log already saved)
  if (!sigResult.valid) {
    return new Response(
      JSON.stringify({
        received: true,
        signature_valid: false,
        event_type: eventType,
        sig_reason: sigResult.reason,
        processed: false,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // 3. Process the event
  let outcome: ProcessOutcome;
  try {
    outcome = await processEvent(supabase, eventType, payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("processEvent threw:", msg);
    await supabase
      .from("webhook_events_raw")
      .update({ processing_error: msg })
      .eq("id", rawId);
    return new Response(
      JSON.stringify({
        received: true,
        signature_valid: true,
        event_type: eventType,
        processed: false,
        error: msg,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // 4. Record processing outcome on the raw row
  if (outcome.processed) {
    await supabase
      .from("webhook_events_raw")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", rawId);
  } else if (outcome.reason) {
    // Skipped (not an error, but useful to know why)
    await supabase
      .from("webhook_events_raw")
      .update({
        processing_error: `skipped: ${outcome.reason}${outcome.details ? ` ${JSON.stringify(outcome.details)}` : ""}`,
      })
      .eq("id", rawId);
  }

  return new Response(
    JSON.stringify({
      received: true,
      signature_valid: true,
      event_type: eventType,
      processed: outcome.processed,
      ...(outcome.reason ? { reason: outcome.reason } : {}),
      ...(outcome.details ? { details: outcome.details } : {}),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
