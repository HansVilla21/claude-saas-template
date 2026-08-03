// request-handoff — Edge Function v0.1.0
//
// Called by N8N (via the "Solicitar Handoff" agent tool) or by the CRM
// (e.g. agent clicks "Tomar conversación") to escalate a conversation
// to a human agent.
//
// All this function does:
//   1. Validate auth + input
//   2. UPDATE conversations SET handoff_status='pending',
//      handoff_reason=$reason, handoff_summary=$summary, handoff_at=now()
//
// The Postgres trigger `tg_handoff_create_task` does the rest:
//   - Creates the high-priority followup task (due in 30 minutes)
//   - Sets handler='human' (silences the bot in this conversation)
//   - Links handoff_task_id back on the conversation
//
// The Postgres trigger `tg_handoff_mark_handled` auto-marks the handoff
// 'handled' when the agent sends their first outbound message.
//
// Auth: verify_jwt is DISABLED. Caller must include
//       Authorization: Bearer <HANDOFF_INTERNAL_SECRET>
//
// Env vars expected (set via `supabase secrets set`):
//   - SUPABASE_URL                  (auto-injected)
//   - SUPABASE_SERVICE_ROLE_KEY     (auto-injected)
//   - HANDOFF_INTERNAL_SECRET       (manual, shared with N8N + CRM action)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("HANDOFF_INTERNAL_SECRET") ?? "";

const FN_VERSION = "0.1.0";

const ALLOWED_REASONS = [
  "qualified",
  "scheduling",
  "objection_complex",
  "bot_stuck",
  "manual",
] as const;
type HandoffReason = (typeof ALLOWED_REASONS)[number];

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// HTTP entry
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  // ── Auth ────────────────────────────────────────────────────────────
  if (!INTERNAL_SECRET) {
    // Misconfigured deploy. Fail loud so we don't accept anonymous calls.
    return json({ ok: false, error: "server_misconfigured" }, 500);
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (token !== INTERNAL_SECRET) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  // ── Body ────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const input = body as {
    conversation_id?: string;
    reason?: string;
    summary?: string | null;
    source?: "n8n" | "crm" | string | null;
  };

  if (!input.conversation_id || typeof input.conversation_id !== "string") {
    return json({ ok: false, error: "conversation_id_required" }, 400);
  }
  if (!input.reason || !ALLOWED_REASONS.includes(input.reason as HandoffReason)) {
    return json(
      { ok: false, error: "reason_invalid", allowed: ALLOWED_REASONS },
      400,
    );
  }

  // summary is optional but recommended — the trigger will fall back to
  // a generic message in the task notes if it's missing.
  const summary =
    typeof input.summary === "string" && input.summary.trim().length > 0
      ? input.summary.trim().slice(0, 1000)
      : null;

  // ── Lookup conversation (verify it exists + read current state) ─────
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, agency_id, lead_id, handoff_status")
    .eq("id", input.conversation_id)
    .maybeSingle();

  if (convErr) {
    return json({ ok: false, error: "db_lookup_failed", detail: convErr.message }, 500);
  }
  if (!conv) {
    return json({ ok: false, error: "conversation_not_found" }, 404);
  }

  // Idempotent: if it's already pending, return the existing state
  // without re-firing the trigger (which would create a duplicate task).
  if (conv.handoff_status === "pending") {
    const { data: existing } = await supabase
      .from("conversations")
      .select("handoff_task_id, handoff_reason, handoff_summary, handoff_at")
      .eq("id", conv.id)
      .single();
    return json({
      ok: true,
      already_pending: true,
      conversation_id: conv.id,
      task_id: existing?.handoff_task_id ?? null,
      handoff_reason: existing?.handoff_reason ?? null,
      handoff_summary: existing?.handoff_summary ?? null,
      handoff_at: existing?.handoff_at ?? null,
      version: FN_VERSION,
    });
  }

  // ── Update — the trigger creates task + flips handler ───────────────
  const { error: updErr } = await supabase
    .from("conversations")
    .update({
      handoff_status: "pending",
      handoff_reason: input.reason,
      handoff_summary: summary,
      handoff_at: new Date().toISOString(),
    })
    .eq("id", conv.id);

  if (updErr) {
    return json(
      { ok: false, error: "update_failed", detail: updErr.message },
      500,
    );
  }

  // Read the linked task id back so the caller (N8N) can include it
  // in any downstream notification it sends (Telegram / WhatsApp).
  const { data: linked } = await supabase
    .from("conversations")
    .select("handoff_task_id")
    .eq("id", conv.id)
    .single();

  return json({
    ok: true,
    conversation_id: conv.id,
    task_id: linked?.handoff_task_id ?? null,
    source: input.source ?? null,
    version: FN_VERSION,
  });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
