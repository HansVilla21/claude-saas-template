# Skill: Apify Integration Pattern

## Cuándo usar esta skill

- Cuando necesitás scraping de Instagram, TikTok, Google Maps, YouTube, LinkedIn, o cualquier sitio con anti-bot
- Cuando evaluás si usar Apify SDK vs fetch directo
- Cuando un actor de Apify retorna valores anómalos (`-1`, `null`, `undefined`) y hay que normalizarlos antes de persistir en DB
- Cuando necesitás estimar costos de un actor antes de usarlo en producción

## Por qué fetch directo, NO el SDK

`apify-client` instala `proxy-agent` como dependencia transitiva. `proxy-agent` llama a `net.createConnection` al importar, lo que **crashea en Vercel Edge/Serverless** (no-op de red). El SDK no funciona en producción en Vercel.

**Siempre usar fetch directo a la REST API de Apify.**

## Proceso

### Paso 1: Descubrir el actor correcto

```typescript
// Buscar en https://apify.com/store — filtrar por rating y uso
// Los actores más confiables para scraping social:
// - Instagram profiles:  apify/instagram-scraper
// - Instagram reels:     apify/instagram-reel-scraper
// - TikTok profiles:     clockworks/free-tiktok-scraper
// - Google Maps:         compass/crawler-google-places
// - YouTube:             bernardo/youtube-scraper
```

### Paso 2: Llamada al actor via REST

```typescript
// lib/scraping/apify-client.ts
const APIFY_BASE = "https://api.apify.com/v2";

interface ApifyRunResult<T> {
  items: T[];
}

export async function runApifyActor<T>(
  actorId: string,
  input: Record<string, unknown>,
  options?: { timeoutSecs?: number }
): Promise<T[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN not set");

  // Iniciar run y esperar resultado (synchronous run — espera hasta timeoutSecs)
  const res = await fetch(
    `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items?token=${token}&timeout=${options?.timeoutSecs ?? 120}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ScraperError("PROVIDER_DOWN", `Apify HTTP ${res.status}: ${text}`);
  }

  const data = await res.json() as T[];
  return data;
}
```

### Paso 3: Normalizar — NUNCA confiar en los valores raw

Apify puede retornar:
- `likesCount: -1` cuando IG tiene "Hide Like Count" activado
- `videoPlayCount: null` en reels sin datos públicos
- `commentsCount: undefined` si el actor no lo expone
- `timestamp: "2024-01-15T10:30:00.000Z"` (string, no Date)
- `followers_count` en algunos actores vs `followersCount` en otros (snake vs camel)

**Patrón de normalización seguro:**

```typescript
function normalizeReel(item: ApifyRawItem): NormalizedReel {
  const rawLikes = item.likesCount ?? 0;
  const likesHidden = rawLikes < 0;           // -1 = likes ocultos

  return {
    externalId:    item.shortCode ?? item.id ?? "",
    url:           item.url ?? `https://www.instagram.com/reel/${item.shortCode}/`,
    thumbnailUrl:  item.displayUrl ?? null,
    caption:       item.caption ?? null,
    viewsCount:    Math.max(0, item.videoPlayCount ?? item.videoViewCount ?? 0),
    likesCount:    Math.max(0, rawLikes),       // Math.max clampea -1 a 0
    likesHidden,
    commentsCount: Math.max(0, item.commentsCount ?? 0),
    publishedAt:   item.timestamp ? new Date(item.timestamp) : null,
    videoCdnUrl:   item.videoUrl ?? null,
  };
}
```

**Regla:** `Math.max(0, valor ?? 0)` en TODOS los campos numéricos que van a DB. Las constraints de Postgres (`CHECK (x >= 0)`) van a rechazar `-1` con error 23514.

### Paso 4: Error handling tipado

```typescript
export type ScraperErrorCode =
  | "RATE_LIMIT"
  | "PROFILE_NOT_FOUND"
  | "PROFILE_PRIVATE"
  | "PROVIDER_DOWN"
  | "BAD_RESPONSE"
  | "TIMEOUT"
  | "UNKNOWN";

export class ScraperError extends Error {
  constructor(
    public readonly code: ScraperErrorCode,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ScraperError";
  }

  toJSON() {
    return { name: this.name, code: this.code, message: this.message };
  }
}

// En el adapter, traducir HTTP errors a ScraperError:
if (res.status === 429) throw new ScraperError("RATE_LIMIT", "Apify rate limit hit");
if (res.status >= 500) throw new ScraperError("PROVIDER_DOWN", `Apify ${res.status}`);
if (!Array.isArray(data) || data.length === 0) throw new ScraperError("PROFILE_NOT_FOUND", handle);
```

### Paso 5: Estimar costos antes de producción

Abrir la página del actor en Apify Store → "Pricing" → ver costo por 1000 items o por hora de compute.

Referencia orientativa (puede cambiar):
- `apify/instagram-scraper` (perfil + 30 reels): ~$0.005-0.01 USD por run
- `apify/instagram-reel-scraper` (1 reel): ~$0.001-0.003 USD por run
- `clockworks/free-tiktok-scraper`: gratuito con limitaciones, ~$0.01 en plan pagado

Con un plan de $49/mes en Apify tenés ~10,000-50,000 runs según el actor. Monitorear uso en `apify.com/billing`.

### Paso 6: Rate limits y reintentos

```typescript
// Wrapper con retry exponencial para rate limits
async function runWithRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ScraperError && err.code === "RATE_LIMIT" && i < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, 1000 * 2 ** i)); // 1s, 2s, 4s
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}
```

## Output esperado

- Función `runApifyActor<T>` reutilizable para cualquier actor
- Normalizer específico por tipo de dato (perfil, reel, hashtag, etc.)
- `ScraperError` tipado con codes que el UI puede manejar diferente
- Cero valores `-1` o `NaN` llegando a la DB

## Ejemplo

**Input:** Necesito scraping de Google Maps para obtener leads (nombre, teléfono, categoría)

**Output:**
1. Actor: `compass/crawler-google-places` (mejor ratio calidad/precio para GMaps)
2. Input del actor: `{ searchStringsArray: ["restaurantes en Bogotá"], maxCrawledPlaces: 100 }`
3. Normalizer: `{ name: item.title ?? "", phone: item.phone ?? null, category: item.categoryName ?? null, lat: item.location?.lat ?? null }`
4. `Math.max(0, item.reviewsCount ?? 0)` para el campo de reviews

## Gotchas conocidos

- **CDN URLs de IG expiran en ~6-24h.** Si vas a pasar por Whisper, descargar el audio inmediatamente al recibirlo, no cachearlo.
- **`shortCode` vs `id`:** Algunos actores retornan solo `shortCode`, otros solo `id` (pk numérico). Usar `shortCode ?? id` como `externalId`.
- **Hashtag scrapers** NO traen métricas completas del perfil (followers, avg_views) — solo el reel + handle del dueño. Si necesitás el perfil completo, scrapear aparte.
- **`musicInfo`** en reel scraper: `item.musicInfo?.audio_id` y `item.musicInfo?.song_name` — puede ser null aunque haya música (IG no siempre lo expone).
