# VARIABLES CONFIGURABLES — `bot_config` de Momentum AI CRM

**Versión:** 1.1
**Fecha:** 2026-06-05 (pasada 2)
**Aplica a:** schema de la columna `agencies.bot_config` (jsonb) en Supabase
**UI target:** panel de configuración del bot en la plataforma Momentum (admin de la agencia)

---

## PROPÓSITO

Este documento es la **fuente única de verdad** de qué campos del `bot_config` son editables desde la UI, qué tipo tienen, qué default usar, y qué cambia operativamente cuando un cliente edita cada uno.

Los prompts (`agente-principal.md`, `agente-objeciones.md`, `router-clasificador.md`, `formateador.md`) consumen estos campos vía expresiones N8N (`{{ $json.bot_config.X }}`). Cualquier campo agregado acá debe quedar:

1. Documentado en este archivo con su contrato (tipo, default, ejemplo)
2. Expuesto en la UI del panel admin de Momentum
3. Validado en el backend al guardar
4. Referenciado en al menos uno de los 4 prompts

Cualquier campo en los prompts que NO esté acá debería migrarse aquí, o documentar por qué se queda hardcodeado en el prompt.

---

## ESTRUCTURA DE `bot_config` (jsonb)

```jsonc
{
  "assistant_name": "Mateo",
  "business_info": "...",
  "sales_methodology": "consultivo",
  "qualification_framework": "bant",
  "pricing": { ... },
  "target_industries": [ ... ],
  "differentiators": [ ... ],
  "pains_to_value_map": { ... },
  "objections_catalog": [ ... ],
  "closing_method": "llamada_humana",
  "calendly_link": "https://...",
  "payment_link": "https://...",
  "horario_equipo": "L-V 8am-6pm hora Costa Rica",
  "handoff_targets": ["Hans", "Pietro"],
  "tone": {
    "preset": "consultivo",
    "notes": "..."
  },
  "anti_bot_rules": { ... },
  "workflow_version": "v1"
}
```

---

## CAMPOS

### 1. `assistant_name`

| | |
|---|---|
| **Tipo** | `string` |
| **Default** | `"Mateo"` |
| **UI** | Input text, max 30 chars |
| **Validación backend** | Letras + espacios + acento, no allcaps, no números |
| **Dónde se usa** | Agente principal (sección IDENTIDAD), agente de objeciones (sección IDENTIDAD), saludo inicial |
| **Ejemplo Momentum** | `"Mateo"` |
| **Ejemplo Pérez Luna** | `"Sofía"` (asistente de catálogo de mueblería) |

**Cuidado:** el prompt asume capitalización natural de nombre propio. Si el cliente pone `"MATEO"` o `"mateo"`, el bot lo dice tal cual y delata al bot. Validar en backend.

---

### 2. `business_info`

| | |
|---|---|
| **Tipo** | `string` (markdown libre, máx 4000 chars) |
| **Default** | (texto del bot_config actual de Momentum, sección "Momentum AI CRM es una plataforma…") |
| **UI** | Textarea grande, contador de caracteres |
| **Validación backend** | Longitud máx, no SQL injection, no scripts |
| **Dónde se usa** | Agente principal sección "QUÉ ES [PRODUCTO]" |
| **Ejemplo Momentum** | "Momentum AI CRM es una plataforma todo-en-uno para negocios que venden por WhatsApp…" (texto actual completo) |
| **Ejemplo Pérez Luna** | "Pérez Luna es una mueblería con tienda física en Asunción y catálogo online. 35 años en el mercado. Especialidad: muebles para sala, comedor, dormitorio. Entrega y armado incluido en zona metropolitana." |

**Nota:** este campo es lo que el bot usa para "saber del negocio". Cada cliente lo escribe a su medida. El bot lo absorbe en el contexto y responde con esa info.

---

### 3. `sales_methodology`

| | |
|---|---|
| **Tipo** | `enum` (`"consultivo"` \| `"transaccional"` \| `"educativo"`) |
| **Default** | `"consultivo"` |
| **UI** | Radio buttons (3 opciones) con tooltip explicativo de cada modo |
| **Validación backend** | Enum estricto |
| **Dónde se usa** | Agente principal sección "MODO DE VENTA" (define qué fases del flujo activar) |
| **Ejemplo Momentum** | `"consultivo"` |
| **Ejemplo Pérez Luna** | `"transaccional"` |
| **Ejemplo Academia X** | `"educativo"` |

**Comportamiento por modo:**

- **`consultivo`** — Diagnóstico Consultivo completo (4 fases). Discovery largo antes del cierre. 70% habla el lead. Mateo / Leo / Sofia. Ideal SaaS B2B, asesoría, real estate.

- **`transaccional`** — Saltar a producto rápido. Lead sabe lo que quiere, vos lo ayudás a confirmar y comprar. Discovery de 1-2 preguntas máx. 50/50 habla. Ideal ecommerce, catálogo físico, retail.

- **`educativo`** — Aportar valor masivo. NO cerrar. La conversión se da en mensajes futuros cuando el lead vuelve listo. CTA siempre "cuando estés listo me escribís". Ideal cursos, info-products, comunidades.

---

### 4. `qualification_framework` (NUEVO v1.1)

| | |
|---|---|
| **Tipo** | `enum` (`"bant"` \| `"none"`) |
| **Default** | `"bant"` |
| **UI** | Radio buttons (2 opciones) con tooltip explicativo (BANT = Budget / Authority / Need / Timeline) |
| **Validación backend** | Enum estricto |
| **Dónde se usa** | Agente principal sección "EXTRACCIÓN BANT (si está activo)"; estructura del handoff al humano (resumen BANT en el mensaje) |
| **Ejemplo Momentum** | `"bant"` (SaaS B2B mid-market, justifica calificar antes de ocupar el tiempo del founder) |
| **Ejemplo Pérez Luna** | `"none"` (catálogo retail, no necesita calificar — el lead que entra a preguntar por un sillón ya está calificado por intención de compra) |
| **Ejemplo Academia X** | `"none"` (educativo, no hay calificación binaria) |

**Comportamiento por modo:**

- **`bant`** — El agente principal extrae los 4 datos (Budget, Authority, Need, Timeline) durante la conversación SIN nombrar el framework. Las preguntas son naturales, paralelas al Diagnóstico Consultivo (no en lugar de). Budget y Need ya están cubiertos por el flujo consultivo estándar. **Authority y Timeline se preguntan explícitamente** con phrasing operacional (ver `agente-principal.md` sección "EXTRACCIÓN BANT"). El handoff a humano lleva el resumen BANT estructurado.

- **`none`** — El bot NO pregunta Authority ni Timeline explícitamente. El handoff al humano lleva solo el resumen estándar (industria, pain, hora propuesta). Útil para flujos `transaccional` o `educativo` donde calificar pesa más que aporta.

**Composición con `sales_methodology`:** BANT es transversal, NO excluye los 3 modos. Combinaciones válidas:
- `consultivo` + `bant` → Momentum default (calificación profunda)
- `consultivo` + `none` → SaaS donde la calificación es por temperatura, no BANT (ej: Level)
- `transaccional` + `bant` → ecommerce que califica antes de mandar catálogo (raro)
- `transaccional` + `none` → Pérez Luna default
- `educativo` + `none` → cursos / comunidades (siempre, no aplica BANT)

**Razón del diseño:** BANT es **CÓMO extraés data**; `sales_methodology` es **CÓMO te comunicás**. Son ejes ortogonales que se componen.

---

### 5. `pricing` (era #4)

| | |
|---|---|
| **Tipo** | `object` con sub-campos |
| **Default** | `{ "setup_amount": 499, "monthly_amount": 150, "currency": "USD", "delivery_time": "1 mes calendario", "justification_phrase": "...stack típico ($120-250) por una sola mensualidad de $150..." }` |
| **UI** | Grupo de inputs (number setup, number monthly, dropdown currency, text delivery_time, textarea justification) |
| **Validación backend** | Números >= 0, currency ISO 4217, delivery_time string corto |
| **Dónde se usa** | Agente principal sección "Precio", FAQs, agente de objeciones objeción #1 "es caro" |

**Sub-campos:**

```jsonc
{
  "pricing": {
    "setup_amount": 499,              // number, >= 0
    "monthly_amount": 150,            // number, >= 0
    "currency": "USD",                // enum: "USD" | "CRC" | "MXN" | "ARS" | "COP" | "PEN" | "CLP"
    "delivery_time": "1 mes calendario",  // string, max 50 chars
    "justification_phrase": "Reemplaza el stack típico (ManyChat + ChatGPT + Soho + servidor + Zapier que cuesta $120-250) por $150 todo incluido"  // string, max 500 chars
  }
}
```

**Ejemplo Pérez Luna:**

```jsonc
{
  "pricing": {
    "setup_amount": 0,
    "monthly_amount": 0,
    "currency": "PYG",
    "delivery_time": "entrega 24-48hs en zona metropolitana",
    "justification_phrase": "Precio incluye armado y entrega sin costo adicional en zona metropolitana"
  }
}
```

(Ecommerce no tiene setup/monthly, los amounts pueden ir en 0 y el agente sabe que el `closing_method = link_pago` y el precio se discute por producto, no por suscripción.)

---

### 6. `target_industries` (era #5)

| | |
|---|---|
| **Tipo** | `array<string>` |
| **Default** | `["inmobiliarias", "fisioterapia", "clínicas privadas", "clínicas dentales", "servicios B2C high-touch"]` |
| **UI** | Multi-select / tags input |
| **Validación backend** | Max 20 items, cada uno max 50 chars |
| **Dónde se usa** | Agente principal sección "Industrias target", FASE 5 CALIFICACIÓN, FAQ "¿Manejan mi industria?" |
| **Ejemplo Pérez Luna** | `["consumidor final", "interior designers", "developers de proyectos residenciales"]` |

**Nota:** el bot usa este array para calificar (industria del lead in/out del target). Si la industria del lead está en este array, califica positivo. Si no, marca como NO_FIT o EXPLORANDO según otros criterios.

---

### 7. `differentiators` (era #6)

| | |
|---|---|
| **Tipo** | `array<object>` con `{ name, description }` |
| **Default** | (los 5 diferenciadores de Momentum del prompt actual) |
| **UI** | Lista editable con cards (nombre + descripción), reordenable, add/remove |
| **Validación backend** | Max 10 diferenciadores, name max 50 chars, description max 300 chars |
| **Dónde se usa** | Agente principal sección "Diferenciadores reales", FASE 4 EDUCACIÓN ADAPTADA |

**Ejemplo Momentum:**

```jsonc
{
  "differentiators": [
    { "name": "Bot integrado al CRM", "description": "no es ManyChat + Soho con Zapier en medio, el bot escribe directo al CRM" },
    { "name": "Handoff con contexto preservado", "description": "el agente humano retoma con todo el historial visible, no empieza de cero" },
    { "name": "AI inline para agentes humanos", "description": "cuando el equipo responde, ve sugerencias contextuales en la misma pantalla, no va a ChatGPT" },
    { "name": "Auto-actualización del CRM", "description": "el bot mueve leads, asigna agentes, agrega notas, sin intervención manual" },
    { "name": "Una sola factura, un solo proveedor", "description": "reemplaza ManyChat + ChatGPT + CRM + servidor + Zapier por $150/mes" }
  ]
}
```

**Ejemplo Pérez Luna:**

```jsonc
{
  "differentiators": [
    { "name": "35 años en el mercado", "description": "trayectoria, no improvisamos con materiales" },
    { "name": "Armado incluido", "description": "no tenés que pagar aparte ni hacerlo vos" },
    { "name": "Entrega 24-48hs zona metro", "description": "no esperás 3 semanas como con otros" },
    { "name": "Showroom físico para tocar y probar", "description": "no comprás a ciegas por foto" }
  ]
}
```

---

### 8. `pains_to_value_map` (era #7)

| | |
|---|---|
| **Tipo** | `object` (key: pain code string, value: respuesta de value prop) |
| **Default** | (los 6 pains del prompt actual: ManyChat se cae, CRM desconectado, leads se pierden, etc.) |
| **UI** | Lista editable de pares (pain → value prop response), cada par con un código corto (key) y texto largo (value) |
| **Validación backend** | Max 15 pairs, key max 50 chars, value max 500 chars |
| **Dónde se usa** | Agente principal FASE 4 EDUCACIÓN ADAPTADA |

**Ejemplo Momentum:**

```jsonc
{
  "pains_to_value_map": {
    "manychat_se_cae": "El problema de ManyChat es que depende 100% de la API de Meta, cuando Meta cambia algo tu bot queda colgado. En Momentum el bot corre en infraestructura nuestra con monitoreo 24/7…",
    "crm_desconectado": "Eso es típico cuando armás el stack con Zapier en medio. En Momentum el bot escribe directo al CRM, sin Zapier, sin webhooks que se caen",
    "leads_se_pierden": "El bot auto-actualiza el CRM en tiempo real, cada lead que entra queda con su pain, su zona, su presupuesto, su industria, sin que nadie lo cargue a mano",
    "equipo_sin_contexto": "Cuando el bot pasa la conversación a un humano, el agente ve TODO el historial, lo que el bot ya preguntó y respondió, no empieza de cero",
    "muchas_licencias": "El cliente típico paga $120-250/mes entre ManyChat + OpenAI + Soho + servidor + Zapier. Momentum es $150 todo incluido, una factura",
    "no_tengo_nada": "Perfecto, ahí lo que conviene es arrancar con la base correcta de una, no parchar después"
  }
}
```

**Nota técnica:** el agente principal, al detectar un pain del lead, busca el match en este map y responde con el value prop correspondiente. Esto permite que el cliente edite los value props desde la UI sin tocar el prompt.

---

### 9. `objections_catalog` (era #8)

| | |
|---|---|
| **Tipo** | `array<object>` con `{ trigger, escuchar_acompañar, respuesta, confirmar }` |
| **Default** | (las 10 objeciones del `agente-objeciones.md` para Momentum) |
| **UI** | Lista editable con cards (objection trigger + 3 textareas para los 3 momentos del framework), reordenable, add/remove |
| **Validación backend** | Max 15 objeciones, trigger max 100 chars, cada texto max 500 chars |
| **Dónde se usa** | Agente de objeciones sección "CATÁLOGO DE OBJECIONES" |

**Estructura de cada objeción:**

```jsonc
{
  "trigger": "es muy caro",                              // patrones que la disparan (separados por |)
  "escuchar_acompañar": "Entiendo, comparado de cabeza ManyChat se ve más barato",
  "respuesta": "El tema es que ManyChat solo te da el bot, después necesitás OpenAI API, CRM aparte, servidor, Zapier…",
  "confirmar": "Mirado así, tiene más sentido?"
}
```

**Ejemplo Pérez Luna (objecion específica del negocio):**

```jsonc
{
  "trigger": "lo veo en otra mueblería más barato",
  "escuchar_acompañar": "Te entiendo, el precio es importante",
  "respuesta": "Lo que pasa es que en otras muebleras el armado y la entrega te cobran aparte, suma $X que en nuestro caso ya está incluido. Y los materiales que usamos son grade A, vienen con garantía de 5 años",
  "confirmar": "Visto así, tiene más sentido?"
}
```

---

### 10. `closing_method` (era #9)

| | |
|---|---|
| **Tipo** | `enum` (`"venta_directa"` \| `"llamada_humana"` \| `"link_pago"` \| `"valor_puerta_abierta"`) |
| **Default** | `"llamada_humana"` |
| **UI** | Radio buttons (4 opciones) con tooltip de cada uno |
| **Validación backend** | Enum estricto |
| **Dónde se usa** | Agente principal FASE 6 CIERRE (define qué camino tomar al cerrar) |
| **Ejemplo Momentum** | `"llamada_humana"` |
| **Ejemplo Pérez Luna** | `"link_pago"` |
| **Ejemplo Academia X** | `"valor_puerta_abierta"` |

**Comportamiento por método:**

- **`venta_directa`** — Cerrá por chat sin link de pago ni Calendly. El bot cierra el commitment verbal y deriva a humano para coordinar pago/firma. Útil cuando no hay infra de pago digital.

- **`llamada_humana`** — (Default Momentum) Conducir a llamada de 20 min con `calendly_link`. El bot NO firma, el humano cierra en vivo.

- **`link_pago`** — Mandar directo el `payment_link` cuando el lead esté CALIFICADO. Útil para ecommerce, productos commodity, info-products de precio fijo.

- **`valor_puerta_abierta`** — NO cerrar nunca activamente. Solo aportar valor + dejar puerta abierta. La conversión sucede asíncronamente cuando el lead vuelve.

---

### 11. `calendly_link` (era #10)

| | |
|---|---|
| **Tipo** | `string (URL)` |
| **Default** | `""` (vacío) |
| **UI** | Input URL con validación visual |
| **Validación backend** | Regex de URL válida, dominios permitidos: `calendly.com`, `cal.com`, `savvycal.com`, `tidycal.com` |
| **Dónde se usa** | Agente principal FASE 6A, FAQs, fuera de horario; agente de objeciones |
| **Obligatorio si:** `closing_method = "llamada_humana"` |
| **Ejemplo Momentum** | `"https://calendly.com/momentum-crm/llamada-20min"` |

**Nota:** si `closing_method` es `"link_pago"` o `"valor_puerta_abierta"` o `"venta_directa"`, este campo puede quedar vacío y el bot no lo va a mencionar.

---

### 12. `payment_link` (era #11)

| | |
|---|---|
| **Tipo** | `string (URL)` |
| **Default** | `""` (vacío) |
| **UI** | Input URL con validación visual |
| **Validación backend** | Regex de URL válida, dominios permitidos: stripe, mercadopago, paypal, kushki, niubiz, payku, payco, etc. |
| **Dónde se usa** | Agente principal FASE 6A si `closing_method = "link_pago"` |
| **Obligatorio si:** `closing_method = "link_pago"` |
| **Ejemplo Pérez Luna** | `"https://link.mercadopago.com.py/perezluna-mueble-001"` |

---

### 13. `horario_equipo` (era #12)

| | |
|---|---|
| **Tipo** | `string` |
| **Default** | `"L-V 8am-6pm hora Costa Rica"` |
| **UI** | Input text con placeholder |
| **Validación backend** | String <= 100 chars |
| **Dónde se usa** | Agente principal sección "Horario y disponibilidad", mensaje fuera de horario |
| **Ejemplo Pérez Luna** | `"L-S 9am-7pm hora Asunción, domingos cerrado"` |

**Nota:** la lógica de "está fuera de horario" actualmente NO la calcula el bot (sería complejo manejar timezones). Si querés esa lógica, se computa en N8N antes del LLM y se pasa como flag `is_out_of_hours: true/false`. El bot solo usa el string para *informar* el horario al lead.

---

### 14. `tone.preset` y `tone.notes` (era #13)

| | |
|---|---|
| **Tipo** | `object { preset: enum, notes: string }` |
| **Default** | `{ "preset": "consultivo", "notes": "voseo CR neutro-LATAM, sin modismos fuertes…" }` |
| **UI** | Dropdown para preset + Textarea para notes |
| **Validación backend** | preset enum, notes max 2000 chars |
| **Dónde se usa** | Agente principal sección PERSONALIDAD, sección IDENTIDAD |

**Presets disponibles:**

- `"consultivo"` — profesional, cercano, asesor doctor (Momentum, Level, SaaS B2B)
- `"directo"` — amable, eficiente, sin relleno (Pérez Luna, ecommerce, catálogo)
- `"educativo_calido"` — explicativo, paciente, valor primero (cursos, comunidades)
- `"corporativo_pulido"` — formal pero humano (B2B enterprise)
- `"custom"` — solo usar `notes`, sin preset implícito

**Ejemplo Pérez Luna:**

```jsonc
{
  "tone": {
    "preset": "directo",
    "notes": "Tuteo paraguayo neutro. Tono amable y eficiente, sin relleno. Saludo cálido pero rápido al producto. Sin formalismos."
  }
}
```

---

### 15. `anti_bot_rules` (era #14)

| | |
|---|---|
| **Tipo** | `object` |
| **Default** | (las reglas del agente principal: no em dash, no punto final, no anunciar respuesta, nombre moderado, no markdown doble) |
| **UI** | **NO expuesto al cliente.** Esto es heredable del sistema y NO debería editarse por cliente típico. Solo Hans/admin de Momentum puede modificarlo. |
| **Validación backend** | Solo editable por rol `super_admin`. Cliente normal no ve este campo. |
| **Dónde se usa** | Agente principal sección REGLAS CRÍTICAS, PUNTUACIÓN; agente de objeciones; formateador (las de markdown) |
| **Sobreescribible por cliente** | Solo el campo `notes_extra` (string libre con reglas adicionales) |

**Estructura:**

```jsonc
{
  "anti_bot_rules": {
    "no_em_dash": true,
    "no_punto_final": true,
    "no_dos_puntos": true,
    "no_punto_y_coma": true,
    "no_signo_apertura": true,
    "no_anunciar_respuesta": true,
    "uso_nombre_max_cada": 3,
    "no_markdown_doble_asterisco": true,
    "no_bullets_dash": true,
    "notes_extra": ""  // editable por cliente, agrega reglas custom
  }
}
```

**`notes_extra` ejemplo Pérez Luna:**

```jsonc
{
  "anti_bot_rules": {
    // resto hereda del sistema
    "notes_extra": "Nunca decir 'showroom', siempre 'tienda'. Nunca usar 'asesor', somos 'vendedores'. Si el cliente menciona armado, siempre clarificar que es sin costo extra."
  }
}
```

---

### 16. `handoff_targets` (NUEVO v1.1, reemplaza `handoff_target` string)

| | |
|---|---|
| **Tipo** | `array<string>` |
| **Default** | `["Hans", "Pietro"]` |
| **UI** | Lista editable de tags / chips. Add/remove nombres. Reordenable (el orden no afecta — el round-robin alterna por persistencia, no por posición) |
| **Validación backend** | Array, mínimo 0 items, máximo 5. Cada item: string letras + espacios + acento, max 30 chars, no allcaps, no números. Si el array está vacío, fallback en runtime a `"el equipo"`. |
| **Dónde se usa** | Agente principal (todos los lugares donde antes decía "Hans" literal, ahora variable inyectada). Agente de objeciones (cuando la respuesta sugiere derivar a humano). `handoff-trigger` Code node (mensaje fijo de handoff + notificación interna al equipo). |
| **Ejemplo Momentum** | `["Hans", "Pietro"]` |
| **Ejemplo Pérez Luna** | `["María"]` (un solo nombre, siempre María) |
| **Ejemplo agency con un solo dueño** | `["Juan"]` |
| **Ejemplo agency con equipo grande** | `["Sara", "Marco", "Ana"]` (round-robin entre 3) |

**Mecanismo de selección (round-robin):**

- El nombre seleccionado se calcula **al PRIMER mensaje del lead** (no en cada turno — sino el lead vería 2 nombres distintos a mitad de conversación)
- Se persiste en `conversations.assigned_handoff_target` (text) en Supabase
- En cada turno posterior, el agente principal y el de objeciones leen ese campo y lo inyectan en el prompt como `handoff_target_for_this_conversation`
- Implementación sugerida: reusar el RPC `assign_round_robin` que ya está en producción (P1.1 roles). Se le pasa el array `handoff_targets` y devuelve el próximo según contador interno por agency.
- Si el array tiene 1 solo elemento, siempre ese (round-robin trivial)
- Si el array está vacío (no debería pasar por validación, pero defensivo): fallback al string `"el equipo"`

**Por qué se cambió de string a array:**

- Antes: `handoff_target: "Hans"` (hardcoded en prompts).
- Ahora: `handoff_targets: ["Hans", "Pietro"]` con round-robin, para distribuir la carga de llamadas entre los dos founders sin que el lead lo perciba.
- Migración: si el `bot_config` viejo tiene `handoff_target` (string), el migration script lo envuelve en array: `[bot_config.handoff_target]`.

**Variable derivada que ve el prompt:**

| Variable | Tipo | Cómo se computa |
|---|---|---|
| `{{ $json.handoff_target_for_this_conversation }}` | `string` | Lee `conversations.assigned_handoff_target`. Si está vacío, computa round-robin con `handoff_targets`, persiste, y devuelve. |

**Nota técnica:** el prompt NO ve `handoff_targets` (el array). Solo ve `handoff_target_for_this_conversation` (el string ya resuelto). Esto previene que el LLM se confunda eligiendo nombres por su cuenta.

---

### 17. `workflow_version` (NUEVO v1.1)

| | |
|---|---|
| **Tipo** | `enum` (`"v1"` \| `"v2"`) |
| **Default** | `"v1"` (workflow monolítico actual) |
| **UI** | **NO expuesto al cliente típico.** Solo `super_admin` (Hans/Pietro) lo edita por agency. Tooltip: "Versión del workflow N8N que procesa los mensajes. Cambiar solo si sos super_admin de Momentum". |
| **Validación backend** | Enum estricto. Solo editable por rol `super_admin`. |
| **Dónde se usa** | El webhook YCloud lee este campo al recibir mensaje y rutea al workflow N8N correspondiente (v1 = bot monolítico actual, v2 = multi-agente). |
| **Ejemplo Momentum (cliente cero)** | `"v2"` después de validar 48h |
| **Ejemplo Pérez Luna y siguientes** | `"v1"` hasta que se valide v2 estable, después migración progresiva |

**Propósito:** feature flag por agency para deploy progresivo del rediseño multi-agente. Permite que conversaciones activas con v1 no se interrumpan, y que Momentum sea cliente cero del v2 sin afectar a otros clientes.

**Plan de retiro de v1:** cuando v2 esté en producción ≥30 días sin incidentes, migrar todas las agencies a v2 y retirar v1 del runtime. Mantener el JSON de v1 versionado en git (skill `n8n-workflow-versioning`) como rollback de emergencia.

---

## EJEMPLO COMPLETO — `bot_config` de Momentum (default)

```jsonc
{
  "assistant_name": "Mateo",
  "business_info": "Momentum AI CRM es una plataforma todo-en-uno para negocios que venden por WhatsApp: chatbot AI integrado que atiende 24/7 + CRM completo + integración con el equipo humano. Reemplaza el stack típico (ManyChat + ChatGPT + Soho/HubSpot + servidor + tarjetas + licencias) por una sola plataforma con una sola mensualidad. Precio: $499 setup inicial + $150/mes (incluye hosting, IA, WhatsApp, soporte, monitoreo 24/7). Entrega en 1 mes calendario. Operamos desde Costa Rica para toda LATAM y EEUU.",
  "sales_methodology": "consultivo",
  "qualification_framework": "bant",
  "pricing": {
    "setup_amount": 499,
    "monthly_amount": 150,
    "currency": "USD",
    "delivery_time": "1 mes calendario",
    "justification_phrase": "Reemplaza el stack típico (ManyChat + ChatGPT + Soho + servidor + Zapier que cuesta $120-250) por $150 todo incluido"
  },
  "target_industries": ["inmobiliarias", "fisioterapia", "clínicas privadas", "clínicas dentales", "servicios B2C high-touch"],
  "differentiators": [
    { "name": "Bot integrado al CRM", "description": "no es ManyChat + Soho con Zapier en medio, el bot escribe directo al CRM" },
    { "name": "Handoff con contexto preservado", "description": "el agente humano retoma con todo el historial visible, no empieza de cero" },
    { "name": "AI inline para agentes humanos", "description": "cuando el equipo responde, ve sugerencias contextuales en la misma pantalla" },
    { "name": "Auto-actualización del CRM", "description": "el bot mueve leads, asigna agentes, agrega notas, sin intervención manual" },
    { "name": "Una sola factura, un solo proveedor", "description": "reemplaza ManyChat + ChatGPT + CRM + servidor + Zapier por $150/mes" }
  ],
  "pains_to_value_map": {
    "manychat_se_cae": "...",
    "crm_desconectado": "...",
    "leads_se_pierden": "...",
    "equipo_sin_contexto": "...",
    "muchas_licencias": "...",
    "no_tengo_nada": "..."
  },
  "objections_catalog": [
    { "trigger": "es muy caro|me parece caro|ManyChat más barato", "escuchar_acompañar": "...", "respuesta": "...", "confirmar": "..." },
    // ... 7 objeciones más
  ],
  "closing_method": "llamada_humana",
  "calendly_link": "https://calendly.com/momentum-crm/llamada-20min",
  "payment_link": "",
  "horario_equipo": "L-V 8am-6pm hora Costa Rica",
  "handoff_targets": ["Hans", "Pietro"],
  "tone": {
    "preset": "consultivo",
    "notes": "Voseo CR neutro-LATAM: vos, tenés, podés, querés. Sin modismos fuertes. Sin 'che', sin 'mae'. Profesional cercano, no recepcionista. Una pregunta a la vez."
  },
  "anti_bot_rules": {
    "no_em_dash": true,
    "no_punto_final": true,
    "no_dos_puntos": true,
    "no_punto_y_coma": true,
    "no_signo_apertura": true,
    "no_anunciar_respuesta": true,
    "uso_nombre_max_cada": 3,
    "no_markdown_doble_asterisco": true,
    "no_bullets_dash": true,
    "notes_extra": ""
  },
  "workflow_version": "v2"
}
```

---

## EJEMPLO COMPLETO — `bot_config` de Pérez Luna mueblería (modo transaccional)

```jsonc
{
  "assistant_name": "Sofía",
  "business_info": "Pérez Luna es una mueblería con tienda física en Asunción y catálogo online. 35 años en el mercado. Especialidad: muebles para sala, comedor, dormitorio. Entrega y armado SIN COSTO ADICIONAL en zona metropolitana de Asunción.",
  "sales_methodology": "transaccional",
  "qualification_framework": "none",
  "pricing": {
    "setup_amount": 0,
    "monthly_amount": 0,
    "currency": "PYG",
    "delivery_time": "24-48hs zona metropolitana",
    "justification_phrase": "Precio incluye armado y entrega sin costo adicional"
  },
  "target_industries": ["consumidor final", "interior designers", "developers residenciales"],
  "differentiators": [
    { "name": "35 años en el mercado", "description": "trayectoria sólida, no improvisamos con materiales" },
    { "name": "Armado y entrega incluidos", "description": "no pagás aparte, no lo hacés vos" },
    { "name": "Entrega 24-48hs", "description": "no esperás 3 semanas como con otros" },
    { "name": "Tienda física", "description": "podés ver y tocar antes de comprar" }
  ],
  "pains_to_value_map": {
    "mueble_se_rompe_rapido": "Lo que pasa con los muebles importados baratos es que usan MDF que se descama. Nuestros muebles son madera maciza con sellado profesional, garantía 5 años",
    "tarda_mucho_la_entrega": "Tenemos stock propio, entrega 24-48hs en zona metro, otras tiendas te hacen esperar 3 semanas o más porque trabajan a pedido",
    "armado_cobran_aparte": "En Pérez Luna armado y entrega están incluidos, sin sorpresas en el precio final"
  },
  "objections_catalog": [
    { "trigger": "más barato en otro lado", "escuchar_acompañar": "Te entiendo, el precio importa", "respuesta": "En otras tiendas el armado y entrega te cobran aparte, suma $X. Y los materiales que usamos son grade A con garantía 5 años", "confirmar": "Visto así, tiene más sentido?" },
    { "trigger": "tarda mucho", "escuchar_acompañar": "Sí, normalmente las muebleras tardan", "respuesta": "Nosotros entregamos en 24-48hs en zona metro porque tenemos stock propio. Otras tiendas trabajan a pedido y tardan 3+ semanas", "confirmar": "Te calza el timing?" }
  ],
  "closing_method": "link_pago",
  "calendly_link": "",
  "payment_link": "https://link.mercadopago.com.py/perezluna-mueble-001",
  "horario_equipo": "L-S 9am-7pm hora Asunción",
  "handoff_targets": ["María"],
  "tone": {
    "preset": "directo",
    "notes": "Tuteo paraguayo neutro. Tono amable y eficiente, sin relleno. Sin formalismos. Saludo cálido pero rápido al producto."
  },
  "anti_bot_rules": {
    "no_em_dash": true,
    "no_punto_final": true,
    "no_dos_puntos": true,
    "no_punto_y_coma": true,
    "no_signo_apertura": true,
    "no_anunciar_respuesta": true,
    "uso_nombre_max_cada": 3,
    "no_markdown_doble_asterisco": true,
    "no_bullets_dash": true,
    "notes_extra": "Nunca decir 'showroom', siempre 'tienda'. Nunca usar 'asesor', somos 'vendedores'."
  },
  "workflow_version": "v1"
}
```

---

## REGLAS DE VALIDACIÓN AL GUARDAR (backend)

Al guardar `bot_config` desde la UI, el backend debe validar:

1. **`assistant_name`** — letras + espacios + acento, max 30 chars, no allcaps
2. **`business_info`** — string, max 4000 chars, sanitizado (no SQL injection, no scripts)
3. **`sales_methodology`** — enum estricto
4. **`qualification_framework`** — enum estricto (`"bant"` \| `"none"`)
5. **`pricing.setup_amount`, `pricing.monthly_amount`** — number >= 0
6. **`pricing.currency`** — enum ISO 4217 (lista corta de las usadas en LATAM)
7. **`target_industries`** — array max 20, cada item max 50 chars
8. **`differentiators`** — array max 10, cada `name` max 50, cada `description` max 300
9. **`pains_to_value_map`** — object max 15 keys, cada value max 500 chars
10. **`objections_catalog`** — array max 15, cada objeción con los 4 sub-campos completos
11. **`closing_method`** — enum estricto
12. **Si `closing_method = "llamada_humana"`** → `calendly_link` obligatorio, regex URL válida, dominios permitidos
13. **Si `closing_method = "link_pago"`** → `payment_link` obligatorio, regex URL válida, dominios de pago permitidos
14. **`horario_equipo`** — string max 100 chars
15. **`handoff_targets`** — array, min 0 max 5 items. Cada item: letras + espacios + acento, max 30 chars, no allcaps, no números. Si array vacío, warning visual en UI ("sin destinatario de handoff, el bot dirá 'el equipo'"). Para `closing_method = "llamada_humana"`, recomendar al menos 1 nombre.
16. **`tone.preset`** — enum
17. **`tone.notes`** — string max 2000 chars
18. **`anti_bot_rules`** — solo editable por `super_admin`. Cliente normal solo edita `notes_extra` (max 500 chars)
19. **`workflow_version`** — enum estricto (`"v1"` \| `"v2"`). Solo editable por `super_admin`. Cliente normal no ve este campo.

Si alguna validación falla → reject con error message claro mostrado en la UI ("El link de Calendly no es válido", "El precio mensual no puede ser negativo", etc.).

---

## MIGRACIÓN DESDE `bot_config` ACTUAL

El `bot_config` actual de Momentum tiene esta estructura:

```jsonc
{
  "tone": { "preset": "...", "notes": "..." },
  "business_info": "...",
  "conversation_flow": [...],         // ← DEPRECATED, se reemplaza por sales_methodology + flujo interno del prompt
  "custom_instructions": "...",        // ← DEPRECATED parcial, se mueve a notes_extra de anti_bot_rules + pains_to_value_map
  "sales_close_behavior": "derivar_humano"  // ← se renombra a closing_method
}
```

**Plan de migración (script de migración):**

1. Para cada `agencies` row con `bot_config` viejo:
2. Tomar `bot_config.tone` → mover a nuevo `bot_config.tone` (sin cambios)
3. Tomar `bot_config.business_info` → mover sin cambios
4. **Descartar `conversation_flow`** (la lógica ahora vive en el prompt, no en config)
5. Tomar `bot_config.custom_instructions` → parsear manualmente y mover relevante a `pains_to_value_map` y `anti_bot_rules.notes_extra`
6. Tomar `bot_config.sales_close_behavior` → mapear:
   - `"derivar_humano"` → `closing_method = "llamada_humana"`
   - `"venta_directa"` → `closing_method = "link_pago"` o `"venta_directa"` según contexto
7. **Inyectar defaults** para los campos nuevos no presentes en config viejo (assistant_name, sales_methodology, qualification_framework, pricing, target_industries, differentiators, pains_to_value_map, objections_catalog, calendly_link, payment_link, horario_equipo, handoff_targets, anti_bot_rules, workflow_version)
8. **Migración `handoff_target` (string) → `handoff_targets` (array):** si el config viejo tiene `handoff_target: "Hans"`, el migration lo envuelve: `handoff_targets: ["Hans"]`. Si NO existe el campo viejo y la agency es Momentum, default a `["Hans", "Pietro"]`. Si es otra agency, default a `[]` con warning visual en UI para que el cliente complete.
9. Validar que el nuevo `bot_config` pase las validaciones del backend
10. Guardar atómicamente

---

## PRE-MORTEM

### Escenario 1 — Cliente nuevo crea agency
- Plataforma debe inyectar defaults en `bot_config` al crear la agency. Mitigación: backend con factory function `getDefaultBotConfig()`.

### Escenario 2 — Cliente edita `assistant_name` con allcaps
- Validación backend rechaza, UI muestra error. Mitigación: regex en validación + mensaje claro.

### Escenario 3 — Cliente cambia `sales_methodology` de `consultivo` a `transaccional`
- El bot debe respetar el nuevo modo en próximo mensaje. Mitigación: el prompt lee `{{ $json.bot_config.sales_methodology }}` en cada turno, no cachea.

### Escenario 4 — Cliente borra `calendly_link` pero deja `closing_method = "llamada_humana"`
- Validación backend rechaza. Mitigación: validación cross-field obligatoria.

### Escenario 5 — Cliente agrega un `pain` al map que el bot no detecta
- Mitigación: el agente principal solo usa los pains que detecta del lead. Si hay un pain en el map que nunca se dispara, no pasa nada. Si hay un pain del lead que NO está en el map, el bot responde con el flujo genérico de FASE 4 (sin value prop adaptado). Idealmente la UI sugiere keywords trigger para cada pain.

### Escenario 6 — Cliente sobrescribe `anti_bot_rules.notes_extra` con reglas contradictorias
- Ej: el cliente pone "siempre usar el nombre del lead en cada mensaje" cuando la regla del sistema dice "uso moderado del nombre, máximo 1 cada 3 mensajes".
- Mitigación: las reglas del sistema **ganan** sobre `notes_extra`. Documentar en la UI: "Las reglas del sistema son inviolables, `notes_extra` solo agrega instrucciones complementarias que NO contradigan las del sistema".

### Escenario 7 — Cliente NO completa `objections_catalog` y deja vacío
- El agente de objeciones cae al fallback "OBJECIÓN NO CATALOGADA". Mitigación: aceptable. Mejor sería que la UI le sugiera al cliente las objeciones top de su industria, pero MVP puede dejar vacío.

### Escenario 8 — Cliente agrega 15 diferenciadores
- El prompt se vuelve muy largo, costo de inferencia sube, y el bot empieza a "recitar bullets" en respuestas. Mitigación: límite 10 + UI con warning "más de 5 diferenciadores hace que el bot suene a brochure".

### Escenario 9 — Cliente desactiva BANT (`qualification_framework = "none"`) y el bot pierde calificación (v1.1)
- El bot deja de preguntar Authority y Timeline. El handoff a humano llega sin info sobre quién decide ni cuándo necesita la solución.
- **Riesgo concreto:** el humano agenda llamada con un junior que después tiene que consultar con su jefe, perdiendo tiempo. O agenda con alguien que "está explorando" para 6 meses adelante.
- Mitigación 1 (UI): warning visual al desactivar BANT en una agency con `closing_method = "llamada_humana"`: "Sin BANT, el bot no pregunta quién decide ni cuándo. Tu equipo de ventas va a tener llamadas con leads no calificados. ¿Seguro?"
- Mitigación 2 (default): para SaaS B2B con setup + monthly fee, `qualification_framework: "bant"` debería ser obligatorio salvo override de `super_admin`.
- Mitigación 3 (handoff): el mensaje al humano siempre dice qué partes de BANT detectó. Si BANT está desactivado, el resumen dice explícito "BANT desactivado, calificación no disponible" para que el humano sepa que tiene que calificar él en la primera llamada.

### Escenario 10 — Cliente edita `handoff_targets` mid-conversación (v1.1)
- Conversación activa tiene `assigned_handoff_target = "Pietro"` persistido en `conversations`. El cliente saca a Pietro del array y deja solo `["Hans"]`.
- **Comportamiento esperado:** la conversación existente sigue con "Pietro" (ya persistido), las conversaciones nuevas van a "Hans". Sin sorpresas para el lead en curso.
- **Riesgo si NO se persiste:** cada turno el bot recalcula round-robin y el lead ve "te paso con Pietro" en un turno, "te paso con Hans" en otro.
- Mitigación: el campo `conversations.assigned_handoff_target` se setea al primer turno y es read-only después (excepto para `super_admin` que puede reasignar manualmente).

### Escenario 11 — Cliente vacía `handoff_targets` y queda `[]` (v1.1)
- El bot dice "te paso con el equipo" en lugar de un nombre. Funcional pero genérico.
- **Riesgo:** el lead pregunta "¿con quién hablo?" y el bot tiene que improvisar.
- Mitigación: validación UI warning "sin destinatarios, el bot dirá 'el equipo' (genérico)". Si `closing_method = "llamada_humana"`, validación más fuerte: error en lugar de warning. No se puede guardar sin al menos 1 destinatario.

### Escenario 12 — Cliente cambia `workflow_version` de v1 a v2 sin avisar (v1.1)
- Conversaciones activas en v1 pasan a v2 en el siguiente mensaje. El historial existe pero el comportamiento del bot cambia mid-conversación.
- Mitigación 1: solo `super_admin` puede editar este campo (validación de rol estricta).
- Mitigación 2: log explícito de cambio con quién + cuándo + qué agency, para auditoría.
- Mitigación 3: idealmente el cambio se aplica solo a conversaciones nuevas, no a las activas. Implementación: el webhook YCloud lee `workflow_version` Y `conversations.workflow_version_at_start` (campo nuevo en conversations que se setea al primer mensaje). Si la conversación arrancó en v1, sigue en v1 hasta que cierre. MVP puede aceptar el cambio inmediato y avisar al super_admin.

## Riesgos residuales

- **El bot consume `bot_config` en runtime.** Si el JSON está mal formateado, el LLM puede romperse o producir output absurdo. Mitigación: validación estricta al guardar + try/catch en el workflow N8N que defaultee al `bot_config` anterior si el nuevo viene mal.
- **Cliente agrega contenido en español neutro pero el bot está configurado en otro tono.** Conflicto entre `tone.notes` y el contenido de `business_info`. Mitigación: validar que el bot **respete `tone.notes` por encima de cualquier cosa que diga `business_info`**. Documentar en `agente-principal.md`.
- **`bot_config` cambia mientras una conversación está en curso.** El próximo turno usa el nuevo config y el bot puede cambiar tono o flujo mid-conversación. Mitigación: aceptable para MVP. En el futuro se puede cachear el `bot_config` por conversación al primer turno.
- **El bot inventa data de `pains_to_value_map` o `differentiators` que NO está.** Mitigación: regla "NO inventar" del agente principal + temperature baja (0.3-0.5).
- **El cliente edita el `assistant_name` mid-conversación.** El lead puede notar el cambio. Mitigación: aceptable, suele pasar al inicio del setup, no en producción. Documentar en la UI.
- **BANT activo + `sales_methodology = "transaccional"` puede sentirse forzado.** Si el cliente activa ambos, el bot intenta extraer Authority y Timeline en una conversación de ecommerce ("¿vos decidís sobre la compra del sillón?") y suena raro. Mitigación: en la UI, al combinar `transaccional` + `bant` mostrar warning "BANT no se diseñó para flujos transaccionales rápidos. ¿Seguro?".
- **`handoff_targets` round-robin pierde balance si el RPC tiene un bug.** Si todos los leads van a Hans porque el contador no avanza, Pietro queda sin llamadas. Mitigación: dashboard semanal con distribución por target (skill `n8n-workflow-audit` puede sumar este check).

---

## CHANGELOG

### v1.1 — 2026-06-05 (pasada 2)

- **NUEVO campo #4 `qualification_framework`** (`"bant"` \| `"none"`). Default Momentum `"bant"`. Default Pérez Luna `"none"`. Composición transversal con `sales_methodology` documentada.
- **NUEVO campo #16 `handoff_targets`** (`array<string>`). Reemplaza `handoff_target` (string) del esquema viejo. Default Momentum `["Hans", "Pietro"]`. Round-robin documentado (selección al primer mensaje, persistencia en `conversations.assigned_handoff_target`, RPC `assign_round_robin` reusado).
- **NUEVO campo #17 `workflow_version`** (`"v1"` \| `"v2"`). Default `"v1"`. Solo `super_admin`. Feature flag para deploy progresivo del rediseño multi-agente. Momentum cliente cero en `"v2"` después de validar 48h.
- **Renumerados campos 5-15** por inserción de #4 `qualification_framework`.
- **Reglas de validación al guardar** actualizadas: enums nuevos (#4, #19) + array `handoff_targets` (#15).
- **Plan de migración** actualizado con paso #8 de mapeo `handoff_target` (string viejo) → `handoff_targets` (array nuevo).
- **Pre-Mortem extendido** (no reemplazado) con escenarios 9-12: cliente desactiva BANT, cliente edita handoff_targets mid-conversación, cliente vacía handoff_targets, cliente cambia workflow_version sin avisar.
- **Riesgos residuales** sumados: BANT + transaccional puede sentirse forzado; round-robin perder balance si RPC falla.

### v1.0 — 2026-06-05 (pasada 1)

- Versión inicial. 14 campos del `bot_config`. Plan de migración desde estructura vieja. Pre-Mortem inicial con 8 escenarios.
