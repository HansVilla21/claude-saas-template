# Skill: Un "Guardar" de una config jsonb que borra campos de otros writers

## Cuándo usar esta skill

- Una columna **jsonb** (`settings`, `config`, `metadata`) la escriben VARIOS: la UI de configuración + el backend/SQL + un workflow externo (n8n, edge function, cron).
- Una pantalla de settings guarda "todo el objeto" (serializa el estado del form al jsonb).
- Un campo de esa config **desaparece solo** después de que alguien abre Settings y le da Guardar — aunque no lo haya tocado.

## Por qué existe esta skill

Cuando la UI de settings **reconstruye el objeto jsonb entero** desde solo los campos que conoce (un `sanitize`/`serialize` completo) y lo escribe con un `update({ settings: nuevoObjeto })`, **borra silenciosamente todos los campos que la UI NO conoce** — los que escriben otros (SQL, un workflow, otra pantalla). No hay error: el campo simplemente ya no está en el próximo save.

Es una **bomba de tiempo**: el campo funciona hasta que alguien guarda Settings; ahí se pierde y algo se rompe "sin razón".

Caso real (Casa CRM, 2026-07-08): `agencies.settings.bot_enabled` (apagar el bot por agencia) lo escribía SQL y lo **leía el gate del workflow n8n**. Pero la pantalla de Configuración hacía `sanitizeSettings()` que reconstruía `settings` con solo los 4 campos que la UI conocía. Cualquier "Guardar cambios" —aunque no tocara el bot— **borraba `bot_enabled`** → el bot se re-activaba solo para ese negocio. Bug latente encontrado al implementar el toggle.

## Proceso

### 1. Antes de escribir un jsonb multi-owner desde la UI: mapear quién más lo toca

```bash
grep -rn "\.settings\|'settings'\|->>'campo'\|settings->" . --include=*.ts --include=*.tsx --include=*.sql --include=*.json | grep -v node_modules
```
Incluí SQL, edge functions, workflows n8n. Preguntá: ¿qué campos de este jsonb escribe/lee alguien que NO es esta UI?

### 2. Elegir una de las dos estrategias seguras

**(a) Merge (spread del valor existente):** leer el jsonb actual y hacer spread antes de escribir, así solo pisás tus campos:
```ts
const { data: cur } = await sb.from('agencies').select('settings').eq('id', id).single();
await sb.from('agencies').update({ settings: { ...cur.settings, ...misCampos } }).eq('id', id);
```
Robusto ante campos que la UI ni conoce.

**(b) Parse/sanitize COMPLETO:** que el tipo + `parse` + `sanitize` + `DEFAULT` conozcan y **preserven TODOS** los campos, incluidos los de otros writers. Agregar el campo faltante al tipo (aunque la UI no lo edite, lo preserva). Es lo que se hizo con `bot_enabled`: sumarlo a `AgencySettings`/`parseSettings`/`sanitizeSettings`/`DEFAULT_SETTINGS`.

Estrategia (b) es mejor si además querés que la UI eventualmente muestre/edite el campo; (a) si querés blindaje genérico sin enumerar todo.

### 3. Verificar que los campos ajenos sobreviven

Setear un campo por SQL, abrir Settings, apretar Guardar (sin tocarlo), y confirmar en la base que el campo **sigue ahí**.

## Output esperado

- Un save de la config UI **preserva** los campos escritos por otros (SQL, workflow, otra pantalla).
- Verificación: tras "Guardar", los campos ajenos siguen en el jsonb.

## Ejemplo concreto (Casa CRM, 2026-07-08)

- `agencies.settings.bot_enabled` lo escribía SQL, lo leía el nodo "Chatbot Activado?" del workflow n8n. `saveAgencySettings` hacía `sanitizeSettings()` (replace total) → borraba `bot_enabled` en cada save → el bot se re-activaba. Fix (estrategia b): agregar `bot_enabled` a `AgencySettings` + `parseSettings` + `sanitizeSettings` + `DEFAULT_SETTINGS`. PR #62.

## Gotchas / antipattern

- **NO** asumas que "no toqué ese campo en el form" = "no lo borro". Un save que **reconstruye el objeto entero** borra lo que no está en la reconstrucción, lo hayas tocado o no.
- **NO** escribas un jsonb multi-owner con un objeto armado solo desde el form sin merge ni parse completo.
- **NO** te olvides de los writers no-obvios: un workflow n8n o un cron SQL que lee `settings->>'x'` es un consumidor real.
- **SIEMPRE** verificá contra la base que un save de la UI no pisó campos ajenos.

## Skills relacionadas

- `umbral-compartido-cron-cliente` — misma familia: un valor consumido por dos sistemas (UI + workflow/cron) que no deben divergir.
- `fuente-unica-derivar-de-hijos` — arquitectura de datos: elegir una fuente de verdad y no duplicar/pisar.
- `verificar-funcionamiento-end-to-end` — verificar contra la base que el efecto real es el esperado.
