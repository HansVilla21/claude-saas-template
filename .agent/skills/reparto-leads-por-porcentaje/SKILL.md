# Skill: Reparto de leads al equipo por porcentaje

## Cuándo usar esta skill

- Un negocio con varios vendedores pide que los leads nuevos **se repartan solos**, y no siempre en partes iguales: 60/40, o cinco personas con 30/25/20/15/10.
- El lead lo atiende primero un **bot**, pero cuando lo pasa a una persona el aviso tiene que llegarle **solo a su dueño**, no a todo el equipo.
- Ya existe un «round robin» en el sistema y nadie sabe si anda. **Medilo antes de construir otro** (paso 1).
- Vas a guardar «quién es el dueño» en la misma fila que el bot usa para saber si un humano tomó la conversación (paso 5: esto **apaga el bot**).

## Por qué existe esta skill

Capturada el 2026-10-07. Se construyó para el CRM multi-tenant de Momentum (MOM-124), con prueba real en producción el 2026-10-01. Tres hallazgos justifican la skill más que el algoritmo:

| Lo que se suponía | Lo que había |
|---|---|
| El sistema ya tenía un reparto por turnos (`assign_round_robin`) | **Nunca asignó una sola conversación.** Escribía `assigned_set_by = 'system'` y un CHECK solo aceptaba `bot`/`human`. El error se tragaba como no fatal. Medido: **0 filas con 'system' en toda la historia** |
| «Elegir al que tiene menos» reparte bien | Con 60/40 da **5/5**: ignora el porcentaje. El control negativo de la prueba es justo ese orden |
| Asignar un dueño mientras atiende el bot no cambia nada | **El bot quedaba mudo** con todo lo repartido. Los triggers de prender y apagar el bot leían «tiene dueño» como «lo tomó una persona». Lo encontró la revisión final, no las pruebas |

> La idea central: **el dueño y quién atiende ahora son dos datos distintos.** Un lead puede tener dueño desde que nace y seguir con el bot. Todo lo que antes deducía «hay un humano» de «hay un dueño» tiene que aprender a distinguir al dueño que puso el sistema.

## Proceso

### 1. Medir el reparto que ya existe

Antes de diseñar, contá si el mecanismo viejo escribió algo alguna vez:

```sql
select assigned_set_by, count(*) from conversations group by 1;
```

Si «system» (o lo que escriba ese camino) da 0, el mecanismo nunca anduvo. Buscá **por qué**: un CHECK, un enum o una policy que rechaza el valor, y un `catch` que lo convierte en log. Ese mismo motivo va a romper el nuevo si no lo cambiás en la misma migración.

### 2. La regla de elección: el más atrasado respecto de su porcentaje

```sql
order by asignados::numeric / porcentaje asc,   -- el más atrasado
         porcentaje desc,                        -- empate: el de más peso
         orden asc, user_id asc                  -- empate total: determinístico
limit 1
```

- **Exacto, no al azar:** con 60/40, de cada 10 caen 6 y 4. Con 30/25/20/15/10 sobre 100, exacto.
- **Candidatos:** solo miembros activos, con rol que puede atender (no lectura), con porcentaje mayor a 0 y sin pausa.
- **Pausar a alguien no toca los porcentajes:** sale de la elección y vuelve cuando lo despausan.
- **Guardar la configuración pone los conteos en cero.** Si no, el que vuelve de una pausa recibe una tanda seguida «para ponerse al día».
- **Control negativo obligatorio en la prueba:** ordenar solo por `asignados` tiene que hacerla fallar (60/40 → 5/5). Si no falla, la prueba no mide la regla.

### 3. Asignar cuando NACE la conversación, en una función de la base

- La llaman los webhooks **solo en el camino del mensaje del contacto**. Un eco o un mensaje propio no reparte.
- **Si la conversación ya existe, no se toca**, y un lead que vuelve conserva su conversación y su dueño.
- **Herencia antes que elección:** si el lead ya tenía dueño se respeta, siempre que siga activo en el equipo. Ese dueño sale primero de su conversación asignada más reciente, que es donde escriben las reasignaciones, y después de la ficha.
- **Concurrencia:** `select … from reparto where agency_id = $1 for update` serializa las elecciones del negocio. Sin eso, dos leads que entran a la vez eligen a la misma persona con el mismo conteo. Medido: 20 leads en paralelo dieron 10/10.
- `insert … on conflict do nothing returning id`. Si otro mensaje creó la conversación en el medio, se devuelve esa **sin sumar al conteo**.
- Si la función falla, el webhook crea la conversación como antes, sin dueño. Un reparto roto no puede dejar mensajes sin guardar.

### 4. El pase del bot asigna antes de avisar

- El pase se queda con su dueño y el aviso le llega **solo a él**.
- Si el dueño **ya no está** (salió del equipo o quedó de solo lectura) y el negocio reparte, se elige de nuevo. Si no, el aviso le llega a alguien que no puede atender.
- Con el reparto apagado, todo como antes: el pase va a todo el equipo.

### 5. ⛔ Distinguir el dueño del sistema del humano que tomó la conversación

Buscá **todo** lo que deduce «un humano la tiene» de «tiene dueño»:
- triggers de prender y apagar el bot, por negocio y por contacto;
- el modo prueba;
- el motor del bot;
- los filtros de la bandeja.

Cada uno tiene que tratar `assigned_set_by = 'system'` como «el bot puede seguir»:

```sql
and (assigned_user_id is null or assigned_set_by = 'system')
```

Lo que pasa si no: con el reparto encendido, apagar y prender el bot deja **todas** las conversaciones repartidas en manos de un humano que no las tomó, y el bot no contesta a nadie. Sin un solo error.

### 6. Lo que no se toca

- **Los leads viejos sin dueño no se reparten en masa.** Se asignan si el bot los pasa con el reparto encendido.
- **Negocio sin reparto:** todo exactamente como antes. Probalo explícitamente.

### 7. Permisos

- Funciones `security definer` ejecutables **solo por service_role**, porque las llaman webhooks y server actions con el cliente de servicio.
- Revocalas de `public`, `anon` y `authenticated`: revocarlas solo de `anon` y `authenticated` no alcanza (`revocar-execute-incluye-public`).
- La pantalla guarda por server action con el gate de owner o admin, y valida que los porcentajes sumen 100.

### 8. Probar

- **SQL contra la base viva, con el bloque que siempre aborta** (`probar-migracion-contra-base-viva-con-rollback`). Casos:
  - 60/40 → 6/4;
  - cinco personas exacto sobre 100;
  - pausa y alguien que sale del equipo;
  - un usuario de solo lectura;
  - reparto apagado;
  - herencia, el pase y las validaciones;
  - permisos.

  Más el control negativo del paso 2.
- **Prueba real:** un número que **nunca escribió** al negocio. Esperado:
  - la conversación nace con dueño y `assigned_set_by = 'system'`;
  - el conteo pasa a 1/0;
  - el bot contesta igual;
  - al pedir una persona, el aviso le llega solo al dueño y el dueño no cambia.

  **Control:** un número que ya había escrito antes cae en su conversación vieja y el reparto no la toca.

## Output esperado

- La configuración por negocio (participantes, porcentaje, pausa, encendido), con la tabla de quién recibió cuántos.
- Las conversaciones nuevas con dueño desde el primer mensaje, sin que el bot deje de contestar.
- El aviso del pase solo al dueño.

## Ejemplo

**Input:** «Quiero que los leads se repartan 50/50 entre mi socio y yo apenas entran, aunque los atienda el bot, y que cuando el bot pase uno me avise solo a mí si es mío.»

**Output:**
1. Medición: el reparto viejo tenía 0 asignaciones en toda la historia. Causa: un CHECK que rechazaba «system».
2. Migración con la regla del paso 2, la creación con dueño, la herencia, el `for update` y los triggers corregidos para el dueño del sistema.
3. Los webhooks crean la conversación con la función; el pase asigna antes de avisar.
4. Pruebas: SQL con 0 fallas y el control negativo con 4 fallas; 20 en paralelo → 10/10.
5. Prueba real: el número nuevo nace con dueño (el primero de la lista); el bot contesta; el pase le avisa solo a ese dueño; el número viejo no se toca.

## Relacionadas

- `config-que-deja-el-sistema-mudo`: el reparto viejo y el bot mudo son la misma familia, un supuesto que vuelve imposible un caso.
- `probar-migracion-contra-base-viva-con-rollback` y `revocar-execute-incluye-public`.
- `whatsapp-proactivo-a-staff`: avisar por WhatsApp al dueño cuando el bot pasa la conversación.
