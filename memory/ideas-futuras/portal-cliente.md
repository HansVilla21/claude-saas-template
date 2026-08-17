# Idea: Portal del Cliente + Gestión Interna de Clientes Momentum

**Estado:** 💭 idea capturada — NO trabajar todavía
**Origen:** sesión 2026-06-05 (founder, mañana)
**Decisión actual:** guardar bien estructurada, retomar cuando se cumpla el trigger (§7).

---

## 1. Qué es la idea

Una capa nueva del sistema Momentum donde:

**Lado Hans (admin master):**
- Sección "Mis clientes Momentum" (separada de la sección "Clientes" actual del CRM, que son agencias-tenant)
- Cada cliente tiene un perfil con: ficha comercial, documentos compartidos, estado de onboarding, contrato, accesos entregados, planning del proyecto
- Vista de progreso: quién ya subió qué, quién está atrasado, próximos hitos
- Notificaciones cuando un cliente carga algo

**Lado cliente (acceso restringido a SU propio perfil):**
- Ver su ficha
- Subir documentos (catálogos, logos, fotos, comprobantes de pago)
- Responder el **checklist de onboarding** (las preguntas del negocio, accesos, materiales) directamente en la app — no en Google Docs / Drive
- Ver su contrato + **firmarlo digitalmente** (Hans ya hizo esto antes en otro proyecto — flujo tipo DocuSign casero)
- Ver el estado del proyecto (qué está hecho, qué falta de su lado)

**Bonus posible:** notificación al cliente vía WhatsApp/email cuando Hans sube un entregable o necesita algo de él.

## 2. Por qué la idea es legítima (no fluff)

- **Ya hay infraestructura manual real funcionando** — la carpeta `clientes/` del repo tiene estructura formal (`_plantilla/` + cliente activo `muebleria-perez-luna/` con perfil + llamadas + onboarding + planning + contrato `.docx`). Esta idea es básicamente **migrar esa estructura local a una app web compartida con el cliente**.
- **El checklist de onboarding ya existe escrito** (`clientes/muebleria-perez-luna/onboarding/checklist-cliente.md`, 46 preguntas distribuidas en 11 bloques) — es el insumo gold para auto-generar el form online.
- **El contrato ya tiene plantilla** (`Contrato Momentum AI - Donald Pérez Luna.docx`) — base para automatizar firma digital.
- **Hans tiene experiencia previa con firma digital** — un proyecto pasado tenía una "ventana donde el cliente hace tipo firma digital, tipo DocuSign, una cosa así, pero desarrollado por mí". Reduce el riesgo técnico de la firma.
- **Hay valor comercial diferenciador**: "No te vendo solo el CRM, te vendo el portal donde vivimos juntos durante el onboarding y la relación" suena premium vs competidores que sólo dan el CRM.

## 3. Por qué NO se trabaja AHORA (justificación de espera)

- **Mes operativo**: 1 cliente cerrado (Pérez Luna, $2,000 + $200/mes mantenimiento, en onboarding desde 2026-06-03). Costo de mantener la estructura manual con 1 cliente = ~0 min/semana.
- **Foco Bloque 6 (polish)** + **Bloque 5 (bot avanzado post-data-real)** = ambos tienen impacto DIRECTO en lo que el cliente ve usando el producto. Esta idea es infraestructura interna.
- **Meta Ads próxima semana (~2026-06-11)** = generar leads pagos para crecer cartera. Primer prioridad.
- **Sin urgencia comercial**: ningún cliente prospecto está pidiendo "portal autoservicio" como hard requirement.

## 4. Visión adyacente (NO confundir con esta idea)

El founder mencionó como **visión separada** un **ERP completo**: capa post-venta que cubra clientes activos, finanzas, procesos internos. Eso es **otra fase** (post-MVP-portal). Esta idea de Portal del Cliente es el primer paso natural hacia ese ERP, pero NO el ERP completo.

## 5. Estado actual manual (lo que existiría que reemplazar/digitalizar)

```
clientes/                                    ← root local en repo
├── README.md                                ← registro maestro con tabla de clientes
├── _plantilla/                              ← template para nuevos
│   └── 00-perfil.md                         ← frontmatter YAML + 9 secciones
└── muebleria-perez-luna/                    ← cliente activo (en onboarding)
    ├── 00-perfil.md                         ← ficha completa
    ├── llamadas/
    │   ├── 2026-04-23-descubrimiento.md
    │   └── 2026-06-03-cierre.md             ← cliente cerrado este día
    ├── onboarding/
    │   ├── checklist-cliente.md             ← 46 preguntas / 11 bloques
    │   ├── checklist-inputs.md
    │   └── _proceso-onboarding-texto-extraido.txt
    ├── planning/
    │   ├── brief-presentacion.md
    │   ├── plan-mes-1.md
    │   └── roadmap-interno.md
    ├── propuesta-y-contrato/
    │   ├── Contrato Momentum AI - Donald Pérez Luna.docx
    │   └── _contrato-texto-extraido.txt
    ├── entregables/                         ← URLs sitio/chatbot/CRM, accesos, repos
    └── marca-y-assets/                      ← catálogos, logos, IG/FB, paleta
```

**Estado del flujo manual:** Hans clona `_plantilla/`, llena `00-perfil.md`, agrega transcripciones de llamadas, manda el checklist en Google Doc al cliente, recibe los archivos por WhatsApp / Drive, los organiza en las subcarpetas, lleva el roadmap en `planning/roadmap-interno.md` manual.

## 6. Esbozo técnico (cuando llegue el momento)

### 6.1 Modelo de datos

- Tabla nueva `momentum_clients` (NO confundir con `agencies` que son los tenants del CRM; estos son los clientes COMERCIALES de Hans-Momentum)
  - id, slug, nombre, sector, país, estado (lead/propuesta/cerrado/onboarding/...), valor_contrato_usd, mantenimiento_mensual_usd, fecha_cierre, fecha_onboarding, agency_id (FK opcional a `agencies` si el cliente ya tiene tenant CRM activo)
- Tabla `momentum_client_documents`: id, client_id, kind (contrato/catalogo/logo/comprobante/...), filename, storage_path, uploaded_by (master/cliente), uploaded_at
- Tabla `momentum_onboarding_responses`: id, client_id, question_key, answer_text, answered_at — relacionada a un template de preguntas reusable (el `checklist-cliente.md` de Pérez Luna como base)
- Tabla `momentum_contracts`: id, client_id, template_id, status (draft/sent/viewed/signed), signed_at, signature_blob, signature_ip
- Tabla `momentum_client_users`: id, client_id, user_id (FK a auth.users), role (owner/viewer) — permite que UNA persona del cliente acceda al portal

### 6.2 Rutas

- **Admin master:**
  - `/master/momentum-clients` — lista de clientes pagos
  - `/master/momentum-clients/[slug]` — perfil + documentos + onboarding + contrato + planning
- **Cliente:**
  - `/cliente/[slug]` — vista del cliente para SU propio perfil
  - `/cliente/[slug]/onboarding` — form interactivo del checklist
  - `/cliente/[slug]/documentos` — uploads + downloads
  - `/cliente/[slug]/contrato` — visualización + firma digital

Gating: middleware nuevo que separa `/master/*` (existing), `/cliente/*` (nuevo, gated por `momentum_client_users.user_id = auth.uid`), y `/a/[slug]/*` (CRM existing, gated por `agency_memberships`).

### 6.3 Componentes a construir

- Sección admin con tabs (perfil, llamadas, onboarding, contrato, planning, entregables, marca)
- Form runner reusable que renderiza el checklist (markdown → form fields tipados)
- Uploader de archivos (Supabase Storage con buckets privados por cliente + signed URLs)
- Firma digital: canvas HTML5 para firma + hash + timestamp + IP, almacenado como blob
- Sistema de notificaciones (in-app + email + WhatsApp opcional si reusa YCloud)
- Audit log de quién subió/firmó/cargó qué y cuándo

### 6.4 Brecha conocida

- Supabase free tier: **Storage NO está en backups automáticos** (riesgo R7 de OBS-3). Si el portal almacena contratos firmados + catálogos + documentos críticos, esto se vuelve bloqueante. Requiere o upgrade a Pro o backup manual de Storage adicional.
- Firma digital legalmente válida en Costa Rica: investigar requerimientos jurídicos antes de tirar código (probable requiere certificado digital, no solo canvas drawing).

## 7. Trigger para retomar (cuándo SÍ vale construirlo)

Cualquiera de estas señales:

1. **Carga operativa**: cuando Hans tenga **3+ clientes simultáneos en onboarding** y el costo de mantener `clientes/<slug>/*` manualmente se vuelva notable (olvidos de quién subió qué, fricción al pedir cosas por WhatsApp, perdida de archivos).
2. **Demanda comercial**: cualquier prospecto pida "portal autoservicio" o "acceso self-service a sus documentos" como hard requirement del cierre.
3. **Cierre del MVP base**: cuando Bloque 6 (polish) + Bloque 5 (bot avanzado) estén cerrados y Meta Ads ya esté generando data validada → ahí hay capacity para nuevas capas.
4. **Diferenciación competitiva**: si en research de competencia (otros CRMs para inmobiliarias/fisios CR) se descubre que NADIE ofrece esto, vale acelerar como wedge comercial.

## 8. Estimación bruta (cuando se haga)

- **Base portal mínimo** (perfil + documentos + form de onboarding): ~3-4 sesiones
- **Firma digital de contratos**: ~2 sesiones (más si certificado legal requerido)
- **Notificaciones in-app + email**: ~1 sesión
- **Notificaciones WhatsApp via YCloud reuso**: ~1 sesión
- **Total realista**: 7-9 sesiones (2-3 semanas en cadencia normal)

## 9. Riesgos conocidos a evaluar antes

- **Confusión semántica de "cliente"**: hoy en el código `cliente` se usa para referir a "agencia tenant del CRM" (en `/master/clientes/[slug]`). Esta idea introduce "cliente Momentum" como concepto distinto. Hay que **renombrar uno de los dos** antes de mezclar (probable: tenants del CRM = "agencias", clientes pagos de Hans = "clientes"). Decisión semántica que afecta UI + URLs + código.
- **Scope creep hacia ERP**: la idea puede crecer rápido (finanzas, contabilidad, time tracking, facturación). Es importante mantener este portal como **MVP de gestión de clientes + onboarding**, y separar ERP completo como Fase 2 distinta.
- **Storage cost en Supabase**: si los catálogos PDF + fotos de productos suben mucho, el plan free se queda corto (1 GB Storage). Migración a Pro o S3 externo.
- **Mantenimiento dual**: si el portal se construye pero algunos clientes prefieren seguir en Drive / WhatsApp, hay que decidir si forzar adopción o mantener ambos caminos (riesgo de duplicar data y nada se actualiza bien).

## 10. Referencias internas

- Estructura local actual: `clientes/README.md`, `clientes/_plantilla/00-perfil.md`
- Cliente activo de referencia: `clientes/muebleria-perez-luna/`
- Checklist real de onboarding: `clientes/muebleria-perez-luna/onboarding/checklist-cliente.md` (insumo gold para auto-generar el form online)
- Contrato real: `clientes/muebleria-perez-luna/propuesta-y-contrato/Contrato Momentum AI - Donald Pérez Luna.docx`
- Documento del proceso de onboarding extraído: `clientes/Momentum AI CRM — Proceso de Onboarding de Cliente (1).docx`

## 11. Proyecto previo de firma digital del founder

Pendiente: cuando se retome, pedirle a Hans link / repo / detalles del proyecto previo donde ya implementó firma digital tipo DocuSign. Eso acelera ~60% del módulo de firma.
