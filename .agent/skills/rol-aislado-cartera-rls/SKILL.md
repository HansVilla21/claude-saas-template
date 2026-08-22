# Skill: Rol aislado con cartera propia (RLS por dueño)

## Cuándo usar esta skill

- Vas a agregar a un CRM/app un **rol que ve SOLO lo suyo** (una "cartera" privada): un asesor externo, un franquiciado, un sub-cuenta, dentro de la MISMA instancia.
- El sistema ya tiene **RLS por dueño** (`owner_id`) y probablemente una **"cola compartida"** (registros sin asignar visibles para todo el equipo).
- Antes de "crear un rol más", leé esto: el peligro no es el rol, es la cola.

**Costo de no usarla:** en el CRM de Josué (JRM-57, caso Giselle) la cola abierta de una migración vieja **exponía la cartera entera** de un asesor a todo el equipo. Era el riesgo #1 (privacidad) y estaba latente en producción.

---

## El bug que SIEMPRE hay que cazar

Si existe una "cola abierta" tipo `where setter_id is null and closer_id is null` (registros que nadie trabaja → visibles para todos), esa cláusula **expone las carteras privadas**, porque un lead importado a una cartera nace **sin setter/closer** (el importador solo setea `owner_id`). Resultado: la cartera "privada" la ve todo el equipo — lo contrario de lo pedido.

## Proceso

1. **La cartera se DERIVA, no se agrega una columna.** Es `owner_id` + el rol del dueño. El "tipo de producto del cliente" ya suele existir (`product_id`). No inventes tablas nuevas.
2. **Helper SQL** `es_<rol>(pid uuid)` → `security definer`, `search_path=''`, lee `profiles` sin recursar (mismo patrón que `is_admin()`).
3. **Reescribí la policy de SELECT** de la tabla: la cláusula de cola abierta suma dos condiciones —
   ```
   or (setter_id is null and closer_id is null
       and not public.es_<rol>(owner_id)              -- la cola NO expone carteras privadas
       and not public.es_<rol>(public.mi_profile_id())) -- el rol aislado NO ve la cola
   ```
4. **Aplicá el MISMO fix a la policy de UPDATE** (no solo SELECT): si la cola vive también en el UPDATE, otro usuario podría *tomar* por UPDATE directo un registro de una cartera ajena. `using` y `with check`.
5. **El rol nuevo va en TODOS los lugares que enumeran roles**: el `check` constraint, el union de tipos, labels, la matriz de permisos, el nav (`SECTION_ROLES`), los gates de página, el form de alta. El **typecheck caza los `Record<Role>` exhaustivos** — corré `tsc` y seguí los errores.
6. **Gate defensivo de pantallas de agregados:** el rol aislado NO debe ver el dashboard del negocio aunque respete RLS, si esa pantalla incluye **widgets de otra fuente con RLS abierta** (ej. una integración de LinkedIn/ads que todos leen). Redirigí ese rol a su pantalla de trabajo.
7. **Reasignar dueño (admin):** una acción de lote que setea `owner_id`. Solo admin (`ve_todo` pasa la RLS).

## Gotchas

| Gotcha | Fix |
|---|---|
| El cliente dice "que sea como asistente/mano derecha" | ❌ NO. Un rol que "ve todo" (`ve_todo()`) rompe el aislamiento. Va como rol NUEVO que ve solo lo suyo. |
| Cola abierta solo parcheada en SELECT | También en UPDATE (using + with check), o se toma por PATCH directo. |
| El rol aislado ve la cola compartida | La cláusula de cola debe excluir al espectador aislado (`not es_<rol>(mi_profile_id())`). |
| Falta el rol en un `Record<Role>` | El build falla — es la red. Corré `tsc --noEmit`. |

## Output esperado

- Migración: `check` constraint ampliado + helper `es_<rol>` + policies SELECT/UPDATE reescritas.
- Rol enchufado en tipos/labels/nav/gates/form.
- Acción admin de reasignar dueño.
- **Prueba de RLS en transacción con ROLLBACK** (no toca prod): dos usuarios del rol A y B → A no ve la cartera de B, el equipo no ve carteras privadas, admin ve todo. Verde antes de declarar listo.

## Ejemplo

**Input:** "quiero que Giselle, una asesora, traiga su cartera y sea solo de ella; habrá varios asesores así."

**Output:** rol `asesor` (6º rol), helper `es_asesor()`, cola abierta que excluye carteras de asesores y no se muestra a un asesor, reasignación en lote para el admin, rótulo "Mi cartera", y `test:rls` de 20 aserciones en verde (aislamiento entre dos asesores probado).

## Relacionado

- [[datos-reales-vs-seed-demo]] — no sembrar, derivar de la fuente.
- El importador ya asigna `owner_id = quien importa`, así que la cartera cae sola en el espacio privado.
