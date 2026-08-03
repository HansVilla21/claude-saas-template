# Skill: Async Job Pattern

## Cuándo usar esta skill

- Cuando una operación tarda más de 5-10 segundos (scraping, IA, transcripción, procesamiento de archivos)
- Cuando la operación no puede bloquear un Server Action / Edge Function (Vercel timeout 10s en Hobby, 60s en Pro)
- Cuando el usuario dispara algo desde la UI y quiere ver progreso en tiempo real
- Cuando múltiples usuarios pueden disparar el mismo job y hay que deduplícarlo

## Proceso

### Paso 1: Diseño del modelo en DB

```sql
CREATE TABLE jobs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id),
  type       text NOT NULL,           -- 'scrape_profile', 'transcribe_reel', etc.
  status     text NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending','running','done','failed')),
  payload    jsonb NOT NULL DEFAULT '{}',  -- input del job
  result     jsonb,                         -- output cuando status='done'
  error      text,                          -- mensaje si status='failed'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: cada usuario solo ve sus propios jobs
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_jobs" ON jobs
  FOR ALL USING (auth.uid() = user_id);
```

### Paso 2: Server Action — crear job y disparar

```typescript
// app/actions/start-job.ts
"use server"
export async function startScrapeJob(handle: string) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  // Idempotencia: si ya hay un job pending/running para este handle, reusar
  const { data: existing } = await supabase
    .from("jobs")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("type", "scrape_profile")
    .eq("payload->>'handle'", handle)
    .in("status", ["pending", "running"])
    .maybeSingle();
  
  if (existing) return { jobId: existing.id };

  // Crear job nuevo
  const { data: job, error } = await supabase
    .from("jobs")
    .insert({ user_id: user.id, type: "scrape_profile", payload: { handle } })
    .select("id")
    .single();
  if (error) throw error;

  // Trigger asíncrono — NO await (fire-and-forget)
  fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/jobs/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": process.env.INTERNAL_SECRET! },
    body: JSON.stringify({ jobId: job.id }),
  }).catch(console.error); // no lanzar — el job ya está en DB

  return { jobId: job.id };
}
```

### Paso 3: Route handler — ejecutar el trabajo real

```typescript
// app/api/jobs/run/route.ts
export async function POST(req: Request) {
  // Autenticar llamada interna
  if (req.headers.get("x-internal-secret") !== process.env.INTERNAL_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { jobId } = await req.json();
  const supabase = createServiceClient(); // service_role

  // Marcar como running (con SELECT FOR UPDATE implícito via upsert)
  const { data: job } = await supabase
    .from("jobs")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "pending") // solo si sigue pending — evita doble ejecución
    .select()
    .maybeSingle();

  if (!job) return new Response("Already running or not found", { status: 409 });

  try {
    // --- TRABAJO REAL ---
    const result = await doTheActualWork(job.payload);
    // --------------------

    await supabase.from("jobs").update({
      status: "done",
      result,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);

    return new Response("OK");
  } catch (err) {
    await supabase.from("jobs").update({
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);

    return new Response("Failed", { status: 500 });
  }
}
```

### Paso 4: UI — polling del estado

```typescript
// components/job-status.tsx
"use client"
import { useEffect, useState } from "react";

export function JobStatus({ jobId }: { jobId: string }) {
  const [status, setStatus] = useState<"pending" | "running" | "done" | "failed">("pending");

  useEffect(() => {
    if (status === "done" || status === "failed") return;

    const interval = setInterval(async () => {
      const res = await fetch(`/api/jobs/${jobId}/status`);
      const { status: s } = await res.json();
      setStatus(s);
      if (s === "done") {
        // revalidatePath o redirect según flujo
      }
    }, 2000); // poll cada 2s

    return () => clearInterval(interval);
  }, [jobId, status]);

  return (
    <div>
      {status === "pending" && <p>En cola...</p>}
      {status === "running" && <p>Procesando...</p>}
      {status === "done" && <p>¡Listo!</p>}
      {status === "failed" && <p>Error. Intentá de nuevo.</p>}
    </div>
  );
}
```

### Paso 5: Refund de créditos en caso de fallo

Si el job consume créditos al inicio, hacer refund en el catch:

```typescript
} catch (err) {
  // Refund
  await supabase.rpc("grant_credits", { p_user_id: job.user_id, p_amount: CREDIT_COST });
  
  await supabase.from("jobs").update({ status: "failed", error: ... }).eq("id", jobId);
}
```

## Output esperado

- Job creado en DB con `id`
- UI recibe `jobId` y hace polling
- Cuando `status='done'`, `result` tiene el output; cuando `status='failed'`, `error` tiene el mensaje
- Créditos refunded si el job falla después de haberlos consumido

## Ejemplo

**Input:** Usuario pega URL de un reel de TikTok y hace click en "Analizar"

**Output:**
1. Server Action crea `jobs` row con `type='analyze_tiktok_reel'`, `status='pending'`
2. Fire-and-forget al route handler
3. Route handler actualiza a `running`, llama Apify + Claude, guarda resultado, actualiza a `done`
4. UI hace poll cada 2s, cuando detecta `done` redirige al análisis

## Trade-offs y límites

- **Polling vs Realtime:** Polling cada 2s es simple y funciona. Para jobs < 30s, es más que suficiente. Para jobs > 2 min, considera Supabase Realtime (`supabase.channel('jobs').on(...)`) para reducir requests.
- **Webhook vs polling desde la ruta:** Apify, OpenAI y otros providers soportan webhooks — úsalos cuando el tiempo de espera es > 60s (límite de Vercel Pro) para que el route handler no quede colgado.
- **Idempotencia:** La clave es el check `eq("status", "pending")` en el UPDATE del route handler — si dos requests llegan al mismo job simultáneamente, solo uno actualiza a `running`.
