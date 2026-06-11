# Skill: Supabase Edge Function con Secret Auth (internal endpoints)

## Cuándo usar esta skill

- Vas a crear una Supabase Edge Function que será llamada por un **sistema interno** (n8n workflow, lambda, cron job, otro backend) — no por un browser/cliente final.
- No querés usar JWT de Supabase Auth (no aplica — no hay user humano firmando este request).
- Necesitás que solo tu sistema pueda llamar al endpoint, no público.
- Buscás el equivalente "internal API key" — simple, sin OAuth, sin JWT.

## Por qué existe esta skill

Supabase Edge Functions por default validan JWT del cliente (`verify_jwt: true`). Eso sirve para apps con usuarios finales (browser → edge function con anon key). Pero para **endpoints internos** (bot llama desde n8n para disparar una acción), JWT es overkill y rompe el flow:
- El bot no tiene un user de Supabase Auth
- N8N no maneja sesiones de Supabase
- Querés un "shared secret" tipo API key, simple

La solución: **deploy con `verify_jwt: false` + validar Bearer header con secret en variables de entorno**.

## Proceso

### 1. Decidir si la función es interna o pública

| Tipo | Auth | Ejemplo |
|---|---|---|
| **Pública** (browser → edge function) | `verify_jwt: true` + anon key del cliente | search público, login flows |
| **Interna** (n8n / lambda → edge function) | `verify_jwt: false` + secret en header | request-handoff, properties-search privada, queue processors |
| **Webhook entrante** (servicio externo → edge function) | `verify_jwt: false` + HMAC signature | ycloud-webhook (ver skill `ycloud-webhook-to-supabase`) |

Esta skill cubre el caso **interna**.

### 2. Generar el secret

```bash
# Generar un secret fuerte (64 chars hex = 256 bits)
openssl rand -hex 32
# → 86eae3d40543b0c713d64fb554c010c16e8399e88fa7ccf5a7cef8dd42af1620
```

Guardarlo en 2 lugares (mismo valor):
- **Supabase Edge Function Secrets:** Dashboard → Project → Edge Functions → Manage secrets → key: `HANDOFF_INTERNAL_SECRET` (o el nombre que aplique)
- **N8N env vars** (si el llamador es n8n): Settings → Environment Variables → mismo nombre + mismo valor

### 3. Implementar la validación en la edge function

```typescript
// supabase/functions/request-handoff/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HANDOFF_INTERNAL_SECRET = Deno.env.get("HANDOFF_INTERNAL_SECRET");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  // 1. Verificar secret está configurado server-side
  if (!HANDOFF_INTERNAL_SECRET) {
    console.error('HANDOFF_INTERNAL_SECRET not configured in env');
    return new Response('server misconfigured', { status: 500 });
  }

  // 2. Verificar Authorization header
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${HANDOFF_INTERNAL_SECRET}`) {
    // No filtrar info en el response
    return new Response('unauthorized', { status: 401 });
  }

  // 3. Validar method
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  // 4. Parse + validate body
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response('invalid json', { status: 400 });
  }

  const { conversation_id, reason, summary, source } = body;
  if (!conversation_id || !reason) {
    return new Response('missing required fields', { status: 400 });
  }

  // 5. Lógica de negocio
  // ... usa supabase (service role) para operar la DB sin pasar por RLS

  return new Response(JSON.stringify({ status: 'ok' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
```

### 4. Deploy

```bash
supabase functions deploy <nombre> --no-verify-jwt
```

El flag `--no-verify-jwt` es CRÍTICO. Sin él, Supabase Gateway rechaza requests sin JWT antes de que tu código corra, y tu Authorization Bearer custom nunca llega a verse.

Verificar deploy:
```bash
supabase functions list
# debe mostrar: <nombre>  ACTIVE  jwt_verify: false
```

### 5. Llamar desde n8n (o cualquier cliente)

```javascript
// En un HTTP Request node de n8n
{
  "method": "POST",
  "url": "https://<project>.supabase.co/functions/v1/request-handoff",
  "headers": {
    "Authorization": "Bearer {{ $env.HANDOFF_INTERNAL_SECRET }}",
    "Content-Type": "application/json"
  },
  "body": {
    "conversation_id": "{{ $('Variables').first().json.conversation_id }}",
    "reason": "qualified",
    "summary": "lead quiere agendar visita",
    "source": "bot"
  }
}
```

Si tu cliente no es n8n: cualquier HTTP client con la capacidad de setear `Authorization: Bearer <secret>` funciona (curl, fetch, requests, axios, etc.).

### 6. Rotación de secret

Cuando rotás (cada 90 días, o cuando alguien deja el equipo, o si hay incidente):

1. Generar nuevo secret: `openssl rand -hex 32`
2. Updatear Supabase Edge Function Secrets con el nuevo valor
3. Updatear N8N env vars con el mismo valor
4. **Forzar redeploy** de la edge function (`supabase functions deploy <nombre>`) para que el nuevo secret se cargue
5. Verificar que requests viejos (con el secret anterior) ahora reciben 401

## Output esperado

1. Edge function desplegada con `verify_jwt: false`
2. Secret configurado en Supabase Edge Function Secrets
3. Mismo secret configurado en el sistema llamador (n8n / lambda / etc.)
4. Edge function valida `Authorization: Bearer <secret>` antes de ejecutar lógica
5. Requests sin header (o con secret incorrecto) reciben 401
6. Requests legítimos del sistema interno funcionan

## Ejemplo concreto (Casa CRM, en producción 2026-05-20)

**Endpoint:** `request-handoff`
- Path: [supabase/functions/request-handoff/index.ts](supabase/functions/request-handoff/index.ts) v0.1.0
- Secret env var: `HANDOFF_INTERNAL_SECRET`
- Valor: `casacrm_handoff_2026_aBcDeFgHiJ_xyz123` (ejemplo — el real está en Supabase Secrets, NUNCA en código)
- Configurado en: Supabase Edge Function Secrets + N8N env vars
- Llamador: HTTP node en workflow Sofia que reemplaza al UPDATE postgres directo

Llamada típica:
```http
POST https://ugkunpsohrimxetofawv.supabase.co/functions/v1/request-handoff
Authorization: Bearer casacrm_handoff_2026_aBcDeFgHiJ_xyz123
Content-Type: application/json

{
  "conversation_id": "abc-123-...",
  "reason": "qualified",
  "summary": "lead quiere agendar visita esta semana",
  "source": "bot"
}
```

## Gotchas / antipattern

- **NO** desplegar sin `--no-verify-jwt`. Supabase Gateway rechaza el request antes de que tu auth custom corra.
- **NO** hardcodear el secret en código (ni en `.env.example`). Solo en Supabase Edge Function Secrets + variables runtime del sistema llamador.
- **NO** loggear el secret en `console.log` ni en error messages. Si el secret aparece en logs, está comprometido.
- **NO** usar un secret corto. Mínimo 32 chars random. Idealmente 64 hex (256 bits).
- **NO** confundir este patrón con HMAC signature. HMAC valida el contenido del request (anti-tampering), Bearer secret solo valida quién llama. Para webhooks de terceros, usar HMAC (ver `ycloud-webhook-to-supabase`).
- **NO** dejar el secret expuesto en logs de n8n. Si el HTTP node loggea el body+headers, configurar el secret como expresion segura `{{ $env.HANDOFF_INTERNAL_SECRET }}` no como string literal.
- **NO** olvidar la rotación. Calendar reminder cada 90 días.

## Skills relacionadas

- `ycloud-webhook-to-supabase` — patrón distinto pero relacionado: HMAC signature para webhooks de terceros
- `bot-handoff-system-end-to-end` — usa este patrón para `request-handoff`
- `n8n-properties-search-tool-pattern` — usa este patrón para `properties-search` cuando se invoca desde n8n
