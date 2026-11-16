# Skill: Historial de importaciones con deshacer preciso

> Continúa `importacion-con-lote-deshacible`, que pone el `import_batch_id` y deshace el último
> lote. Esta es la parte siguiente: el historial de todas, y deshacer cualquiera sin dejar ni
> pisar datos.

## Cuándo usar esta skill

- Un CRM o SaaS importa contactos desde Excel/CSV y el cliente pide **«control Z»**: ver qué se importó y deshacer una importación que salió mal.
- La importación tiene una opción de **«completar existentes»** (rellenar lo vacío de contactos que ya estaban). Es la parte difícil: deshacerla bien exige saber qué casilla rellenó cada lote.
- Ya existe un «deshacer la última» y hay que llevarlo a «deshacer cualquiera».

**Por qué existe.** En el CRM de Josué (JRM-82, 25/10/2026) solo se podía deshacer la última importación, y solo los leads que creó: lo que «completar» había rellenado en contactos existentes se quedaba. Josué lo dijo así: «importé 1.500 contactos y vienen sin correo, y no le puedo dar control Z». No sabía si reimportar sobrescribía lo que ya tenía. El Momentum CRM tampoco tiene historial: no había precedente que copiar.

---

## Proceso

### 1. El lote se registra ANTES de escribir, y no se le cree al navegador
Una importación grande se sube en bloques con el mismo id de lote (lo genera el navegador para que un reintento no duplique). Una tabla `import_batches` guarda **solo lo que no se puede derivar**: id (= `leads.import_batch_id`), archivo, política de repetidos, filas del archivo, quién, cuándo, `undone_at`/`undone_by`.

- Primer bloque: `insert`.
- Si ya existe (código `23505`): aceptarlo **solo** si es de quien importa, es reciente (unas horas) y no se deshizo.
- **Trampa:** con un `upsert ... ignoreDuplicates`, cualquier sesión puede colgar sus leads del lote de otro (el id se ve en la UI), y un admin que lo deshaga los manda a la papelera sin saberlo. Lo encontró la revisión del Mentor.
- **No guardar conteos:** creados, en papelera y completados se cuentan en vivo desde los leads y los cambios. Un conteo guardado se desfasa con el primer borrado o restauración.

### 2. «Completar» devuelve lo que cambió DE VERDAD
`coalesce` no pisa, pero tampoco dice qué escribió. La función que completa devuelve `(lead_id, field, value)` solo para las casillas que pasaron de vacías a llenas.

En Postgres 17 o anterior no hay `RETURNING OLD`: se leen los valores de antes con la fila **bloqueada**, en la misma sentencia.

```sql
with data as (...),
antes as (                       -- bloqueadas: lo que se lee es lo que el UPDATE encuentra
  select l.id, l.email, l.phone from public.leads l join data d on d.id = l.id
   where l.deleted_at is null for update of l
),
upd as (
  update public.leads l set email = coalesce(l.email, d.email), phone = coalesce(l.phone, d.phone)
    from antes a join data d on d.id = a.id
   where l.id = a.id and ((a.email is null and d.email is not null) or (a.phone is null and d.phone is not null))
  returning l.id, l.email, l.phone
)
select u.id, c.field, c.value from upd u join antes a on a.id = u.id
 cross join lateral (values ('email', case when a.email is null then u.email end),
                            ('phone', case when a.phone is null then u.phone end)) c(field, value)
 where c.value is not null;
```

- Esta función es `security invoker`: decide la RLS de quien importa. `grant` a `authenticated` y `revoke` a `public` y `anon`.
- Los cambios se guardan en `import_batch_changes (batch_id, lead_id, field, value, reverted_at)`. Si eso va en otra llamada, **reintentar**: lo completado ya quedó escrito y, sin el registro, deshacer no lo ve.

### 3. Deshacer en UNA transacción, y nunca dos veces lo mismo
Una función solo para `service_role`, llamada después de `requireAdmin()`:

1. **Los leads que creó, a la papelera** (borrado suave, recuperables).
2. **Lo completado vuelve a vacío** solo si todavía tiene el valor que puso (`and l.email = c.value`) **y** no se revirtió antes (`c.reverted_at is null`). Después se marcan todos sus cambios con `reverted_at = now()`.
3. **Se borran las notas que dejó en contactos que ya existían.** Las de los leads que creó se quedan con ellos: si se restauran, vuelven enteros.
4. Se marca el lote con `undone_at` y `undone_by`.

**El caso que mata el `reverted_at`** (revisión del Mentor):
1. El lote A completa `email = X`.
2. Se deshace A y el correo queda vacío.
3. El lote B vuelve a poner X (reimportar es justo el camino para recuperar datos).
4. Alguien restaura leads de A desde la papelera y vuelve a deshacer A.

Sin `reverted_at`, el paso 2 encuentra `email = X` y **vacía el correo de B**.

### 4. Lotes huérfanos y lotes viejos
- **Huérfanos:** desde que se aplica la migración hasta el deploy, el código viejo sigue importando sin fila en el historial. La lista se arma con `union` desde los leads, y deshacer crea la fila mínima (id + fecha). El backfill solo no alcanza: corre una vez.
- **Viejos (de antes del historial):** no tienen archivo ni política, y sus leads se vienen trabajando hace meses. Hans decidió un **aviso fuerte**: para deshacer hay que escribir la cantidad de leads. El panel dice además **cuántos ya se trabajaron** (actividad, citas, cierres, notas que no vinieron del archivo). Se van a la papelera igual, con su historial.

### 5. La pregunta de repetidos, con los números del archivo
Un desplegable con «Omitir / Completar / Importar igual» no le responde al cliente su duda real: «¿esto pisa lo que tengo?». Para resolverla:

- Separar las filas que **ya están en el CRM** (traen el id del contacto) de las **repetidas dentro del mismo archivo**: contarlas juntas promete «N que ya estaban» con filas que no estaban.
- Cada opción dice qué pasa con esos números: «Se crean solo los 1.358 nuevos», «a esos contactos (hasta 98) se les rellena…», «quedan repetidos».
- Ocultar «Completar» si no hay nada que completar.
- Cerrar con «ninguna opción borra ni sobrescribe lo que ya está, y se puede deshacer desde Importaciones».

### 6. Seguridad
- Las tablas del historial llevan RLS **sin policies** y `revoke all` a `anon` y `authenticated`: solo el servidor las lee y escribe.
- Las funciones de lista y de deshacer van como `security invoker`, con `search_path = ''`, `revoke` a `public`, `anon` y `authenticated`, y `grant` a `service_role`. Ver `revocar-execute-incluye-public`.
- Si hay una función que une perfiles duplicados, tiene que mover también `import_batches.created_by` y `undone_by`.

### 7. Probar con rollback y por la API
- Toda la migración va dentro de una transacción que termina en `rollback`:
  - anon rechazado;
  - un closer sobre un lead ajeno ve 0 cambios;
  - un admin ve los cambios exactos;
  - el caso de deshacer dos veces del paso 3, reproducido;
  - un correo cambiado a mano NO se toca;
  - se borra la nota del contacto existente y no la del creado.
- **Trampa de escenario:** si la RLS tiene una «cola abierta» (leads sin setter ni closer que cualquiera puede trabajar), un lead de prueba sin asignar hace pasar al closer y parece un hueco de permisos. Asignale un closer antes.
- Por la API con la clave anon: `42501` en las funciones y en las tablas.
- Pantallas: una página temporal con datos falsos, en celular. El botón de deshacer de un lote viejo queda apagado hasta escribir la cantidad exacta.

## Output esperado
- La migración con `import_batches` (más el backfill de lo que ya existe), `import_batch_changes` con `reverted_at`, la función de completar que devuelve los cambios, la lista con conteos en vivo (incluidos los huérfanos) y deshacer en una transacción. Todo con su DOWN.
- La acción del servidor que registra el lote antes de escribir, valida el lote del navegador y guarda los cambios con reintento.
- La pantalla del historial (solo admin): archivo, quién, cuándo, creados, completados y «con actividad», con deshacer en dos pasos y aviso fuerte para los lotes viejos.
- La pregunta de repetidos reescrita con los números del archivo.
- La prueba con rollback del paso 7, más la de la API.

## Ejemplo
**Input:** «Importé 1.500 contactos, vinieron sin correo y no puedo deshacerlo. Si vuelvo a importar, ¿me pisa lo que ya tengo?»

**Output:**
1. **0048:**
   - `import_batches`, con backfill de las 2 importaciones del 17/08 (solo id y fecha);
   - `import_batch_changes`;
   - `fill_lead_contact_v3`;
   - `resumen_importaciones()`;
   - `deshacer_importacion(lote, quien)`.
2. **`/leads/importaciones`** (ejemplo ilustrativo, con datos de prueba): «contactos-octubre.xlsx · 25 oct · Josué — 1.358 leads nuevos · 98 contactos completados · de 1.500 filas». Al deshacer: «Se mandan a la papelera los 1.358… Ojo: 12 ya se trabajaron… A los 98 contactos que ya estaban se les vacía lo que les completó».
3. **Revisión del Mentor → 0049:**
   - `reverted_at` para no deshacer dos veces;
   - la lista une los lotes huérfanos;
   - commitImport valida el lote del navegador.
4. **Las importaciones viejas** (4.041 leads, 530 trabajados) se deshacen solo escribiendo «4041».
