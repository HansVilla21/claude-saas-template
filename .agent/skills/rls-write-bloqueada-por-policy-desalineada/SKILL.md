# Skill: RLS que bloquea escrituras de un rol (WITH CHECK desalineado + triggers que propagan RLS)

## Cuándo usar esta skill

- Un usuario con un rol NO-privilegiado (ej. `agent`) no puede **guardar** algo (cambiar un estado, enviar un mensaje, editar un campo) y **no aparece ningún error** — el cambio "no toma" o el elemento vuelve solo.
- A **owner/admin/master les funciona** lo mismo que a los agentes NO. (Señal fortísima de RLS por rol.)
- Dos síntomas distintos ("no cambia la etapa" + "no envía mensajes") resultan ser **la misma** policy rota.
- Acabás de mover una "fuente de verdad" de una tabla a otra (ej. la asignación de `leads.assigned_user_id` → `conversations.assigned_user_id`) y algo empezó a fallar para ciertos roles.
- Ves un error Postgres `42501: new row violates row-level security policy for table "X"` — a veces apuntando a una tabla que NO es la que estabas escribiendo.
- **Un update que cambia un campo a un valor que ese rol NO puede VER falla, pero a `null` o al propio usuario funciona.** Ej.: un agente reasigna su conversación a OTRO agente → `42501`; a "sin asignar" (`null`) → OK. Señal de la interacción **SELECT-policy ↔ UPDATE** (causa 3).

## Por qué existe esta skill

El incidente Givi (2026-07-08): un equipo entero de `agent`s no podía enviar mensajes ni cambiar etapas. Cero errores visibles. Dos causas que en realidad eran **una sola policy mal configurada**, y dos trampas que las hacían invisibles:

1. **`WITH CHECK` divergido del `USING` en la misma policy.** En una policy de `UPDATE`, `USING` decide **qué filas podés tocar** (visibilidad) y `WITH CHECK` valida **el estado final de la fila**. Son cláusulas separadas y es facilísimo actualizar una y olvidar la otra. Cuando una migración movió la asignación de `leads.assigned_user_id` (viejo) a `conversations.assigned_user_id` (nuevo), el `USING` se actualizó para mirar la conversación pero el `WITH CHECK` siguió exigiendo `leads.assigned_user_id = auth.uid()` — columna que ahora es **siempre NULL** → `WITH CHECK` **insatisfacible** para agentes → `42501`.

2. **Un trigger `SECURITY INVOKER` que escribe OTRA tabla propaga el fallo de RLS.** Insertar en `messages` disparaba `denorm_conversation_on_message` (trigger normal = corre con los permisos del usuario), que hacía `UPDATE leads SET last_message_at=...`. Ese UPDATE chocaba contra la MISMA policy rota → `42501` **abortaba el INSERT de messages entero**. Por eso "no puedo enviar mensajes" era en realidad "el trigger no puede tocar leads". El `CONTEXT:` del error 42501 lo delata (nombra la tabla real + la función del trigger).

3. **La SELECT policy bloquea el UPDATE aunque el WITH CHECK pase (incidente Givi reasignación, 2026-07-09).** En un UPDATE, Postgres exige que la fila NUEVA quede **visible bajo la SELECT policy** del usuario; si no, tira `42501` sobre esa tabla — aunque el `WITH CHECK` del UPDATE pase. Caso: la SELECT policy del agente solo lo deja ver conversaciones propias o del pool (`assigned_user_id = auth.uid() OR null`). Al reasignar su conversación a OTRO agente, la fila nueva (`assigned = otro`) deja de serle visible → `42501`. Reasignar a `null` (sí visible) o a sí mismo (sí visible) funciona → **ese contraste es la firma del problema**. Acá **relajar el WITH CHECK NO alcanza** (el bloqueo viene de la SELECT policy), y **aflojar la SELECT policy rompería el modelo de visibilidad** ("el agente solo ve lo suyo"). La salida correcta es **no hacer la escritura client-side**: moverla a un **server action con chequeo de permiso + admin client (service_role, bypasea RLS)** — la operación es legítima, solo que la RLS por-fila la hace imposible desde el cliente. Patrón: `claimUnassignedConversation` / `reassignConversation` / `reassignContact` en el inbox.

Las dos trampas que lo hacen invisible:
- **La escritura es client-side y el error se traga.** El patrón "optimista + `if (error) revert; return;`" (sin toast) hace que el chip vuelva a su valor y el mensaje desaparezca **sin decir nada**. Para el usuario "no funciona y no sé por qué".
- **owner/admin/master lo enmascaran.** Como su rama del `OR` de la policy pasa siempre, quien prueba con una cuenta privilegiada (casi siempre el que desarrolla) nunca lo ve. Se destapa recién con un cliente de puros agentes.

## Proceso

### 1. Confirmar que es RLS-por-rol (no otra cosa)

- ¿Le funciona a owner/admin y NO a agent/viewer? → casi seguro RLS.
- Mirá la evidencia en la base: si la acción "no deja rastro" (ni una fila fallida, ni un error en logs de la app), la escritura se bloqueó **antes** de persistir. Ej.: 0 mensajes salientes pero tampoco filas `status='failed'` → nunca se insertó → RLS.

### 2. Reproducir bajo el ROL REAL del usuario (en transacción que revertís)

No adivines: ejecutá la escritura EXACTA con el contexto RLS del usuario afectado, y `rollback` para no mutar prod.

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<user_uuid_del_agente>","role":"authenticated"}';
-- la escritura real:
update <tabla> set <col> = <val> where id = '<row>';   -- o el insert real
rollback;
```
Interpretación:
- `ERROR: 42501 ... violates row-level security policy for table "X"` → **WITH CHECK / INSERT** bloqueado. Leé el `CONTEXT:` — si nombra otra tabla + una función `*_trigger`/`denorm_*`, el culpable es un **trigger que escribe esa otra tabla** (ver paso 4).
- `UPDATE 0` (0 filas, sin error) → el `USING` no matchea ninguna fila (bloqueo silencioso de UPDATE/DELETE). En la app esto se ve idéntico a "no guardó".
- **Si el mismo UPDATE a `null`/al propio usuario PASA pero a OTRO valor da 42501** → es la **SELECT policy** (causa 3): la fila nueva no queda visible para el rol. Probá las tres variantes (a self, a null, a otro) para confirmar. Aquí NO sirve tocar el WITH CHECK; ver paso 5b.

### 3. Leer las cláusulas de la policy y comparar USING vs WITH CHECK

```sql
select polname, polcmd,
       pg_get_expr(polqual, polrelid)      as using_expr,
       pg_get_expr(polwithcheck, polrelid) as check_expr
from pg_policy where polrelid = 'public.<tabla>'::regclass order by polcmd;
```
Antipattern a cazar: para el rol afectado, `using_expr` contempla la fuente de verdad NUEVA (ej. un `EXISTS` contra la tabla hija) pero `check_expr` sigue mirando la columna VIEJA. Esa asimetría es el bug.

### 4. Si el error apunta a una tabla que no tocaste: buscar el trigger

```sql
select tgname, p.proname, p.prosecdef as security_definer, pg_get_functiondef(p.oid)
from pg_trigger t join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.<tabla_que_insertaste>'::regclass and not t.tgisinternal;
```
- Un trigger de **denormalización** (mantiene `last_message_at`, contadores, previews) que es `SECURITY INVOKER` (prosecdef=false) y hace `UPDATE otra_tabla` corre con RLS del usuario → puede abortar tu insert.
- Decisión de diseño: los triggers que solo mantienen **campos derivados de sistema** (no contenido del usuario) idealmente son `SECURITY DEFINER` (con `set search_path`), porque no es "el usuario editando" sino "el sistema refrescando un cache". Pero ver paso 5 — a veces alcanza con arreglar la policy.

### 5. Arreglar quirúrgico: alinear WITH CHECK con USING

La corrección más segura y de menor blast-radius: hacer que el `WITH CHECK` del rol **espeje exactamente** su `USING` (no inventar semántica nueva). Migración idempotente:

```sql
drop policy if exists <tabla>_update on public.<tabla>;
create policy <tabla>_update on public.<tabla> for update
  using ( <expr> )
  with check ( <la MISMA expr> );   -- ← antes divergía
```
- Si el `USING` ya permite al rol vía la tabla hija (conversación asignada), el `WITH CHECK` igualado **también** deja pasar el UPDATE del trigger `SECURITY INVOKER` → arregla los DOS síntomas de una.
- Sólo tocá `SECURITY DEFINER` en el trigger si querés blindaje extra o si hay caminos donde el usuario legítimamente NO "posee" la fila hija pero el sistema igual debe denormalizar.

### 5b. Si el bloqueo es la SELECT policy (causa 3): server action, NO más RLS

Cuando la operación es **legítima** pero deja la fila fuera de la visibilidad del rol (ej. reasignar a otro), no pelees con la RLS por-fila:
- **NO** aflojes la SELECT policy para que el rol vea más — rompe el modelo de visibilidad ("el agente solo ve lo suyo").
- **NO** relajes el WITH CHECK — no es lo que bloquea.
- **SÍ** mové esa escritura a un **server action** (o RPC `SECURITY DEFINER`) que: (1) chequea el permiso en código (¿el agent posee la fila / es del pool? ¿el destino es miembro?), (2) escribe con **admin client / service_role** (bypasea RLS). Es el patrón de `claimUnassignedConversation` / `reassignConversation`. El write client-side sigue existiendo para lo que SÍ permite la RLS; solo el caso "fuera de visibilidad" pasa por el server action.

### 6. Verificar adversarialmente: positivo Y negativo

Bajo el rol real (paso 2), en transacciones que revertís:
- [ ] **Positivo:** el agente afectado AHORA puede hacer la escritura (UPDATE devuelve 1 fila / el INSERT no tira 42501).
- [ ] **Negativo (no te pasaste de abierto):** un agente que NO debería (ej. una conversación asignada a OTRO) SIGUE bloqueado (42501 / 0 filas). Si el negativo también pasa, abriste un hueco.

### 7. Aplicar + versionar + verificar en prod

- Aplicá como migración `00NN_*.sql`, **versionala en el repo** aunque la corras a mano (si no, drift DB↔repo).
- Re-corré la reproducción del paso 2 contra prod: positivo pasa, negativo sigue bloqueado.

## Prevención (lo que evita que vuelva a pasar)

- **Al mover una "fuente de verdad" de una tabla/columna a otra** (refactor tipo "el encargado ahora vive en la conversación, no en el lead"): grepeá TODA policy que referencie la columna vieja y actualizá `USING` **y** `WITH CHECK` juntos. Y revisá triggers `SECURITY INVOKER` que escriban esa tabla.
- **Regla de policies:** salvo intención explícita, `WITH CHECK` debe ser igual (o un subconjunto coherente) del `USING`. Un `WITH CHECK` más estricto que el `USING` = filas que podés targetear pero no podés dejar en un estado válido = bloqueo silencioso.
- **En el cliente, NO te tragues el error de escritura.** El patrón optimista debe **mostrar** el fallo (toast / burbuja "no enviado"), no solo revertir en silencio. Un error de RLS invisible cuesta horas de diagnóstico.
- **Probá SIEMPRE con una cuenta del rol MÁS restrictivo real** (agent/viewer), no solo con owner/admin/master — que enmascaran todos los bugs de permisos.

## Output esperado

1. Diagnóstico con la causa raíz nombrada (qué policy, qué cláusula divergía, si hay trigger propagando).
2. Reproducción bajo el rol real ANTES (falla) y DESPUÉS (pasa) + prueba negativa (sigue bloqueado quien no debe).
3. Migración idempotente versionada que alinea `WITH CHECK` con `USING` (y/o el fix del trigger).
4. Verificación en prod.

## Ejemplo concreto (Casa CRM — incidente Givi, 2026-07-08)

- **Síntomas:** los `agent`s de Givi (negocio sin bot, equipo 100% agentes) no cambiaban etapa ni enviaban mensajes. Sin error visible. A Hans (admin) le funcionaba.
- **Causa raíz única:** `leads_update` (migración 0019) tenía el `WITH CHECK` exigiendo `leads.assigned_user_id = auth.uid()`. La Misión 6 movió la asignación a `conversations.assigned_user_id` → `leads.assigned_user_id` quedó NULL → `WITH CHECK` insatisfacible para agentes. (1) Cambio de etapa = UPDATE directo → 42501. (2) Envío de mensaje = INSERT en `messages` dispara el trigger `denorm_conversation_on_message` (SECURITY INVOKER) que hace `UPDATE leads` → mismo 42501 → aborta el insert.
- **Reproducción** (bajo el JWT real de la agente Tania): stage UPDATE → 42501; message INSERT → 42501 con `CONTEXT: ... denorm_conversation_on_message() ... update public.leads`.
- **Fix:** migración **0029** — el `WITH CHECK` del agent pasa a espejar su `USING` (permite si el lead tiene una conversación asignada a `auth.uid()`). Verificado: positivo (Tania OK en su conv) + negativo (Tania sigue bloqueada en la conv de otra agente).
- Migración: `crm-v2/supabase/migrations/0029_leads_update_check_conversation_assignment.sql`. PR #63.

## Gotchas / antipattern

- **NO** asumas que `USING` y `WITH CHECK` son lo mismo. En UPDATE son dos cláusulas: `USING` = qué filas alcanzás; `WITH CHECK` = validación del estado final. Un fix que sólo toca una deja el bug a medias.
- **NO** leas el `42501` sólo por la tabla del mensaje principal. El `CONTEXT:` puede revelar que el culpable es un **trigger** escribiendo OTRA tabla.
- **NO** diagnostiques con owner/admin/master: bypasean o pasan la rama privilegiada del OR y esconden el bug. Reproducí con el rol restrictivo real.
- **NO** dejes que el cliente se trague el error de escritura (optimista + revert en silencio). Mostralo, o vas a debuggear a ciegas.
- **NO** muevas una fuente de verdad entre tablas sin auditar todas las policies (USING **y** WITH CHECK) y los triggers `SECURITY INVOKER` que tocan la tabla.
- **SIEMPRE** verificá el negativo además del positivo: que el fix no abrió acceso a quien no debe.

## Skills relacionadas

- `habilitar-rls-tabla-expuesta` — el otro lado del mismo tema (prender RLS sin romper el backend; roles que bypasean).
- `fuente-unica-derivar-de-hijos` — el refactor "el dato vive en la tabla hija" que, mal propagado a las policies, causa justo este bug.
- `verificar-funcionamiento-end-to-end` — verificar contra la base bajo el rol real antes de decir "arreglado".
