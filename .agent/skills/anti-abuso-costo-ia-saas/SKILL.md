# Skill: Anti-abuso + tope de costo (SaaS con motor de IA)

## Cuándo usar esta skill

- Antes de difundir la URL de un SaaS self-serve donde **cada acción del usuario cuesta dinero real** (OpenAI, Replicate, Apify, transcripción, etc.).
- Cuando hay un **free tier** (N acciones gratis por cuenta) + registro abierto: el riesgo NO es un usuario, es **crear cuentas en masa** para quemar tu presupuesto.
- Cuando el proveedor no tiene un tope de gasto duro o querés uno propio, más agresivo.

## Principio: modelá el riesgo antes de codear

Calculá el costo máximo por cuenta: `free_grant × costo_por_acción`. Ejemplo real (FreshAdFlow): 3 packs × ~$0.55 = ~$1.65/cuenta. Con eso claro, el único vector caro es **volumen de cuentas**. La defensa es en profundidad, de más barata a más cara de burlar:

1. **Verificación de email** — frena emails falsos triviales (el atacante tendría que confirmar cada uno).
2. **Tope por IP/día** — frena el loop de cuentas desde una máquina.
3. **Tope global diario de costo** — backstop: pase lo que pase, el gasto del día tiene techo.

Ninguna es suficiente sola; juntas cubren los huecos de las otras. **Todos los límites como variables de entorno** (ajustás sin re-desplegar).

## Proceso

### Paso 1: Módulo de guardas (fail-open en el backstop)

```typescript
// server/abuse.ts
import { headers } from "next/headers";
const MAX_DAILY_ACTIONS = Number(process.env.MAX_DAILY_ACTIONS ?? 120);   // techo global de costo
const MAX_ACTIONS_PER_IP = Number(process.env.MAX_ACTIONS_PER_IP ?? 8);   // por IP/día

export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");             // Vercel/Cloudflare
  return fwd ? (fwd.split(",")[0].trim() || null) : h.get("x-real-ip");
}
const startOfUtcDay = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())).toISOString();
};

export async function checkGlobalDailyCap() {
  if (MAX_DAILY_ACTIONS <= 0) return { ok: true as const };
  const { count, error } = await admin.from("jobs")
    .select("id", { count: "exact", head: true }).gte("created_at", startOfUtcDay());
  if (error) { console.error(error); return { ok: true as const }; } // FAIL-OPEN: no tumbar el producto
  return (count ?? 0) >= MAX_DAILY_ACTIONS
    ? { ok: false as const, message: "Estamos con mucha demanda. Probá en un rato." }
    : { ok: true as const };
}

export async function checkIpDailyCap(ip: string | null) {
  if (!ip || MAX_ACTIONS_PER_IP <= 0) return { ok: true as const }; // sin IP no penalizamos
  const { count, error } = await admin.from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("client_ip", ip).gte("created_at", startOfUtcDay());
  if (error) { console.error(error); return { ok: true as const }; }
  return (count ?? 0) >= MAX_ACTIONS_PER_IP
    ? { ok: false as const, message: "Máximo de acciones por hoy desde esta conexión." }
    : { ok: true as const };
}
```

### Paso 2: Llamar las guardas ANTES de consumir nada

En el Server Action / route que dispara el motor, chequear **antes** de descontar créditos o crear el job. Guardar la IP en la fila para el conteo por-IP (necesita una columna `client_ip text` + índice `(client_ip, created_at)`).

```typescript
const ip = await getClientIp();
const ipCheck = await checkIpDailyCap(ip);
if (!ipCheck.ok) return { ok: false, reason: "rate_limited", message: ipCheck.message };
const globalCheck = await checkGlobalDailyCap();
if (!globalCheck.ok) return { ok: false, reason: "rate_limited", message: globalCheck.message };
// ...recién ahora: validar saldo, crear job (con client_ip: ip), descontar crédito, disparar worker
```

### Paso 3: Email-verify como estado "pending", NO como error

Con confirmación de email activa, el signup no devuelve sesión. Eso **no es un error** — es el flujo esperado. Devolvé un estado `pending` para mostrar un aviso amable, no una caja roja:

```typescript
if (data.user && !data.session) {
  return { ok: true, pending: true, message: "Te enviamos un correo para confirmar tu cuenta." };
}
```

En el cliente, renderizá `pending` en una caja neutra (brand-soft), separada de `authError`. Limpiá el aviso al cambiar de campo / cambiar login↔signup.

### Paso 4: Blocklist de dominios desechables (filtro barato)

```typescript
const DISPOSABLE = new Set(["mailinator.com","guerrillamail.com","10minutemail.com",
  "yopmail.com","tempmail.com","trashmail.com","sharklasers.com","maildrop.cc", /* ... */]);
if (DISPOSABLE.has(email.toLowerCase().split("@")[1] ?? ""))
  return { ok: false, message: "Usá un correo permanente." };
```

### Paso 5: El toggle manual del dashboard (no se olvida)

El código soporta email-verify, pero **el gate real es un toggle del proveedor**. En Supabase: Authentication → Providers → Email → activar "Confirm email". Documentarlo como paso de deploy — sin él, todo el paso 3-4 no se aplica. (Los usuarios de Google llegan verificados por Google, así que ese login no choca con esto.)

## Output esperado

- Un atacante que scriptea 1000 cuentas choca con: confirmar 1000 emails + tope por IP + el techo global. El daño máximo del día está acotado por `MAX_DAILY_ACTIONS`.
- Usuario legítimo: no nota nada (los límites default son holgados vs el uso real).

## Ejemplo

**Input:** bot crea cuentas `user+1@gmail`, `user+2@gmail`… y dispara generaciones desde una IP.
**Output:** las primeras N pasan; al llegar a `MAX_ACTIONS_PER_IP` la IP queda bloqueada por el día; si rotara IPs, el `MAX_DAILY_ACTIONS` global corta el gasto total. Con "Confirm email" ON, además cada cuenta requiere clic en un correo real.

## Trade-offs y límites

- **IP compartida (CGNAT, oficinas):** el tope por IP puede pegarle a usuarios legítimos que comparten IP. Poné el default holgado (≥ 2-3× el free_grant) y hacelo env-tunable. El backstop global es el que de verdad protege el bolsillo.
- **Gmail `+alias`:** Supabase los cuenta como emails distintos, pero todos requieren el MISMO inbox real para confirmar ⇒ el email-verify sigue siendo fricción alta. Por eso importa el toggle del paso 5.
- **Fail-open a propósito:** un error al contar NO debe tumbar el producto para usuarios legítimos. Se loguea y se deja pasar; el techo global es la red de seguridad, no el conteo perfecto.
- **Precisión vs simplicidad:** contar filas del día es un proxy barato del costo. Si necesitás exactitud, sumá el costo real (`usage`) por acción en un ledger y capá por dólares.
- Relacionada: [[async-job-pattern]] (dónde se descuenta/reembolsa el crédito), [[deploy-seguro-vercel-preview-prod]] (checklist de deploy), [[auth-supabase-google-nativo]] (el otro camino de login).

## Gotcha — el límite del PROVEEDOR de IA también bloquea (2026-07-08, FreshAdFlow)

- Además de NUESTROS topes, el **billing hard limit de la cuenta del proveedor** (OpenAI) frena la
  generación: devuelve **400 `billing_hard_limit_reached`** (no es 429, NO reintenta). Se ve como
  "imágenes que no salieron".
- **Antes de escalar tráfico/ads: subir el límite de gasto del proveedor** (Settings → Limits) y
  confirmar saldo/tarjeta. Si se topa, TODAS las generaciones fallan = registrados que no pueden
  usar el producto = plata quemada.
- Guardar el error real para diagnóstico, o leer los logs de prod (ver `debugging-silent-errors`).
