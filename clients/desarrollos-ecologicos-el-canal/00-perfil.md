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

> Desarrollo residencial en **Grecia, Alajuela** (faldas del Poás), conocido internamente como **Condominio El Canal**. Vende casas/lotes desde **$159,900 USD**. Tiene un **chatbot de calificación BANT (Eva)** corriendo fuera de nuestro stack (ManyChat) y desde hoy un **espacio propio en el CRM**.

> ⚠️ **Ficha parcial.** Todo lo de acá está sacado de material técnico que ya vivía en el repo (`knowledge/workflows-reference/el-canal/`) y de la base del CRM. La parte comercial —deal, contacto, estado real— **no está registrada en ningún lado**; ver §7.

## 1. Personas / stakeholders

| Persona | Rol | Notas |
|---|---|---|
| **Varela** | Contacto del lado del cliente (a confirmar) | Aparece en `clients/README.md` como "Varela (Condominio del Canal)". **Sin confirmar** rol, apellido ni si sigue siendo el contacto. |
| **Mario Rodríguez** | Vendedor | Recibe leads calificados por WhatsApp (`wa.me/50689108591`). Round-robin: hora **par**. |
| **Mauricio Monge** | Vendedor | Recibe leads calificados por WhatsApp (`wa.me/50688308372`). Round-robin: hora **impar**. |

## 2. El negocio

- **Qué venden:** casas / propiedades en el desarrollo residencial El Canal, Grecia. Rango **$159,900 – $250,000+ USD**. **Solo venta, NO alquiler.**
- **Cómo venden hoy:** leads entran por WhatsApp → el bot **Eva** califica por BANT → los calificados se derivan por link `wa.me` a Mario o Mauricio, alternando por hora par/impar. Los no calificados se descartan con descalificación elegante.
- **Herramientas actuales:** **ManyChat** (canal), **Airtable** (CRM/estado del lead + apagado del bot), **Google Sheets** (inventario), **Evolution API + Whisper** (transcripción de audios), **Redis** (batching de mensajes), n8n como orquestador.
- **Tienen:** equipo de 2 vendedores, inventario en Sheets, chatbot multi-agente ya en operación.

## 3. Dolores → qué resuelve la compra

| Dolor | Solución |
|---|---|
| Vendedores quemando tiempo con leads sin presupuesto | Bot **Eva** filtra por presupuesto mínimo ($159,900) antes de derivar |
| Leads que buscan alquiler o que no quieren Grecia | Validación explícita de propósito y ubicación antes de pasar a vendedor |
| Repartir leads entre Mario y Mauricio a mano | Asignación **round-robin** automática por hora par/impar |
| Bot que sigue hablando después de descalificar | **Detector de descalificación** post-agente que apaga el chatbot para ese lead |
| Sin visibilidad de los leads en un solo lugar | **CRM propio** (espacio creado 2026-08-04) |

## 4. Alcance actual

- ✅ **Chatbot Eva** — multi-agente en producción (Principal BANT · Inventario vía Google Sheets · Agendamiento/derivación), **en ManyChat, fuera de nuestro stack**
- ✅ **Espacio en el CRM** — `/a/desarrollos-ecologicos-el-canal`, funnel inmobiliario de 5 etapas, owner = Hans (2026-08-04)
- ⏳ **Número de WhatsApp** — sin conectar (`agency_channels` vacío)
- ⏳ **Acceso del cliente al CRM** — todavía no invitado
- ⏳ **Migración del bot a nuestro stack** — `settings.bot_enabled=false` hasta que exista

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
- [ ] **Contacto principal**: ¿es Varela? nombre completo, rol, teléfono/correo
- [ ] **Deal**: valor, forma de pago, mantenimiento mensual, fecha de cierre
- [ ] ¿El bot de ManyChat lo construimos y lo mantenemos nosotros, o es heredado?

**Operativo (ya definido):**

- [x] Espacio en el CRM creado y verificado bajo RLS (2026-08-04)
- [ ] Conectar el número de WhatsApp en YCloud → `agency_channels`
- [ ] Invitar al cliente desde Settings → Equipo y decidir si Hans sigue como owner
- [ ] Prender el bot (`settings.bot_enabled`) cuando el flujo viva en nuestro stack

## 8. Notas estratégicas (para mí)

- El bot de El Canal es **una de las tres referencias de arquitectura del repo** (`template-base`, `dr-carlos`, `el-canal`). Es el más complejo de los tres: 3 agentes + clasificador + detector de descalificación + sub-workflow de CRM en paralelo. Migrarlo a nuestro stack es trabajo real, no un copy-paste.
- El `analysis.md` de referencia deja anotados **2 bugs potenciales** del flujo actual: el clasificador menciona 2 rutas en el prompt pero el Switch tiene 3 salidas, y el Code JS busca links de Calendly cuando los agentes usan `wa.me`. Si retomamos ese bot, revisar eso primero.
- Filtro de presupuesto duro ($159,900) + solo-venta + solo-Grecia = un ICP muy angosto. Buena señal para calificación automática: el bot puede descartar sin riesgo de perder plata.

## 9. Enlaces internos

- Espacio en el CRM: `/a/desarrollos-ecologicos-el-canal` (agency `343317d1-b3d0-4903-a49d-f99437749699`)
- Script de alta: [`crm-v2/scripts/provision-el-canal.js`](../../crm-v2/scripts/provision-el-canal.js)
- Arquitectura del bot actual: [`knowledge/workflows-reference/el-canal/analysis.md`](../../knowledge/workflows-reference/el-canal/analysis.md)
- Prompts del bot actual: [`knowledge/workflows-reference/el-canal/prompts/`](../../knowledge/workflows-reference/el-canal/prompts/)
- Llamadas: — (sin transcripciones)
- Propuesta y contrato: — (sin registrar)
