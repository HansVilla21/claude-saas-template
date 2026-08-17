---
cliente: Desarrollos Ecológicos El Canal
slug: desarrollos-ecologicos-el-canal
estado: por-confirmar   # ⚠️ ver §7 — no tengo el estado comercial real
servicios: [chatbot, crm]
valor_contrato_usd: 0   # ⚠️ pendiente
mantenimiento_mensual_usd: 0   # ⚠️ pendiente
fecha_cierre:
onboarding:
pais: Costa Rica
sector: Inmobiliaria / desarrollo residencial (Grecia, Alajuela)
ultima_actualizacion: 2026-08-04
---

# Ficha de cliente — Desarrollos Ecológicos El Canal

> Desarrollo residencial **sostenible** en **Grecia, Alajuela** (faldas del volcán Poás), conocido internamente como **Condominio El Canal**. Vende **apartamentos desde $149,900 USD** y **casas desde $229,900 USD**. Tiene un **chatbot de calificación BANT (Eva)** corriendo fuera de nuestro stack (ManyChat) y desde hoy un **espacio propio en el CRM**, con el prompt de Eva cargado para poder probarlo.

> ⚠️ **Ficha parcial.** Todo lo de acá está sacado de material técnico que ya vivía en el repo (`knowledge/workflows-reference/el-canal/`) y de la base del CRM. La parte comercial —deal, contacto, estado real— **no está registrada en ningún lado**; ver §7.

## 1. Personas / stakeholders

| Persona | Rol | Notas |
|---|---|---|
| **Jimena** | Contacto principal | Figura como **Contacto** en el encabezado del prompt v2 de Eva (`4. Chatbot Arquitect`). Falta apellido, cargo y datos de contacto. |
| **Varela** | ¿Contacto? (sin confirmar) | Aparece en `clients/README.md` como "Varela (Condominio del Canal)". **No sé si es la misma persona que Jimena, alguien más del cliente, o un registro viejo.** |
| **Mario Rodríguez** | Vendedor | Recibe leads calificados por WhatsApp (`wa.me/50689108591`). Round-robin: hora **par**. |
| **Mauricio Monge** | Vendedor | Recibe leads calificados por WhatsApp (`wa.me/50688308372`). Round-robin: hora **impar**. |

## 2. El negocio

- **Qué venden:** apartamentos y casas en el desarrollo residencial El Canal, Grecia. **Apartamentos desde $149,900 USD**, **casas desde $229,900 USD** (sin techo publicado — varía por modelo). **Solo venta, NO alquiler. Solo Grecia.**
- **Diferenciadores:** 60% del terreno son áreas verdes preservadas (20,000+ m², 25,000 plantas sembradas), senderos junto al río, desarrollo planificado. A 40 min de San José por la General Cañas.
- **Cómo venden hoy:** leads entran por WhatsApp → el bot **Eva** califica por BANT → los calificados se derivan por link `wa.me` a Mario o Mauricio, alternando por hora par/impar. Los no calificados se descartan con descalificación elegante.
- **Herramientas actuales:** **ManyChat** (canal), **Airtable** (CRM/estado del lead + apagado del bot), **Google Sheets** (inventario), **Evolution API + Whisper** (transcripción de audios), **Redis** (batching de mensajes), n8n como orquestador.
- **Tienen:** equipo de 2 vendedores, inventario en Sheets, chatbot multi-agente ya en operación.

## 3. Dolores → qué resuelve la compra

| Dolor | Solución |
|---|---|
| Vendedores quemando tiempo con leads sin presupuesto | Bot **Eva** filtra por presupuesto mínimo antes de derivar ($149,900 apto / $229,900 casa, sin mezclar los pisos) |
| Leads que buscan alquiler o que no quieren Grecia | Validación explícita de propósito y ubicación antes de pasar a vendedor |
| Repartir leads entre Mario y Mauricio a mano | Asignación **round-robin** automática por hora par/impar |
| Bot que sigue hablando después de descalificar | **Detector de descalificación** post-agente que apaga el chatbot para ese lead |
| Sin visibilidad de los leads en un solo lugar | **CRM propio** (espacio creado 2026-08-04) |

## 4. Alcance actual

- ✅ **Chatbot Eva** — multi-agente en producción (Principal BANT · Inventario vía Google Sheets · Agendamiento/derivación), **en ManyChat, fuera de nuestro stack**
- ✅ **Espacio en el CRM** — `/a/desarrollos-ecologicos-el-canal`, funnel inmobiliario de 5 etapas, owner = Hans (2026-08-04)
- ✅ **Prompt de Eva cargado al CRM** — **v3** (auditoría 2026-08-04), 7.325 chars, en `bot_config.agent_prompts.principal` **y** en `custom_instructions` (las dos formas que conviven en la base). Habilita "Probar bot" y el asistente de IA del inbox. v2 (23.150 chars) archivada en `prompts/versions/`
- ⏳ **Número de WhatsApp** — sin conectar (`agency_channels` vacío) → no entra tráfico real
- ⏳ **Acceso del cliente al CRM** — todavía no invitado
- ⏳ **Migración del bot a nuestro stack** — hoy solo el prompt principal; faltan clasificador, inventario y derivación

## 5. Fuera de alcance / fase futura

- Migrar el bot de ManyChat/Airtable a n8n + Supabase (decisión no tomada)
- Sitio web — no hay nada registrado

## 6. Comercial / deal

- **Total:** ⚠️ pendiente
- **Pago:** ⚠️ pendiente
- **Mantenimiento:** ⚠️ pendiente
- **Correos de facturación:** ⚠️ pendiente

## 7. Estado / próximos pasos

**Lo que necesito de Hans para completar esta ficha:**

- [ ] **Estado comercial real** (lead / propuesta / cerrado / onboarding / en desarrollo / producción / mantenimiento) — hoy está en `por-confirmar`
- [ ] **Contacto principal**: apellido y datos de Jimena. ¿Varela es la misma persona u otra?
- [ ] **Deal**: valor, forma de pago, mantenimiento mensual, fecha de cierre
- [ ] ¿El bot de ManyChat lo construimos y lo mantenemos nosotros, o es heredado?

**Operativo (ya definido):**

- [x] Espacio en el CRM creado y verificado bajo RLS (2026-08-04)
- [x] Prompt principal de Eva **v3** cargado y verificado con la función real del inbox (2026-08-04)
- [ ] Agregar al prompt la regla de **variar los mensajes repetidos** — v3 no la trae y es el tell #2 que delata al bot (ver `memory/feedback-prompting.md` §4)
- [ ] Decidir el modelo: con 7.325 chars la metodología pide GPT-4o, no mini
- [x] `settings.bot_enabled=true` — necesario para que responda en "Probar bot". Sin número conectado no puede entrar tráfico real
- [ ] Probar la conversación en `/a/desarrollos-ecologicos-el-canal/probar-bot` (round-trip a n8n, no verificable desde el repo)
- [ ] Cargar el resto de los agentes (clasificador, inventario, derivación) si se va a replicar el flujo completo
- [x] **Usuario de Jimena creado** (2026-08-04) — `jimemateo@gmail.com`, rol `admin` de la agency. Creado con `admin.createUser` (no `inviteUserByEmail`), así que **todavía no le llegó ningún correo**. Contraseña temporal generada al vuelo, no guardada en ningún lado
- [x] **Login de Jimena verificado end-to-end** (2026-08-04) — con su correo y contraseña reales contra la API de auth, no con `service_role`
- [x] **Datos de prueba sembrados** (2026-08-04) — 1 contacto `Ana Sofía Rodríguez (PRUEBA)` (+50600000001) con conversación de WhatsApp y 5 mensajes, para que practique las etiquetas. Se borra con `node crm-v2/scripts/seed-demo-el-canal.js --undo`
- [ ] Borrar el contacto de prueba antes de que entren leads reales
- [ ] Que ella cambie la contraseña desde "olvidé mi contraseña" (mata la temporal)
- [ ] Decidir si Jimena pasa a `owner` (hoy el owner es Hans; `agencies.owner_user_id` es uno solo)
- [ ] Conectar el número de WhatsApp en YCloud → `agency_channels`

## 8. Notas estratégicas (para mí)

- El bot de El Canal es **una de las tres referencias de arquitectura del repo** (`template-base`, `dr-carlos`, `el-canal`). Es el más complejo de los tres: 3 agentes + clasificador + detector de descalificación + sub-workflow de CRM en paralelo. Migrarlo a nuestro stack es trabajo real, no un copy-paste.
- El `analysis.md` de referencia deja anotados **2 bugs potenciales** del flujo actual: el clasificador menciona 2 rutas en el prompt pero el Switch tiene 3 salidas, y el Code JS busca links de Calendly cuando los agentes usan `wa.me`. Si retomamos ese bot, revisar eso primero.
- Filtro de presupuesto duro ($159,900) + solo-venta + solo-Grecia = un ICP muy angosto. Buena señal para calificación automática: el bot puede descartar sin riesgo de perder plata.

## 9. Enlaces internos

- Espacio en el CRM: `/a/desarrollos-ecologicos-el-canal` (agency `343317d1-b3d0-4903-a49d-f99437749699`)
- Prompt principal v3 (fuente): [`prompts/agente-principal.md`](prompts/agente-principal.md) · listo para pegar: [`prompts/_compiled/agente-principal.txt`](prompts/_compiled/agente-principal.txt) · histórico: [`prompts/versions/`](prompts/versions/)
- Script de alta: [`crm-v2/scripts/provision-el-canal.js`](../../crm-v2/scripts/provision-el-canal.js)
- Script que carga el prompt al CRM: [`crm-v2/scripts/load-el-canal-prompts.js`](../../crm-v2/scripts/load-el-canal-prompts.js)
- Arquitectura del bot actual: [`knowledge/workflows-reference/el-canal/analysis.md`](../../knowledge/workflows-reference/el-canal/analysis.md)
- Prompts del bot actual: [`knowledge/workflows-reference/el-canal/prompts/`](../../knowledge/workflows-reference/el-canal/prompts/)
- Llamadas: — (sin transcripciones)
- Propuesta y contrato: — (sin registrar)
