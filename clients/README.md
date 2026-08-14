# 📇 Registro de clientes

Registro y análisis de todos los clientes que usan (o usarán) el sistema (chatbot + CRM + sitios web).

**UN cliente = UNA carpeta**, con lo comercial y lo técnico juntos. Un cliente puede tener solo una de las dos partes (un lead sin construir aún, o un bot armado sin ficha comercial) — no todas las subcarpetas son obligatorias.

> **Nota histórica (2026-07-16):** esto vivía partido en dos árboles por idioma — `clientes/` (comercial, con este registro) y `clients/` (técnico, con los prompts). Dos carpetas con el mismo nombre en distinto idioma y nadie sabía cuál era cuál. Se unificaron acá.

```
clients/
├── README.md                    ← este registro maestro
├── _plantilla/                  ← template para arrancar un cliente nuevo
│   └── 00-perfil.md
└── <slug-del-cliente>/
    │  ── comercial ──
    ├── 00-perfil.md             ← ficha: negocio, gente, dolores, deal, estado
    ├── llamadas/                ← transcripciones con resumen + insights al inicio
    ├── propuesta-y-contrato/    ← propuesta, contrato, cuentas
    ├── planning/                ← plan de trabajo, hitos, roadmap interno
    ├── onboarding/              ← checklist de accesos/inputs que necesito del cliente
    ├── entregables/             ← URLs sitio/chatbot/CRM, accesos, repos
    ├── marca-y-assets/          ← catálogos, logos, IG/FB, paleta
    │  ── técnico ──
    ├── architecture.md          ← arquitectura del bot (cuántos agentes, modelo, flujo)
    ├── prompts/                 ← los prompts que corren, + `_compiled/` listos para pegar
    └── test-prompts/            ← iteraciones versionadas (v1, v2, … ) para comparar
```

El **proceso de onboarding genérico** (el que se le manda a cualquier cliente) NO va acá: vive en `templates/onboarding/` — es reusable, no de un cliente.

## Cómo agregar un cliente nuevo

1. Copiar `_plantilla/` a `clients/<slug-del-cliente>/`.
2. Llenar `00-perfil.md`.
3. Tirar las transcripciones de llamadas en `llamadas/` y agregarles resumen + insights arriba.
4. Agregar la fila al cuadro de abajo.

## Clientes

| Cliente | Sector | Servicios | Estado | Valor | Mant./mes | Cerrado | Ficha |
|---|---|---|---|---|---|---|---|
| **Mueblería Pérez Luna** | Muebles premium (CR) | Chatbot · CRM · Sitio web | Onboarding | $2.000 | $200 | 2026-06-03 | [perfil](muebleria-perez-luna/00-perfil.md) |
| **Desarrollos Ecológicos El Canal** | Inmobiliaria / desarrollo residencial (Grecia, CR) | Chatbot · CRM | ⚠️ por confirmar | — | — | — | [perfil](desarrollos-ecologicos-el-canal/00-perfil.md) |
| **Givi** | App de fidelización / lealtad para comercios (CR) | CRM (producción) · Chatbot (por construir) | producción | ⚠️ s/d | ⚠️ s/d | — | [perfil](givi/00-perfil.md) |

> **Carpetas con parte TÉCNICA pero todavía sin ficha comercial** (tienen prompts, no `00-perfil.md`). Si entran al registro: copiarles `_plantilla/00-perfil.md` y sumar la fila arriba.
> `momentum-ai-crm/` (el bot del propio CRM: prompts + test-prompts v1→v4.4.2) · `jaco-dream-rentals/` · `roberto/`
>
> Otros clientes de chatbot mencionados por Hans, sin carpeta todavía: Dr. Carlos (SmartCheck), asesores financieros (demo), una inmobiliaria (versión CRM base).
> (Givi salió de esta lista el 2026-08-13: ya tiene carpeta y ficha con los datos verificados contra la base viva.)
> (Varela / Condominio del Canal salió de esta lista el 2026-08-04: ya tiene carpeta como **Desarrollos Ecológicos El Canal**.)

## Leyenda de estados

`lead` → `propuesta` → `cerrado` → `onboarding` → `en desarrollo` → `producción` → `mantenimiento` → `pausado` / `cerrado-baja`
