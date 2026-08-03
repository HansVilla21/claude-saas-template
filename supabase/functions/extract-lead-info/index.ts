// extract-lead-info — Edge Function v0.3.0
//
// Fired by an AFTER INSERT trigger on `public.messages` (only for inbound
// text messages). Reads the lead's recent conversation, asks OpenAI to
// extract structured intent (interest, budget, operation, properties),
// then merges the extraction into `public.leads` + `public.lead_tags` +
// `public.lead_property_interest`.
//
// Throttling: a single lead can be re-extracted at most once every
// THROTTLE_SECONDS. Bursts of messages collapse into a single LLM call.
//
// Auth: verify_jwt is DISABLED. The trigger sends a shared internal
// secret in `Authorization: Bearer <secret>`. We compare against the env
// var LEAD_EXTRACT_INTERNAL_SECRET.
//
// Env vars expected (set via supabase secrets):
//   - SUPABASE_URL                  (auto-injected)
//   - SUPABASE_SERVICE_ROLE_KEY     (auto-injected)
//   - OPENAI_API_KEY                (manual)
//   - LEAD_EXTRACT_INTERNAL_SECRET  (manual, shared with the trigger)
//   - OPENAI_MODEL                  (manual, default: gpt-4o-mini)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const INTERNAL_SECRET = Deno.env.get("LEAD_EXTRACT_INTERNAL_SECRET") ?? "";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";

const THROTTLE_SECONDS = 5;
const HISTORY_LIMIT = 20;
const FN_VERSION = "0.3.0";

// Closed set of segmentation tags. The LLM can ONLY pick from these.
// Topical/keyword tags ("CASAS", "VENTA") are not allowed — those belong
// to the message metadata, not the lead.
const ALLOWED_TAGS = [
  "Hot",
  "Tibio",
  "Frío",
  "Inversionista",
  "Familia",
  "Primera vivienda",
  "Urgente",
  "Solo viendo",
  "Cliente recurrente",
  "Necesita financiamiento",
] as const;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TriggerPayload = {
  agency_id: string;
  lead_id: string;
  message_id: string;
  conversation_id: string;
};

type Operation = "compra" | "alquiler" | "venta" | null;
type Currency = "CRC" | "USD" | null;

type Extraction = {
  interest_summary: string | null;
  operation: Operation;
  budget_min: number | null;
  budget_max: number | null;
  currency: Currency;
  bedrooms_wanted: number | null;
  bathrooms_wanted: number | null;
  property_type_wanted: string | null;
  preferred_zones: string[];
  interested_property_codes: string[];
  suggested_tags: string[];
  notes: string | null;
};

const EMPTY_EXTRACTION: Extraction = {
  interest_summary: null,
  operation: null,
  budget_min: null,
  budget_max: null,
  currency: null,
  bedrooms_wanted: null,
  bathrooms_wanted: null,
  property_type_wanted: null,
  preferred_zones: [],
  interested_property_codes: [],
  suggested_tags: [],
  notes: null,
};

// ---------------------------------------------------------------------------
// OpenAI structured output schema
// ---------------------------------------------------------------------------

const EXTRACTION_SCHEMA = {
  name: "lead_extraction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      interest_summary: {
        type: ["string", "null"],
        description:
          "1-2 frases en español describiendo qué busca el lead. Solo si el lead lo dijo explícitamente. Si no se sabe, null.",
      },
      operation: {
        type: ["string", "null"],
        enum: ["compra", "alquiler", "venta", null],
        description:
          "Tipo de operación que busca el lead. 'compra' si quiere comprar, 'alquiler' si quiere alquilar, 'venta' si quiere vender su propiedad. null si no se sabe.",
      },
      budget_min: {
        type: ["number", "null"],
        description: "Presupuesto mínimo en la moneda indicada, sin separadores. null si no se sabe.",
      },
      budget_max: {
        type: ["number", "null"],
        description: "Presupuesto máximo en la moneda indicada, sin separadores. null si no se sabe.",
      },
      currency: {
        type: ["string", "null"],
        enum: ["CRC", "USD", null],
        description: "Moneda del presupuesto. CRC = colones, USD = dólares. null si no se sabe.",
      },
      bedrooms_wanted: {
        type: ["integer", "null"],
        description: "Cantidad de dormitorios que pide el lead. null si no se sabe.",
      },
      bathrooms_wanted: {
        type: ["integer", "null"],
        description: "Cantidad de baños que pide el lead. null si no se sabe.",
      },
      property_type_wanted: {
        type: ["string", "null"],
        description:
          "Tipo de propiedad: 'casa', 'apartamento', 'lote', 'oficina', 'local'. null si no se sabe.",
      },
      preferred_zones: {
        type: "array",
        items: { type: "string" },
        description:
          "Zonas/cantones/barrios mencionados como interés. Ej: ['Escazú', 'Santa Ana']. Array vacío si nada.",
      },
      interested_property_codes: {
        type: "array",
        items: { type: "string" },
        description:
          "Códigos CR-NNNN que el LEAD mencionó/preguntó/confirmó interés. NO incluyas las que solo mostró el bot/agente y el lead no respondió. Array vacío si el lead no se interesó en ninguna específica.",
      },
      suggested_tags: {
        type: "array",
        items: { type: "string", enum: [...ALLOWED_TAGS] },
        description:
          "0-2 tags de SEGMENTACIÓN del lead, ELEGIDOS de la lista permitida. Son etiquetas sobre la persona/intención (cómo es como cliente), NO sobre el contenido de la conversación. Si no hay evidencia clara para ninguna, devolvé array vacío.",
      },
      notes: {
        type: ["string", "null"],
        description:
          "Información adicional relevante (timeline, motivo, condiciones especiales). null si nada nuevo.",
      },
    },
    required: [
      "interest_summary",
      "operation",
      "budget_min",
      "budget_max",
      "currency",
      "bedrooms_wanted",
      "bathrooms_wanted",
      "property_type_wanted",
      "preferred_zones",
      "interested_property_codes",
      "suggested_tags",
      "notes",
    ],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  // ─── 1. Auth: shared internal secret ─────────────────────────────────
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!INTERNAL_SECRET || !constantTimeEqual(provided, INTERNAL_SECRET)) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  // ─── 2. Parse payload ────────────────────────────────────────────────
  let payload: TriggerPayload;
  try {
    payload = (await req.json()) as TriggerPayload;
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }
  const { agency_id, lead_id } = payload;
  if (!agency_id || !lead_id) {
    return jsonResponse(400, { error: "missing_fields" });
  }

  // ─── 3. Throttle by last_extraction_at ───────────────────────────────
  const { data: leadRow, error: leadErr } = await supabase
    .from("leads")
    .select(
      "id, agency_id, status, interest_summary, operation, budget_min, budget_max, budget_currency, notes, metadata, last_extraction_at",
    )
    .eq("id", lead_id)
    .eq("agency_id", agency_id)
    .maybeSingle();
  if (leadErr || !leadRow) {
    return jsonResponse(404, { error: "lead_not_found", detail: leadErr?.message });
  }

  if (leadRow.last_extraction_at) {
    const last = new Date(leadRow.last_extraction_at as string).getTime();
    if (!Number.isNaN(last) && Date.now() - last < THROTTLE_SECONDS * 1000) {
      return jsonResponse(202, { skipped: "throttled", version: FN_VERSION });
    }
  }

  // ─── 4. Load conversation history ────────────────────────────────────
  const { data: msgRows, error: msgErr } = await supabase
    .from("messages")
    .select("direction, sender_kind, kind, body, created_at")
    .eq("lead_id", lead_id)
    .eq("agency_id", agency_id)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (msgErr) {
    return jsonResponse(500, { error: "messages_query_failed", detail: msgErr.message });
  }
  const messages = (msgRows ?? []).reverse(); // oldest → newest
  if (messages.length === 0) {
    return jsonResponse(200, { skipped: "no_messages", version: FN_VERSION });
  }

  // Build the chat transcript for the LLM.
  const transcript = messages
    .map((m) => {
      const speaker =
        m.direction === "inbound"
          ? "Lead"
          : m.sender_kind === "bot"
          ? "Bot"
          : "Agente";
      const body = (m.body ?? "").trim();
      if (!body) return null;
      return `${speaker}: ${body}`;
    })
    .filter((s): s is string => !!s)
    .join("\n");

  if (!transcript) {
    return jsonResponse(200, { skipped: "empty_transcript", version: FN_VERSION });
  }

  // ─── 5. Call OpenAI ──────────────────────────────────────────────────
  const currentState = {
    interest_summary: leadRow.interest_summary,
    operation: leadRow.operation,
    budget_min: leadRow.budget_min,
    budget_max: leadRow.budget_max,
    currency: leadRow.budget_currency,
    notes: leadRow.notes,
  };

  const systemPrompt = [
    "Sos un extractor de información para un CRM inmobiliario en Costa Rica.",
    "Tu tarea: leer un historial de WhatsApp entre un LEAD y un AGENTE/BOT y extraer SOLO datos que el LEAD haya confirmado.",
    "",
    "REGLAS CRÍTICAS:",
    "- Si algo no se mencionó, devolvé null o array vacío. NO INVENTES.",
    "- Distinguí siempre entre lo que dijo el LEAD vs lo que dijo el BOT/AGENTE. Las preferencias salen SOLO de lo que dijo el lead.",
    "",
    "PRESUPUESTO:",
    "- Si el lead dijo un rango ('entre 200 y 300 mil'), usá budget_min y budget_max.",
    "- Si dijo solo un techo ('hasta $500k', 'máximo X'), usá budget_max.",
    "- Si dijo un piso ('al menos X', 'mínimo Y'), usá budget_min.",
    "- currency: $ o 'dólares' → USD. ₡, 'colones' o 'millones' sin $ → CRC.",
    "",
    "ZONAS: cantones, distritos o barrios de Costa Rica (Escazú, Santa Ana, Heredia, etc.). NO países, NO ciudades ya implícitas.",
    "",
    "interested_property_codes — REGLA ESTRICTA:",
    "- Incluí un código SOLO si el LEAD:",
    "  (a) escribió el código él mismo ('me interesa la CR-2031'), o",
    "  (b) respondió pidiendo más info de UNA propiedad específica que el bot mostró ('contame de la primera', 'esa de Escazú me interesa', '¿la de $485k todavía está?').",
    "- Si el bot mostró 3 propiedades y el lead solo dijo 'ok gracias' o no respondió, devolvé array VACÍO.",
    "- En la duda, devolvé vacío. Es peor un falso positivo que un vacío.",
    "",
    "suggested_tags — REGLA ESTRICTA:",
    "- Solo podés elegir de esta lista cerrada: " + ALLOWED_TAGS.join(", "),
    "- Son tags de SEGMENTACIÓN sobre la persona (cómo es como cliente), no sobre el contenido de la conversación.",
    "- 'Hot' = decidido, pregunta detalles concretos, urgencia explícita.",
    "- 'Tibio' = interesado pero explorando, sin urgencia.",
    "- 'Frío' = solo curiosidad, sin intención de compra próxima.",
    "- 'Inversionista' = mencionó comprar para alquilar/revender, o múltiples propiedades.",
    "- 'Familia' = mencionó esposa/hijos/cambio de hogar familiar.",
    "- 'Primera vivienda' = es su primera compra de propiedad.",
    "- 'Urgente' = tiene deadline ('para fin de mes', 'antes de marzo').",
    "- 'Solo viendo' = explícitamente dijo que no está listo aún.",
    "- 'Necesita financiamiento' = preguntó por préstamos/hipotecas/financiación.",
    "- Si no hay evidencia clara para NINGUNA, devolvé array vacío. NO forzar tags.",
  ].join("\n");

  const userPrompt = [
    `Estado actual del lead en el CRM (puede estar incompleto):`,
    "```json",
    JSON.stringify(currentState, null, 2),
    "```",
    "",
    `Historial de la conversación (últimos ${messages.length} mensajes):`,
    "```",
    transcript,
    "```",
    "",
    "Extraé lo que el lead haya CONFIRMADO en este historial. Si un dato ya estaba en el estado y el lead no lo cambió, podés repetirlo. Si el lead dijo algo nuevo, usá lo nuevo.",
  ].join("\n");

  let extraction: Extraction = { ...EMPTY_EXTRACTION };
  try {
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: EXTRACTION_SCHEMA,
        },
      }),
    });
    if (!aiRes.ok) {
      const detail = await aiRes.text();
      return jsonResponse(502, {
        error: "openai_error",
        status: aiRes.status,
        detail: detail.slice(0, 500),
      });
    }
    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content;
    if (typeof raw !== "string") {
      return jsonResponse(502, { error: "openai_no_content" });
    }
    extraction = { ...EMPTY_EXTRACTION, ...(JSON.parse(raw) as Partial<Extraction>) };
  } catch (e) {
    return jsonResponse(502, {
      error: "openai_exception",
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // ─── 6. Merge extraction with current lead state ─────────────────────
  // Strategy: only overwrite when the LLM returned a non-null value. The
  // LLM is instructed to repeat known values, so this naturally preserves
  // anything it dropped accidentally.
  const updates: Record<string, unknown> = {};
  if (extraction.interest_summary && extraction.interest_summary.trim()) {
    updates.interest_summary = extraction.interest_summary.trim();
  }
  if (extraction.operation) {
    updates.operation = extraction.operation;
  }
  if (extraction.budget_min != null) {
    updates.budget_min = extraction.budget_min;
  }
  if (extraction.budget_max != null) {
    updates.budget_max = extraction.budget_max;
  }
  if (extraction.currency) {
    updates.budget_currency = extraction.currency;
  }
  // Build a human-readable budget label for the lead panel.
  if (extraction.budget_min != null || extraction.budget_max != null) {
    const cur = extraction.currency ?? leadRow.budget_currency ?? "USD";
    const fmt = (n: number) =>
      cur === "CRC"
        ? `₡${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
        : `$${new Intl.NumberFormat("en-US").format(n)}`;
    const lo = extraction.budget_min;
    const hi = extraction.budget_max;
    if (lo != null && hi != null) updates.budget_label = `${fmt(lo)} – ${fmt(hi)}`;
    else if (hi != null) updates.budget_label = `Hasta ${fmt(hi)}`;
    else if (lo != null) updates.budget_label = `Desde ${fmt(lo)}`;
  }
  if (extraction.notes && extraction.notes.trim()) {
    updates.notes = extraction.notes.trim();
  }
  // Stash zones + property type + bedrooms/baths in metadata jsonb
  // (no dedicated columns for these yet).
  const newMetadata = {
    ...((leadRow.metadata as Record<string, unknown>) ?? {}),
    extracted: {
      bedrooms_wanted: extraction.bedrooms_wanted,
      bathrooms_wanted: extraction.bathrooms_wanted,
      property_type_wanted: extraction.property_type_wanted,
      preferred_zones: extraction.preferred_zones,
      updated_at: new Date().toISOString(),
    },
  };
  updates.metadata = newMetadata;
  updates.last_extraction_at = new Date().toISOString();
  updates.last_extraction_message_id = payload.message_id;

  // ─── Status auto-derivation ──────────────────────────────────────────
  // Only auto-update the early-funnel statuses (nuevo / contactado /
  // calificado). The agent-driven states (visita_agendada, en_negociacion,
  // cerrado_*, frio) are untouched — the bot never downgrades.
  //
  // Rules:
  //   - calificado:   intent (op/zone/type) + budget known → ready to be worked
  //   - contactado:   bot/agente respondió en algún momento; conversación viva
  //   - nuevo:        sin respuesta del bot/agente aún (raro a esta altura)
  const CURRENT_STATUS = leadRow.status as string | null;
  const BOT_DRIVABLE = new Set(["nuevo", "contactado", "calificado"]);

  if (CURRENT_STATUS && BOT_DRIVABLE.has(CURRENT_STATUS)) {
    // Merge known + just-extracted facts to make the qualification call.
    const knownOperation = extraction.operation ?? leadRow.operation ?? null;
    const knownBudget =
      extraction.budget_min ?? leadRow.budget_min ?? extraction.budget_max ?? leadRow.budget_max ?? null;
    const knownIntent =
      (extraction.preferred_zones?.length ?? 0) > 0 ||
      !!extraction.property_type_wanted ||
      !!extraction.interest_summary ||
      !!leadRow.interest_summary;
    const hasOutbound = messages.some((m) => m.direction === "outbound");

    let nextStatus: string;
    if (knownOperation && knownBudget != null && knownIntent) {
      nextStatus = "calificado";
    } else if (hasOutbound) {
      nextStatus = "contactado";
    } else {
      nextStatus = "nuevo";
    }

    // Never downgrade. Order: nuevo < contactado < calificado.
    const RANK: Record<string, number> = { nuevo: 0, contactado: 1, calificado: 2 };
    if ((RANK[nextStatus] ?? 0) > (RANK[CURRENT_STATUS] ?? 0)) {
      updates.status = nextStatus;
    }
  }

  const { error: updErr } = await supabase
    .from("leads")
    .update(updates)
    .eq("id", lead_id)
    .eq("agency_id", agency_id);
  if (updErr) {
    return jsonResponse(500, { error: "lead_update_failed", detail: updErr.message });
  }

  // ─── 7. Tags: insert any new ones (tags table is per-agency) ─────────
  // Defense in depth: filter to ALLOWED_TAGS even though the schema's enum
  // already restricts it. If the LLM ever drifts, we don't pollute tags.
  const allowedSet = new Set<string>(ALLOWED_TAGS as readonly string[]);
  if (extraction.suggested_tags.length > 0) {
    const tagNames = Array.from(
      new Set(
        extraction.suggested_tags
          .map((t) => t.trim())
          .filter((t) => t.length > 0 && allowedSet.has(t)),
      ),
    );

    // Lookup existing tags for this agency.
    const { data: existingTags } = await supabase
      .from("tags")
      .select("id, name")
      .eq("agency_id", agency_id)
      .in("name", tagNames);
    const existingByName = new Map(
      (existingTags ?? []).map((t) => [t.name as string, t.id as string]),
    );

    const tagIds: string[] = [];
    for (const name of tagNames) {
      let id = existingByName.get(name);
      if (!id) {
        const { data: ins } = await supabase
          .from("tags")
          .insert({ agency_id, name, system: false })
          .select("id")
          .single();
        id = ins?.id;
      }
      if (id) tagIds.push(id);
    }

    if (tagIds.length > 0) {
      const rows = tagIds.map((tag_id) => ({
        agency_id,
        lead_id,
        tag_id,
      }));
      await supabase.from("lead_tags").upsert(rows, {
        onConflict: "lead_id,tag_id",
        ignoreDuplicates: true,
      });
    }
    // Note: we intentionally do NOT remove existing tags here. If an agent
    // added a tag manually, we want to keep it. The LLM is additive only.
  }

  // ─── 8. Properties: link interest by property code ───────────────────
  if (extraction.interested_property_codes.length > 0) {
    const codes = Array.from(
      new Set(
        extraction.interested_property_codes.map((c) => c.trim().toUpperCase()).filter(Boolean),
      ),
    );
    const { data: props } = await supabase
      .from("properties")
      .select("id, code")
      .eq("agency_id", agency_id)
      .in("code", codes);
    if (props && props.length > 0) {
      const rows = props.map((p) => ({
        agency_id,
        lead_id,
        property_id: p.id as string,
        source: "chatbot" as const,
      }));
      await supabase.from("lead_property_interest").upsert(rows, {
        onConflict: "lead_id,property_id",
        ignoreDuplicates: true,
      });
    }
  }

  return jsonResponse(200, {
    ok: true,
    version: FN_VERSION,
    extraction,
    applied: Object.keys(updates),
  });
});
