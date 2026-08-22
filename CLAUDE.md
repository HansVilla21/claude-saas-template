# Claude SaaS Template

## Qué es este proyecto

**Template madre** para construir SaaS y aplicaciones web con Claude Code como copiloto. Provee un sistema completo de agentes especializados, skills curadas, memoria estructurada, y referencias de calidad para arrancar proyectos sin partir de cero cada vez.

Este NO es un proyecto en sí — es la **base reusable** desde la que se inicializan proyectos concretos en `proyectos/<nombre>/`.

## Cómo se usa

### Para arrancar un proyecto nuevo

1. Crear carpeta en `proyectos/<nombre-del-proyecto>/`
2. Inicializar la estructura mínima dentro:
   ```
   proyectos/<nombre>/
   ├── .claude/agents/        ← agentes específicos del proyecto (ia, scraping, etc.)
   ├── .agent/skills/         ← skills propias del proyecto (procesos repetibles)
   ├── memory/                ← cerebro del proyecto (proyecto, posicionamiento, stack, decisiones)
   ├── inputs/                ← material de entrada
   ├── outputs/               ← entregables
   ├── templates/             ← prompts y formatos del proyecto
   ├── src/                   ← código de la aplicación
   ├── docs/                  ← documentación técnica
   ├── CLAUDE.md              ← instrucciones específicas del proyecto (extiende a este)
   ├── .env.example, .env, .gitignore, README.md
   └── (opcional) .mcp.json   ← MCPs específicos del proyecto
   ```
3. Cada subproyecto es un **repo de git independiente** (ver "Versionado" abajo)

### Para usar este template como referencia

- Los **agentes en `.claude/agents/`** están disponibles automáticamente para Claude Code en cualquier subproyecto
- Las **skills de Claude Code en `.claude/skills/`** también — son project-local del template pero se heredan a cualquier sesión que se abra desde la raíz
- Las **skills de proceso en `.agent/skills/`** las leen los agentes vía Read tool — son procesos repetibles aplicables a cualquier SaaS (ICP, oferta, avatar, pain discovery, meta-skill)
- Los **frameworks en `memory/frameworks/`** son la "biblia operativa" compartida que los agentes consultan (ej: Hormozi)
- Los **repos en `inputs/repos-referencia/`** son material de consulta para los agentes

## Estructura del template

```
.
├── .claude/
│   ├── agents/        Agentes genéricos reusables (17):
│   │                  · técnicos (8): arquitecto, frontend-builder, backend-builder,
│   │                    code-reviewer, debugger, security-auditor, penetration-tester,
│   │                    orquestador (genérico)
│   │                  · estrategia/SaaS (4): hormozi-strategist, saas-strategist,
│   │                    pain-discovery, billing-engineer
│   │                  · pipeline n8n (3): n8n-architect → n8n-builder → n8n-reviewer
│   │                    (el reviewer tiene VETO; ver "Construcción de Workflows n8n")
│   │                  · prompting (2): langchain-prompt-designer (system prompts de
│   │                    agentes LangChain), prompt-reviewer (checklist pre-deploy)
│   └── skills/        62 skills de Claude Code (slash commands), por familia:
│                      · UI/UX y diseño (13): ui-ux-pro-max, ui-styling, design,
│                        design-system, brand, brandkit, banner-design, slides,
│                        emil-design-eng, taste-skill, minimalist-skill,
│                        redesign-skill, soft-skill
│                      · animación GSAP (7): gsap-core, gsap-timeline,
│                        gsap-scrolltrigger, gsap-plugins, gsap-react,
│                        gsap-performance, gsap-utils
│                      · marketing y CRO (14): copywriting, customer-research,
│                        product-marketing-context, marketing-psychology,
│                        launch-strategy, social-content, email-sequence,
│                        pricing-strategy, page-cro, onboarding-cro,
│                        signup-flow-cro, paywall-upgrade-cro, meta-pixel-capi,
│                        output-skill
│                      · seguridad (12): owasp-security, supabase-pentest
│                        (orquestador) + su suite: supabase-detect,
│                        supabase-audit-rls, supabase-audit-authenticated,
│                        supabase-audit-auth-config, supabase-audit-auth-signup,
│                        supabase-audit-functions, supabase-audit-buckets-public,
│                        supabase-evidence, supabase-report, supabase-help
│                      · chatbot / n8n / prompting (10): momentum-architect,
│                        momentum-prompt-gen, momentum-prompt-optimizer,
│                        momentum-n8n-builder, momentum-workflow-variants,
│                        n8n-workflow-audit, n8n-expression-validator,
│                        n8n-langchain-prompts-rules,
│                        n8n-postgres-prepared-statements,
│                        langchain-agent-prompt-design
│                      · infra y datos (6): chatbot-db-schema-supabase,
│                        chatbot-manychat-supabase-multicanal,
│                        vercel-domain-migration, onvo-setup,
│                        onvo-checkout-flow, onvo-troubleshooting
├── .agent/
│   └── skills/        140 skills de proceso reusables:
│                      Originales (5): creador-de-skills (meta-skill),
│                      evaluar-icp, definir-avatar, descubrir-dolor, construir-oferta.
│                      Tier 1 — Bot/N8N/WhatsApp core (5, capturadas 2026-05-21):
│                      n8n-workflow-build-script, n8n-code-node-debug-pattern,
│                      whatsapp-image-delivery-ycloud, n8n-pipeline-rapido-vs-pesado,
│                      bot-llm-marker-expand-pattern.
│                      Tier 2 — Integración full-stack (5, capturadas 2026-05-21):
│                      ycloud-webhook-to-supabase, supabase-realtime-broadcast-pattern,
│                      bot-handoff-system-end-to-end, inbox-message-bubble-render,
│                      sales-framework-spsp-whatsapp.
│                      Tier 3 — Nicho específico (5, capturadas 2026-05-21):
│                      supabase-edge-function-secret-auth,
│                      n8n-properties-search-tool-pattern,
│                      crm-inbox-conv-list-filters-strip,
│                      n8n-langchain-agent-postgres-memory,
│                      bot-anti-loop-detector.
│                      Tier 4 — Outbound + Contactos + Admin (3, capturadas 2026-05-29):
│                      outbound-delivery-server-action, crm-contact-detail-tabs,
│                      crm-admin-panel-master-gated.
│                      Tier 5 — Meta-decisión + Operations (2, capturadas 2026-05-30):
│                      mesa-arquitectonica-multiagente (panel multi-agente
│                      + jueces adversariales para decisiones arquitectónicas
│                      grandes; incluye template.js parametrizable) +
│                      n8n-workflow-versioning (política formal de versionado
│                      de workflows N8N: snapshots, tags, rollback procedure).
│                      Tier 6 — N8N 1.121 gotchas (4, capturadas 2026-06-01,
│                      del fix loop de bot-c-v1): n8n-task-runner-no-crypto
│                      (UUID v4 + hash djb2 manuales cuando el sandbox restringe
│                      crypto global) + n8n-trace-id-postgres-overwrite (Postgres
│                      nodes pisan campos custom del item; usar $('NodeName')
│                      directo) + n8n-merge-combineall-trap (combineAll =
│                      cross-product que muere con input vacío; default a
│                      'append') + n8n-information-extractor-schema-mode
│                      (fromJson espera ejemplo, NO schema literal; usar
│                      'manual' + inputSchema para schemas dinámicos).
│                      Tier 7 — Flujo de salida del bot (1 nueva + 2
│                      extensiones, capturadas 2026-06-12 del pulido de
│                      bot-c-v1): bot-multibubble-output-flow (flujo
│                      Formateador→Parser→Split Out→Expand para responder
│                      en burbujas; wrapper output del Basic LLM Chain, el
│                      límite de burbujas lo pone el parser no el prompt, no
│                      aplastar \n con /\s+/g) + extensiones a
│                      bot-handoff-system-end-to-end (reactivar bot limpia
│                      bot_paused_until, no solo handler) y a
│                      n8n-workflow-build-script (deploy vía API PUT +
│                      verificación por hash SHA-256 contra el N8N vivo).
│                      Tier 8 — Arquitectura de datos (1, capturada 2026-06-14
│                      de la Misión 6 de crm-v2): fuente-unica-derivar-de-hijos
│                      (cuando dos vistas muestran "lo mismo" leyendo columnas
│                      distintas y divergen: elegir UNA fuente de verdad y
│                      DERIVAR el dato en la otra vista desde las filas hijas —
│                      repuntar writes + patch realtime + fallback; sin trigger,
│                      sin backfill, sin doble-columna sincronizada).
│                      Tier 9 — Seguridad DB (1, capturada 2026-06-15 de la
│                      Misión 8 de crm-v2): habilitar-rls-tabla-expuesta
│                      (prender RLS en una tabla viva sin romper el backend:
│                      auditar TODOS los consumidores y su ROL DB —¿service_role
│                      bypassa?—, calcar las policies de una tabla hermana, usar
│                      los helpers SECURITY DEFINER existentes, verificar
│                      adversarialmente, recién ahí aplicar; enable+policies
│                      juntos o queda deny-all silencioso).
│                      Tier 10 — Infra SaaS producción (1, capturada 2026-06-15
│                      de la Misión 9 de crm-v2): setup-correo-auth-saas
│                      (poner un SaaS en prod: subdominio Vercel + Resend
│                      verificado sin pisar el correo existente —usa subdominio
│                      send.— + Supabase Auth SMTP + Site URL/NEXT_PUBLIC_SITE_URL
│                      + flujos reset/invite-only/invitación-fija-contraseña +
│                      plantillas de correo branded; checklist e2e).
│                      Tier 11 — Patrones de CRM web (3 nuevas + 1 update,
│                      capturadas 2026-06-22 de M5-M8 de crm-v2):
│                      umbral-compartido-cron-cliente (un mismo umbral en un
│                      cron SQL y un filtro cliente TS: helper puro + constante
│                      nombrada + cross-reference + verificación contra la DB
│                      viva, para que notificación y filtro nunca diverjan) +
│                      inicio-dia-timezone-fija ("hoy"/corte de día anclado a
│                      una TZ fija con aritmética de offset, NO setHours del
│                      runtime —bug clásico server-UTC vs negocio-local—) +
│                      intencion-ui-persistir-sessionstorage (persistir una
│                      intención que la DB no distingue —marcar no-leído— en
│                      sessionStorage + guard en el auto-read + re-armado en
│                      mount, para que sobreviva F5/back-nav). Update a
│                      setup-correo-auth-saas: links de correo con token_hash
│                      + verifyOtp en /auth/confirm, NO PKCE code (rompe
│                      cross-device; fix del reset de Pietro).
│                      Tier 12 — Roles/permisos + UI (2, capturadas 2026-07-08
│                      del onboarding de Givi en crm-v2):
│                      rls-write-bloqueada-por-policy-desalineada (un rol
│                      no-privilegiado no puede GUARDAR y no aparece error, pero
│                      a owner/admin sí; causa: WITH CHECK divergido del USING
│                      tras mover una fuente de verdad entre tablas + triggers
│                      SECURITY INVOKER que propagan el 42501 a otra tabla;
│                      incluye el método de reproducir bajo el rol real
│                      —set local role + jwt.claims + rollback— y verificar
│                      positivo Y negativo) + dialogo-confirmacion-no-nativo
│                      (nunca window.confirm/alert/prompt; usar/armar un
│                      <ConfirmDialog> del design system con variantes
│                      default/warning/destructive; regla del founder).
│                      Tier 13 — Inbox estilo WhatsApp + método (4 nuevas + 1
│                      extensión, capturadas 2026-07-16 de la sesión de
│                      adjuntos/reacciones/citas del CRM):
│                      bsp-media-expira-archivar-propio (⭐ cross-project: el
│                      CDN del BSP BORRA la media a los 7 días —medido: 7.0d
│                      HTTP 206 / 7.1d 404—; se perdieron 54 archivos para
│                      siempre antes de detectarlo. Archivar a Storage propio
│                      al recibir, en background, degradando si falla; el
│                      filtro del rescate NO es direction='inbound' sino DÓNDE
│                      APUNTA la URL —el echo de coexistencia muere igual) +
│                      webhook-contar-event-types-antes-de-arreglar ("solo el
│                      lead hace las cosas" es FALSO: las reacciones llegan por
│                      3 event_type distintos; el mismo error se cometió 3
│                      veces en una sesión. `group by event_type` ANTES de
│                      tocar el webhook; el `default` que hace JSON.stringify
│                      envenena la memoria del bot) +
│                      probar-migracion-contra-base-viva-con-rollback (BEGIN +
│                      migración + assertions de invariantes + controles
│                      negativos + ROLLBACK; verificar después que prod quedó
│                      intacta. Da números medidos, no estimados) +
│                      verificar-visual-midiendo-contraste (medir el ratio WCAG
│                      real en el browser componiendo el velo sobre el fondo:
│                      el instinto de "aclarar el velo" daba 3.2:1, oscurecerlo
│                      6.42:1). Extensión a
│                      rls-write-bloqueada-por-policy-desalineada: causa 4 —
│                      la policy de SELECT y la de WRITE de la MISMA tabla
│                      mirando fuentes de verdad distintas (el rol VE y hace
│                      clic, no pasa nada, sin error).
│                      Tier 14 — SaaS/Scraping patterns (3, capturadas 2026-06-11,
│                      de Hookly): async-job-pattern (UI→job→worker→polling+refund
│                      créditos), apify-integration-pattern (fetch directo,
│                      normalización -1/null, ScraperError tipado),
│                      debugging-silent-errors (console.error estructurado,
│                      reproducir antes de instrumentar, error codes).
│                      Tier 15 — Auth/UX/Deploy SaaS (5, capturadas 2026-06-18, de Mi Menudo):
│                      auth-supabase-google-nativo (email/clave + Google nativo GIS que
│                      muestra tu dominio + fix 'Database error saving new user'),
│                      prototipo-ui-a-datos-reales (conectar un prototipo mock a Supabase
│                      sin reescribir la UI; perfil real + derivados en vivo),
│                      embudo-activacion-saas (diseñar el camino del usuario:
│                      confianza→completar→usar→pagar + tarjeta de activación),
│                      deploy-seguro-vercel-preview-prod (preview→prod sin romper),
│                      ingesta-email-cloudflare-worker (forwarding → Worker → Edge
│                      Function, idempotente, por usuario, nunca botar).
│                      Tier 16 — Finanzas + Auth/Onboarding SaaS (7, capturadas
│                      2026-06-18/20 de Mi Menudo): dinero-multimoneda-app-financiera
│                      (precisión decimal + moneda nativa por cuenta + saldo en vivo;
│                      evita "plata fantasma") + tipo-de-cambio-real-bccr-hacienda
│                      (FX real CR vía BCCR/Hacienda JSON sin API key, endpoint propio
│                      + caché + fallback; nunca hardcodear el tipo de cambio) +
│                      supabase-google-login-movil-vs-desktop (login Google+Supabase
│                      en SPA: GIS/signInWithIdToken en desktop vs OAuth redirect en
│                      móvil —la sesión no se establecía en el cel y rebotaba al login) +
│                      gmail-forwarding-auto-confirm (auto-confirmar el reenvío de Gmail
│                      server-side; el usuario no toca el link de confirmación) +
│                      onboarding-estado-server-side (estado de onboarding desde señales
│                      reales del server, NO localStorage por-dispositivo —reaparecía como
│                      cuenta nueva en otro device) + ui-distintiva-no-ai-default (no caer
│                      en el "default genérico de IA" al crear/rediseñar landing o UI;
│                      distintivo y de alta calidad desde la v1) + reskin-marca-coherente
│                      (migrar un template heredado a una marca propia coherente: auditar
│                      la capa de tokens + cazar overrides de --accent en runtime + barrer
│                      colores hardcodeados; landing == app).
│                      Tier 17 — WhatsApp proactivo a staff (1, capturada 2026-08-05
│                      de crm-v2): whatsapp-proactivo-a-staff (avisar por WhatsApp a
│                      un agente/staff cuando pasa un evento en la DB —caso canónico:
│                      handoff— vía plantilla Meta aprobada: colgarse de la fila
│                      `notifications` que ya hace el fan-out + trigger pg_net que lee
│                      secretos de Vault → Edge Function que resuelve teléfono + número
│                      del negocio + datos del lead y manda la plantilla YCloud, con
│                      tabla de log/anti-spam y degradación total. Gotchas no-obvios:
│                      proactivo fuera de la ventana de 24h EXIGE plantilla aprobada;
│                      la plantilla no puede empezar/terminar en variable; las
│                      "variables con nombre" de YCloud son posicionales por debajo;
│                      hardcodear lo que es igual para todos los tenants; botón URL
│                      dinámico = base fija + sufijo `<slug>/inbox?conv=<id>`; revocar
│                      EXECUTE del trigger SECURITY DEFINER a anon; guardado del perfil
│                      por server action —el update client-side falla silencioso—).
│                      Tier 18 — Catálogo multifuncional (1, capturada 2026-08-05
│                      de crm-v2): catalogo-multifuncional-por-preset (sección donde
│                      cada negocio carga LO QUE VENDE —propiedades, servicios,
│                      productos— con UNA base que se adapta a cualquier rubro por
│                      configuración y que el bot consume. Enfoque híbrido: tabla base
│                      `catalog_items` (columnas compartidas + `attributes` jsonb) +
│                      "preset" por vertical sobre el sistema de módulos existente
│                      (`module_definitions`: config_schema=ficha de atributos,
│                      extractor_schema, tool_config.mode, prompt_fragment, ui_slots).
│                      Plomería una vez, rubro nuevo = preset nuevo sin código. Dos
│                      modos de bot: `search` (rubro grande → tool con fallback
│                      multi-pass, cap 5) vs `inline` (rubro chico → lista completa
│                      inyectada en el prompt, `list_all`). UI con form dinámico
│                      derivado de la ficha (cero forms por rubro) + fotos a Storage
│                      por agencia + server action con gate de rol. Gotchas: jsonb
│                      `->>` es TEXTO —filtrar numéricos en memoria—; el camino de
│                      lectura debe servir al owner REAL no solo master (presets
│                      scope=global + agency_modules is_member_of); `agency_id` lo pone
│                      el flow nunca el LLM; confirmar enums/uniques del schema antes;
│                      solo `available`+`is_published`+no borrado se muestra al lead).
│                      Tier 19 — Método de trabajo (3, capturadas 2026-08-11 de la
│                      sesión de etiquetas + drill-down del CRM):
│                      verificar-base-del-pr-antes-de-mergear (⭐ cross-project:
│                      `mergeable: MERGEABLE` responde "¿se puede mergear?", NO
│                      "¿a dónde?" — dos PRs figuraban MERGED pero su
│                      `baseRefName` era otra rama y el código NUNCA llegó a
│                      producción; casi se repite el mismo día porque GitHub solo
│                      reapunta un PR apilado si la rama base se BORRA. Incluye
│                      cómo auditar PRs viejos mergeados fuera de main y cómo
│                      rescatarlos) + drill-down-numero-a-lista (hacer clickeable
│                      un número del dashboard: enlazar a la lista que ya existe
│                      en vez de construir un modal; comparar las DEFINICIONES de
│                      las dos pantallas antes de enlazar —si "sin atender" y "sin
│                      asignar" cuentan distinto, ese número NO se enlaza—; una
│                      fuente única que construye Y lee la URL; y verificar el
│                      ROUND-TRIP completo exigiendo número === filas, no que se
│                      armó un string) + worktree-para-no-pisar-el-checkout
│                      (trabajar cuando el founder está en el mismo repo: un
│                      `git checkout` suyo movió HEAD a mitad de una feature y
│                      otro commit quedó HUÉRFANO; incluye el gotcha de que un
│                      worktree FUERA del repo da ~96 errores fantasma de tsc con
│                      idéntica versión de paquetes → va DENTRO para heredar el
│                      node_modules, y el reflog como red de seguridad).
│                      Tier 20 — La escritura que no avisa (2 nuevas + 2
│                      extensiones, capturadas 2026-08-13 de las acciones en
│                      lote del CRM): detectar-escritura-filtrada-rls
│                      (⭐ cross-project: bajo RLS un `update` que NO matchea el
│                      USING **no devuelve error** — afecta 0 filas y responde
│                      éxito, así que `if (error)` nunca entra y la UI optimista
│                      queda mintiendo. La única detección es pedir `.select()` y
│                      CONTAR filas. Incluye dónde NO sirve: cuando el write
│                      vuelve la fila invisible para quien la hizo —reasignar a
│                      otro— el RETURNING viene vacío aunque haya funcionado, y
│                      eso va por server action. 3 incidentes del proyecto salen
│                      de este mismo modo de fallo) + acciones-en-lote-seguras
│                      (selección múltiple + acciones masivas sin los 3 desastres
│                      típicos: actuar sobre filas que el usuario ya no ve —se
│                      resuelve DERIVANDO la selección como intersección con lo
│                      visible, garantía estructural y no un efecto que compite
│                      con el clic—; decir "50" cuando cambiaron 40 —reportar
│                      `appliedIds` de la base + los motivos, y tratar "ya
│                      estaban así" como ÉXITO—; y ser más permisivo que la app
│                      de a una fila —si escribís con admin client el gate propio
│                      es la ÚNICA barrera: tenant del contexto nunca del
│                      navegador, destino validado, tope por lote—).
│                      **Extensiones:** probar-migracion-contra-base-viva-con-rollback
│                      suma el **bloque que SIEMPRE aborta** (`DO` que termina en
│                      `raise exception`, con el reporte dentro del mensaje del
│                      error): no existe camino en que la escritura persista, y
│                      como la DDL es transaccional permite aplicar la policy
│                      NUEVA adentro y medir antes/después en el mismo bloque —
│                      reemplaza al paso de "confirmar que el rollback funciona".
│                      Y rls-write-bloqueada-por-policy-desalineada suma la
│                      **causa 5** (policies de TABLAS DISTINTAS que expresan el
│                      MISMO permiso y divergen: el agente VE el lead y PUEDE
│                      etiquetarlo pero NO cambiarle el estado) + el aviso
│                      **3d: leé la policy VIVA, no la migración** — se reportó
│                      un bug inexistente por leer un `.sql` que una migración
│                      posterior ya había arreglado.
│                      Tier 21 — Reportar lo que no se puede reconstruir (1,
│                      capturada 2026-08-13 de la sección de reportes del CRM):
│                      reporte-in-app-con-snapshot-efimero (⭐ cross-project:
│                      poner "reportar un bug" DENTRO del producto cuando lo que
│                      hay que reportar es EFÍMERO — un playground, un preview,
│                      una vista derivada que tu base no guarda. La pregunta que
│                      decide todo el diseño es una sola: *"¿el servidor puede ir
│                      a buscar después lo que el usuario vio?"*. Si no puede, el
│                      **snapshot viaja con el reporte en el instante del clic**
│                      —jsonb, no FK: no hay a qué apuntar— y de ahí sale todo lo
│                      demás. Lo no-obvio: la evidencia la manda el CLIENTE y no
│                      hay alternativa, así que la línea que importa es cuál campo
│                      viene del navegador y cuál del contexto autenticado —un
│                      transcript inventado solo ensucia el reporte de quien lo
│                      inventó, un `agency_id` del navegador escribe en la cuenta
│                      de otro—; una burbuja rota se DESCARTA pero lo que ni
│                      siquiera es un array SÍ falla (front roto, conviene
│                      enterarse); al recortar por tamaño se tira lo VIEJO porque
│                      el final es donde está la evidencia; la selección se
│                      congela DESMONTANDO el modal al cerrar, no con un efecto
│                      que sincronice —el linter de React rechaza eso y tiene
│                      razón—; nombre y correo del que reportó se COPIAN o darlo
│                      de baja vuelve el reporte anónimo; e INSERT y UPDATE van
│                      como policies SEPARADAS porque no expresan el mismo
│                      permiso —reportar es de todos, gestionar es del dueño del
│                      panel—. Incluye el chequeo que ni tsc ni el build ven: si
│                      el join con la tabla del tenant viene vacío bajo RLS,
│                      TODA la bandeja dice "Negocio eliminado").
│                      Tier 22 — El número que dirige la plata (1, capturada
│                      2026-08-13 rediseñando "Por campaña" del CRM):
│                      porcentaje-necesita-minimo-muestra (⭐ cross-project:
│                      una tasa —conversión, cierre, apertura, rating, error—
│                      que ORDENA una lista necesita un mínimo de muestra. Caso
│                      real: un anuncio con **1 lead y 1 cierre daba 100%** y
│                      encabezaba la tabla, en verde, por encima del que trajo
│                      **89 con 3 cierres (3%)** — en la pantalla donde el
│                      cliente decide en qué anuncio pone el presupuesto. El
│                      fondo es de razonamiento, no de diseño: una tasa es una
│                      ESTIMACIÓN y su incertidumbre depende del denominador
│                      (con n=1, el intervalo de "100%" va de ~2% a 100%), así
│                      que ordenar por el valor puntual sin mirar n pone el
│                      ruido arriba SIEMPRE. Lo no-obvio del arreglo: (1)
│                      SEGMENTAR y no filtrar —esconder las filas de poca
│                      muestra hace que el cliente crea que su anuncio nuevo no
│                      se está midiendo—, con los insuficientes abajo ordenados
│                      por VOLUMEN; (2) apagar el color y la barra, que es la
│                      mitad del daño porque el color se lee ANTES que el
│                      número; (3) escalar la barra solo con los significativos
│                      o el ruido aplasta a los datos reales; (4) el CSV
│                      necesita su columna `datosSuficientes` porque en Excel lo
│                      primero que hacen es reordenar por el %. Incluye el
│                      control negativo que hace que el test discrimine
│                      —"ordenar solo por tasa lo pondría primero"— y por qué
│                      se eligió el umbral duro sobre el lower-bound de Wilson
│                      o el suavizado bayesiano: en un dashboard de CLIENTE el
│                      orden tiene que poder explicarse en una línea).
│                      Tier 23 — Lo que no encoge, desborda (1, capturada
│                      2026-08-14 del arreglo responsive completo del CRM):
│                      auditar-responsive-midiendo (⭐ cross-project: el
│                      desborde horizontal en celular casi nunca es "algo es
│                      muy ancho" — es algo que **se niega a encogerse**, y en
│                      CSS eso tiene tres formas, TODAS invisibles para tsc,
│                      el linter y el build: (1) un track de grid `1fr` es
│                      `minmax(auto, 1fr)` y ese `auto` es un PISO —el olor
│                      delator es que la rama de desktop ya usa `minmax(0,1fr)`
│                      porque alguien ya se peleó con esto, y la de mobile
│                      quedó en `1fr`—; (2) `flex-1` sin `min-w-0`, y peor con
│                      un control de formulario adentro porque su ancho
│                      intrínseco (~180px) pasa a ser piso duro —medido: el
│                      composer del chat pedía 398px en una caja de 375—; (3)
│                      texto sin corte, que muerde en los campos que caen a un
│                      email cuando falta el nombre. Más la cuarta: restar
│                      alturas a mano (`calc(100dvh - 49px)`) ignora los
│                      banners condicionales —el de impersonación se enciende
│                      JUSTO en el caso de todos los días—; se reemplaza por
│                      un shell que define el alto y pantallas que piden
│                      `h-full`, avisando que eso mueve el scroll del `body` a
│                      `main`. Trae el script de auditoría con las dos piezas
│                      no obvias (ignorar lo que vive dentro de un scroller
│                      horizontal INTENCIONAL, y reportar solo el ancestro más
│                      alto), el control negativo que prueba que la medición
│                      discrimina, los blancos táctiles por NIVELES (44 suelto
│                      / 36 denso / 24 piso duro de WCAG 2.5.8) con el truco
│                      del `<label>` que agranda el área sin agrandar lo que se
│                      ve —y reenvía el clic con el `shiftKey` intacto—, y la
│                      regla de NO inflar lo que WCAG exime por estar dentro de
│                      una frase: un reporte en cero puede ser peor producto.
│                      Incluye el bug que no es de tamaño sino de EXISTENCIA
│                      —una acción colgada de `group-hover` no existe en una
│                      pantalla sin hover— y los 4 gotchas que hacen MENTIR al
│                      reporte: medir sobre el esqueleto de carga, el bucle que
│                      no espera el cambio de ruta —delator: el mismo número de
│                      caracteres en rutas distintas—, un panel que no compone
│                      frames congela las animaciones y una geometría de modal
│                      parece rota, y el ROL de la sesión decidiendo qué podés
│                      ver —con `agent` el composer roto ni se renderiza—).
│                      Tier 24 — Ejecución y marca (7, capturadas 2026-08-22 del
│                      sistema de contenido Content OS; ninguna es de contenido
│                      en sí, todas son método transferible a cualquier proyecto):
│                      tarjeta-de-hoy-una-sola-cosa (⭐ cuando el proyecto tiene
│                      TODA la estrategia lista y CERO output: el bloqueo no es
│                      falta de plan, es que abrir el proyecto exige DECIDIR.
│                      Se reduce a `HOY.md` —una tarjeta ejecutable sin abrir
│                      otro archivo ni elegir nada— + `COLA.md`, triggers de
│                      rotación en lenguaje natural, umbral de reposición y un
│                      GATE numérico de salida —N unidades publicadas— porque
│                      el riesgo #1 es que "mejorar el sistema" reemplace a
│                      producir) + perfil-de-operador-del-founder (⭐ el
│                      `CLAUDE.md` documenta QUÉ se construye y nadie documenta
│                      CÓMO responderle al humano que dirige; la corrección de
│                      estilo o de ritmo que el founder hace DOS veces es una
│                      regla que falta en un archivo, y mientras viva en el chat
│                      se re-aprende cada sesión. Se llena por observación con
│                      citas textuales, no por entrevista; incluye plantilla de
│                      6 secciones y la separación dura entre lo operativo —va
│                      al repo— y lo personal/clínico —vive fuera—) +
│                      matar-el-olor-a-ia (catálogo de tells del texto generado
│                      y cómo borrarlos SIN mover el claim: paralelismo negativo
│                      "no es X, sino Y" con tolerancia cero, frases plantilla,
│                      vocabulario de modelo, ritmo parejo, simetría de tres,
│                      puntuación de máquina —crítico en mensajes de bot, ahí no
│                      es estilo sino producto—. Si falta un dato real se marca
│                      [PENDIENTE], nunca se inventa) +
│                      destripar-video-de-competencia (pipeline para que Claude
│                      VEA un video y no
│                      solo lo lea: scraper de API → `videoUrl` del CDN +
│                      transcript → `destripar-video.sh` extrae frames con
│                      ffmpeg → Claude los lee con Read y escribe el teardown
│                      separando OBSERVADO de INFERIDO. Analizar por caption da
│                      conclusiones falsas con mucha confianza: la lectura de
│                      texto decía "reels de 15-30s", la medición real dio ~83s.
│                      Las URLs del CDN caducan en horas ⇒ bajar en la misma
│                      sesión del scrape; <$0.10 por teardown) +
│                      archivar-en-vez-de-borrar (la maquinaria sobrante cobra
│                      renta: cada pieza que existe es una opción que hay que
│                      descartar antes de trabajar. No se poda porque la
│                      pregunta "¿esto sirve?" es irrefutable —habla del futuro—;
│                      se desbloquea cambiándola por "¿se usó en 4 semanas?" y
│                      archivando con `git mv` espejando rutas. Archivar vuelve
│                      REVERSIBLE una decisión irreversible, y las reversibles se
│                      toman rápido: 17→11 skills y 6→4 agentes en una sesión sin
│                      una sola discusión. El `archive/README.md` con "cuándo
│                      reactivar" es lo que separa un archivo de un cementerio;
│                      el paso que siempre se olvida es actualizar las TABLAS DE
│                      RUTEO —un orquestador que enruta a un agente archivado
│                      falla en silencio) + filtro-de-esencia-de-marca (gate de
│                      4 preguntas antes de publicar cualquier cosa de cara al
│                      público; la que más piezas mata es "¿lo podría haber
│                      publicado cualquier competidor?" —prueba de foso—. No
│                      prohíbe las tendencias, prohíbe las tendencias SIN
│                      traducir; lo descartado se anota con su condición de
│                      reevaluación o la discusión se reabre cada mes) +
│                      arrancar-angosto-antes-de-ensanchar (separar el PARAGUAS
│                      —todo lo que se vende, amplio, es el ROI— de la CUÑA
│                      visible —UNA sola cosa que se muestra una y otra vez—.
│                      El error es hacer la cuña tan ancha como el paraguas
│                      "para no perder clientes", y el resultado es el opuesto:
│                      nadie puede terminar "ah, vos sos el de ___". La cuña es
│                      la PUERTA, no el catálogo: angosto para entrar, ancho para
│                      facturar. El instinto de variar llega mucho antes de que
│                      el mercado se sature —ese cansancio interno es la trampa—;
│                      se repite con muchos ángulos sobre UN sistema-bandera y se
│                      ensancha por señal escrita, no por aburrimiento).
│                      Tier 25 — Lo que parece config y no lo es (4 nuevas + 2
│                      extensiones, capturadas 2026-08-17/18 de las sesiones de
│                      Roberto a producción y del flujo del handoff):
│                      config-por-tenant-no-literal-en-el-flujo (⭐ cross-project:
│                      en multi-tenant, la lógica de UN rubro cableada en el
│                      flujo COMPARTIDO. El MISMO modo de fallo apareció dos
│                      veces en dos días: el nodo Router tenía el clasificador de
│                      un cliente escrito a mano —los prompts de router que cada
│                      cliente tenía cargados NUNCA se ejecutaron, y una alarma
│                      médica la venía atendiendo el bot en vez de escalar—, y un
│                      nodo inyectaba, haciéndose pasar por el mensaje del lead,
│                      "pedile la zona o el código de la propiedad" a los leads
│                      de un fisioterapeuta. Lo no-obvio: (1) no hay error, log
│                      ni test que lo agarre —funciona perfecto para el cliente
│                      cuyo literal quedó cableado—; (2) el guard NO es un flag
│                      (`usar_router_propio:true` dice "quiero", no "funciona"):
│                      se verifica que lo cargado declare el CONTRATO del
│                      consumidor, porque un cliente tenía bajo la llave `router`
│                      un filtro pre-bot con otro schema y sin guard quedaba MUDO
│                      en producción; (3) un valor FUERA del contrato no degrada
│                      —el Switch descarta el ítem y el bot no contesta; el
│                      BACKUP solo dispara si el campo NO EXISTE—; (4) el default
│                      va en el flujo con nombre de default y los que dependían
│                      del texto viejo lo conservan por override cargado ANTES
│                      del deploy; (5) el control que NO discrimina se reporta
│                      igual) + probar-camino-produccion-sin-efectos-externos
│                      (⭐ cross-project: probar el camino REAL de producción
│                      cortando en el último centímetro, justo antes del nodo que
│                      sale al mundo. Un flag EN EL DATO —`__eval_synthetic`— no
│                      en el entorno: una env var apaga el envío para TODOS,
│                      incluido el lead que escriba en ese momento. Trae la
│                      matriz mínima de 4 —caso nuevo · el camino de TODOS ·
│                      no-regresión de un cliente VIVO · idempotencia—, y los dos
│                      rastros a limpiar: las filas sintéticas y la memoria
│                      conversacional del agente, que si volvés a probar por el
│                      mismo hilo los recuerda) +
│                      webhook-fanout-sin-reconciliacion (el proveedor entrega el
│                      MISMO evento a dos endpoints independientes —uno persiste,
│                      otro reacciona— y si una entrega falla NADIE reconcilia:
│                      el bot contestó una foto que en la base no existe. Dos
│                      suscriptores al mismo evento no son redundancia, son dos
│                      formas independientes de perderse el evento. Arreglo:
│                      INSERT idempotente por la llave natural del proveedor
│                      colgado EN PARALELO —en serie convierte la red de
│                      seguridad en un punto de falla nuevo— con la unicidad
│                      garantizada por constraint, nunca por select-previo. Y el
│                      hueco se documenta: si el evento perdido es el PRIMER
│                      mensaje de un lead nuevo, el rescate no lo salva) +
│                      enforcement-con-hook-no-con-regla (una regla escrita
│                      depende de que alguien se acuerde; un hook no. La regla
│                      "nunca push directo a main" estaba escrita desde el
│                      2026-05-29 y el 2026-07-15 un commit directo deployó a
│                      producción sin preview. Trae el filtro de 3 preguntas para
│                      decidir si algo merece hook, las 3 propiedades del hook
│                      que sobrevive —explica en vez de solo bloquear, escape
│                      explícito con nombre propio en vez de `--no-verify`,
│                      y conoce sus falsos positivos: un merge en main NO es un
│                      commit directo— y el gotcha que lo anula: `.git/hooks/` NO
│                      se versiona, así que sin `git config core.hooksPath
│                      .githooks` el hook existe en el repo, se lee, da confianza
│                      y NO corre. El hook real viaja en `.githooks/pre-commit`
│                      de este template).
│                      **Extensiones:** verificar-funcionamiento-end-to-end suma
│                      **"el nodo corrió" ≠ "el nodo escribió"** (un INSERT
│                      reportaba `success` sin escribir: nombre de enum mal
│                      escrito + `onError: continueRegularOutput` —que es lo
│                      CORRECTO en producción— convirtiendo el error en un ítem
│                      silencioso; el manejo de errores que necesitás en prod es
│                      justo el que esconde el bug en la prueba). Y
│                      whatsapp-proactivo-a-staff suma dos: el endpoint
│                      **`?wabaId=` de YCloud IGNORA el filtro** (devuelve las
│                      plantillas de toda la cuenta → creés que tu cliente ya
│                      tiene la plantilla, es de otro, y el aviso muere con
│                      `ycloud_403`) y los **parámetros fantasma** (se mandaba
│                      `send_lead_message` en el payload y la función nunca lo
│                      lee: antes de confiar en un flag, buscá su LECTOR).
│                      Sin tier (capturadas en el camino, faltaban del índice):
│                      verificar-funcionamiento-end-to-end (⭐ el estándar de
│                      prueba del proyecto: "compila"/"corrió"/"respondió
│                      200"/"se ve bien" NO son "funciona"; fuente de verdad por
│                      capa + Definition of Done de 3 preguntas) ·
│                      onboarding-cliente-crm (alta de un cliente externo de
│                      punta a punta, con gotchas numerados desde #-2) ·
│                      conexion-whatsapp-ycloud-supabase-n8n (montar la conexión
│                      WhatsApp en un proyecto/cliente nuevo) ·
│                      jsonb-config-save-no-pisar-campos-ajenos (un "Guardar" de
│                      una config jsonb que borra los campos de otros writers) ·
│                      realtime-canal-muere-en-silencio (el canal se cae y la UI
│                      queda vieja hasta F5) · desktop-notifications-from-realtime
│                      (notificaciones del SO enganchadas a un realtime
│                      por-usuario) · refrescar-vista-server-tras-mutacion-cliente
│                      ("hago algo y tengo que refrescar para verlo") ·
│                      popover-portal-no-absolute (popovers SIEMPRE con portal,
│                      NUNCA `absolute` — el mismo bug 3+ veces) ·
│                      toaster-montado-por-scope (toasts que no aparecen y no dan
│                      error: falta el `<Toaster>` en ese scope) ·
│                      nota-de-voz-real-whatsapp (nota de voz con la ondita, no
│                      adjunto) · bot-whatsapp-unsupported-fallback (recuperar
│                      los mensajes `unsupported` del clic de anuncio cableando
│                      el fallback del Switch — 3 leads reales quedaron sin
│                      respuesta).
│                      Tier 26 — Sitio + catálogo + CMS para cliente PYME
│                      (8, capturadas 2026-08-22 de un proyecto de 4 meses:
│                      web pública + catálogo + panel + chatbot, Next.js 15 +
│                      Supabase + Vercel). Es la vertical que faltaba: hasta
│                      acá el template era casi todo n8n/WhatsApp/CRM.
│                      · auditar-datos-antes-de-programar-features (⭐ el más
│                        transferible: antes de convertir el feedback de una
│                        llamada en un plan, CONTÁ las filas de producción.
│                        Caso medido: 3 quejas que sonaban distintas eran un
│                        solo agujero —81/83 sin precio, 0/83 con descripción,
│                        0 variantes—, así que media lista pedida NO se veía
│                        aunque se programara. La Fase 1 pasó a ser importar
│                        datos, no UI. Incluye el SQL del censo, el mapa
│                        queja→causa con `archivo:línea`, y por qué el seed
│                        local nunca sirve para esto).
│                      · catalogo-desde-pdf-del-cliente (el catálogo del
│                        cliente vive en 4 PDF de Canva: Canva exporta el texto
│                        letra por letra —"C Ó D I G OC M - 2 0"— así que las
│                        regex no matchean nunca y hace falta pdfjs; y agrupar
│                        filas redondeando la Y a una rejilla INVIERTE precios
│                        —pasó, Queen/King— hay que agrupar por proximidad con
│                        tolerancia. Importador que NO escribe en la base
│                        —produce CSV para Excel + JSON + informe de cruce— y
│                        cargador aparte, idempotente, con los nuevos en
│                        visible=false y sin pisar precios ya publicados.
│                        Trae `lib-catalogo-pdf.mjs` reusable tal cual).
│                      · fotos-de-pdf-con-revision-humana (extraer imágenes con
│                        pdfjs+sharp, filtrar por geometría + dispersión +
│                        NITIDEZ —medida: degradado ~0.1, borrosa ~0.14, foto
│                        usable 1.4–7.0— y NUNCA subir automático: los
│                        catálogos del propio cliente traían stock y un render
│                        de IA con marca de agua, que pasó todos los filtros
│                        por ser nítido. Hoja de revisión HTML para que el
│                        cliente marque cuáles son suyas. Gotcha caro:
│                        preguntar con `has()` en page.objs/commonObjs devuelve
│                        false para objetos que se están resolviendo y perdió
│                        un catálogo entero, en silencio).
│                      · chatbot-web-tools-sobre-datos-vivos (asistente EN LA
│                        WEB —no WhatsApp, no n8n— con Vercel AI SDK + OpenAI:
│                        el catálogo NO va en el prompt, va en herramientas, y
│                        por eso los precios son exactos y el costo no crece
│                        con el catálogo. Sin RAG ni embeddings. Los 3 bugs
│                        reales de producción: el modelo INVENTA el slug —el
│                        fix es que la tool se defienda con fallback por nombre
│                        y desambiguación devuelta como datos, no instruir el
│                        prompt—, expone slugs al usuario, y escribe los montos
│                        en formato gringo. Más: 503 + fallback a WhatsApp sin
│                        API key para poder desplegar antes de que el cliente
│                        apruebe el gasto, columna `fuente` para trazar el
│                        lead, y stream de texto plano en vez de useChat para
│                        no atarse a la versión del SDK).
│                      · supabase-free-se-pausa-y-tumba-el-sitio (el plan
│                        gratis se pausa por INACTIVIDAD: sitio 500 y builds
│                        con `fetch failed`. Se cae por no usarse, o sea justo
│                        en pilotos y demos. Diagnóstico en 30s por API
│                        —status INACTIVE— antes de leer un solo log de Next,
│                        restore ~4 min sin pérdida de datos, y keep-alive con
│                        cron de Vercel. Gotchas: los crons se identifican por
│                        PATH —dos con la misma ruta es UNO— y solo corren en
│                        producción).
│                      · completitud-de-contenido-en-el-panel (que el cliente
│                        no técnico SÍ termine de llenar 230 fichas: completitud
│                        como función pura, badge que dice QUÉ falta, filtro de
│                        incompletos, drawer con "Guardar y siguiente" y lote
│                        solo-sobre-vacíos. Regla de oro: la IA redacta prosa
│                        —descripción, como borrador que el humano aprueba— y
│                        el HUMANO pone los hechos —maderas, plazos—, porque
│                        una IA que "deduce" el material publica una mentira
│                        comercial firmada por el cliente).
│                      · panel-en-subdominio-por-middleware (admin.cliente.com
│                        sirve /panel en la raíz vía rewrite, el dominio público
│                        redirige, y la sesión de Supabase se refresca en el
│                        mismo middleware — una sola app, un deploy, tipos
│                        compartidos. Gotcha que aparece sí o sí: en el host de
│                        admin TODO se reescribe a /panel/*, así que apagar un
│                        widget del sitio público con usePathname no alcanza,
│                        hay que mirar el HOST — el dueño veía el chatbot de
│                        atención al cliente dentro de su propio gestor).
│                      · reporte-de-estado-para-cliente-no-tecnico (los TRES
│                        documentos son distintos y mezclarlos cuesta la
│                        reunión: resumen del cliente —solo logros, HTML
│                        autocontenido que abre de un toque en WhatsApp—, hoja
│                        de revisión —decisiones como preguntas, para pantalla
│                        compartida— y reporte de estado —el completo, en el
│                        repo—. Con plantilla HTML parametrizable, mobile-first
│                        y con modo oscuro. Gotcha: antes de pedir un insumo,
│                        verificá que sea del cliente — se le pidieron "las
│                        reseñas de Google" dos reportes seguidos siendo que
│                        son públicas y tomarlas era trabajo nuestro).
│                      Tier 27 — Lo que se quedó en el espejo (8 + 3 apéndices,
│                      capturadas 2026-07-06/08/10 en FreshAdFlow, subidas
│                      2026-08-22): son las skills que FreshAdFlow numeró como
│                      sus Tiers 9/10/11, se commitearon en la rama
│                      `feat/skills-seguridad-saas` de su espejo privado y
│                      NUNCA llegaron al madre — mientras tanto el madre reusó
│                      los números 9/10/11 para otras cosas, así que entran
│                      renumeradas. **Seguridad free→pago:**
│                      watermark-en-display-plan-gating (nunca servir el master
│                      limpio a un free; un overlay CSS es decoración, no
│                      seguridad) + anti-abuso-costo-ia-saas (defensa en
│                      profundidad para un SaaS con motor de IA: email-verify,
│                      blocklist de desechables, tope por IP/día y tope global
│                      de costo, todo env-tunable y fail-open).
│                      **Crecimiento/ops + pagos:**
│                      generar-creativos-de-anuncios-con-ia (incluye la regla
│                      de coherencia de marca: producto simple → anuncio
│                      simple) + probar-pasarela-de-pago-en-prod (validar pagos
│                      E2E con productos de $1 cuando el sandbox está caído) +
│                      feedback-con-recompensa-en-creditos (otorgamiento
│                      manual, para controlar costo y evitar gaming) +
│                      pagina-de-cuenta-billing-saas (tarjeta de estado +
│                      período de gracia + historial de ledger) +
│                      handoff-dossier-a-otro-proyecto (empaquetar un proyecto
│                      para otro agente). **Iteración sobre lo generado:**
│                      anexar-creativos-a-pack-existente ("generar más" y
│                      "variar UNO" sobre el mismo job: claim atómico
│                      done→running + bump de count, offset de path, finally
│                      siempre a done, reserva/refund; el enabler es guardar el
│                      prompt por ítem). Más 3 apéndices append-only sobre
│                      skills que ya estaban: debugging-silent-errors (leer los
│                      logs de prod con el MCP de Vercel ANTES de hipotetizar —
│                      la firma decía "rate limit", el log decía
│                      `billing_hard_limit_reached`), deploy-seguro-vercel-
│                      preview-prod (las env vars se snapshotean en el build →
│                      redeploy; y verificar que estén en la PLATAFORMA, no
│                      solo en el `.env`) y onvo-troubleshooting (sandbox
│                      caído, monto mínimo ~$0.50, período de gracia).
│                      Tier 28 — Lo que el motor no dijo (12, capturadas
│                      2026-08-22 de la auditoría completa de FreshAdFlow —
│                      aprendizajes de julio que nunca se habían capturado):
│                      ⭐ causa-raiz-mala-calidad-ia-esta-en-el-input (el
│                      hallazgo madre: cuando un producto de IA saca output
│                      malo con usuarios reales, la causa raíz casi nunca es el
│                      motor — es un input malo que el producto aceptó sin
│                      avisar. Las 2 primeras usuarias generaron TODO en modo
│                      "Producto" —el default preseleccionado— vendiendo una
│                      masajes y la otra un e-book; el motor, obligado a
│                      "mantener el producto exactamente igual", inventó un
│                      tarro de crema y un libro pegado. Trae el orden de
│                      sospecha de 5 pasos y el plan de 3 capas: UI primero,
│                      guards después, techo del modelo se anota) +
│                      ⭐ probar-motor-ia-fuera-de-la-app (correr el módulo de
│                      recetas REAL —no una copia— desde un script standalone
│                      con `node --experimental-strip-types` + file URL: A/B
│                      sobre datos reales de usuarios por ~$0.50, sin auth, sin
│                      créditos y sin ensuciar la base) +
│                      selector-que-obliga-eleccion-consciente (cero
│                      preselección + tarjeta con descripción y ejemplos en el
│                      idioma del usuario + jerga interna fuera —"Concepto"
│                      pasó a "Digital"—, y el detalle que ahorra un día: el
│                      `null` de "todavía no eligió" vive en el estado LOCAL de
│                      la pantalla, nunca asciende al tipo del dominio) +
│                      gate-0-validar-motor-antes-de-construir (harness aislado
│                      cero-dependencias con criterios de PASS escritos ANTES;
│                      12 imágenes y $0.76 decidieron endpoint, costo por
│                      unidad, latencia —y con ella que el job asíncrono era
│                      requisito, no opción— y descartaron un subsistema
│                      entero) + ⭐⭐ motor-de-recetas-de-prompts-para-imagen
│                      (el moat: prompt compuesto por bloques, rotación con
│                      paso COPRIMO para que no salgan gemelas —el bug era
│                      `angles[i % 5]` con count=9, aritmética, no modelo—,
│                      `coreRules` con las 7 reglas que sobrevivieron a
│                      producción, y "poco texto ≠ texto vago") +
│                      migraciones-postgres-directo-con-guard-de-proyecto (la
│                      Management API da 403 en `security definer`/`create
│                      policy`; y con el MCP apuntando a OTRA base, el guard
│                      del ref en el aplicador es el requisito, no la paranoia)
│                      + creditos-por-imagen-reserva-y-refund (cobrar por la
│                      unidad que CUESTA, ledger append-only, refund por unidad
│                      fallida, y el founder exento por SALDO y no por código)
│                      + limites-del-motor-de-imagen (los 3 techos: la
│                      moderación la dispara la FOTO y no el prompt · las
│                      imágenes-referencia NO transfieren estilo en `edits` —el
│                      logo sí porque es un objeto a colocar, la estética no—,
│                      solución real = vision-to-text · y el residuo del modelo
│                      se anota, no se pelea) +
│                      galeria-rapida-thumbnails-url-estable (el polling que
│                      re-firma signed URLs recarga TODAS las imágenes en cada
│                      tick; la cura es una URL estable por id, no optimizar el
│                      polling) + respaldo-total-espejo-privado-repo-de-repos
│                      (cuando el repo del deploy excluye `memory/`, ese cerebro
│                      queda en un solo disco: espejo privado con rama
│                      `respaldo-full-<fecha>`, y el trade-off de los `.env` en
│                      texto plano decidido explícito, con git-crypt como
│                      alternativa) + git-footguns-de-sesion (los 3 que borran
│                      trabajo sin dar error: untrackear un dir con ediciones
│                      sin commitear, dos sesiones sobre la misma rama con
│                      `git add -A`, y el Credential Manager multicuenta) +
│                      verificar-ui-detras-de-auth-en-local (quitar la ruta de
│                      `PROTECTED_PREFIXES` en local y REVERTIR — el revert es
│                      parte del cambio; Google GIS no corre en un preview de
│                      Vercel).
│                      Tier 29 — La cosecha del CRM de Josué (13, capturadas entre
│                      2026-07-15 y 2026-08-05, todas construidas y EN VIVO en un
│                      CRM de asesor de inversiones): prospai-webhook-crm (LinkedIn
│                      → CRM: los 16 eventos, el payload de prueba con placeholders
│                      literales que hace fallar el test, webhook no editable →
│                      crear-antes-de-borrar, guardar crudo antes de validar) +
│                      fathom-transcripciones-al-crm (el body CRUDO antes de parsear
│                      —re-serializar rompe la firma y parece que el proveedor firma
│                      mal—; el webhook-id ES la clave de idempotencia; 200 a casi
│                      todo porque reintentar lo que fallás VOS duplica; TRES estados
│                      y no dos, porque un secreto de webhook solo se prueba
│                      RECIBIENDO uno; preguntá por el HECHO (`is_won`) y no por el
│                      NOMBRE, que el cliente lo renombra; 🔴 ON DELETE CASCADE en la
│                      tabla de eventos = el botón de "quitar" borra el historial
│                      entero; y el grande: EL CÓDIGO QUE YA EXISTE PUEDE SER UNA
│                      FICCIÓN —ese webhook tenía CINCO invenciones y nadie lo notó
│                      porque nunca corrió) + manychat-instagram-al-crm (IG → CRM SIN
│                      la API de ManyChat —esa es pull y cuesta; se usa "Solicitud
│                      externa", push, Pro estándar—; el disparador "Nuevo contacto"
│                      YA es una-vez-por-persona y mata el reflejo del tag; el secret
│                      se INVENTA y va idéntico en Vercel + ManyChat, y una env nueva
│                      NO aplica sin redeploy; el reflejo a matar: el receptor YA
│                      existía y estaba desplegado —grep + curl (401=vivo) antes de
│                      reconstruir) + meta-ads-conexion-oficial (Standard Access
│                      ALCANZA para multi-negocio —probado contra la API— pero un
│                      tercero NO puede autorizar tu app, así que NO hay OAuth: el
│                      cliente comparte su cuenta y tu token la lee; la cuenta se
│                      FIJA —un token ve VARIAS y podés mostrarle a un cliente el
│                      gasto de un tercero—; el gasto viene en la MONEDA y la ZONA de
│                      la cuenta y ninguna falla ruidosamente; debug_token TE DICE
│                      cuándo vence; y el hoyo que hay que NOMBRAR: el gasto no trae
│                      los leads, y un "Leads: 0" al lado de la inversión le echa la
│                      culpa a las campañas de un agujero propio) +
│                      agendamiento-google-calendar (Calendly propio sobre Google
│                      Calendar: lo que lo mata en silencio es dejar la app en
│                      "Testing" —el refresh token se vence a los 7 días y la agenda
│                      muere un martes cualquiera—; el cartel de "app no verificada"
│                      se dispara por los scopes de CADA REQUEST y no del proyecto;
│                      el token NO depende del dominio; sin conectar NO se ofrece ni
│                      un horario, porque una tabla vacía de citas se lee como "todo
│                      libre"; freeBusy con error TIRA, nunca devuelve []) +
│                      key-de-ia-en-configuracion (la API key del proveedor se pega
│                      en Configuración y vive CIFRADA en la base, no en el .env:
│                      destraba la espera de la cuenta del cliente y deja el
│                      multi-negocio servido; el modelo NO se hardcodea, se le
│                      pregunta a /v1/models; la puerta `tieneSustancia()` corta
│                      ANTES de llamar, porque un modelo sin material no dice "no sé",
│                      inventa; y el gotcha que casi la mata: el texto más largo del
│                      registro era el TEMPLATE DEL PROPIO CLIENTE) +
│                      rol-aislado-cartera-rls (rol que ve SOLO su cartera; el bug a
│                      cazar es la "cola abierta" que expone carteras privadas —hay
│                      que excluirlas del SELECT Y del UPDATE—) +
│                      valor-derivado-pendiente-config (comisión/valor calculado de
│                      una tabla editable: SIN fallback —si falta la config el hecho
│                      entra igual y el valor queda `pendiente_config` + alerta, se
│                      congela al configurar; nunca inventar el número) +
│                      programar-envios-cron-vercel (⚠️ el gotcha decide la feature:
│                      HOBBY corre el cron 1×/día y NO a la hora exacta → en este
│                      proyecto la feature se QUITÓ en vez de mentirle al cliente) +
│                      datos-reales-vs-seed-demo (cuando el prototipo empieza a
│                      recibir datos reales: BORRAR los agregados sembrados en vez de
│                      ignorarlos, cazar los fallbacks hardcodeados tipo `?? 47`,
│                      blindar db:seed para que no borre el trabajo del cliente) +
│                      demo-con-datos-falsos (capturada después de casi dejar a dos
│                      prospectos REALES marcados como que habían comprado $38.500 y
│                      $62.000: las filas de demo son inventadas y rotuladas con
│                      prefijo visible, NUNCA registros del cliente; el deshacer se
│                      escribe ANTES del cambio; email y teléfono van en NULL, porque
│                      un `@ejemplo.test` es un rebote duro contra el dominio del
│                      cliente y la reputación de envío NO se arregla con un script) +
│                      verificar-frontend-sin-ver (⭐ pedirle el CSS al server y listar
│                      qué clases generó Tailwind DE VERDAD —sin sesión ni captura—:
│                      el JIT se atrasa con clases y arbitrarios NUEVOS y deja el CSS
│                      congelado con clases zombi; `min-width:auto` de flexbox le gana
│                      a tu `w-80` y hace que las dimensiones las decida el TEXTO;
│                      `toLocaleTimeString` rompe la hidratación por un espacio
│                      invisible que cambia según la versión de ICU. Nació de 3 rondas
│                      de "no me convence" con el diseño bien) +
│                      construir-landings-cliente (3 landings de conversión sobre el
│                      material real del cliente: blueprint, autoridad por landing,
│                      audio-testimonios, subdominios en Cloudflare DNS-only).
│                      Tier 30 — Entregar sin que el sistema muera con vos (9,
│                      capturadas 2026-08-22 de la cosecha del CRM de Josué; son los
│                      aprendizajes de agosto que nunca se habían escrito):
│                      ⭐ subir-archivos-grandes-sin-pasar-por-el-servidor (Vercel
│                      CORTA el cuerpo de todo request a 4.5 MB, límite duro de
│                      plataforma en Hobby Y Pro, aplicado en el edge ANTES de tu
│                      función: por eso `bodySizeLimit` de next.config no salva nada y
│                      tu validación de tamaño NUNCA corre —el usuario no ve tu
│                      mensaje porque el código no arranca—; el flujo correcto son 3
│                      pasos desde el primer commit: el server FIRMA (createSigned
│                      UploadUrl, gate intacto, ruta decidida por el server), el
│                      navegador sube DIRECTO al storage, y recién ahí se registra el
│                      metadato; en local NO se reproduce, así que todo "ya funciona"
│                      probado con pnpm dev es falso) + ⭐ soft-delete-bloqueado-por-rls
│                      (la papelera que no borra: poner `deleted_at` desde la sesión
│                      VIOLA la RLS hasta para el admin y aun con `with check (true)`,
│                      porque al borrar la fila deja de satisfacer la policy de SELECT
│                      —la estás haciendo desaparecer para vos mismo—; el fix es
│                      service role gateado por requireAdmin, que es como ya funciona
│                      el "restaurar"; se confirma impersonando contra la base con RLS
│                      on/off, JAMÁS por la UI, que refresca optimista y miente; y
│                      arreglá la FUNCIÓN, no el botón: el mismo bug tenía dos puertas
│                      reportadas como bugs distintos) + ⭐ manual-de-ayuda-dentro-del-
│                      producto (el manual VIVE en el producto —ruta /ayuda— y su
│                      contenido se LEE de las pantallas reales, no de memoria: un
│                      manual que miente es peor que ninguno porque el usuario deja de
│                      confiar al primer error; contenido como DATO tipado en
│                      lib/help/content/*, la UI solo dibuja, con un bloque `botones`
│                      que es lo que la gente busca parada frente a la pantalla; uno
│                      solo para todos los roles —filtrar por rol duplica el
│                      mantenimiento y rompe la llamada telefónica en la que el admin
│                      le explica a su asistente—; el enlace NO pasa por el gate del
│                      nav, porque el rol con menos permisos es el que más lo
│                      necesita, y en mobile va un "?" o el manual no existe donde se
│                      abre. 19 pantallas → 24 artículos; el inventario destapó un bug
│                      real) + ⭐ trabajar-en-la-cuenta-del-cliente (su GitHub, su
│                      Vercel: Windows guarda UNA credencial por host y actualizarla
│                      en otro proyecto te saca del repo del cliente con un
│                      "Repository not found" que suena a que te lo quitaron; una
│                      regla global `insteadOf` reescribe TODA URL SSH a HTTPS y por
│                      eso el remoto en `git@github.com:` no sirve —la forma
│                      `ssh://git@github.com/` con BARRA la esquiva sin borrar la
│                      regla—; y Vercel Hobby NO soporta colaboración: los deploys de
│                      git se BLOQUEAN si el autor del commit no es el dueño de la
│                      cuenta, así que `git push` NO deploya y el fallo es MUDO —un
│                      commit quedó BLOCKED y nadie se dio cuenta—; se deploya por API
│                      con gitSource y el script VERIFICA el dominio; el uso comercial
│                      en Hobby está fuera de términos: se le dice al cliente y decide
│                      él) + probar-todas-las-ramas-no-solo-la-feliz (`frío` VA CON
│                      TILDE: un CHECK de Postgres vs un literal sin tilde hacía que
│                      los leads C y D reventaran con 500 en producción y se PERDIERAN
│                      los datos de la persona, mientras A y B guardaban bien —y la
│                      primera prueba, hecha con el perfil de capital alto, dio
│                      verde—; una prueba verde sobre una rama es evidencia sobre esa
│                      rama y nada más: una prueba POR rama, verificada contra la
│                      base, y los valores permitidos como tipo literal para que los
│                      agarre el compilador. Segunda mitad: NO probar endpoints con
│                      acentos usando curl desde la consola de Windows —rompe el UTF-8
│                      antes de salir a la red y parece un bug de codificación de la
│                      app— usar Node con Buffer.from(json,"utf8")) +
│                      ⭐ reporte-de-traspaso-del-proyecto (un repo NO es un traspaso:
│                      el código dice QUÉ hace el sistema, no de quién es cada cuenta,
│                      por qué está así, ni qué falta y de quién depende; 13 secciones
│                      probadas en un CRM real, con la #8 —accesos: dueño, quién paga,
│                      qué vence— como la que salva el proyecto; los pendientes se
│                      PARTEN por dueño (bloqueados por el CLIENTE / técnicos /
│                      comerciales) o los 20 se leen como deuda tuya; cero secretos,
│                      solo nombres de variables y dónde viven; y escribirlo ENCUENTRA
│                      bugs, porque documentar obliga a mirar) +
│                      importacion-con-lote-deshacible (`import_batch_id`: deshacer
│                      por `created_at` se lleva por delante lo que entró por el
│                      formulario y los webhooks en la misma ventana; un uuid por
│                      corrida —el MISMO para todas las tandas— hace el lote
│                      nombrable: "Ver solo estos" es la mitad más usada, el deshacer
│                      va a PAPELERA, gateado a admin e idempotente, y las filas
│                      viejas quedan SIN lote a propósito porque inventarles uno sería
│                      fabricar un hecho) + dominio-que-envia-pero-no-recibe (enviar y
│                      recibir son DOS sistemas: SPF/DKIM habilitan enviar, pero sin
│                      MX el dominio NO recibe y cada respuesta a un boletín REBOTA
│                      —el correo con más intención de compra del mes es justo el que
│                      se pierde, y el proveedor no avisa porque su tablero está
│                      verde—; se verifica en 30 segundos con nslookup -type=MX; se
│                      presentan TRES opciones —reenvío gratis / casilla real /
│                      bandeja en el sistema— y la tercera es DEV que se cotiza
│                      aparte, no soporte; y se dice que los rebotes ya ocurridos no
│                      se recuperan) + boton-llamar-softphone-vs-telefono (`tel:` en
│                      una Mac se lo queda FaceTime; los softphones tipo Zoiper
│                      registran `callto:`, que FaceTime no toca → cae directo sin que
│                      el cliente configure nada; `tel:` se queda solo para mobile y
│                      la decisión se toma DESPUÉS de montar, o hay desajuste de
│                      hidratación; si aparece Skype, `sip:`; y decir que un enlace
│                      abre el marcador y NO registra la llamada: eso es integración
│                      telefónica y se cotiza).
│                      Las leen los agentes vía Read tool.
├── memory/
│   ├── orquestacion.md       Patrón de routing en lenguaje natural
│   └── frameworks/
│       └── hormozi.md        Síntesis de $100M Offers + Money Models + GOATed Ads.
│                             Biblia operativa de hormozi-strategist, saas-strategist,
│                             pain-discovery y las skills construir-oferta + evaluar-icp.
├── clients/                   UN cliente = UNA carpeta (comercial + técnico juntos).
│                              Tiene su propio README.md = REGISTRO MAESTRO con la
│                              tabla de clientes (sector, servicios, estado, valor,
│                              mant./mes) + `_plantilla/` para dar de alta uno nuevo.
│                              Por cliente: lo comercial (00-perfil, llamadas/,
│                              propuesta-y-contrato/, planning/, onboarding/,
│                              entregables/, marca-y-assets/) y lo técnico
│                              (architecture.md, prompts/ con sus `_compiled/`,
│                              test-prompts/ versionados v1→v4.x). No todas las
│                              subcarpetas son obligatorias: un lead puede tener solo
│                              la ficha, y un bot solo los prompts.
│                              ⚠️ Antes de tocar acá, LEER `clients/README.md` — el
│                              proceso de alta y la leyenda de estados están ahí.
│                              (Hasta 2026-07-16 esto vivía partido en dos árboles por
│                              idioma —`clientes/` comercial y `clients/` técnico—; se
│                              unificaron. Si ves `clientes/` en algún lado, es viejo.)
├── inputs/repos-referencia/   10 repos de calidad como referencia para los agentes
├── templates/                 Plantillas reusables:
│   ├── onboarding/            el proceso de onboarding genérico que se le manda a
│   │                          CUALQUIER cliente (.docx + texto extraído). Reusable ⇒
│   │                          NO va bajo un cliente.
│   └── supabase-email-templates/  4 HTML de Auth parametrizados (confirm, magic-link,
│                                  reset-password, change-email). Reemplazar placeholders
│                                  {{PRODUCT_NAME}}, {{PRODUCT_TAGLINE}}, etc.
├── outputs/                   Entregables del template (vacío por defecto)
├── proyectos/                 ← Aquí viven los proyectos concretos (gitignored)
│   └── hookly/                  primer proyecto (repo independiente)
├── crm-v2/                    ← Momentum AI CRM (repo independiente, gitignored).
│                              Es el proyecto que produjo la mayoría de las skills
│                              de los Tiers 8→24. Su `memory/backlog.md` es la
│                              fuente de verdad de ESE proyecto, no de este.
├── .githooks/
│   └── pre-commit             Bloquea commits directos en main/master. NO viaja
│                              solo: cada clon corre UNA VEZ
│                              `git config core.hooksPath .githooks`.
│                              Ver skill `enforcement-con-hook-no-con-regla`.
├── CLAUDE.md                  Este archivo
├── README.md
└── .gitignore                 Incluye `proyectos/` y `crm-v2/` (subproyectos no se
                               versionan aquí)
```

## Versionado / GitHub

Este repo es la **plantilla**. Tiene su propio repo en GitHub: `claude-saas-template`.

**Cada subproyecto en `proyectos/`** es **otro repo independiente** de GitHub. El madre los IGNORA (vía `.gitignore`).

Esto permite:
- Versionar el template separado de los proyectos (mejoras al template no contaminan proyectos)
- Cada proyecto cliente/SaaS tiene su propio historial, permisos, deploys
- Si mañana clonas el madre en otra máquina, los subproyectos se clonan por separado

## Cómo trabajamos (filosofía aplicable a TODOS los proyectos)

### Modo de trabajo: orquestación en lenguaje natural

El usuario **NO usa slash commands**. Habla en lenguaje natural sobre lo que quiere lograr. El **orquestador** (`.claude/agents/orquestador.md` del template, o el específico del subproyecto si existe) detecta intención y enruta al recurso correcto.

Detalles en `memory/orquestacion.md`.

### Directriz permanente: capturar todo proceso como skill (regla del founder, 2026-05-21)

**Cada vez que logramos un proceso nuevo en este proyecto** (conectar dos sistemas, resolver una clase de bug, armar un pipeline end-to-end, definir una mecánica de UI), **inmediatamente capturarlo como skill** en `.claude/skills/` (si es slash command usable por Claude Code) o `.agent/skills/` (si es proceso que leen los agentes vía Read).

**Cuándo capturar (regla del 3 + regla del "primera vez no trivial"):**
- Lo hicimos ≥2 veces y se ve venir la tercera → capturar.
- Fue la primera vez pero el aprendizaje es no-obvio o cross-project → capturar igual.
- Resolvimos un bug en cascada y hay learning técnico replicable → capturar.

**Qué capturar:**
- Pasos repetibles (con variables claras), no narrativas.
- Gotchas y errores que ya cometimos (para no repetirlos).
- Output esperado y formato.
- Ejemplo concreto de input → output.

**Por qué importa (cita literal del founder):**
> "Va a ser muy importante para más adelante, todo eso replicarlo también en otros proyectos. Quedando bien en este, podemos documentarlo, crear skills para, en otros proyectos, nada más reutilizar esas skills y volver a recrear todo con mucha más facilidad."

**Meta-skill que rige el formato:** `.agent/skills/creador-de-skills/SKILL.md`.

**Cómo se invoca en sesión:** El founder NO escribe `/crear-skill`. Detectar proactivamente cuando un proceso califica y proponerle: *"esto ya califica para skill — la armo ahora?"*. Si dice sí, crear inmediatamente sin pedir más detalles (el contexto ya está en la sesión).

### Reglas inviolables

- Nunca commits directos a `main`/`master` (en cualquier proyecto). **Esto no depende de acordarse:** el template trae `.githooks/pre-commit` que lo bloquea. Instalarlo **una vez por clon** — `.git/hooks/` no se versiona, así que sin esto el hook existe pero no corre:
  ```bash
  git config core.hooksPath .githooks
  ```
  Verificar con `git config core.hooksPath` (debe decir `.githooks`). Escapes a propósito: los merges pasan solos, y `ALLOW_MAIN_COMMIT=1 git commit ...` para una emergencia real. Ver skill `enforcement-con-hook-no-con-regla`.
- Nunca instalar global sin OK explícito del usuario
- `.env` siempre en `.gitignore`, secretos nunca hardcodeados
- Antes de instalar un repo nuevo: investigar a fondo, verificar qué instala el CLI vs qué hay en el repo
- Auditoría de saturación cada 5 nuevas instalaciones

## Subproyectos activos

| Proyecto | Path | Repo GitHub | Descripción |
|---|---|---|---|
| **Momentum AI CRM** | `crm-v2/` | `momentum-ai-crm` | CRM SaaS multi-tenant + bot de WhatsApp. **En producción con clientes reales.** Es la fuente de los Tiers 8→24 de skills. |
| Hookly | `proyectos/hookly/` | `hookly` | SaaS análisis viral de reels (Instagram MVP, TikTok V1) |

> Los clientes que corren sobre el CRM (fichas comerciales + prompts) viven en `clients/` — ver `clients/README.md`, que es el registro maestro.

## Convenciones

- Idioma: el usuario habla español → respuestas en español. Código en inglés.
- UI: mobile-first sin excepción. Tailwind CSS. Animaciones con `motion` (primaria) o GSAP (secundaria, casos específicos).
- Branches: `feat/<nombre>`, `fix/<nombre>`, `docs/<nombre>`.
- Archivos > 300 líneas: dividir en módulos.

## Memoria global del usuario

Persistente entre sesiones (en `~/.claude/projects/.../memory/`):
- Modo orquestador en lenguaje natural
- Nunca instalar global sin permiso
- Protocolo para instalar repos pasados por el usuario
- Auditoría de saturación de skills

## Generacion de Prompts y Agentes de Chatbot (Momentum AI)

Este proyecto usa la metodologia Momentum AI para crear prompts y entrenar los agentes de IA
que responden en los flujos de chatbot. La calidad depende de seguir estas reglas SIEMPRE.

### Antes de generar u optimizar CUALQUIER prompt (obligatorio)

1. Leer `memory/metodologia-core.md` — reglas no-negociables (fuente de verdad)
2. Leer `memory/feedback-prompting.md` — correcciones ganadas en produccion
3. Consultar los prompts reales en `knowledge/workflows-reference/` como ancla de calidad
   (no inventar patrones — seguir lo que ya funciona)

### Skills y agente disponibles

| Recurso | Cuando se usa |
|---|---|
| skill `momentum-architect` | decidir cuantos agentes, modelo LLM, estructura del flujo |
| skill `momentum-prompt-gen` | generar prompts (agente principal, router, especialistas, objeciones, formateador, etc.) |
| skill `momentum-prompt-optimizer` | mejorar un prompt existente con cambios quirurgicos |
| agente `prompt-reviewer` | validar un prompt contra el checklist pre-deploy |

El flujo de calidad completo es: **architect (estructura) -> prompt-gen (genera) ->
prompt-reviewer (valida) -> prompt-optimizer (arregla quirurgicamente lo que falle).**

### Reglas de prompting NO negociables (resumen — el detalle esta en metodologia-core.md)

- **Arquitectura modular** — 1-3 agentes especializados, nunca un mega-prompt
- **Limites de chars:** agente principal 3,000-5,000 · especializado 1,000-2,000 · classifier 1,500-3,000
- **Cambios quirurgicos** — si funciona al 70%, arreglar el 30%. NUNCA reescribir desde cero
- **No inventar** — "Deja verifico eso" en vez de inventar datos
- **Valor primero, datos despues** — nunca pedir email/tel antes de dar valor
- **Puntuacion humana** — sin punto final, sin dos puntos, sin ; sin ¿ sin em-dash (—). Default SIEMPRE
- **Variar mensajes repetidos** — nunca el mismo texto literal dos veces
- **No prometer lo que el bot no puede enviar** — solo links y texto
- **SIEMPRE reportar el conteo de caracteres** de cada prompt generado
- **Formateador:** copiar verbatim el canonico (`.claude/skills/momentum-prompt-gen/assets/template-formateador.md`), no improvisar

### Regla de oro

Si el mensaje del bot suena a articulo de periodico, es bot. Si suena a un mensaje de WhatsApp
a un amigo, es humano. Ese es el filtro de calidad final.

### Decisiones de prompting (memoria heredada)

`memory/prompting-decisions.md` contiene decisiones arquitectónicas del proyecto Momentum AI
Chatbot Arquitect (Jacó, Dr. Carlos, El Canal, Level, etc.). Es contexto histórico — NO se
mezcla con `memory/decisions.md` (que es del CRM SaaS).

---

## Construcción de Workflows n8n (Momentum AI) — kit hermano del de prompts

Para construir **cualquier flujo de n8n** o **chatbot multi-agente** de Momentum, seguí el
entrenamiento. La **regla madre**: **el template base se DUPLICA, NUNCA se construye desde cero.**

### Antes de construir CUALQUIER workflow n8n (obligatorio)

1. Leer `knowledge/00_CURRICULUM_CONSTRUCCION_N8N.md` — el camino de aprendizaje completo (11 módulos)
2. Leer `memory/metodologia-core.md` — reglas no-negociables (compartido con prompting-kit)
3. Leer `memory/feedback-n8n-build.md` — **los 14 errores reales y su fix** (checklist OBLIGATORIO
   antes de declarar un workflow terminado — revisar SIEMPRE)
4. **DUPLICAR** el template más parecido de `knowledge/workflows-reference/` (template-base /
   dr-carlos / el-canal) — **NO improvisar nodos**, NO crear "Router" desde memoria

### Skills de construcción disponibles

| Skill | Cuándo se usa |
|---|---|
| `momentum-architect` | decidir cuántos agentes, router, post-processing, stack |
| `momentum-n8n-builder` ⭐ | configurar el workflow nodo por nodo sobre el template duplicado |
| `momentum-workflow-variants` | generar variantes TEST (chat interno n8n) / Telegram / YCloud |
| `n8n-langchain-prompts-rules` | evitar que las llaves `{}` rompan el Information Extractor |
| `n8n-postgres-prepared-statements` | queries Postgres robustas (JSON deconstruction, 5+ params) |
| `chatbot-db-schema-supabase` | schema multi-canal + multi-nicho (versión canónica del kit en `.claude/skills/`) |
| `chatbot-manychat-supabase-multicanal` | patrón multi-canal WA + IG + errores comunes |

### Reglas de construcción NO negociables (resumen — detalle en feedback-n8n-build.md)

- **Duplicar el template, no construir de cero** — solo cambian prompts, agentes, tools,
  post-procesamiento, credenciales. Mantener nodos comunes intactos.
- **Router = Information Extractor bien configurado** — SIN llaves `{}` en el prompt, schema
  repetido dentro del prompt en prosa, 3-4 destinos + backup al principal, Switch leyendo el
  campo real (`destino` u otro nombre corto). **NUNCA inventar un nodo tipo "Router"**.
- **Llaves `{}` en nodos LangChain rompen silencioso** — describir formatos en prosa, schema en
  el campo `inputSchema` (que sí acepta JSON literal)
- **Postgres 5+ params/nullables → JSON deconstruction** (`$1::jsonb` + `d->>'campo'`)
- **Nodos de persistencia EN PARALELO, no en serie** (si no, sobrescriben `$json.output`)
- **"Leer estado" en multi-canal → UPSERT, no SELECT** (auto-curativo)
- **Usar `.first()` no `.item`** después de Code/Agent/IE/Loop
- **Webhook externo → `responseMode: onReceived`** (evita timeout y duplicados)
- **Nombres de nodos representativos + sticky notes** por zona del flujo
- **VALIDAR antes de entregar** — verificar el output real de cada nodo (sobre todo el router)
  contra un Information Extractor que ya funcione en el proyecto, NO contra memoria

### Herramientas externas recomendadas (instalar aparte)

- **n8n-mcp** (czlonkowski/n8n-mcp) — crear/validar workflows en vivo. **La validación es lo que
  mata el router improvisado.**
- **Skills globales de n8n** (czlonkowski/n8n-skills) — sintaxis exacta de nodos y expresiones.
  Algunas YA están disponibles globalmente: `n8n-expression-syntax`, `n8n-node-configuration`,
  `n8n-code-javascript`, `n8n-validation-expert`, `n8n-mcp-tools-expert`, `n8n-workflow-patterns`.

### Causa raíz que este kit ataca (cita textual del README)

> *"El error #1 al construir estos bots es armar el workflow desde cero e improvisar los nodos
> (sobre todo improvisar el 'router' en vez de un Information Extractor bien configurado).
> La regla madre de Momentum: el template base se DUPLICA, nunca se construye de cero."*

Esto es **operativo**. Si Claude construye un workflow sin haber duplicado un template y sin
leer `feedback-n8n-build.md` primero, está violando una regla explícita del proyecto.
