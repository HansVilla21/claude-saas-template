# Skill: Lo que parece configurable y no lo es — literales de UN cliente en el flujo compartido

## Cuándo usar esta skill

- Trabajás en un sistema **multi-tenant** donde un mismo flujo/worker/pipeline atiende a varios clientes.
- Vas a dar de alta un cliente nuevo de un **rubro distinto** al de los que ya están.
- Un cliente se comporta como otro: dice algo que no es de su negocio, clasifica mal, usa vocabulario ajeno.
- Vas a agregar una instrucción, un texto o una regla "temporal" dentro de un nodo/función que corre para todos.
- Alguien te dice *"eso ya es configurable por cliente"* y no lo verificaste vos.

## Por qué existe esta skill

Capturada el **2026-08-17 y 2026-08-18** en el CRM de Momentum. **El mismo modo de fallo apareció dos veces en dos días**, en dos lugares distintos del mismo flujo. Por eso es skill y no anécdota.

El sistema tiene un workflow de n8n compartido por todos los clientes y una tabla `bot_config` por cliente. La creencia del equipo era: *"los prompts salen de la config del tenant"*. Era verdad **a medias**.

**Caso 1 — el Router.** `Agente Principal` y `Agente Objeciones` leían `bot_config.agent_prompts.*` desde hacía meses. El nodo `Router` **no**: tenía el clasificador de un cliente escrito a mano en `options.systemPromptTemplate` (7.508 chars, idéntico en los dos workflows). Los prompts de router que cada cliente tenía cargados **nunca se ejecutaron**.

El efecto, medido con el mismo mensaje por los dos caminos:

| Router | *"tengo un dolor agudo insoportable, no puedo ni moverme"* |
|---|---|
| **El del fisioterapeuta** (tenant) | `HANDOFF_HUMANO` — alarma médica, escalá |
| El del inmobiliario (default cableado) | `AGENTE_PRINCIPAL` — "no es una objeción ni dato relevante para calificación comercial" |

Traducido: **una señal de alarma médica la venía atendiendo un bot** en vez de escalar a una persona.

**Caso 2 — el texto de las fotos.** Al día siguiente, el bot de un fisioterapeuta recibió una foto y contestó *"¿en qué zona está la propiedad o tenés el código?"*. Lo primero que se sospechó fue mezcla de prompts — razonable, y **falso**: los 3 prompts del cliente no contienen la palabra "propiedad" y su hash difería del de los otros tenants. La instrucción venía del **flujo**: un nodo inyectaba, *haciéndose pasar por el mensaje del lead*:

> `[El lead mando una foto. Como aun no podemos identificar propiedades por imagen, responde diciendo que viste la foto y pedile la zona o el codigo de la propiedad.]`

El agente obedece eso por encima de su propio prompt. El nodo hermano tenía la variante `[contacto nuevo desde anuncio sin texto]` — que asume que todo lo que no es texto viene de un anuncio.

> El patrón: **la lógica de un rubro se cablea "por ahora" en el camino compartido**, se olvida, y reaparece meses después en la boca de un cliente de otro rubro.

Lo que lo vuelve peligroso: **no hay error, no hay log, no hay test que lo agarre.** El sistema funciona perfecto — para el cliente cuyo literal quedó cableado.

---

## Cómo auditarlo (antes de que lo descubra un cliente)

### 1. Buscar vocabulario de rubro en el camino compartido

El olor es **una palabra de un negocio concreto** en un archivo que corre para todos.

```bash
# Ajustar la lista al rubro del cliente fundador — es el que dejó los literales
grep -rniE 'propiedad|inmueble|zona|m2|cita|paciente|menu|plato|reserva' \
  n8n/workflows/*.json src/lib/bot/ supabase/functions/ \
  | grep -v 'bot_config\|prompt_fragment\|/tests/'
```

Todo hit es sospechoso hasta demostrar lo contrario. La pregunta no es "¿está bien escrito?" sino **"¿esto sería correcto para un cliente de otro rubro?"**.

### 2. Comparar lo que el sistema DICE que lee con lo que LEE

Por cada campo de config que el equipo cree que es por-cliente, encontrar **el consumidor real**. Si `bot_config.agent_prompts.router` existe en la base pero ningún nodo lo referencia, la llave está **mintiendo**: guarda algo que nadie ejecuta.

La pregunta operativa: **¿qué llaves se escriben y nunca se leen?** Esas son las que van a explotar cuando alguien las llene creyendo que sirven.

### 3. El control que discrimina de verdad

No alcanza con leer un campo: `router_source=tenant` prueba **un campo**, no un comportamiento. Hay que encontrar **un input donde los dos caminos den distinto** y correrlo por ambos.

En el caso real, *"no me gusta lo virtual"* daba `AGENTE_OBJECIONES` en los dos routers — **ese caso no probaba nada**. El de la alarma médica sí. **Un control que no discrimina se reporta igual**, no se descarta en silencio: es la diferencia entre "verifiqué" y "encontré algo que me dio la razón".

---

## El arreglo: default neutro + override, y el guard es un CONTRATO

### El default va en el flujo, no en cada tenant

Mover el literal a una variable con **nombre de default** (`ROUTER_DEFAULT`, `media_prompts` con texto neutro) en el primer nodo que corre después de resolver el tenant. Los clientes que dependían de ese texto lo conservan **por override explícito**, cargado en su config **ANTES** de deployar el cambio — así no hay ni un segundo de comportamiento distinto.

```js
// El default es neutro: sirve a cualquier rubro
const DEFAULT_IMAGE = 'Todavia no tengo forma de ver imagenes por aqui pero si me contas por texto te ayudo igual';
const texto = cfg?.media_prompts?.image || DEFAULT_IMAGE;
```

### El guard NO es un flag: es que lo cargado declare el contrato

La tentación es un booleano (`usar_router_propio: true`). **Está mal**: el booleano dice "quiero usarlo", no "esto funciona". El guard correcto verifica que lo cargado **cumpla el contrato del consumidor**.

```js
// Se usa el del tenant SOLO si declara el contrato del Switch
const DESTINOS = ['AGENTE_PRINCIPAL', 'AGENTE_OBJECIONES', 'HANDOFF_HUMANO'];
const p = cfg?.agent_prompts?.router || '';
const cumpleContrato = p.includes('destino') && DESTINOS.every(d => p.includes(d));
const routerPrompt = cumpleContrato ? p : ROUTER_DEFAULT;
```

**Por qué importa tanto:** un cliente tenía guardado bajo la llave `router` un **filtro pre-bot con otro schema** (`tipo_mensaje`, `debe_continuar_bot`). Sin el guard, al volver el Router config-driven ese cliente quedaba **mudo en producción**.

---

## El gotcha que convierte un bug en un apagón

> Un valor **fuera** del contrato no degrada: **descarta el turno**.

El `Switch` de n8n (y cualquier router por reglas) tiene dos modos de fallo que se confunden todo el tiempo:

| Situación | Qué hace |
|---|---|
| El campo `destino` **no existe** | dispara la salida **BACKUP** → el bot responde algo |
| El campo existe con un valor **desconocido** (`ROBERTO`, `VENTAS`, un typo) | **ninguna regla matchea → el ítem se descarta → el bot queda MUDO** |

Por eso un prompt de tenant que emite un destino propio no produce "un bot degradado": produce **un bot que no contesta**, sin error y sin log. Cualquier script que cargue un prompt de router debe **abortar** si el prompt emite destinos fuera del contrato.

---

## Proceso

1. **Listar los literales del camino compartido** (grep de vocabulario de rubro, paso 1).
2. **Por cada uno preguntarse:** ¿sería correcto para un cliente de OTRO rubro? Si no → es config, no código.
3. **Mover el literal a un default neutro** en el primer nodo post-resolución de tenant.
4. **Cargar el override a los tenants que dependían del texto viejo, ANTES de deployar.** Merge quirúrgico sobre el jsonb, nunca reescribir el objeto entero (ver `jsonb-config-save-no-pisar-campos-ajenos`).
5. **Escribir el guard como verificación de contrato**, no como flag.
6. **Verificar con un control que discrimine** + **no-regresión de cada cliente en producción**.
7. **Abortar el script de carga** si el contenido no cumple el contrato del consumidor.

## Output esperado

- Cero vocabulario de un rubro en el camino compartido; los defaults son neutros y están nombrados como defaults.
- Cada llave de config tiene un consumidor real (nada que se escriba y no se lea).
- El guard valida contrato, no intención.
- Evidencia: mismo input por los dos caminos dando **distinto**, más la no-regresión de cada cliente vivo.

## Ejemplo

**Input:** "El bot del fisio le preguntó al paciente en qué zona está la propiedad. ¿Se mezclaron los prompts?"

**Output incorrecto:** revisar los prompts, no encontrar "propiedad", y responder "los prompts están bien".

**Output correcto:** "No son los prompts — los 3 del cliente no contienen la palabra y su hash difiere del de los inmobiliarios. Es el nodo `Set Normalize - Image` del flujo compartido, que inyecta el texto como si fuera el mensaje del lead. Lo moví a `bot_config.media_prompts.image` con default neutro; a los dos inmobiliarios les cargué su texto como override antes de deployar. Verificado: foto→fisio ya no menciona propiedades, foto→inmobiliario conserva el texto viejo, y texto→fisio (el camino de TODOS los mensajes) no se movió."

## Skills relacionadas

`catalogo-multifuncional-por-preset` (la forma correcta: un preset por rubro sobre una base compartida) · `onboarding-cliente-crm` (alta de cliente nuevo — gotcha #-2) · `jsonb-config-save-no-pisar-campos-ajenos` (merge quirúrgico del override) · `probar-camino-produccion-sin-efectos-externos` (cómo verificar sin tocarle el teléfono a nadie) · `verificar-funcionamiento-end-to-end` (el estándar de prueba) · `n8n-workflow-build-script` (deploy idempotente + verificación por hash).
