# Prompts — Roberto (fisioterapeuta)

Carpeta de los prompts del bot de Roberto. Misma convención que `clients/momentum-ai-crm/`.

## Tenant en producción (ya creado)

- **Negocio / agency:** `Roberto` (industria `fisio`)
- **Slug:** `roberto` → `/a/roberto`
- **agency_id:** `db2ccbc7-ca8a-491a-a9e7-febef1585de1`

## Dónde va cada cosa

| Ruta | Qué es |
|---|---|
| `clients/roberto/prompts/*.md` | **Fuente legible** de cada agente (principal, router/classifier, objeciones, formateador, etc.). Lo que se edita a mano. |
| `clients/roberto/prompts/_compiled/*.txt` | **Versión compilada** que consume el build del bot. Es lo que se carga al `bot_config` de la agency y a los nodos LLM de n8n. |
| `clients/roberto/test-prompts/vN/` | Versiones de prueba/iteración (opcional, como en Momentum). |
| `clients/roberto/architecture.md` | Arquitectura del bot de Roberto (cuántos agentes, router, modelo). |

## Cómo se usa (referencia)

El script de build lee los `_compiled/*.txt` y los sube a la DB, igual que
`crm-v2/scripts/update-momentum-bot-config.js` lee
`clients/momentum-ai-crm/prompts/_compiled/agente-principal.txt`.

## Para vos

**Pegá acá los prompts que traés del otro proyecto.** No importa si es uno solo o
el set completo (principal / router / objeciones / formateador) — los acomodo a la
estructura que corresponda según la arquitectura del bot. Con eso disparo el Carril 2
(cargar config + montar el bot en n8n + variante de prueba).
