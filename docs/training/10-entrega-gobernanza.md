# 10 — Entrega al cliente y gobernanza

Este capítulo cubre el proceso de entrega final al cliente y las reglas de gobernanza que mantienen el sistema sano a lo largo del tiempo: versionado, fuentes de verdad, propagación de cambios, y disciplina operativa.

---

## 1. El documento de entrega

Al terminar un proyecto, el cliente recibe un documento de entrega que explica qué se construyó, cómo funciona, qué puede esperar, y cómo dar mantenimiento. Este documento NO es para el equipo técnico — es para el cliente final que probablemente no entiende de chatbots.

### 1.1 Regla absoluta: cero jerga técnica

**NUNCA mencionar en el documento de entrega:**

- n8n, API, LLM, GPT, prompt, webhook, node, token
- Postgres, Redis, Airtable, ManyChat (a menos que el cliente sea quien los administra)
- Modelos específicos (GPT-4.1-mini)
- Detalles del workflow
- Code Nodes, Information Extractor, Switch, Trigger

**El cliente debe entender:**
- Qué hace el bot
- Cómo funciona desde su perspectiva (recibe mensajes → responde automáticamente)
- Qué puede hacer y qué no puede hacer
- Cuándo lo notifica
- Qué resultados esperar

### 1.2 Estructura del documento de entrega

Archivo: `clients/{cliente}/entrega.md`

```markdown
# [NOMBRE DEL BOT] - Tu Asistente de [FUNCIÓN]

## Qué hace [Nombre]
[2-3 líneas explicando en lenguaje simple]

## Cómo funciona
[Explicar flujo sin mencionar tecnología]
"Cuando alguien te escribe por WhatsApp, [Nombre] responde automáticamente..."

## Qué puede hacer
- [Capacidad 1]
- [Capacidad 2]
- [Capacidad 3]

## Qué NO puede hacer
- [Limitación 1 - importante para expectativas]
- [Limitación 2]

## Cuándo te notifica
- Cuando alguien está listo para hablar con vos (lead calificado)
- Cuando hay una solicitud que requiere tu intervención directa
- Cuando alguien expresa frustración

## Cómo recibo las notificaciones
[Explicar el canal: Discord, WhatsApp del equipo, email]

## Resultados esperados
- [Métrica target 1: conversión esperada]
- [Métrica target 2: tiempo de respuesta]

## Cómo dar mantenimiento
[Cosas básicas que el cliente puede ajustar — típicamente nada técnico]

## Soporte y mantenimiento de Momentum
[Qué incluye el servicio post-entrega]
- Soporte por X días/semanas
- Ajustes incluidos
- Costos de mantenimiento mensual
```

### 1.3 Ejemplo: documento de entrega de Liliana (Jacó Dream Rentals)

```markdown
# Liliana — Tu Asistente de Reservas en WhatsApp e Instagram

## Qué hace Liliana
Liliana atiende automáticamente a quienes te escriben por WhatsApp 
o Instagram preguntando por las villas. Les muestra opciones, les 
explica el proceso de reserva, y los guía hasta tu sitio web para 
que reserven directamente.

## Cómo funciona
Cuando alguien te envía un mensaje, Liliana responde en segundos 
preguntando para cuántas personas buscan villa. Según la respuesta, 
recomienda las villas que mejor encajan y comparte los links para 
que vean fotos, disponibilidad y precios actualizados.

## Qué puede hacer Liliana
- Atender consultas en español, inglés, portugués, francés y alemán
- Recomendar villas según número de personas
- Explicar el proceso de reserva paso a paso
- Resolver dudas sobre amenidades y políticas
- Mencionar el descuento del 8% por reservar directo

## Qué NO puede hacer Liliana
- Confirmar disponibilidad exacta (eso lo ve el cliente en cada link)
- Dar precios específicos (los precios son dinámicos según fecha)
- Compartir direcciones exactas antes de reserva
- Reservar directamente — siempre redirige al sitio web

## Cuándo te notifica
Liliana te avisa cuando:
- Un cliente pide hablar con vos directamente
- Detecta una consulta compleja que requiere tu intervención
- Hay grupos grandes (más de 18 personas) que necesitan opciones custom

## Cómo recibo las notificaciones
Las notificaciones llegan al canal de Discord del equipo que creamos. 
Cada notificación incluye el nombre del cliente, su contacto, y el 
resumen de la conversación.

## Resultados esperados
- Respuesta automática en menos de 3 segundos
- 30-40% de leads que llegan a la fase de reserva
- Disponibilidad 24/7, incluso fines de semana y madrugada

## Soporte de Momentum
- 30 días de soporte post-lanzamiento incluidos
- Ajustes a Liliana basados en feedback real de tus clientes
- Mantenimiento mensual incluye: revisión de métricas, mejoras al 
  flujo, ajustes según temporada
```

### 1.4 Validación del documento

Antes de enviar al cliente:

- [ ] ¿Buscaste y eliminaste cualquier mención de jerga técnica? (n8n, API, LLM, GPT, prompt, webhook, token)
- [ ] ¿El documento se entiende sin necesidad de conocimientos técnicos?
- [ ] ¿Las limitaciones están claras (el bot no confirma precios, no reserva, etc.)?
- [ ] ¿Las notificaciones están descritas con claridad?
- [ ] ¿Se mencionan las métricas target sin números técnicos (sin "latencia <3s", mejor "respuesta en segundos")?
- [ ] ¿El cliente sabe qué incluye el soporte post-entrega?

---

## 2. La propuesta comercial (para clientes nuevos)

Antes del proyecto, el cliente recibe una propuesta. Misma regla de cero jerga técnica.

### 2.1 Estructura de propuesta

```markdown
# Propuesta: Asistente Inteligente para [EMPRESA]

## Diagnóstico
[Situación actual del cliente y oportunidad detectada]
- Cuántas consultas reciben hoy y qué les cuesta atenderlas
- Qué pasa fuera de horario
- Cómo califican leads actualmente

## Solución Propuesta
[Qué se va a construir, en lenguaje de negocio]
- Un asistente que responde automáticamente en WhatsApp/Instagram
- Califica leads usando el proceso que ya tienen
- Deriva los listos para comprar al equipo de ventas
- Funciona 24/7

## Fases de Implementación
- Fase 1 (Semana 1): Discovery y diseño del asistente
- Fase 2 (Semana 2): Construcción y testing interno
- Fase 3 (Semana 3): Demo con su equipo y ajustes
- Fase 4 (Semana 4): Lanzamiento y monitoreo

## Inversión
[Precio del proyecto + costos operativos mensuales]
- Proyecto inicial: $X (one-time)
- Operación mensual: $Y (cubre canales + APIs + monitoreo)

## Resultados Esperados (mes 1)
- 30-40% de leads calificados (vs ~10-15% promedio industria)
- Respuesta automática 24/7
- Reducción de tiempo de respuesta de horas a segundos

## Siguientes Pasos
[1-2 decisiones que el cliente necesita tomar para arrancar]
- Aprobar el alcance
- Compartir accesos al canal (WhatsApp/Instagram)
```

### 2.2 Reglas de la propuesta

- **Modular** — el cliente debe poder elegir scope (solo WhatsApp, solo Instagram, ambos)
- **Sin jerga** — igual que la entrega
- **Precios claros** — proyecto inicial vs operación mensual diferenciados
- **Métricas con contexto** — "30-40%" sin contexto no significa nada; "30-40% vs 10-15% promedio industria" sí

---

## 3. Gobernanza de prompts: las reglas inviolables

### 3.1 Los prompts del cliente son la única fuente de verdad

**Regla:** los archivos `.md` en `clients/{cliente}/prompts/` son la única fuente de verdad para los prompts del cliente.

**Cualquier JSON de workflow (producción, TEST, TELEGRAM, cualquier variante) DEBE:**

1. **Leer los prompts literalmente** de `clients/{cliente}/prompts/*.md`
2. **Copiar el contenido EXACTO** (byte-por-byte) al campo correspondiente del nodo
3. **NUNCA modificar, "limpiar", reescribir, o "mejorar" los prompts** al generar un JSON

### 3.2 Reglas inviolables al copiar prompts a JSONs

- ❌ NO cambiar `{nombre}` a `Nombre` — los placeholders single-brace son válidos en n8n cuando van dentro de strings, no se interpolan
- ❌ NO cambiar emojis `❌ ✅` a texto `NO/SI` — los emojis Unicode son válidos en JSON
- ❌ NO acortar, expandir, o reorganizar los prompts
- ❌ NO inventar prompts nuevos cuando ya existen en el cliente
- ❌ NO "embellecer" formato (espacios, indentación) — copiar tal cual

### 3.3 Verificación obligatoria con MD5

Al generar un JSON nuevo o modificar uno existente:

```powershell
# Extraer prompt del JSON y calcular MD5
$promptFromJson = (Get-Content 'chatbot-cliente.json' | ConvertFrom-Json).nodes | 
                  Where-Object { $_.name -eq 'Agente Principal' } | 
                  Select-Object -ExpandProperty parameters | 
                  Select-Object -ExpandProperty systemMessage

$promptFromMd = Get-Content 'clients/cliente/prompts/agente-principal.md' -Raw

# Comparar
$hashJson = (Get-FileHash -InputStream ([System.IO.MemoryStream]::new([System.Text.Encoding]::UTF8.GetBytes($promptFromJson))) -Algorithm MD5).Hash
$hashMd = (Get-FileHash -InputStream ([System.IO.MemoryStream]::new([System.Text.Encoding]::UTF8.GetBytes($promptFromMd))) -Algorithm MD5).Hash

if ($hashJson -eq $hashMd) {
  Write-Output "✓ Prompts coinciden"
} else {
  Write-Output "✗ DRIFT detectado entre .md y JSON"
}
```

### 3.4 Proceso correcto para cambiar un prompt

```
1. Editar el archivo .md en clients/{cliente}/prompts/
   ↓
2. Hacer commit del cambio en git (snapshot del antes/después)
   ↓
3. Propagar el cambio a TODOS los JSONs del cliente
   (prod, TEST, TELEGRAM, YCLOUD, etc.)
   ↓
4. Verificar con MD5 que los JSONs ahora coinciden con el .md
   ↓
5. Solo entonces reportar "listo"
```

### 3.5 Lo que NO se hace

**Edición directa en n8n sin sincronizar al .md.** Esto causa drift: el JSON en n8n tiene una versión, el `.md` tiene otra, y nadie sabe cuál es la verdad. Detectado como problema recurrente con Level (ver `memory/feedback_prompt_version_drift.md`).

**Si el equipo edita directo en n8n** (a veces inevitable por velocidad), la disciplina es:

1. Hacer el cambio en n8n
2. Probar
3. INMEDIATAMENTE exportar el prompt del nodo
4. Pegarlo en el `.md` correspondiente
5. Commit en git con mensaje describiendo el cambio
6. Propagar a las otras variantes

---

## 4. Versionado y snapshots

### 4.1 La carpeta `clients/` está en `.gitignore`

Por privacidad de los clientes, `clients/` no se sube a git público. Pero el versionado es crítico. Solución:

**`clients/{cliente}/versions/` para snapshots manuales.**

Antes de cualquier cambio significativo a prompts o workflow:

```
clients/{cliente}/versions/
  2026-04-15_initial-deploy.md
  2026-04-22_v2-objections-update.md
  2026-05-01_v3-budget-threshold-change.md
```

Cada snapshot incluye:

- Fecha
- Descripción del cambio
- Snapshot completo de los prompts
- (opcional) Diff con la versión anterior

### 4.2 Por qué snapshots y no solo git

Git en repositorio local funciona para tracking. Pero los snapshots manuales sirven para:

- **Rollback rápido** — si algo se rompe, copiar la versión anterior y deployar
- **Auditoría con el cliente** — "el bot empezó a hacer X mal desde el cambio del 22 de abril"
- **Documentación de evolución** — el cliente puede ver el historial de mejoras

### 4.3 Naming convention

```
YYYY-MM-DD_descripcion-corta.md
```

Ejemplos:

- `2026-04-15_initial-deploy.md`
- `2026-04-22_objections-laarc-added.md`
- `2026-05-01_budget-159k-threshold.md`
- `2026-05-15_tone-adjustment-less-pushy.md`

### 4.4 Estructura de un snapshot

```markdown
# Snapshot: 2026-04-22 - Objections LAARC Added

## Cambio
Agregamos agente de objeciones LAARC al chatbot de El Canal.
Antes: 2 destinos (EVA_PRINCIPAL, AGENTE_INVENTARIO).
Ahora: 3 destinos (+ AGENTE_OBJECIONES).

## Razón
Después de 2 semanas en producción detectamos 18% de conversaciones 
con objeciones de precio que el bot no manejaba bien (iban siempre 
a AGENTE_PRINCIPAL que respondía genéricamente).

## Archivos modificados
- `prompts/clasificador-router.md` (+450 chars, +1 destino)
- `prompts/agente-objeciones-laarc.md` (NUEVO, 1,800 chars)
- `workflow/chatbot-el-canal.json` (Switch + 1 ruta, AI Agent +1)

## Snapshot de prompts

### Router (post-cambio)
[contenido completo del prompt]

### Agente Objeciones (nuevo)
[contenido completo del prompt]

### Agente Principal Eva (sin cambios)
[hash MD5: abc123...]
```

---

## 5. Templates se nutren con cada cliente (CRÍTICO)

**Regla:** cada vez que un cliente nuevo revela un patrón reutilizable, ese patrón se extrae a los templates anonimizados.

### 5.1 Qué se extrae

- **Nuevo post-processing** (ej: integración con Slack, Discord nuevos)
- **Nuevo canal** (ej: Facebook Messenger)
- **Nueva estructura de routing** (ej: sub-routers)
- **Nuevos tipos de agentes especializados**
- **Nuevos patrones técnicos** (ej: handling de audios con Whisper)

### 5.2 Qué NO se extrae

- Información específica del cliente (nombres reales, links, precios)
- Decisiones de negocio del cliente (su política interna)

### 5.3 Proceso de extracción

1. Terminar el cliente (pipeline completo)
2. Identificar qué fue NUEVO vs los templates existentes
3. Si es reutilizable:
   - Anonimizar (quitar info del cliente específico)
   - Agregar a [`knowledge/workflow-variants-templates/`](../knowledge/workflow-variants-templates/) o [`knowledge/workflows-reference/`](../knowledge/workflows-reference/)
   - Documentar en `knowledge/08+_LECCIONES_*.md`
4. Commit + push al repo público

### 5.4 Ubicaciones de templates anonimizados

- `knowledge/workflows-reference/` — workflows reales completos con prompts originales (template-base, dr-carlos, el-canal)
- `knowledge/workflow-variants-templates/` — templates genéricos por canal (TEST, TELEGRAM, YCLOUD, YCLOUD-AUDIO)
- `knowledge/01_METODOLOGIA_MOMENTUM_AI.md` — metodología
- `knowledge/02_CASOS_CLIENTES_COMPLETOS.md` — casos
- `knowledge/04_PATRONES_TECNICOS_N8N.md` — snippets de código
- `knowledge/08_LECCIONES_LEVEL_KENNETH.md` — lecciones del cliente más reciente
- `knowledge/09_INTEGRACION_YCLOUD.md` — integración técnica

---

## 6. Estructura de carpeta del cliente

Estructura recomendada en `clients/{nombre-cliente}/`:

```
clients/{cliente}/
├── docs/                          # Material del cliente
│   ├── precios.pdf
│   ├── faqs.md
│   ├── politicas.md
│   └── brochure.pdf
│
├── discovery.json                 # Output del discovery
│
├── architecture.md                # Diseño de arquitectura
│
├── prompts/                       # Prompts individuales (fuente de verdad)
│   ├── router-classifier.md
│   ├── filtro-inicial.md          # opcional
│   ├── agente-principal.md
│   ├── agente-objeciones.md       # opcional
│   ├── agente-inventario.md       # opcional
│   ├── detector-descalificacion.md # opcional
│   └── formateador.md
│
├── workflow/                      # JSONs del workflow + config
│   ├── chatbot-{cliente}.json
│   ├── chatbot-{cliente}-TEST.json
│   ├── chatbot-{cliente}-TELEGRAM.json
│   ├── chatbot-{cliente}-YCLOUD.json
│   └── workflow-config.md
│
├── versions/                      # Snapshots históricos
│   ├── 2026-04-15_initial.md
│   ├── 2026-04-22_v2.md
│   └── ...
│
└── entrega.md                     # Documento de entrega
```

### 6.1 Sobre `docs/`

Aquí va todo lo que el cliente comparte durante el discovery: PDFs, brochures, listas de precios, FAQs, políticas. **Estos archivos no se modifican** — son la fuente original.

### 6.2 Sobre `prompts/`

Cada prompt en su propio `.md` para facilitar revisión y edición. Header recomendado:

```markdown
# Prompt: [Tipo] — [Cliente]
# Nodo en n8n: [Nombre del nodo]
# Modelo: gpt-4.1-mini | Temp: X.X | Max Tokens: XXX
# Memory: [Postgres 15 / ninguna]
# Tools: [lista o ninguno]
# Chars: ~X,XXX
# Última modificación: 2026-XX-XX

---

[Contenido del prompt]
```

### 6.3 Sobre `versions/`

Snapshots manuales antes de cambios significativos (ver §4).

### 6.4 Sobre `workflow/`

Múltiples JSONs por cliente (uno por variante). El `workflow-config.md` documenta:

- Qué credenciales hay que configurar
- Qué placeholders se reemplazaron
- Notas operativas (cuándo se activó, cuándo se hizo el último deploy)

---

## 7. Disciplina de commits

Cuando se trabaja con clientes activos:

### 7.1 Commits frecuentes

Después de cada cambio significativo a prompts, hacer commit:

```bash
git add clients/{cliente}/prompts/
git commit -m "fix({cliente}): mejorar manejo de objeción de precio en agente LAARC"
```

### 7.2 Mensajes descriptivos

Formato:

```
tipo({cliente}): descripción corta del cambio

- Cambio 1 (con razón)
- Cambio 2 (con razón)

Conteo de chars: X,XXX → Y,YYY (+/- N%)
```

Tipos:

- `feat` — nueva funcionalidad
- `fix` — corrección de bug
- `refactor` — reorganización sin cambio de funcionalidad
- `docs` — solo documentación
- `chore` — mantenimiento

### 7.3 No commitear cosas sensibles

Antes de cada commit:

- [ ] `.env` no incluido (verificar con `git status`)
- [ ] No hay API keys en código o prompts
- [ ] No hay datos personales reales de leads en docs

El archivo `.gitignore` debe incluir:

```
.env
.env.local
CLAUDE.local.md
clients/
*/credentials/
node_modules/
.DS_Store
```

---

## 8. Operación con múltiples clientes activos

Cuando se manejan 3+ clientes en producción simultáneamente, surge complejidad operativa adicional.

### 8.1 Convención de naming en n8n

Workflows en n8n con nombres consistentes:

```
Chatbot {Cliente}                   # producción
Chatbot {Cliente} - TEST            # test interno
Chatbot {Cliente} - TELEGRAM        # demo telegram
Chatbot {Cliente} - YCLOUD          # demo whatsapp
```

Credenciales con nombres consistentes:

```
{Cliente} - OpenAI
{Cliente} - Postgres
{Cliente} - Redis
{Cliente} - Telegram
{Cliente} - YCloud API
{Cliente} - Airtable
```

### 8.2 Folders en n8n

Si la instancia de n8n soporta folders (n8n Cloud o self-hosted reciente):

```
📁 Production
   📁 Cliente A
      Chatbot Cliente A
   📁 Cliente B
      Chatbot Cliente B
📁 Demos
   📁 Cliente A
      Chatbot Cliente A - TEST
      Chatbot Cliente A - TELEGRAM
```

### 8.3 Monitoreo cross-cliente

Un dashboard o spreadsheet con:

- Cliente
- Estado (producción / demo / paused)
- Fecha último deploy
- Métricas semana actual (conversaciones, leads, conversión)
- Próximos issues a atender
- Saldo de OpenAI estimado

---

## 9. Reglas de seguridad

### 9.1 Las absolutas (ya cubiertas en CLAUDE.md global)

- NUNCA escribir passwords, API keys, tokens o secretos en ningún archivo
- NUNCA hacer commit de `.env` — verificar siempre que esté en `.gitignore`
- NUNCA hacer commit directo en `main`/`master`
- NUNCA hacer deploy a producción sin confirmación explícita
- SIEMPRE usar variables de entorno para credenciales
- SIEMPRE incluir `.env.example` con placeholders

### 9.2 Específicas del proyecto

- **Datos personales de leads** — nunca commitear en código ni docs públicos. Los leads están en Airtable del cliente.
- **API keys de YCloud / OpenAI / etc.** — solo en credenciales de n8n, nunca en el workflow JSON
- **Webhooks URLs** — los path deben ser oscuros (incluir el nombre del cliente) para evitar collision
- **Acceso a n8n** — usar autenticación, no exponer la URL pública sin login

### 9.3 Auditoría de seguridad

Antes de cada deploy:

- [ ] `/security-check` ejecutado y limpio
- [ ] No hay credenciales hardcoded en el JSON del workflow
- [ ] `.env` está en `.gitignore`
- [ ] Webhook paths son específicos al cliente
- [ ] n8n requiere login

---

## 10. Onboarding del cliente al deploy

Cuando se entrega el chatbot, el cliente típicamente necesita capacitación mínima sobre:

### 10.1 Cómo monitorear

- **Airtable:** cómo ver leads que el bot capturó
- **Discord/Slack/WhatsApp:** dónde llegan las notificaciones
- **Chatwoot (si aplica):** cómo tomar una conversación cuando se hace handoff

### 10.2 Cómo activar/desactivar

- Toggle del workflow en n8n (solo si el cliente lo administra)
- Toggle "Chatbot Activado" en Airtable per-lead (para handoff manual)

### 10.3 Qué hacer ante un problema

- A quién llamar (equipo Momentum)
- Cómo dar contexto (qué conversación, qué hora, qué número)
- Tiempo de respuesta esperado

### 10.4 Sesión de handoff (1 hora)

Idealmente, una sesión presencial o por video de 1 hora con el cliente y su equipo donde se muestra:

1. El bot funcionando en vivo
2. Cómo se ven las notificaciones
3. Cómo tomar el handoff
4. Cómo leer las métricas básicas
5. Q&A

---

## 11. Disciplina post-launch

### 11.1 Las primeras 72 horas

- Monitoreo activo de cada conversación
- Respuesta rápida si el bot falla (rollback a snapshot anterior si es necesario)
- Comunicación constante con el cliente

### 11.2 Primera semana

- Revisión diaria de conversaciones
- Identificar 3-5 issues para iterar
- Cambios quirúrgicos (un cambio por día max)

### 11.3 Primer mes

- Métricas vs target (conversión, latencia, abandono)
- Reporte semanal al cliente
- Iteración basada en datos

### 11.4 A partir del mes 2

- Frecuencia de cambios disminuye
- Mantenimiento mensual programado
- Actualizaciones por temporada (si aplica)

---

## 12. Cuándo terminar la relación con un cliente

Por completitud, los casos donde la relación con el cliente debe terminarse profesionalmente:

- **El cliente no puede mantener el costo operativo** — comunicar honestamente y proponer alternativas (Evolution API más barata, reducir features)
- **El cliente quiere features fuera del scope ético** — bot que prometa lo que no puede entregar, bot que descalifique por raza/género/etc., bot que recoja datos personales sin consentimiento
- **El cliente no colabora con el discovery** — sin información del negocio, el bot no puede funcionar bien
- **El cliente reescribe los prompts sin consultar** — drift continuo que rompe el sistema

En todos los casos, terminar profesionalmente con documentación del estado actual para que otra empresa pueda continuar si el cliente lo desea.

---

**Siguiente:** [Capítulo 11 — Checklists y glosario](11-checklists-glosario.md)

**Anterior:** [Capítulo 09 — Troubleshooting y optimización](09-troubleshooting.md)
