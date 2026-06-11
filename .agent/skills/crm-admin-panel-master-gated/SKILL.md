# Skill: Panel Admin gateado por master (config jsonb + preview del compositor)

## Cuándo usar esta skill

- Necesitás una zona de administración **solo para el dueño de la plataforma (master)**, **dentro** del espacio de un tenant (no una consola separada), que el cliente final NO debe ver.
- Vas a editar configuración de un tenant guardada como **jsonb** (ej. `agencies.bot_config`, settings, feature flags) con una UI estructurada por secciones, no un textarón.
- Querés una **vista previa read-only** de algo que se ensambla por capas (ej. un system prompt tipo "Prompt Compositor": núcleo fijo + capas configurables + reglas finales).

## Por qué existe esta skill

Mezclar palancas de master dentro de la pantalla de "Configuración" del cliente es frágil: tarde o temprano se filtra algo que el cliente no debía ver/editar. La solución limpia es un **Panel Admin** propio, gateado por rol, que vive en la misma app del tenant (reusa shell + RLS + sesión) pero solo aparece y solo abre para el master. Además: **dar al cliente "read-only" es una puerta abierta** — ve algo, pide editarlo, lo rompe. Si no debe tocarlo, que ni lo vea.

## Proceso

### 1. Ítem de menú solo-master (esconder el botón)

- El shell ya suele recibir un `isMaster` (derivado de una tabla tipo `master_accounts` en el layout). Render condicional del ítem: `{isMaster && <Link href={`${base}/admin`}>…</Link>}`.
- **Verificá el nombre del ícono contra el paquete instalado** antes de usarlo — varios nombres intuitivos NO existen (en Phosphor: `SlidersHorizontal`, `ShieldStar`, `Wrench` no existen; `ShieldCheck`, `Crown`, `PipeWrench` sí). `ls node_modules/@phosphor-icons/react/dist/ssr | grep -i <nombre>`.

### 2. Ruta blindada en el servidor (cerrar la puerta)

- Defensa en dos capas: esconder el botón **no alcanza**. En el `page.tsx` (server component) re-verificá el rol contra la tabla master y, si no es master, `notFound()` — **no `redirect`** (notFound no revela que la ruta existe).
- Next 16: `params`/`searchParams` son async → `const { slug } = await params`.

### 3. Shape tipado + parseo defensivo del jsonb

- Definí un tipo completo de la config (`BotConfig`) + `DEFAULT_*`. El jsonb crudo puede venir **vacío, parcial o con claves viejas**: un `parse*(raw): T` que SIEMPRE devuelve la forma completa con defaults, así la UI nunca se defiende.
- Un `sanitize*(c): T` al guardar (trim, descartar items vacíos de arrays ordenados).

### 4. Server action: verificar → verificar → escribir con admin client

Mismo patrón que las otras actions del proyecto (ver `outbound-delivery-server-action`):
1. `getUser()` → si no, `not_authenticated`.
2. **Gate master**: query a `master_accounts` por `user_id`; sin fila → `not_authorized`.
3. Ownership del tenant vía cliente user-bound (RLS); fila ausente → no existe.
4. `UPDATE` con el **admin client (service_role)** — los writes user-bound a veces fallan silencioso bajo cookies SSR. El admin solo se usa tras los gates.

### 5. Editor client con dirty-tracking

- `useState(config)` + `useState(baseline)`; `dirty = JSON.stringify(config) !== JSON.stringify(baseline)`.
- Botón Guardar `disabled={!dirty || saving}`. Al guardar OK → `setBaseline(config)` (vuelve a no-dirty) + feedback "Guardado". Cualquier edición resetea el feedback a idle.
- Secciones tipo radio con descripción (preset pickers), textareas etiquetados, y para config **ordenada** (ej. pasos de un flujo) un editor de lista array con **↑↓ + borrar + agregar** (no hace falta dnd para esto; las flechas son robustas y mobile-first).

### 6. Preview read-only del ensamblado (honesto)

- Función PURA `composePreview(config, ctx): string` que arma el resultado por capas.
- Las **capas fijas/globales** (que no edita el master) se muestran como bloques **etiquetados** ("definido globalmente"), **NO se inventa su texto**. Las capas configurables se renderizan fielmente. Las automáticas (ej. módulos activos) se listan.

## Output esperado

1. Ítem "Panel Admin" visible solo para master; cliente no lo ve.
2. `/a/[slug]/admin` devuelve 404 a no-master (probado server-side).
3. Editor por secciones que guarda en el jsonb y **persiste tras reload** (round-trip DB verificado).
4. Preview en vivo del ensamblado. 0 errores de consola, responsive, `tsc`/`eslint` limpios.

## Ejemplo concreto (Momentum CRM v2, funcionando 2026-05-29)

`/a/demo/admin` (solo master): edita `agencies.bot_config` con 5 secciones (Identidad, Tono [4 presets], Comportamiento de venta [3], **Flujo de conversación = pasos reordenables**, Instrucciones). Guardé "Inmobiliaria boutique en Escazú…" + un paso → reload → la config volvió de la DB y el preview mostró "## SOBRE ESTE NEGOCIO" + "## FLUJO 1. …". Capas núcleo/reglas etiquetadas como fijas. 0 errores.

## Gotchas / antipattern

- **NO solo escondas el botón** — gateá la ruta server-side con `notFound()` (no `redirect`, que revela la existencia).
- **NO des read-only al cliente "para que sienta control"** — abre la puerta a "quiero editarlo" y termina rompiendo el prompt. Si no debe tocarlo, no lo ve. (Decisión del founder, 2026-05-29.)
- **Verificá nombres de íconos** contra el paquete; varios intuitivos no existen y rompen el build.
- **jsonb defensivo**: nunca asumas forma; parseá a una forma completa con defaults.
- **Escribí con el admin client** tras los gates (writes user-bound fallan silencioso bajo SSR).
- **Caveat honesto = parte del diseño**: guardar la config NO cambia el comportamiento del consumidor (ej. el bot n8n) hasta que ese consumidor LEA la config en runtime. Decílo; no vendas humo. El panel es la **fuente de verdad** que el runtime leerá después (cero retrabajo).

## Skills relacionadas

- `outbound-delivery-server-action` — el patrón verificar→verificar→admin-write de server actions.
- `crm-contact-detail-tabs` — otro client editor con persistencia/optimismo en este mismo CRM.
- `langchain-agent-prompt-design` — el modelo "Prompt Compositor" por capas que este panel edita.
- `n8n-langchain-agent-postgres-memory` — el consumidor (bot) que leerá esta config en runtime.

## Memoria global del founder (relacionada)

- `feedback_no_optional_menus` — cuando el fork es real (A/B/dónde vive), explicarlo claro; cuando ya sé la respuesta, ejecutar.
- `feedback_partner_critico_no_yesman` — reconocer cuando el founder hace una mejor llamada que la mía (el "no read-only").
- `feedback_capture_skills_for_every_process` — esta skill nació de esa directriz.
