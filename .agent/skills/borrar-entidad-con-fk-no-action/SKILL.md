# Skill: Borrar una entidad con FKs `NO ACTION` (el borrado que nunca se implementó)

## Cuándo usar esta skill

- El cliente pide **borrar** algo que ya tiene historia: un cliente con contratos, un producto con
  ventas, un proyecto con tareas.
- Falla con `23503 update or delete violates foreign key constraint` y la tabla que nombra el
  error **no es la que estabas borrando**.
- Descubrís que **no existe** el borrado de la entidad intermedia, así que la de arriba queda
  trabada para siempre.
- Vas a diseñar el esquema y estás por dejar las FK en su default sin pensarlo.

**Costo de no usarla:** en Grandir CRM no se podía borrar un inversionista porque tenía contratos,
y **el borrado de contratos no existía**. Un registro cargado por error quedaba en el sistema para
siempre. El cliente lo vivía como "el sistema no deja borrar nada".

---

## Por qué existe esta skill

**El default de Postgres para una FK es `NO ACTION`**, o sea: *bloquear*. Es el default correcto
—protege los datos— y también el que hace que "agregar el botón de borrar" no sea agregar un
botón.

Cuando borrás una entidad con historia, sus dependientes caen en tres grupos, y **cada uno pide
algo distinto**:

| FK | Qué pasa | Qué tenés que hacer |
|---|---|---|
| `ON DELETE CASCADE` | se borra sola | nada — pero **saber cuál cae**, porque puede llevarse historial que querías conservar |
| `ON DELETE SET NULL` | queda huérfana con `null` | nada, si el `null` tiene sentido |
| `NO ACTION` (default) | **bloquea** | borrarla vos, **antes**, en el orden correcto |

Y hay un cuarto caso que es el que muerde: **dependientes de segundo nivel**. Una tabla puede
apuntar a una fila que va a caer por CASCADE. Si la borrás después, ya no existe a qué apuntar; si
la borrás antes, funciona. **El orden importa y no es obvio leyendo el esquema.**

> La contracara: `ON DELETE CASCADE` en una tabla de eventos o de auditoría convierte el botón de
> "quitar" en un borrado de historial. Elegir CASCADE es una decisión de producto, no un default.

---

## Proceso

### 1. Mapear las FK reales antes de escribir el borrado

No de memoria, contra la base:

```sql
select
  tc.table_name    as tabla_dependiente,
  kcu.column_name  as columna,
  rc.delete_rule   as al_borrar
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
where tc.constraint_type = 'FOREIGN KEY' and ccu.table_name = 'contratos'
order by rc.delete_rule, tc.table_name;
```

Eso te da la lista completa, agrupada por regla. Las `NO ACTION` son tu trabajo.

### 2. Escribir el orden, de las hojas hacia la raíz

```
borrar contrato:
  1. contract_documents      ← NO ACTION, y además apunta a contract_investors,
                                que va a caer por CASCADE → tiene que ir PRIMERO
  2. payments                ← NO ACTION
  3. reports                 ← NO ACTION
  4. notifications           ← NO ACTION
  5. referral_commissions    ← NO ACTION
  6. el contrato             → contract_investors, contract_beneficiaries,
                                verification_codes caen solas (CASCADE)
```

El paso 1 es el que se descubre a los golpes: `contract_documents` referencia
`contract_investors`, que muere por cascade con el contrato. Borrarlo después del contrato ya no
es posible.

### 3. Probar el orden contra datos reales, sin persistir

Antes de escribir el endpoint, verificá el orden contra la base **de verdad**, con una transacción
que siempre aborta:

```sql
BEGIN;
  delete from contract_documents    where contract_id = '<uuid real>';
  delete from payments              where contract_id = '<uuid real>';
  delete from reports               where contract_id = '<uuid real>';
  delete from notifications         where contract_id = '<uuid real>';
  delete from referral_commissions  where contract_id = '<uuid real>';
  delete from contratos             where id = '<uuid real>';
ROLLBACK;   -- ← nunca falta
```

Si pasa sin `23503`, el orden es correcto. Si falla, el error **te dice exactamente** qué tabla
falta y dónde va. Es la forma más barata de encontrar el orden: la base te lo dicta.

### 4. Decidir qué NO se borra en cascada, a propósito

Antes de poner `CASCADE` en una migración nueva, preguntá si esa tabla es **historia**. Eventos de
integración, auditoría de firmas, log de pagos: eso normalmente **no** debería desaparecer porque
alguien tocó "quitar". Si la relación tiene que romperse, `SET NULL` conserva el hecho.

### 5. Bloquear a propósito lo que debe bloquearse

No todo dependiente se borra en silencio. En Grandir, borrar un **inversionista** se bloquea si
todavía tiene contratos: el usuario borra los contratos primero, conscientemente. Es un modelo
controlado, y el mensaje lo dice:

> *"Este inversionista tiene 2 contratos. Borrá los contratos primero."*

Un borrado en cascada silencioso de algo que representa plata es peor que un bloqueo explicado.

### 6. Envolver todo en una transacción y verificar

El borrado real va en una transacción (o una función `security definer`): si falla el paso 4, no
pueden haber quedado borrados los pasos 1 a 3. Después, verificá contra la base que no quedaron
huérfanos.

---

## Output esperado

- El mapa de FK de la entidad, sacado del esquema y no de memoria.
- Un orden de borrado escrito, con las de segundo nivel primero.
- El orden **probado con `BEGIN; … ROLLBACK;`** contra datos reales.
- Las que deben bloquear, bloqueando con un mensaje que diga qué hacer.
- Todo el borrado en una transacción.

---

## Gotchas / antipatrones

- 🔴 **Poner `CASCADE` en todo para que el error desaparezca.** Es cómo se borra un historial de
  auditoría sin que nadie se entere.
- 🔴 **Probar el borrado en producción sin transacción.** `BEGIN … ROLLBACK` cuesta lo mismo.
- 🔴 **Dejar la entidad de arriba sin borrado.** Si no se puede borrar un contrato, el
  inversionista queda trabado para siempre — el bug se presenta como "no deja borrar clientes".
- ⚠️ **Dependientes de segundo nivel.** Una tabla que apunta a algo que va a caer por CASCADE
  tiene que borrarse **antes** que la raíz.
- ⚠️ **Leer el `delete_rule` del código o de la migración original.** Alguien pudo alterarla
  después. Se lee del esquema vivo.
- ⚠️ **Borrar filas y olvidar los archivos.** Si la entidad tenía documentos en storage, se
  limpian aparte; las FK no saben de buckets.

---

## Ejemplo concreto (Grandir CRM, 2026-06-30)

**Síntoma:** *"no me deja borrar un inversionista"*. Causa: tenía contratos, y **el borrado de
contratos no existía**.

**Lo que apareció al mapear las FK del contrato:** `contract_investors`,
`contract_beneficiaries` y `verification_codes` caían por CASCADE; pero `payments`, `reports`,
`contract_documents`, `notifications` y `referral_commissions` eran **NO ACTION**. Y
`contract_documents.uploaded_by_portal` referencia `contract_investors.id` — que muere con el
contrato — así que tenía que borrarse **antes que todo lo demás**.

Del lado del inversionista: `investor_emails` por CASCADE, `referrer_id` de otros a `SET NULL`, y
`notifications` / `bulletin_recipients` / `referral_commissions` en NO ACTION. El endpoint
**bloquea** si todavía tiene contratos.

**Método:** el orden se validó con la Management API usando `BEGIN; …deletes…; ROLLBACK;` contra
datos reales, sin persistir nada. Commit `27bb97a`.

---

## Skills relacionadas

- `probar-migracion-contra-base-viva-con-rollback` — el mismo método (`BEGIN … ROLLBACK`) aplicado
  a migraciones.
- `fathom-transcripciones-al-crm` — el caso opuesto: un `ON DELETE CASCADE` mal puesto que
  convierte "quitar" en borrar el historial entero.
- `soft-delete-bloqueado-por-rls` — cuando lo correcto no es borrar sino archivar.
- `acciones-en-lote-seguras` — borrar muchos a la vez sin mentir sobre qué se tocó.
