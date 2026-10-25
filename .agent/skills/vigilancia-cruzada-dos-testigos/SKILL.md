---
name: vigilancia-cruzada-dos-testigos
description: Usar cuando el sistema se cae y nadie se entera, porque lo que tendría que avisar vive adentro de lo que se cayó (el cron de la base no corre si la base está en solo lectura; el cron de Vercel no corre si Vercel apagó el proyecto). Se arman dos vigilantes en dominios de falla distintos que se miran entre sí, con prueba de escritura, avisos que se reclaman una vez, deduplicación sin estado cuando el estado es lo caído, y un aviso específico para cuando el respaldo tapa la caída. Se dispara con "se cayó y nadie se dio cuenta", "quiero una alerta si el sistema deja de contestar", "estuvimos horas sin bot", "quién vigila al vigilante".
---

# Skill: Vigilancia cruzada con dos testigos

## Cuándo usar esta skill

- El sistema ya se cayó **sin que nadie se enterara**, y se supo porque un humano vio que faltaba algo.
- Hay más de una pieza de infraestructura (app en Vercel + base en Supabase, o equivalentes) y **cada una puede caerse por su lado**.
- Ya existe, o se está por armar, un cron que revise la salud. La pregunta que esta skill contesta es **dónde tiene que vivir** ese cron para no morir con lo que vigila.
- Hay un respaldo automático (otro modelo de IA, otro proveedor) que puede **tapar** una caída: el usuario no la nota, pero el proveedor sigue caído y alguien tiene que saberlo.
- Cross-project: cualquier SaaS con más de una pieza de infraestructura y clientes que dependen de que conteste.

## Por qué existe esta skill

Capturada el 2026-10-24 en el CRM de Momentum (Next.js en Vercel, Postgres en Supabase, bot con Claude). En octubre el sistema se cayó tres veces y **ninguna avisó**:

| Caso | Qué se cayó | Cuánto duró | Por qué no avisó nada |
|---|---|---|---|
| 02-10 | El disco de Supabase se llenó y la base pasó a **solo lectura** | 11,5 h sin bot | Todo lo que podía avisar (pg_cron, pg_net, triggers) **escribe** para funcionar |
| 13-10 | Vercel apagó el proyecto por un cobro fallido (402) | 1 h 20 sin bot | Los crons de Vercel viven en Vercel |
| 21-10 | El tope de gasto de Anthropic cortó todas las respuestas | 2 h, todos los bots en "falla técnica" | Nadie miraba los turnos fallados |

Ya había una revisión de números de WhatsApp (`vigilar-proveedor-que-no-avisa`), pero corría como ruta de Vercel disparada por pg_cron: **dependía de las dos piezas a la vez**. Si caía cualquiera, no corría.

> La idea central: **un vigilante no puede vivir dentro del dominio de falla que vigila.** Con dos piezas, la solución son dos vigilantes, cada uno del lado opuesto: la base vigila a la app, y la app vigila a la base. El que se cae deja de vigilar, pero el otro lo ve caer.

## Proceso

### 1. Dibujar los dominios de falla antes de escribir código

Para cada cosa que puede caerse, contestar: **¿qué deja de funcionar con ella?** El vigilante de X no puede estar en esa lista.

| Se cae | Deja de funcionar | Lo tiene que mirar |
|---|---|---|
| Vercel (402, deploy roto, región caída) | Rutas, crons de `vercel.json`, server actions | Algo que viva en Supabase: un Edge Function disparado por pg_cron |
| Postgres en solo lectura (disco lleno) | pg_cron (escribe `cron.job_run_details`), pg_net (encola en una tabla), cualquier insert | Algo que viva afuera: un cron de Vercel |
| Postgres caído del todo | Todo lo de arriba, y además las lecturas | El mismo cron de Vercel, con los teléfonos en una variable de entorno |
| Proveedor de IA (tope, clave revocada) | Los turnos del bot (`failed` o en respaldo) | El vigilante de Supabase, leyendo los turnos de los últimos 15 minutos |
| Saldo del proveedor de mensajería | Toda plantilla de todo cliente | El vigilante de Supabase, preguntando el saldo |

**Gotcha:** un Edge Function de Supabase **no** cae con la base en solo lectura: es otro proceso. Pero el cron que lo despierta sí. Por eso la base caída la tiene que mirar Vercel.

### 2. El testigo de la app vive del lado de la base

- **Edge Function** (`vigilar-sistema`), despertado por **pg_cron cada 5 minutos** con `net.http_post` y un secreto.
- El secreto se **genera dentro del Vault** en la migración (`vault.create_secret(encode(gen_random_bytes(32), 'hex'), ...)`) y el Edge Function lo lee por una RPC `security definer` que solo puede ejecutar `service_role`. Nadie lo copia a mano, y no hay variable que se desincronice.
- **Qué mira** (todo en paralelo):
  - la app (`GET /login` con un timeout de 15 s, `redirect: 'manual'`): un 2xx o 3xx responde, y un 402 o 5xx es una falla;
  - los turnos fallados del bot en los últimos 15 minutos (3 o más es una falla);
  - las respuestas con el respaldo (ver el paso 6);
  - el saldo del proveedor de mensajería, por debajo de un mínimo.
- **Las reglas, puras y en su propio archivo** (`reglas.ts`, sin Deno ni red), para probarlas con `node --test`.

### 3. El testigo de la base vive del lado de la app, y ESCRIBE

- **Cron de Vercel** (`vercel.json` → `crons`), cada 5 minutos, a una ruta bajo un prefijo público del middleware (`/api/cron/...`). Vercel manda `Authorization: Bearer <CRON_SECRET>`: sin `CRON_SECRET` la ruta responde 503 y no trabaja.
- **La prueba es una escritura, no una lectura.** Con el disco lleno, la base en solo lectura **sigue contestando lecturas**: un `select 1` diría que todo está bien mientras ningún mensaje se guarda. Una RPC `sistema_latido()` que hace `update ... set ultimo_chequeo_at = now()` falla justo cuando importa.
- **Un error suelto no es una caída:** se espera 15 s y se prueba otra vez.
- **Los teléfonos, de la base si se deja leer; si no, de una variable** (`ALERTAS_TELEFONOS`). Con la base caída del todo no hay de dónde sacar a quién avisar.
- Los crons de Vercel **solo corren en producción**. Lo de la ruta se prueba en el preview; el cron, después del merge.

### 4. Avisar una vez por falla y otra por vuelta

En el lado que tiene base (el testigo de la app), igual que en `vigilar-proveedor-que-no-avisa`:

- Una tabla `alertas_sistema` con una fila por vigilancia (`clave`, `estado`, `fallas_seguidas`, `detalle`, `desde`, `avisado_at`).
- **Cuántas lecturas malas hacen una falla, según el ruido de cada una:**
  - **La app pide dos seguidas** (10 minutos): un deploy o un pico dan un error suelto.
  - **Las que ya miran una ventana** (turnos de 15 minutos) se cuentan con una sola.
- **No saber no es estar caído:** si la lectura no se pudo hacer (el proveedor no contestó), no se cambia nada.
- **El aviso se reclama con un update atómico:** `update ... set avisado_at = now() where clave = $1 and avisado_at is null`, y el «volvió» con el inverso. El upsert del estado **nunca** toca `avisado_at`. Dos corridas a la vez avisan una sola vez.
- **El «volvió» solo sale si la falla se había avisado.** Una falla que se curó antes de avisarse no tiene nada que resolver.

### 5. Deduplicar sin estado cuando el estado es lo que se cayó

El testigo de la base **no puede guardar que ya avisó**: lo caído es justo donde se guarda.

- **Ventanas fijas de reloj:** avisa solo la corrida que cae en los minutos 0–4 o 30–34 de la hora. Corriendo cada 5 minutos, eso da a lo sumo **2 avisos por hora** y el primero llega en menos de 30 minutos. Una caída de 11 horas manda 22 mensajes y no 132.
- **La vuelta se infiere de un hueco en el latido.** Si al volver a escribir el `ultimo_chequeo_at` anterior tiene más de 15 minutos, la base estuvo sin escribirse.
- **Ojo de quién fue el hueco:** si Vercel estuvo caído, tampoco hubo latido, pero la base estaba bien. Antes de avisar «la base volvió», mirar si el otro testigo anotó el CRM caído en ese rango. Si lo anotó, el hueco fue de Vercel y no se avisa.

### 6. Que el respaldo no tape la caída

Si el bot tiene un modelo de respaldo (en el CRM, gpt-4.1 cuando Claude falla), una caída del proveedor principal **ya no se ve**: los turnos salen bien. Por eso:

- Cada turno que usó el respaldo lo deja dicho en su fila: `metadata.respaldo = { usado: true, primario, error, detalle }`.
- El vigilante avisa con **una sola** respuesta en respaldo en 15 minutos. El detalle del aviso es el error del primario («400 You have reached your specified API usage limits»), que es lo que hay que ir a arreglar.
- **Los turnos de prueba no cuentan:** filtrar `is_eval_synthetic`. Una tanda de pruebas con una clave rota no es una caída.

### 7. A quién y por dónde

- **Los avisos internos van solo a los dueños del sistema,** nunca al cliente. Decisión del founder en el CRM: «para nadie más, no hay que avisar al cliente de nada».
- **WhatsApp proactivo exige una plantilla aprobada.**
  - Una genérica con el texto en una variable sirve para todos los avisos: «Hola {{1}}, alerta del CRM: {{2}}. El detalle está en el panel master.»
  - El parámetro va sin saltos de línea, sin tabs, sin más de 4 espacios seguidos y con un largo acotado.
  - **Meta puede recategorizarla** (la creamos UTILITY y pasó a MARKETING) y tarda en aprobarla.
- **Siempre un segundo canal dentro de la app:** las vigilancias en falla salen arriba de todo en el panel del dueño. Si el WhatsApp no sale (plantilla en revisión, saldo en cero), la falla igual se ve.

## Output esperado

- Un **Edge Function** de vigilancia con sus reglas puras y probadas, más una migración con la tabla de estado, los secretos generados en el Vault, la RPC de latido y el cron cada 5 minutos.
- Una **ruta de cron en la app**, con su entrada en `vercel.json` y `CRON_SECRET` + teléfonos de respaldo en las variables de producción (cargadas por la API, sin imprimir valores).
- Las vigilancias en falla **visibles en el panel** del dueño.
- **Verificado:**
  - reglas con control negativo;
  - el Edge Function disparado a mano en producción responde 200 con todo en orden;
  - sin el secreto, 401 en los dos lados;
  - después del merge, los dos latidos avanzan solos (`ultimo_chequeo_at` de cada clave se mueve cada 5 minutos).

## Ejemplo

**Input:**
"El 02-10 la base pasó a solo lectura por disco lleno y estuvimos 11 horas sin bot. El 13-10 Vercel apagó el proyecto. Nadie se enteró en ninguno de los dos. Quiero que me avise."

**Output:**
- `supabase/functions/vigilar-sistema/` (Edge Function + `reglas.ts` con 9 pruebas): mira `/login`, turnos fallados, respuestas con el respaldo y el saldo de YCloud cada 5 minutos, despertado por el cron `sistema_vigilar`.
- `src/app/api/cron/vigilar-base/route.ts` + `vercel.json` → `crons`: escribe en la base cada 5 minutos; si falla dos veces, avisa por WhatsApp desde la app, a lo sumo cada 30 minutos.
- Migración `0151_vigilar_sistema.sql`: `alertas_sistema`, los secretos en el Vault, `sistema_latido()`, `sistema_disparar()` y el cron.
- **Lo medido el día que salió:**
  - el Edge Function, disparado a mano, respondió 200 con todo en orden (saldo USD 14.63);
  - sin el secreto, 401 en los dos lados;
  - a los 15 minutos del merge, los dos latidos se habían movido solos.

## Errores que ya cometimos

1. **El cron de salud dependía de las dos piezas.** pg_cron disparaba una ruta de Vercel, así que con cualquiera de las dos caída no corría. Si el disparador y el que trabaja viven en dominios distintos, el vigilante cae con cualquiera de los dos.
2. **Probar la base con una lectura.** En solo lectura las lecturas andan. La prueba tiene que escribir.
3. **El identificador del proyecto escrito de memoria en la migración.** La URL del Edge Function se arma con el `ref` del proyecto, y el primero que se escribió era inventado. Sacarlo de la herramienta (`get_project_url`) o del `.env`, nunca de memoria. Si se equivoca, el cron llama a la nada y no da ningún error.
4. **El orden de despliegue.** La migración arranca el cron, así que el Edge Function va **antes**. Al revés, el cron pide algo que no existe cada 5 minutos.
5. **Que el respaldo tape la caída.** Sin el aviso de respaldo, el tope de gasto del 21-10 habría pasado sin que nadie supiera que Anthropic estaba cortado.

## Relacionado

- `vigilar-proveedor-que-no-avisa`: la máquina de estados para una pieza externa que no manda eventos. Esta skill dice **dónde** tiene que vivir el vigilante.
- `supabase-disco-lleno-pasa-a-solo-lectura`: el incidente del 02-10 y el runbook.
- `whatsapp-proactivo-a-staff`: plantillas para avisar al equipo por WhatsApp.
- `probar-migracion-contra-base-viva-con-rollback`: cómo se probó la migración antes de aplicarla.
