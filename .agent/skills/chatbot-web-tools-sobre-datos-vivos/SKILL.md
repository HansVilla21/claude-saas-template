# Skill: Chatbot en la web con herramientas sobre datos vivos (no en el prompt)

Un asistente dentro del sitio del cliente que asesora sobre su catálogo, responde
FAQ y captura leads — con los datos **consultados por herramientas en cada turno**,
no metidos en el system prompt. Next.js App Router + Vercel AI SDK + OpenAI.

## Cuándo usar esta skill

- El cliente quiere un asistente **en su página web** (no en WhatsApp, no n8n).
- El bot tiene que hablar de un catálogo/inventario/listado que cambia y donde
  los precios tienen que ser exactos.
- Querés capturar leads de gente que **no usa WhatsApp** (fue el argumento
  literal de la clienta: *"si es una persona adulta y no tiene WhatsApp, ya se
  pierde ese cliente"*).
- No hay acceso a Meta / WhatsApp Business API y el proyecto está bloqueado por
  eso. Esto entrega valor sin depender de terceros.

## La decisión que define todo: tools, no prompt-stuffing

Con 230 productos, la tentación es serializar el catálogo al system prompt. **No.**

| | Catálogo en el prompt | Catálogo por herramientas |
|---|---|---|
| Costo por turno | crece con el catálogo | prompt chico y constante |
| Frescura | la del último deploy | la de este segundo |
| Precios | el modelo "recuerda" → inventa | salen de la query, exactos |
| Catálogo grande | no entra | indiferente |

El modelo tiene 3 herramientas y el prompt solo trae lo que **no** está en la base
(horario, ubicación, cómo se cotiza). No hace falta RAG ni embeddings: para un
catálogo estructurado, un `ilike` + filtros gana en exactitud y en costo.

## Arquitectura mínima

| Archivo | Responsabilidad |
|---|---|
| `app/api/chat/route.ts` | `streamText` + tools. Runtime node. La key nunca sale del server |
| `lib/chat/tools.ts` | Las 3 tools con Zod + su ejecución contra la BD |
| `lib/chat/prompt.ts` | System prompt + conocimiento fijo (FAQ) |
| `lib/catalogo.ts` | `buscarCatalogo(...)` — la query que consume la tool |
| `components/chat/ChatWidget.tsx` | Burbuja flotante, client, lee el stream |

```ts
// app/api/chat/route.ts
export const runtime = "nodejs";
export const maxDuration = 30;

if (!process.env.OPENAI_API_KEY) {           // degradar, no romper
  return new Response(JSON.stringify({ error: "no_disponible" }), { status: 503 });
}

const result = streamText({
  model: openai("gpt-4o-mini"),
  system: SYSTEM_PROMPT,
  messages,
  tools: chatTools,
  maxSteps: 5,          // buscar → ver detalle → responder
  temperature: 0.4,
});
return result.toTextStreamResponse();
```

**Las 3 tools que cubren el 100% del caso:**

1. `buscar_productos({ texto?, categoria?, precio_max? })` → lista compacta
   (`nombre, categoria, precio_desde, slug`), tope 8.
2. `detalle_producto({ slug })` → descripción, precio, variantes con precio,
   materiales, tiempo, URL de la ficha.
3. `registrar_solicitud({ nombre, telefono?, correo?, resumen, producto_slug? })`
   → inserta el lead por el **mismo camino que el formulario del sitio**.

## El bug que vas a tener: el modelo inventa el identificador

Fue el primer fix en producción. El modelo llamaba `detalle_producto` con un slug
**plausible pero inexistente** (`cama-matrimonial` en vez de `cm-09-rectangular`),
o con el nombre en vez del slug, y el bot le decía al usuario que no tenía el
producto — teniéndolo.

**Instruir en el prompt "usá el slug exacto" no alcanza.** El fix real es que la
tool se defienda sola:

```ts
execute: async ({ slug }) => {
  let p = await getProductoBySlug(slug);
  if (!p) {
    // Pudo pasar un nombre o un slug aproximado: buscar por texto.
    const texto = slug.split(/[-_\s]+/).filter(t => t.length > 3 && !/\d/.test(t)).join(" ");
    const matches = await buscarCatalogo({ texto: texto || slug });
    if (matches.length === 1) p = await getProductoBySlug(matches[0].slug);
    else if (matches.length > 1) return {
      necesita_desambiguar: true,
      mensaje: "Hay varios que coinciden. Preguntale a la persona cuál es y volvé a llamar con el slug correcto.",
      opciones: matches.map(m => ({ nombre: m.nombre, slug: m.slug })),
    };
  }
  if (!p) return { error: "No encontré ese producto en el catálogo." };
  ...
}
```

Tres cosas que lo hacen funcionar: **fallback por nombre**, **desambiguación
devuelta como datos** (el modelo pregunta y reintenta, no adivina), y la
`description` de la tool explicando que el fallback existe.

## Proceso

1. **Escribí primero la query, no el bot.** `buscarCatalogo(...)` — `ilike` sobre
   nombre, filtro por categoría **normalizando tildes**, `precio_desde <= max`,
   `visible = true`, límite duro. Validala contra la base real con un script de
   5 líneas antes de conectarle un LLM encima. Si la query miente, el bot miente.
2. **System prompt: solo lo que NO está en la base.** Horario, ubicación,
   teléfono, proceso a alto nivel — importados de tu `lib/site.ts`, no
   escritos a mano dos veces.
3. **Regla de oro explícita y repetida:** precios, medidas, variantes y
   disponibilidad **solo** salen de las tools. Si la tool no lo trae, el bot lo
   dice y encamina a WhatsApp. *"Nunca inventés un precio"*, literal, en el prompt.
4. **Tono del cliente, no tono de bot.** Voseo costarricense, respuestas breves,
   servicial sin ser insistente. Es la parte que hace que el cliente lo sienta suyo.
5. **Captura de lead con consentimiento.** `registrar_solicitud` solo cuando la
   persona quiere ser contactada, y solo con nombre + (teléfono **o** correo).
   Validá eso **en la tool**, no en el prompt.
6. **Trazá el origen del lead.** Una columna `fuente` con default `'formulario'`;
   el bot inserta `'chatbot'`. El panel muestra una etiqueta. Sin eso no podés
   demostrarle al cliente que el bot sirve.
   ```sql
   alter table solicitudes_contacto
     add column if not exists fuente text not null default 'formulario';
   ```
7. **Widget: stream de texto plano, no `useChat`.** Leer el body con
   `res.body.getReader()` + `TextDecoder` y acumular. Es ~15 líneas y **no te ata
   a la versión del SDK** — los hooks del AI SDK cambiaron de API entre majors y
   rompen el widget en un `npm update`.
8. **Probalo contra la base real, no contra tu intuición.** Preguntá por una
   categoría (verifica `buscar_productos`), pedí el precio de un modelo puntual
   y **compará contra la ficha del sitio** (verifica `detalle_producto`), y dejá
   los datos (verifica que la solicitud aparece en el panel con `fuente='chatbot'`).
   Preguntale por un producto **sin precio cargado** y confirmá que no lo inventa.

## Gotchas

- **Los slugs son internos: el usuario nunca los ve.** El bot llegó a escribir
  *"te recomiendo el cm-09-rectangular"*. Instrucción explícita en el prompt:
  los códigos y slugs son solo para llamar herramientas; a la gente se le habla
  por el **nombre** del mueble.
- **Los montos hay que formatearlos en el prompt.** La tool devuelve `350000` y
  el modelo escribe `$350,000` o `350000 colones`. Decile el formato local exacto
  con ejemplos: *"₡350 000, ₡1 250 000"*. Un precio con formato gringo en el
  sitio de un cliente tico se ve mal y le resta credibilidad al bot entero.
- **Sin API key el sitio NO se puede romper.** `/api/chat` responde 503 y el
  widget muestra el CTA de WhatsApp. Así se puede mergear y desplegar el chatbot
  **antes** de que el cliente apruebe el gasto de la key.
- **El widget no va en el panel de administración.** Si el admin vive en un
  subdominio reescrito a `/panel`, chequear `pathname` no alcanza — hay que mirar
  también el **host**. Sin eso, el dueño ve el bot de atención al cliente dentro
  de su propio gestor.
- **`maxSteps` es un tope de costo, no un detalle.** Con 5 alcanza para
  buscar → detallar → responder. Sin tope, un loop de tools se come la cuenta.
- **Rate limit en memoria del lambda es best-effort y hay que decirlo.** Entre
  instancias serverless no se comparte. Para algo robusto hace falta Vercel KV o
  Upstash. Documentalo como follow-up, no lo vendas como resuelto.
- **Los resultados de las tools son datos, no instrucciones.** Si el catálogo lo
  carga el cliente desde un panel, alguien puede escribir un prompt injection en
  la descripción de un producto. El system prompt es la única autoridad, y decilo ahí.
- **El transcript no se persiste por defecto.** Solo el resumen que el bot guarda
  como `mensaje` del lead. Si el cliente quiere analítica de conversaciones, es
  otra entrega (y tiene implicaciones de privacidad que hay que conversar).

## Output esperado

- `/api/chat` con `streamText` + 3 tools, 503 sin key, `maxSteps` y `maxDuration` topeados.
- `lib/chat/tools.ts` con Zod, fallback de identificador y desambiguación como datos.
- `lib/chat/prompt.ts` con FAQ importada de la config del sitio + regla de oro + tono local.
- Migración de `fuente` + etiqueta de origen en el panel.
- Widget flotante que lee stream de texto plano, oculto en el host de admin,
  con fallback a WhatsApp.
- Recorrido de prueba corrido contra la base real, incluido el caso "producto sin precio".

## Ejemplo

**Input:**
"El cliente quiere un asistente de IA en su página. Meta está bloqueado hace dos
meses. Tiene 230 productos con precios por variante."

**Output:**
Chatbot web con AI SDK + `gpt-4o-mini`, 3 tools sobre Supabase, prompt de ~40
líneas con la FAQ y el voseo del cliente. Los precios los da exactos porque salen
de la query. Los leads caen al mismo panel que el formulario, etiquetados
`chatbot`. Se desplegó sin la key (503 + fallback WhatsApp) y se encendió cuando
el cliente aprobó el gasto. Dos fixes en producción: el modelo inventaba slugs
(resuelto con fallback + desambiguación en la tool) y los exponía al usuario
(resuelto en el prompt, junto con el formato de montos).

## Skills relacionadas

`catalogo-multifuncional-por-preset` (la misma idea de tool de búsqueda, del lado n8n/WhatsApp) ·
`n8n-properties-search-tool-pattern` · `bot-anti-loop-detector` ·
`panel-en-subdominio-por-middleware` (por qué el widget necesita mirar el host) ·
`auditar-datos-antes-de-programar-features` (un bot sobre una base vacía no sirve de nada) ·
`verificar-funcionamiento-end-to-end`.
