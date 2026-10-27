# Skill: Historial de cambios con triggers — "¿cómo llegó este registro a como está?"

El pedido (2026-09-25, un cliente del CRM): *"cuando un contacto termina en un estado
raro, nadie puede reconstruir cómo llegó ahí"*. El sistema guardaba solo el ÚLTIMO
cambio: quién puso el estado y cuándo. Cada cambio pisaba al anterior.

Parece una tabla de log y un INSERT en el botón de guardar. No lo es: el estado lo
cambiaban **seis caminos** (la ficha, el chat, las acciones en lote, el bot, las
automatizaciones, el borrado de un estado que reasigna los contactos) y las
etiquetas, **cuatro**. Un historial que se escribe desde cada pantalla tiene huecos
desde el primer día, y cada camino nuevo que alguien agregue los amplía en silencio.

## Cuándo usar esta skill

- Alguien pide "historial", "quién cambió esto", "cómo llegó a este estado",
  "auditoría" de un campo o de una relación (estado, etiquetas, asignado, precio).
- Ya existe un "último cambio" (`*_set_by/_at`) y hace falta la secuencia.
- Hay una tabla `audit_log` genérica que nadie llena. Medido: 1 fila en toda la
  base. No la resucites; ver el paso 1.

## Proceso

### 1. Contar los caminos antes de diseñar

`grep` de cada UPDATE de la columna y cada INSERT/DELETE de la tabla de relación:
el navegador, las server actions con admin client, las Edge Functions, los crons,
las RPC. Si son más de dos, **va por trigger**. Anotá cada camino con cómo firma hoy,
porque es el insumo del paso 3.

Tabla propia y no `audit_log` genérica: una fila con `antes_nombre` y
`despues_nombre` se lee directo; un jsonb `before/after` hay que interpretarlo en
cada pantalla.

### 2. La tabla

```sql
create table public.lead_historial (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  tipo text not null check (tipo in ('estado', 'etiqueta')),
  accion text not null check (accion in ('inicial', 'cambio', 'agregada', 'quitada')),
  antes_id uuid,   antes_nombre text,     -- el NOMBRE como era en ese momento
  despues_id uuid, despues_nombre text,
  actor_kind text not null check (actor_kind in ('human', 'bot', 'sistema')),
  actor_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.lead_historial (lead_id, created_at desc);
```

**Los nombres se guardan, no solo los ids.** Si el estado "Calificado" después se
renombra o se borra, el historial tiene que seguir diciendo lo que pasó.

### 3. Quién fue: la sesión manda, el navegador no firma

```sql
if auth.uid() is not null then            -- hay sesión: es esa persona, diga lo que diga la fila
  v_kind := 'human'; v_user := auth.uid();
elsif tg_op = 'UPDATE'
  and new.stage_set_at is distinct from old.stage_set_at   -- el MISMO update trae procedencia
  and new.stage_set_by in ('bot', 'human') then
  v_kind := new.stage_set_by; v_user := new.stage_set_by_user;
else
  v_kind := 'sistema'; v_user := null;     -- automatización, reasignación, import
end if;
```

- Con sesión, **nunca** se cree a la columna de procedencia: el navegador la manda y
  la policy no la restringe, así que un usuario podría firmar "Chatbot" o a un
  compañero. Eso es justo el "yo no fui" que el historial viene a resolver.
- Sin sesión (service role), la procedencia solo vale si **ese mismo UPDATE** la
  escribió (`stage_set_at` cambió). Si no, la que está es vieja, de otro cambio.
- **Un DELETE sin sesión no dice quién fue.** Queda "sistema", y el camino que sí
  sabe quién fue (una acción en lote con admin client) lo **corrige él mismo**
  justo después, acotado: esos registros, ese valor, `actor_kind = 'sistema'` y
  `created_at >= ahora - 1 minuto` (el margen es porque el reloj del servidor y el
  de la base no son el mismo).

### 4. El trigger nunca rompe la escritura

```sql
create trigger trg_historial_estado_upd
after update of stage_id on public.leads
for each row when (old.stage_id is distinct from new.stage_id)   -- un UPDATE que no cambia nada no deja fila
execute function public.tg_historial_estado();
```

- `SECURITY DEFINER` + `set search_path = public, pg_temp` + `revoke execute ... from
  public, anon, authenticated`.
- El INSERT va adentro de `begin ... exception when others then raise warning ...;
  end;`. **Perder una línea de historial es mejor que un "no se pudo guardar"** en
  la cara del usuario o del bot.
- En el trigger de la relación (`tag_assignments`), si el padre ya no existe se
  sale: un DELETE en cascada del contacto violaría la FK del historial.
- Un trigger `AFTER INSERT` para el estado inicial ("Entró como Nuevo") cierra la
  secuencia desde el principio.

### 5. Quién lo ve: el mismo que ve el registro

```sql
create policy lead_historial_select on public.lead_historial for select using (
  is_master() or (is_member_of(agency_id)
    and exists (select 1 from public.leads l where l.id = lead_historial.lead_id)));
```

El `exists` corre con la RLS de quien pregunta: un rol con cartera propia ve el
historial solo de los registros que ve. **Sin policies de escritura:** solo escriben
los triggers.

### 6. Probarlo contra la base viva con el bloque que siempre aborta

DDL + casos dentro de un `DO` que termina en `raise exception 'REPORTE: %'`. Los que
tienen que estar:

| Caso | Esperado |
|---|---|
| service role con procedencia `bot` en el mismo UPDATE | `bot` |
| service role sin procedencia | `sistema`, con nombres |
| UPDATE que no cambia el valor | ninguna fila |
| con sesión, intentando firmar como `bot` | `human`, la persona de la sesión |
| agregar y quitar la relación | `agregada` / `quitada`, con nombre |
| rol que NO ve el registro | 0 filas |
| **control positivo:** se le asigna el registro | ahora sí las ve |
| ese rol intenta escribir a mano | 42501 |

Después, verificar que la tabla y los triggers **no** existen en producción.

### 7. En pantalla

- Un evento por fila: "Pasó de X a Y · Por Ana", "Se agregó la etiqueta Z · Por el
  bot", "Entró como Nuevo · Automático".
- Si había un evento derivado del "último cambio", **se apaga cuando hay
  historial**: si no, el último cambio aparece dos veces. Queda para los registros
  cuyo último cambio es anterior al historial.
- Techo en la lectura (200 por registro), con el porqué en un comentario.
- **Avisar que arranca vacío:** lo anterior no se puede reconstruir, y quien abra un
  registro viejo va a creer que está roto. Se dice en el anuncio del cambio y en
  capacitación.

## Output esperado

- La migración (tabla, índice, RLS, dos funciones de trigger, tres triggers)
  probada con el bloque que siempre aborta, más la verificación de que producción
  quedó intacta.
- La corrección de firma en cada camino sin sesión que sí sabe quién fue.
- El timeline con los eventos nuevos, sin duplicar el "último cambio", con techo.
- Un ticket de verificación con tráfico real para las primeras filas `bot` y
  `sistema`, porque a la hora del deploy puede no haber tráfico.

## Ejemplo

**Input:** "Quiero ver en Actividad cómo se fue moviendo el estado y las etiquetas de
un contacto."

**Output:**
1. **Caminos contados:** 6 que cambian el estado y 4 que cambian las etiquetas → va
   por trigger.
2. **`lead_historial`** con los nombres de ese momento.
3. **Firma:** la sesión manda; sin sesión, la procedencia del mismo UPDATE; si no
   hay, "sistema". El lote firma sus quitadas.
4. **El bloque que siempre aborta:** 10/10 y producción intacta.
5. **En pantalla:** "Se agregó la etiqueta Acuario · Por vos". El anuncio aclara que
   se registra desde hoy.
