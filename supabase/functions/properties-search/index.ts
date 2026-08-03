// properties-search v1.5 — multi-pass fallback con relajación inteligente + multi-imagen.
//
// Cambios vs v1.4:
//   - NUEVO: `foto_urls: string[]` — array completo de URLs públicas (hasta 5 por propiedad).
//   - NUEVO: `foto_count: number` — len de foto_urls (útil para el LLM decidir mostrar foto o no).
//   - MANTIENE: `foto_url` (primera URL o null) → retrocompat 100% con workflow v4.
//   - Filtrado defensivo: solo URLs `string` no vacías entran en `foto_urls`.
//   - Cap a 5 URLs por propiedad (Sofia solo manda 3; suficiente margen).
//
// Razón del cambio: Sofia v5 escribe markers `[IMG:CR-XXXX]` y el Code node de N8N
// necesita resolver URLs por código. Mantener `foto_url` evita romper v4 si el
// founder no ha migrado todavía.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PROPERTIES_SEARCH_SECRET = Deno.env.get("PROPERTIES_SEARCH_SECRET") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const VALID_TYPES = new Set([
  "casa", "apartamento", "villa", "lote",
  "local_comercial", "oficina", "edificio", "finca", "bodega",
]);
const VALID_OPERATIONS = new Set(["venta", "alquiler", "alquiler_temporal"]);

const MIN_RESULTS_TARGET = 3;
const MAX_PHOTOS_PER_PROPERTY = 5; // hard cap para el array foto_urls

const ZONE_GROUPS: Record<string, string[]> = {
  "gam": ["san jose", "heredia", "alajuela", "cartago"],
  "gran area metropolitana": ["san jose", "heredia", "alajuela", "cartago"],
  "valle central": ["san jose", "heredia", "alajuela", "cartago"],
  "area metropolitana": ["san jose", "heredia", "alajuela", "cartago"],
};
const ZONE_ACCENT_VARIANTS: Record<string, string[]> = {
  "san jose": ["san jose", "san josé"],
  "limon": ["limon", "limón"],
  "escazu": ["escazu", "escazú"],
  "perez zeledon": ["perez zeledon", "pérez zeledón"],
  "belen": ["belen", "belén"],
};

function stripAccents(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function buildZoneTokens(zonaRaw: string): string[] {
  const input = stripAccents(zonaRaw.trim());
  if (!input) return [];
  const splitParts = input
    .split(/\s+o\s+|\s+y\s+|,|\/|\bor\b/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const afterGroups: string[] = [];
  for (const tok of splitParts) {
    if (ZONE_GROUPS[tok]) afterGroups.push(...ZONE_GROUPS[tok]);
    else afterGroups.push(tok);
  }
  const final = new Set<string>();
  for (const tok of afterGroups) {
    if (ZONE_ACCENT_VARIANTS[tok]) {
      for (const v of ZONE_ACCENT_VARIANTS[tok]) final.add(v);
    } else final.add(tok);
  }
  return Array.from(final);
}

function safeNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function safeString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}
function escapeIlike(s: string): string {
  return s.replace(/[%_\\]/g, (m) => "\\" + m);
}

type Proximidad =
  | "exacta"
  | "fuera_presupuesto_arriba"
  | "fuera_presupuesto_abajo"
  | "otro_tipo"
  | "otro_tipo_fuera_presupuesto";

/**
 * Extrae todas las URLs válidas del array `images` JSONB.
 *
 * Cada item puede tener forma `{url: "...", alt?, order?}` o forma simple `{url: "..."}`.
 * Filtra:
 *  - items que no son objetos
 *  - items sin campo `url`
 *  - urls que no son `string`
 *  - urls vacías o solo whitespace
 *
 * Devuelve hasta MAX_PHOTOS_PER_PROPERTY URLs, en el orden de inserción del JSONB
 * (que coincide con `order` 0..N en los seeds actuales).
 */
function extractPhotoUrls(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  const urls: string[] = [];
  for (const item of images) {
    if (!item || typeof item !== "object") continue;
    const url = (item as { url?: unknown }).url;
    if (typeof url !== "string") continue;
    const trimmed = url.trim();
    if (trimmed.length === 0) continue;
    urls.push(trimmed);
    if (urls.length >= MAX_PHOTOS_PER_PROPERTY) break;
  }
  return urls;
}

function toItem(p: Record<string, unknown>) {
  const fotoUrls = extractPhotoUrls(p.images);
  const fotoUrl = fotoUrls[0] ?? null;
  const priceLabel = p.operation === "alquiler" || p.operation === "alquiler_temporal"
    ? `$${Number(p.price).toLocaleString("en-US")}/mes`
    : `$${Number(p.price).toLocaleString("en-US")}`;
  const specs: string[] = [];
  if (p.bedrooms !== null) specs.push(`${p.bedrooms} dorm`);
  if (p.bathrooms !== null) specs.push(`${p.bathrooms} baños`);
  if (p.area_built_m2 !== null) specs.push(`${p.area_built_m2}m²`);
  if (p.parking_spaces !== null) specs.push(`${p.parking_spaces} parqueo`);
  return {
    codigo: p.code,
    titulo: p.title,
    tipo: p.type,
    operacion: p.operation,
    precio: priceLabel,
    precio_numero: Number(p.price),
    moneda: p.currency,
    ubicacion: p.location_text,
    barrio: p.neighborhood,
    canton: p.canton,
    especificaciones: specs.join(" · "),
    dormitorios: p.bedrooms,
    banos: p.bathrooms,
    area_m2: p.area_built_m2,
    parqueos: p.parking_spaces,
    caracteristicas: p.features ?? [],
    descripcion_corta: (p.description as string ?? "").slice(0, 300),
    foto_url: fotoUrl,         // retrocompat con v4 (primera URL o null)
    foto_urls: fotoUrls,       // NUEVO en v1.5 (array completo, cap 5)
    foto_count: fotoUrls.length, // NUEVO en v1.5
    link_externo: p.external_url,
    status: p.status,
    destacada: !!p.featured,
  };
}

function proximidadByPrice(price: number, target: number | null): Proximidad {
  if (target === null) return "exacta";
  if (price === target) return "exacta";
  if (price > target) return "fuera_presupuesto_arriba";
  return "fuera_presupuesto_abajo";
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        status: "ok", function: "properties-search", version: "1.5.0",
        secret_configured: PROPERTIES_SEARCH_SECRET.length > 0,
        changes: "v1.5 adds foto_urls (array) + foto_count. foto_url kept for backcompat.",
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const headerSecret = req.headers.get("x-search-secret") ?? "";
  const querySecret = url.searchParams.get("secret") ?? "";
  const provided = headerSecret || querySecret;
  if (!PROPERTIES_SEARCH_SECRET || provided !== PROPERTIES_SEARCH_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400, headers: { "Content-Type": "application/json" } }); }

  const agencyId = safeString(body.agency_id);
  if (!agencyId) return new Response(JSON.stringify({ error: "agency_id_required" }), { status: 400, headers: { "Content-Type": "application/json" } });

  const tipoRaw = safeString(body.tipo);
  const tipo = tipoRaw && VALID_TYPES.has(tipoRaw) ? tipoRaw : null;
  const operacionRaw = safeString(body.operacion);
  const operacion = operacionRaw && VALID_OPERATIONS.has(operacionRaw) ? operacionRaw : null;
  const zonaRaw = safeString(body.zona);
  const zonaTokens = zonaRaw ? buildZoneTokens(zonaRaw) : [];
  const precioMin = safeNumber(body.precio_min);
  const precioMax = safeNumber(body.precio_max);
  const dormitoriosMin = safeNumber(body.dormitorios_min);
  const codigo = safeString(body.codigo);
  let limit = safeNumber(body.limit) ?? 5;
  if (limit < 1) limit = 1;
  if (limit > 50) limit = 50;

  type PassOpts = { skipPrice?: boolean; skipType?: boolean; };
  const baseQuery = (opts: PassOpts = {}) => {
    let q = supabase
      .from("properties")
      .select(
        "id, code, title, type, operation, price, currency, bedrooms, bathrooms, " +
        "area_built_m2, area_lot_m2, parking_spaces, location_text, neighborhood, " +
        "canton, province, description, features, images, external_url, status, featured",
      )
      .eq("agency_id", agencyId)
      .is("archived_at", null)
      .in("status", ["disponible", "reservada"]);
    if (tipo && !opts.skipType) q = q.eq("type", tipo);
    if (operacion) q = q.eq("operation", operacion);
    if (dormitoriosMin !== null) q = q.gte("bedrooms", dormitoriosMin);
    if (codigo) q = q.ilike("code", `%${escapeIlike(codigo)}%`);
    if (zonaTokens.length > 0) {
      const conds = zonaTokens.flatMap((t) => {
        const e = escapeIlike(t);
        return [
          `location_text.ilike.%${e}%`,
          `neighborhood.ilike.%${e}%`,
          `canton.ilike.%${e}%`,
          `province.ilike.%${e}%`,
        ];
      });
      q = q.or(conds.join(","));
    }
    if (!opts.skipPrice) {
      if (precioMin !== null) q = q.gte("price", precioMin);
      if (precioMax !== null) q = q.lte("price", precioMax);
    }
    return q;
  };

  type Enriched = ReturnType<typeof toItem> & {
    proximidad: Proximidad;
    relajado: ("precio" | "tipo")[];
  };

  const seen = new Set<string>();
  const results: Enriched[] = [];
  const relaxations: string[] = [];

  // PASS 1 — strict
  {
    const { data, error } = await baseQuery()
      .order("featured", { ascending: false })
      .order("price", { ascending: true })
      .limit(limit);
    if (error) {
      return new Response(JSON.stringify({ error: "query_failed", detail: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
    for (const row of data ?? []) {
      if (seen.has(row.id as string)) continue;
      seen.add(row.id as string);
      results.push({ ...toItem(row), proximidad: "exacta", relajado: [] });
    }
  }

  // PASS 2 — relax price
  if (results.length < MIN_RESULTS_TARGET && (precioMin !== null || precioMax !== null)) {
    const { data } = await baseQuery({ skipPrice: true })
      .order("featured", { ascending: false })
      .order("price", { ascending: true })
      .limit(limit + 5);
    const target = precioMax ?? precioMin ?? 0;
    const candidates = (data ?? [])
      .filter((r) => !seen.has(r.id as string))
      .map((r) => {
        const price = Number(r.price);
        const distance = target ? Math.abs(price - target) : 0;
        return { row: r, distance };
      })
      .sort((a, b) => a.distance - b.distance);
    for (const c of candidates) {
      if (results.length >= Math.max(MIN_RESULTS_TARGET, limit)) break;
      seen.add(c.row.id as string);
      const price = Number(c.row.price);
      results.push({
        ...toItem(c.row),
        proximidad: proximidadByPrice(price, target || null),
        relajado: ["precio"],
      });
    }
    if (candidates.length > 0) relaxations.push("precio");
  }

  // PASS 3 — relax type
  if (results.length < MIN_RESULTS_TARGET && tipo) {
    const { data } = await baseQuery({ skipType: true })
      .order("featured", { ascending: false })
      .order("price", { ascending: true })
      .limit(limit + 5);
    const candidates = (data ?? [])
      .filter((r) => !seen.has(r.id as string) && r.type !== tipo)
      .map((r) => {
        const price = Number(r.price);
        const target = precioMax ?? precioMin ?? null;
        const distance = target ? Math.abs(price - target) : 0;
        return { row: r, distance };
      })
      .sort((a, b) => a.distance - b.distance);
    for (const c of candidates) {
      if (results.length >= Math.max(MIN_RESULTS_TARGET, limit)) break;
      seen.add(c.row.id as string);
      results.push({
        ...toItem(c.row),
        proximidad: "otro_tipo",
        relajado: ["tipo"],
      });
    }
    if (candidates.length > 0) relaxations.push("tipo");
  }

  // PASS 4 — relax both
  if (results.length < MIN_RESULTS_TARGET && tipo && (precioMin !== null || precioMax !== null)) {
    const { data } = await baseQuery({ skipPrice: true, skipType: true })
      .order("featured", { ascending: false })
      .order("price", { ascending: true })
      .limit(limit + 5);
    const candidates = (data ?? [])
      .filter((r) => !seen.has(r.id as string) && r.type !== tipo)
      .map((r) => {
        const price = Number(r.price);
        const target = precioMax ?? precioMin ?? 0;
        const distance = target ? Math.abs(price - target) : 0;
        return { row: r, distance };
      })
      .sort((a, b) => a.distance - b.distance);
    for (const c of candidates) {
      if (results.length >= Math.max(MIN_RESULTS_TARGET, limit)) break;
      seen.add(c.row.id as string);
      results.push({
        ...toItem(c.row),
        proximidad: "otro_tipo_fuera_presupuesto",
        relajado: ["tipo", "precio"],
      });
    }
    if (candidates.length > 0) {
      if (!relaxations.includes("precio")) relaxations.push("precio");
      if (!relaxations.includes("tipo")) relaxations.push("tipo");
    }
  }

  const trimmed = results.slice(0, limit);

  return new Response(
    JSON.stringify({
      total: trimmed.length,
      relajaciones_aplicadas: relaxations,
      filtros_aplicados: {
        tipo, operacion, zona: zonaRaw,
        zona_tokens_expandidos: zonaTokens,
        precio_min: precioMin, precio_max: precioMax,
        dormitorios_min: dormitoriosMin, codigo, limit,
      },
      fallback_applied: relaxations.length > 0,
      fallback_reason: relaxations.length > 0 ? `relajado:${relaxations.join("+")}` : null,
      propiedades: trimmed,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
