# Skill: Programar envíos (o cualquier tarea) con cron en Vercel

## Cuándo usar esta skill

- Necesitás **disparar algo a una fecha/hora futura** en una app Next.js en Vercel: un email programado, un recordatorio, una limpieza, un reporte.
- El cliente pide "programar envíos" y creés que basta con guardar `scheduled_at`. Falta el disparador — y en Vercel tiene una trampa de plan.

**Costo de no usarla:** prometer "sale a las 14:30" y que en **Vercel Hobby salga al día siguiente** (el cron corre ~1×/día). Es una limitación de plataforma, no un bug — hay que decirla antes.

---

## El gotcha que encabeza todo

**En Vercel HOBBY los cron jobs corren ~1×/día**, no a la hora exacta. Un envío programado sale en esa corrida diaria. Para **hora exacta**: plan **Pro** (cron cada pocos minutos) o un **cron externo** (cron-job.org, GitHub Actions) pegando al endpoint. El endpoint que armás sirve a cualquier frecuencia — el disparador es lo que cambia. **Decíselo al cliente antes de construir.**

## Proceso

1. **Estado + snapshot en la tabla:** `+ scheduled_at timestamptz`, `+ status ('borrador'|'programado'|'enviado')`, y **un SNAPSHOT del contenido** (no una referencia viva a la plantilla). Si la plantilla se edita/borra entre programar y disparar, el programado sale con lo que tenía. Congelá `blocks`/payload en la fila.
2. **Endpoint** `app/api/cron/<tarea>/route.ts` (`GET`), que lee los `status='programado'` con `scheduled_at <= now()` y procesa cada uno.
3. **Auth por `CRON_SECRET`**: header `Authorization: Bearer <secret>`. Falla cerrado (401). Vercel Cron manda ese header solo cuando la env `CRON_SECRET` existe; un cron externo lo manda vos.
4. **Service role (sin sesión):** el cron NO tiene sesión. Si el procesamiento lee datos con RLS (ej. destinatarios), con la anon key **no ve nada** → usá `createAdminClient()`. Este fue el bug clásico: `getRecipients` con cliente de sesión devolvía vacío en el cron.
5. **Idempotente:** al procesar, marcá `status='enviado'` y **rechazá lo ya enviado**. Dos corridas (reintento) no duplican.
6. **Excluir `/api/cron` del middleware de auth:** si no, el middleware lo manda a `/login` (307) y el cron nunca corre. Agregalo a la allowlist del matcher, junto a `api/webhooks`.
7. **`vercel.json`** con `{ "crons": [{ "path": "/api/cron/<tarea>", "schedule": "<cron>" }] }`. En Hobby el schedule debe ser **diario** (`0 12 * * *`); un `*/10` lo rechaza el deploy.
8. **El `CRON_SECRET` se INVENTA** (`randomBytes(32).hex`), va en Vercel env, y **exige redeploy** (env nueva no aplica sin redeploy). Igual que un webhook secret — no se saca de ningún lado.

## Verificación limpia (sin disparar nada)

`curl` al endpoint SIN el header → debe dar **401**. Confirma que está vivo y protegido sin procesar nada:

```bash
curl -sS -o /dev/null -w "%{http_code}" https://<dominio>/api/cron/<tarea>
```

## Gotchas

| Gotcha | Qué pasa | Fix |
|---|---|---|
| **Hobby = 1×/día** | El envío programado no sale a la hora exacta | Pro o cron externo; decirlo antes |
| **Cron sin service role** | Lee datos con anon key → RLS niega → vacío | `createAdminClient()` en el endpoint |
| **Middleware traga el cron** | 307 a /login, nunca corre | Excluir `api/cron` del matcher |
| **Referencia viva a la plantilla** | Editan/borran la plantilla y el programado sale mal o vacío | Congelar el contenido (snapshot) en la fila |
| **Env sin redeploy** | Seteás `CRON_SECRET` y sigue 401 | Redeploy después de setear |
| **Schedule sub-diario en Hobby** | El deploy rechaza el `vercel.json` | Schedule diario en Hobby |

## Output esperado

- Tabla con `status` + `scheduled_at` + snapshot del contenido.
- Endpoint `/api/cron/<tarea>` con auth por secret, service role, idempotente.
- `api/cron` fuera del middleware. `vercel.json` con el cron.
- `CRON_SECRET` en Vercel (+ redeploy). Verificado por `curl` (401).

## Ejemplo

**Input:** "quiero programar los boletines para una fecha y hora."

**Output:** `newsletters += status/scheduled_at/blocks(snapshot)`, `/api/cron/send-scheduled` (401 sin secret, service role, marca enviado), `vercel.json` diario, y la nota honesta de que en Hobby sale 1×/día (para hora exacta, Pro o cron externo).

## Relacionado

- [[manychat-instagram-al-crm]] — el secret también se INVENTA y va idéntico en los dos lados; env nueva exige redeploy.
- [[deploy-seguro-vercel-preview-prod]] — el flujo de deploy donde se setea la env.
