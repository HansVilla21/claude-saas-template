# Índice de skills de proceso (`.agent/skills/`)

**90 skills.** Las leen los agentes vía Read tool: `.agent/skills/<nombre>/SKILL.md`.

Cada una salió de un problema real que ya nos costó tiempo, y documenta **el gotcha**, no solo el procedimiento. Las marcadas ⭐ son **cross-project**: valen en cualquier proyecto, no solo en este.

> **Cómo elegir:** buscá por el síntoma, no por la tecnología. La mayoría de estas skills existen porque algo *parecía funcionar* y no funcionaba.
> **Antes de crear una nueva:** leé `creador-de-skills`.

---

## 🔬 Método de trabajo y verificación

Cómo saber que algo funciona de verdad. Si vas a decir "listo", empezá acá.

| Skill | Qué resuelve |
|---|---|
| ⭐ `verificar-funcionamiento-end-to-end` | El estándar del proyecto: "compila" / "corrió" / "respondió 200" / "se ve bien" **no** son "funciona". Fuente de verdad por capa + Definition of Done de 3 preguntas |
| ⭐ `probar-camino-produccion-sin-efectos-externos` | Probar el camino REAL de producción cortando justo antes del envío al mundo. El flag va en el dato, no en el entorno |
| ⭐ `probar-migracion-contra-base-viva-con-rollback` | `BEGIN` + migración + assertions + controles negativos + bloque que SIEMPRE aborta. Da números medidos, no estimados |
| ⭐ `verificar-base-del-pr-antes-de-mergear` | `MERGEABLE` responde "¿se puede?", no "¿a dónde?". Dos PRs figuraban MERGED y su código nunca llegó a producción |
| ⭐ `enforcement-con-hook-no-con-regla` | Una regla escrita depende de que alguien se acuerde. Cuándo algo merece hook y el gotcha que lo anula |
| `verificar-visual-midiendo-contraste` | Medir el ratio WCAG real en el browser. El instinto daba 3.2:1; medir dio el camino a 6.42:1 |
| `debugging-silent-errors` | `console.error` estructurado, reproducir antes de instrumentar, códigos de error de Postgres/Supabase |
| `worktree-para-no-pisar-el-checkout` | Trabajar cuando otra persona está en el mismo repo (un commit quedó huérfano) |
| `mesa-arquitectonica-multiagente` | Panel multi-agente + jueces adversariales para decisiones arquitectónicas grandes |
| `creador-de-skills` | La meta-skill: cuándo y cómo capturar un proceso |

## 🗄️ Datos, RLS y seguridad de base

El grupo con más incidentes del proyecto. Casi todos comparten un modo de fallo: **la escritura no avisa.**

| Skill | Qué resuelve |
|---|---|
| ⭐ `detectar-escritura-filtrada-rls` | Bajo RLS, un `update` que no matchea **no devuelve error**: afecta 0 filas y responde éxito. La única detección es `.select()` y contar |
| `rls-write-bloqueada-por-policy-desalineada` | 5 causas de "un rol no puede guardar y no aparece error", con el método de reproducir bajo el rol real |
| `habilitar-rls-tabla-expuesta` | Prender RLS en una tabla viva sin romper el backend (enable + policies juntos, o queda deny-all silencioso) |
| `fuente-unica-derivar-de-hijos` | Dos vistas que muestran "lo mismo" leyendo columnas distintas y divergen: elegir UNA fuente y derivar |
| `jsonb-config-save-no-pisar-campos-ajenos` | Un "Guardar" de config jsonb que borra los campos de otros writers |
| `supabase-edge-function-secret-auth` | Endpoints internos autenticados por secret |
| `chatbot-db-schema-supabase` | Schema multi-canal + multi-nicho |

## 🏢 Multi-tenant y SaaS

| Skill | Qué resuelve |
|---|---|
| ⭐ `config-por-tenant-no-literal-en-el-flujo` | La lógica de UN rubro cableada en el flujo compartido. El guard es un contrato, no un flag |
| `catalogo-multifuncional-por-preset` | Una base que se adapta a cualquier rubro por configuración; rubro nuevo = preset nuevo sin código |
| `crm-admin-panel-master-gated` | Panel admin gateado por rol master |
| `onboarding-cliente-crm` | Alta de un cliente externo de punta a punta, con gotchas numerados |
| `setup-correo-auth-saas` | Subdominio + Resend + Supabase Auth + flujos de reset/invitación (links con `token_hash`, **no** PKCE) |
| `embudo-activacion-saas` | Diseñar el camino confianza → completar → usar → pagar |
| `onboarding-estado-server-side` | Estado de onboarding desde señales reales, no `localStorage` por dispositivo |
| `async-job-pattern` | UI → job → worker → polling + refund de créditos |

## 🤖 Bot, n8n y LangChain

| Skill | Qué resuelve |
|---|---|
| `n8n-workflow-build-script` | Deploy vía API PUT + verificación por hash SHA-256 contra el n8n vivo |
| `n8n-workflow-versioning` | Snapshots, tags y procedimiento de rollback |
| `n8n-code-node-debug-pattern` | Debug de Code nodes |
| `n8n-task-runner-no-crypto` | UUID v4 + hash manuales cuando el sandbox restringe `crypto` |
| `n8n-trace-id-postgres-overwrite` | Los Postgres nodes pisan campos custom del item |
| `n8n-merge-combineall-trap` | `combineAll` = cross-product que muere con input vacío |
| `n8n-information-extractor-schema-mode` | `fromJson` espera un ejemplo, **no** un schema literal |
| `n8n-langchain-agent-postgres-memory` | Agente + memoria conversacional en Postgres |
| `n8n-properties-search-tool-pattern` | Tool HTTP con `$fromAI()` desde un LLM agent |
| `n8n-pipeline-rapido-vs-pesado` | Separar el camino que responde del que procesa |
| `bot-multibubble-output-flow` | Responder en burbujas (Formateador → Parser → Split Out → Expand) |
| `bot-handoff-system-end-to-end` | Handoff bot → humano completo |
| `bot-anti-loop-detector` | Anti-loop + descalificación |
| `bot-llm-marker-expand-pattern` | Marcadores del LLM expandidos aguas abajo |
| `bot-whatsapp-unsupported-fallback` | Recuperar los mensajes `unsupported` del clic de anuncio |
| `sales-framework-spsp-whatsapp` | SPSP adaptado a WhatsApp |

## 💬 WhatsApp, webhooks e integraciones

| Skill | Qué resuelve |
|---|---|
| ⭐ `bsp-media-expira-archivar-propio` | El CDN del BSP **borra la media a los 7 días** (medido). Se perdieron 54 archivos antes de detectarlo |
| ⭐ `webhook-fanout-sin-reconciliacion` | El proveedor entrega el mismo evento a dos endpoints y nadie reconcilia si uno falla |
| `webhook-contar-event-types-antes-de-arreglar` | `group by event_type` **antes** de tocar el webhook. El mismo error se cometió 3 veces en una sesión |
| `conexion-whatsapp-ycloud-supabase-n8n` | Montar la conexión completa en un proyecto/cliente nuevo |
| `ycloud-webhook-to-supabase` | La ingesta que persiste |
| `whatsapp-proactivo-a-staff` | Avisar al equipo por plantilla aprobada cuando pasa un evento en la DB |
| `whatsapp-image-delivery-ycloud` | Formato de imagen que Meta acepta (JPG/PNG — WebP se rechaza en silencio) |
| `nota-de-voz-real-whatsapp` | Nota de voz con la ondita, no adjunto |
| `outbound-delivery-server-action` | Envío saliente confiable desde el CRM |
| `ingesta-email-cloudflare-worker` | Correo → Worker → Edge Function, idempotente y por usuario |
| `gmail-forwarding-auto-confirm` | Auto-confirmar el reenvío server-side |
| `apify-integration-pattern` | Fetch directo, normalización `-1`/null, `ScraperError` tipado |

## 🎨 UI, UX y frontend

| Skill | Qué resuelve |
|---|---|
| ⭐ `auditar-responsive-midiendo` | El desborde no es "algo muy ancho": es algo que **se niega a encogerse**. Las 3 formas, invisibles para tsc y el linter |
| ⭐ `acciones-en-lote-seguras` | Selección múltiple sin los 3 desastres típicos (actuar sobre lo que no se ve, decir 50 cuando cambiaron 40, ser más permisivo que la app) |
| ⭐ `reporte-in-app-con-snapshot-efimero` | Reportar un bug cuando lo que hay que reportar es efímero y el servidor no puede reconstruirlo |
| `drill-down-numero-a-lista` | Hacer clickeable un número del dashboard — comparando las DEFINICIONES antes de enlazar |
| `ui-distintiva-no-ai-default` | No caer en el "default genérico de IA" al crear o rediseñar |
| `reskin-marca-coherente` | Migrar un template heredado a una marca propia (landing == app) |
| `prototipo-ui-a-datos-reales` | Conectar un prototipo mock a datos reales sin reescribir la UI |
| `dialogo-confirmacion-no-nativo` | Nunca `window.confirm`/`alert`/`prompt` — regla del founder |
| `popover-portal-no-absolute` | Popovers SIEMPRE con portal, NUNCA `absolute` (el mismo bug 3+ veces) |
| `toaster-montado-por-scope` | Toasts que no aparecen y no dan error: falta el `<Toaster>` en ese scope |
| `refrescar-vista-server-tras-mutacion-cliente` | "Hago algo y tengo que refrescar para verlo" |
| `realtime-canal-muere-en-silencio` | El canal se cae y la UI queda vieja hasta F5 |
| `supabase-realtime-broadcast-pattern` | Broadcast Changes (`postgres_changes` está deprecado) |
| `desktop-notifications-from-realtime` | Notificaciones del SO enganchadas a un realtime por-usuario |
| `intencion-ui-persistir-sessionstorage` | Persistir una intención que la DB no distingue (marcar no-leído) |
| `inbox-message-bubble-render` | Render de burbujas multi-tipo |
| `crm-inbox-conv-list-filters-strip` | Tira de filtros horizontal con scroll + fades |
| `crm-contact-detail-tabs` | Ficha de contacto full-page con pestañas |

## 📊 Números, dinero y tiempo

| Skill | Qué resuelve |
|---|---|
| ⭐ `porcentaje-necesita-minimo-muestra` | Una tasa que **ordena** una lista necesita mínimo de muestra. 1 lead / 1 cierre = 100% encabezando la tabla donde se decide el presupuesto |
| `umbral-compartido-cron-cliente` | El mismo umbral en un cron SQL y un filtro TS, sin que diverjan |
| `inicio-dia-timezone-fija` | "Hoy" anclado a una TZ fija, no al runtime (bug clásico server-UTC vs negocio-local) |
| `dinero-multimoneda-app-financiera` | Precisión decimal + moneda nativa por cuenta (evita "plata fantasma") |
| `tipo-de-cambio-real-bccr-hacienda` | FX real de Costa Rica sin API key, con caché y fallback |

## 🔐 Auth y deploy

| Skill | Qué resuelve |
|---|---|
| `auth-supabase-google-nativo` | Email/clave + Google nativo que muestra tu dominio |
| `supabase-google-login-movil-vs-desktop` | GIS en desktop vs OAuth redirect en móvil (la sesión no se establecía en el celular) |
| `deploy-seguro-vercel-preview-prod` | Preview → prod sin romper |

## 💡 Estrategia, marca y oferta

| Skill | Qué resuelve |
|---|---|
| `evaluar-icp` · `definir-avatar` · `descubrir-dolor` · `construir-oferta` | El pipeline de oferta sobre el framework Hormozi (`memory/frameworks/hormozi.md`) |
| `arrancar-angosto-antes-de-ensanchar` | El negocio hace muchas cosas: separar el **paraguas** (todo lo que vendés) de la **cuña visible** (LA cosa que mostrás una y otra vez) |
| `filtro-de-esencia-de-marca` | El gate previo a publicar: ¿esto se rastrea al posicionamiento, o nos subimos a un tema porque estaba de moda? Corre **al entrar** al plan, no al publicar |
| `matar-el-olor-a-ia` | Catálogo de tells del texto generado y cómo borrarlos sin mover el claim. En mensajes de bot no es estilo: es producto |
| `destripar-video-de-competencia` | Que Claude **vea** el video, no que lo lea: frames con ffmpeg + separar OBSERVADO de INFERIDO. Leer por caption daba "reels de 15-30s"; medir dio ~83s |

## 🎯 Ejecución y modo de trabajo del founder

| Skill | Qué resuelve |
|---|---|
| ⭐ `tarjeta-de-hoy-una-sola-cosa` | Toda la estrategia lista y cero output: el bloqueo no es falta de plan, es que abrir el proyecto exige **decidir**. `HOY.md` ejecutable sin abrir nada más + gate numérico de salida |
| ⭐ `perfil-de-operador-del-founder` | El `CLAUDE.md` documenta **qué** se construye; nadie documenta **cómo** responderle al humano que dirige. La corrección que el founder hace dos veces es una regla que falta en un archivo |
| `archivar-en-vez-de-borrar` | La maquinaria sobrante cobra renta. Cambiar "¿esto sirve?" (irrefutable) por "¿se usó en 4 semanas?" y archivar con `git mv` |

---

## Historial por tier

El orden **cronológico** de captura (qué salió de qué sesión, con el contexto completo de cada tier) está en `CLAUDE.md`, sección "Estructura del template" → `.agent/skills/`. Este README es el índice **temático**; el de `CLAUDE.md` es el **narrativo**.
