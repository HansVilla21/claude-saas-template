# Skill: El Supabase gratis se pausa y te tumba el sitio del cliente

Un proyecto Supabase en plan gratis **se pausa solo por inactividad**. Cuando eso
pasa, el sitio del cliente responde 500 y los builds de Vercel fallan. Esta skill
es cómo diagnosticarlo en 30 segundos, revivirlo, y que no vuelva a pasar.

## Cuándo usar esta skill

- El sitio de un cliente empezó a dar 500 y "no tocamos nada".
- Un build de Vercel falla con `fetch failed` / `ENOTFOUND` apuntando al host de
  Supabase, y el commit anterior compilaba igual.
- Estás por poner en producción cualquier proyecto con Supabase en plan gratis.
- Un proyecto de demo/piloto que se usa poco (justo el perfil de riesgo).

## Por qué existe esta skill

Pasó el 03/08/2026, en producción, con el sitio del cliente ya entregado. El
síntoma no apunta a la causa: parece un problema de la app o del deploy, y podés
perder una hora leyendo logs de Next antes de mirar el estado del proyecto.

Y es un modo de fallo **de la clase peor**: no lo dispara un cambio tuyo. Lo
dispara que **nadie usó el sitio** — o sea, se cae exactamente cuando el cliente
está más tranquilo y menos lo estás mirando. Si además el cliente entra ese día,
lo que ve es su sitio nuevo caído.

## Diagnóstico (30 segundos, hacelo primero)

```bash
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  https://api.supabase.com/v1/projects/<ref> | jq .status
```

- `ACTIVE_HEALTHY` → el problema es otro, seguí buscando.
- `INACTIVE` → **es esto**. Dejá de leer logs.

**Antes de tocar nada más, correlo.** Es una llamada; descarta o confirma la
causa más barata de verificar.

## Reactivar

```bash
curl -s -X POST -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  https://api.supabase.com/v1/projects/<ref>/restore
```

Tarda **~4 minutos**. Los datos quedan intactos — no se pierde nada, solo estuvo
apagado. Después del restore, re-disparar el build de Vercel que falló (un commit
vacío alcanza), porque ese build ya quedó marcado como fallido.

## La solución de fondo: un cron que lo mantenga despierto

Cualquier actividad reinicia el contador de inactividad. Un ping diario alcanza.

```ts
// app/api/keepalive/route.ts
import { NextResponse } from "next/server";
import { supabasePublic } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";   // sin esto Next lo cachea y NO pinguea nada

export async function GET() {
  const { error } = await supabasePublic.from("productos").select("id").limit(1);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

```json
// vercel.json
{ "crons": [ { "path": "/api/keepalive", "schedule": "0 6 * * *" } ] }
```

Query trivial, tabla pública, sin service role: el endpoint queda expuesto y no
debe poder hacer nada más que un `select id limit 1`.

## Proceso

1. **Al diagnosticar un 500 o un build roto, consultá el `status` del proyecto
   ANTES de leer logs de aplicación.**
2. `restore` y esperá ~4 min. Re-disparar el build fallido.
3. **Poné el keep-alive el mismo día**, no "cuando haya tiempo". Es un archivo y
   tres líneas de `vercel.json`.
4. **Decíselo al cliente, con el número.** Es una decisión suya, no tuya: plan
   Pro (~USD 25/mes) o convivir con el keep-alive. El keep-alive resuelve la
   pausa por inactividad; **no** te da backups ni el resto de lo que trae el Pro.
5. **Dejalo escrito en el handoff del proyecto**, con el `<ref>`, el comando de
   diagnóstico y el de restore. La próxima vez lo puede resolver cualquiera en 5
   minutos, incluso vos dentro de tres meses.

## Gotchas

- **Poné `export const dynamic = "force-dynamic"` aunque tu versión no lo pida.**
  Un route handler cacheado devuelve la respuesta guardada sin tocar la base: el
  cron sale verde todos los días y el proyecto se pausa igual — fallo mudo
  perfecto. En Next 14 los GET se cacheaban por defecto; en Next 15 ya no, pero
  esa es exactamente la clase de default que cambia entre majors, y acá cambiarlo
  no cuesta nada. Verificalo una vez de verdad: mirá que el `last_activity` del
  proyecto se mueva después de que el cron corra.
- **Los crons de Vercel se identifican por `path`.** Dos entradas con la misma
  ruta y distinto horario **no** son dos crons: la segunda pisa a la primera.
  Si necesitás varios horarios, cada uno con su ruta. Verificá con `vercel crons ls`.
- **Los crons de Vercel corren solo en producción**, no en preview. El keep-alive
  no se prueba en una rama: se verifica después de mergear.
- **El síntoma miente.** `fetch failed` / `ENOTFOUND` en un build parece problema
  de red o de dependencias, y ahí es donde se va la hora.
- **Se cae por no usarse.** Un sitio de bajo tráfico, un piloto o una demo son
  justo el perfil que se pausa. No asumas que "si está en producción, se usa".
- **Un `select` sobre una tabla con RLS restrictiva devuelve 0 filas sin error** —
  igual cuenta como actividad, pero si además querés que el endpoint sirva de
  health check, elegí una tabla que el rol anon sí puede leer.
- **No pongas el keep-alive contra el service role.** Un endpoint público con
  service role es una superficie que no necesitás.

## Output esperado

- Comando de diagnóstico (`status`) y de `restore` documentados en el handoff,
  con el `<ref>` del proyecto.
- `app/api/keepalive/route.ts` con `force-dynamic` y query trivial.
- Entrada de cron en `vercel.json`, verificada en producción.
- Decisión de plan (Pro vs gratis + keep-alive) conversada con el cliente y anotada.

## Ejemplo

**Input:**
"El sitio del cliente está dando 500 y el deploy de Vercel falló. No tocamos nada
desde hace una semana."

**Output:**
`GET /v1/projects/<ref>` → `INACTIVE`. `POST /restore`, 4 minutos, sitio arriba y
datos intactos. Mismo día: `/api/keepalive` con `force-dynamic` + cron diario a
las 6am en `vercel.json`. Al cliente se le explicó en una línea: su base se
apagó por falta de uso, ya está arriba, y hay dos caminos — pagar el plan Pro o
quedarse con el ping diario. Quedó anotado en el handoff con los dos comandos.

## Skills relacionadas

`deploy-seguro-vercel-preview-prod` (el build fallido es donde suele aparecer) ·
`debugging-silent-errors` (misma familia: el código de estado miente) ·
`umbral-compartido-cron-cliente` · `verificar-funcionamiento-end-to-end`.
