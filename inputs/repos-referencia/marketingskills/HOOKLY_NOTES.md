# Marketing Skills — Notas para Hookly

## Origen
- **Repo:** https://github.com/coreyhaines31/marketingskills
- **Autor:** Corey Haines (Conversion Factory, Swipe Files)
- **Clonado el:** 2026-04-26
- **Total skills en repo:** 39

## Por qué Hookly necesita marketing skills
Hookly es un SaaS B2C/PLG (creadores de contenido) con freemium → paid. La calidad del marketing afecta directamente:
- Conversión de la landing
- Activación post-signup (onboarding)
- Conversión free → paid (paywall)
- Retención (churn)
- Adquisición (referrals, social, contenido)

## Skills instaladas (8 de 39 — TIER 1 críticas)

| Skill | Cuándo se invoca |
|---|---|
| ⭐ `product-marketing-context` | **FUNDACIÓN.** Todas las demás skills la leen primero. Documenta producto, audiencia, posicionamiento. Pendiente: generar `product-marketing-context.md` específico de Hookly cuando arranquemos copy. |
| `copywriting` | Escribir copy de la landing, dashboard, emails, error states |
| `page-cro` | Optimizar conversión de la landing principal |
| `signup-flow-cro` | Optimizar el flujo de registro (auth + first run) |
| `onboarding-cro` | **Diferenciador vs ReHit** — onboarding guiado en Hookly |
| `paywall-upgrade-cro` | Diseñar el paywall freemium → paid |
| `pricing-strategy` | Definir precios USD localizados LATAM |
| `marketing-psychology` | Doble uso: (1) marketing de Hookly, (2) generación de guiones virales en el producto mismo (psicología del hook) |

## Skills NO instaladas (31 de 39)

### Excluidas con razón explícita

| Razón | Skills |
|---|---|
| Hookly es web, no app móvil | `aso-audit` |
| Más B2B enterprise (Hookly es B2C/PLG) | `sales-enablement`, `revops`, `cold-email` |
| Over-engineering para MVP | `programmatic-seo`, `schema-markup`, `analytics-tracking`, `ab-test-setup` |
| Cubierto por otras skills nuestras | `image` (tenemos `brandkit`), `video` (tenemos GSAP + ui-ux-pro-max) |
| Anti-patterns para SaaS modernos | `popup-cro` |
| No aplica modelo Hookly | `form-cro` (no somos lead-gen, somos PLG) |

### Diferidas a fases posteriores (V1+)

| Skill | Fase |
|---|---|
| `referral-program` | V3 — programa de afiliados |
| `churn-prevention` | V1+ cuando tengamos churn real para medir |
| `social-content` | V1+ — meta-contenido viral |
| `launch-strategy` | Cuando se acerque el lanzamiento |
| `email-sequence` | V1+ — emails transaccionales y lifecycle |
| `competitor-profiling` + `competitor-alternatives` | V1+ — páginas comparativas SEO |
| `customer-research` | V1+ — research formal post-lanzamiento |
| `seo-audit`, `ai-seo`, `site-architecture`, `content-strategy` | V2+ — SEO y contenido |
| `community-marketing` | V2 — comunidad |
| `lead-magnets`, `free-tool-strategy` | V2+ |
| `paid-ads`, `ad-creative` | V3 — paid acquisition |
| `directory-submissions` | Cerca del lanzamiento |
| `marketing-ideas` | Cuando necesite inspiración |
| `copy-editing` | Cuando ya tengamos copy escrito que refinar |

## Cómo se usan en el flujo de Hookly

### Fase 1: Definir contexto (HACER PRIMERO)
Antes de escribir cualquier copy, generar `product-marketing-context.md` específico de Hookly. Esta skill estructura el documento. Sin esto, las demás skills no saben qué producto/audiencia/posicionamiento aplicar.

### Fase 2: Diseño de la landing
- `marketing-psychology` → identificar disparadores aplicables al target (creadores hispanohablantes)
- `copywriting` → escribir hero, value props, social proof, FAQ
- `page-cro` → optimizar estructura, jerarquía, CTAs

### Fase 3: Flujos de conversión del producto
- `signup-flow-cro` → registro
- `onboarding-cro` → primer-run guiado (diferenciador clave)
- `paywall-upgrade-cro` → free → paid

### Fase 4: Pricing y modelo
- `pricing-strategy` → finalizar precios USD/MXN/COP, planes, descuento anual

## Integración con el resto del proyecto

| Tarea | Skills primarias | Skills secundarias |
|---|---|---|
| Construir landing | `copywriting` + `page-cro` + `marketing-psychology` | `ui-ux-pro-max` + `gsap-scrolltrigger` (visual/animación) |
| Diseñar onboarding | `onboarding-cro` | `frontend-builder` + `motion` |
| Diseñar paywall | `paywall-upgrade-cro` | `pricing-strategy` + `billing-engineer` |
| Definir precios | `pricing-strategy` | `billing-engineer` (implementación Stripe) |

## Dependencia clave: product-marketing-context
El README del repo dice textualmente: "every other skill checks it first to understand your product, audience, and positioning before doing anything." Por eso es la PRIMERA en orden de uso.
