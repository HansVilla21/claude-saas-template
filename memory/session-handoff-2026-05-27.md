# Session Handoff — 2026-05-27 (mañana)

> ⚠️ **HANDOFF HISTÓRICO — superado por `session-handoff-2026-05-28.md`**
> Este archivo se conserva como registro del estado al 2026-05-27. Para estado actual, leer el handoff del 2026-05-28 primero.

> ⚠️ **Cambio de marca al cierre de la sesión:** El producto pasa a llamarse **Momentum AI CRM** (general, multi-nicho, multi-canal). "Casa CRM" queda como nombre del v1 inmobiliario — primer caso de uso del producto general. Las menciones de "Casa CRM" en este handoff refieren a ese estado histórico. De acá en adelante en sesiones nuevas usar **Momentum AI CRM** o "el CRM" sin el prefijo "Casa".

**Propósito:** Snapshot del estado de Casa CRM al 27 de mayo 2026. Sesión enfocada en **escalabilidad cross-project**: investigación de Facebook Messenger + creación de skill transferible para que otros chatbots del founder migren de Airtable a Supabase con el mismo schema que Casa CRM. Lectura obligatoria al inicio de cualquier sesión nueva.

**Reemplaza al handoff anterior** (`session-handoff-2026-05-21.md` queda como histórico).

Cargar también:
- `memory/decisions.md` (entradas 2026-05-27 al tope: skill chatbot-db-schema-supabase + roadmap Messenger)
- `memory/proyecto.md`
- `memory/stack.md`
- `memory/research/11-facebook-messenger-integration.md` (research grounded del día)

---

## Estado del founder hoy

Hans está en modo **planificación + replicabilidad**. Casa CRM ya tiene la columna vertebral funcionando (bot, DB, inbox, imágenes end-to-end desde el 21-may). Ahora está pensando en cómo extender el valor: nuevos canales (Messenger) y nuevos clientes (chatbots de otros nichos que ya tiene en Airtable y van a migrar a Supabase).

Tono: claro, organizado, hizo planning explícito antes de pedir ejecución ("vamos, incluso si se puede o si es necesario, con un planning para hacer todo bien"). Validó el plan antes de los 60-90 min de construcción de la skill. No hubo carga emocional.

---

## Marco mental activo

- **Fase actual:** estabilización de Casa CRM + preparación para escalar.
- **Visión a largo plazo:** un "CRM general" (no nichado) que sirva para CUALQUIER chatbot del founder. La skill nueva `chatbot-db-schema-supabase` es el primer paso concreto hacia esa visión — los chatbots que se migren de Airtable ahora ya van a estar listos para ingerirse en el CRM general futuro sin re-trabajo de schema.
- **Modo de trabajo confirmado:** planning antes de ejecución para tareas grandes (validar dirección con 3-5 preguntas críticas, después ir). Pipeline rápido para todo lo demás.

---

## Lo nuevo de esta sesión (2026-05-27)

### 1. Investigación Facebook Messenger (entregable: research grounded)

- **Archivo:** `memory/research/11-facebook-messenger-integration.md` (creado en sesión)
- **Hallazgos clave:**
  - YCloud NO soporta Messenger (confirmado)
  - Meta Messenger direct es GRATIS dentro de ventana 24h
  - **NO necesitamos ser Tech Provider** de Meta (eso es para BSPs WhatsApp)
  - **Business Verification** NO es necesaria para dev/beta con agentes amigos (Standard Access). SÍ es necesaria para producción multi-tenant real (Advanced Access).
- **Decisión:** cuando se implemente, ir con Meta Messenger Platform direct (no migrar de YCloud, no BSP multi-canal). Reutilizar arquitectura Supabase + N8N existente.
- **Próximo paso (cuando se decida implementar):** aplicar al App Review de Meta (5-10 días hábiles, asíncrono, no bloquea otras tareas). NO se implementó hoy — research solo.

### 2. Skill `chatbot-db-schema-supabase` (entregable: paquete transferible cross-project)

- **Path:** `.agent/skills/chatbot-db-schema-supabase/` (15 archivos, 176 KB)
- **Contenido:**
  - 5 archivos SQL: core (13 tablas) + RLS preparado + triggers/realtime + 4 plug-ins (reservas, ecommerce, soporte, inmobiliaria) + seed demo
  - 5 docs markdown: arquitectura + schema explicado tabla por tabla + plug-ins + onboarding paso a paso + migración desde Airtable
  - SKILL.md (entry point para Claude) + README.md (humano)
- **Validaciones automáticas pasadas:** 32 tablas totales, 17 enums sin duplicados entre core y plug-ins, todas las tablas tenant-scoped tienen `agency_id` (excepto las 3 excepciones documentadas).
- **Las 5 decisiones de diseño grabadas en el schema:** ver `decisions.md` entrada 2026-05-27 "Skill chatbot-db-schema-supabase".
- **Cómo se transfiere al otro proyecto del founder:**
  1. Copiar la carpeta entera al `.agent/skills/` del otro proyecto
  2. Mandarle al Claude del otro proyecto el "Prompt #1" (entregado en sesión) para que estudie la skill antes de aplicarla
  3. Después usar Prompt #2 (chatbot nuevo) o Prompt #3 (migración desde Airtable) según el caso
- **CLAUDE.md del proyecto madre actualizado** con conteo correcto (15 → 20 skills en `.agent/skills/`).

---

## Productos / activos del founder al cierre

| Activo | Status | Notas |
|---|---|---|
| **Casa CRM** | En producción multi-tenant lista, bot Sofia v5.5 funcionando end-to-end (texto + imagen via WhatsApp), inbox renderiza image correctamente | Pendiente test E2E completo + import oficial de v5.5 (todavía con código pegado a mano en n8n) |
| **20 skills en `.agent/skills/`** | 15 originales (template + bot/n8n/WhatsApp) + 1 nueva hoy (`chatbot-db-schema-supabase`) | Listas para replicar a otros proyectos del founder |
| **Research Facebook Messenger** | Persistido en `memory/research/11-facebook-messenger-integration.md` | Listo para usar cuando se decida implementar |
| **Otros chatbots del founder en Airtable** | Externos al proyecto Casa CRM. Plan: migrar a Supabase usando la skill nueva | El founder los maneja desde otro proyecto Claude Code |

---

## Pipeline real al 2026-05-27

(Sin cambios respecto al handoff anterior — esta sesión fue de planificación/construcción, no de leads/comerciales.)

---

## Pendientes operativos inmediatos

### Heredados del handoff 2026-05-21 (no resueltos hoy)

1. **Importar `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v5.5.json`** como workflow nuevo en n8n y desactivar la versión actual con código pegado a mano. Activar v5.5 oficial.
2. **Test end-to-end completo del bot Sofia v5.5** (lo que el founder mencionó el 21-may: "ahorita voy a probarlo bien todo completo"). Casos:
   - Lead pide propiedad → imagen llega a WhatsApp ✓ (ya verificado puntual)
   - Lead pide propiedad → imagen se renderiza en inbox CRM ✓ (fix aplicado, falta verificar visualmente)
   - Multi-imagen: ¿llegan las 3 fotos de CR-2031 o solo 1?
   - Orden de mensajes: ¿imagen primero o texto primero?
3. **Commit a git** de todo lo del 21-may (workflow v5.2-v5.5, CRM image rendering, skills tier 1/2/3) + lo de hoy (skill chatbot-db-schema-supabase + research Messenger).

### Nuevos de hoy (2026-05-27)

1. **Decidir cuándo el founder copia la skill nueva** al otro proyecto y arranca el flujo de migración de algún chatbot Airtable. Es asíncrono — no bloquea Casa CRM.
2. **App Review de Meta — PRIORIZADO** (decisión 2026-05-27, ver `decisions.md`). Alcance ampliado: **Messenger + Instagram** en una misma Meta App (research extendido en `memory/research/12-instagram-y-messenger-multicanal.md` — en 2026 Meta los separó como APIs distintas). Founder dijo "vamos a hacer el proceso primero que todo de la app review" pero antes quiere plantear otra cosa — esperar siguiente instrucción. Bloque pendiente de ~2-3 horas concentradas cuando arranquemos:
   - Crear / preparar Meta App en developers.facebook.com
   - Publicar Privacy Policy en URL pública (definir dominio público del CRM)
   - Grabar screencast 2-3 min del flujo agente → lead → bot → inbox
   - Llenar form de review con permisos `pages_messaging` + `instagram_business_manage_messages` + justificaciones
   - Esperar 5-10 días hábiles asíncronos. NO bloquea otras tareas mientras tanto.

---

## Sesiones paralelas activas

El founder maneja **al menos 2 sesiones Claude Code paralelas**:
- **Esta sesión (Casa CRM):** sistema inmobiliario + skills del proyecto madre transferibles
- **Otro proyecto (chatbots de varios nichos):** consume la skill `chatbot-db-schema-supabase` para migrar clientes de Airtable a Supabase

La skill `chatbot-db-schema-supabase` es el **interfaz entre ambos**. Cualquier mejora a esa skill que descubramos en Casa CRM (mejores prácticas, nuevos plug-ins, gotchas) debe propagarse al otro proyecto re-copiando la carpeta.

---

## Cómo trabajar con Hans (recordatorio breve)

- Habla en lenguaje natural, NUNCA pide ni espera slash commands.
- Para tareas grandes: PRIMERO planning (con preguntas críticas usando `AskUserQuestion`), DESPUÉS ejecución. Confirma plan antes de gastar 60+ min.
- Para tareas chicas/quirúrgicas: builder directo + validator + founder revisa.
- Pipeline rápido vigente (n8n y demás): NO architect/reviewer agentes salvo cambios >3 nodos o estructurales.
- Cuando hay bug: diagnóstico con DATOS reales (logs, outputs visibles), no asumir. Emitir debug items visibles.
- Idioma: español.
- UI: mobile-first siempre.
- **Directriz permanente del proyecto:** cada vez que logramos un proceso nuevo replicable → proponer capturar como skill SIN esperar que lo pida (regla del 3 + regla "primera vez no-trivial").

---

## Última actualización

- Fecha: 2026-05-27, mañana (~12:00).
- Sesión: foco en escalabilidad cross-project (investigación Messenger + skill chatbot-db-schema-supabase).
- Próximo update sugerido: cuando se aplique la skill al primer chatbot real fuera de Casa CRM, capturar gotchas en `docs/05-migracion-desde-airtable.md` y actualizar handoff.
