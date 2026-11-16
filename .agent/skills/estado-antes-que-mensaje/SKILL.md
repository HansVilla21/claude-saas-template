# Skill: El aviso que llega antes que la cosa que avisa

> Nació el 2026-09-12 en el CRM de Momentum. Un mensaje escrito desde el celular
> quedó marcado "enviado" para siempre, aunque WhatsApp había avisado que se
> entregó. Medido en los webhooks: el aviso de "entregado" llegó **36 ms antes**
> que el mensaje. El webhook buscó el mensaje, no lo encontró y descartó el
> aviso, con un motivo prolijo (`estado_de_mensaje_desconocido`) que nadie mira.
> Después del arreglo, la primera prueba en vivo **repitió la carrera**: el
> mensaje llegó primero pero tardó 0,7 s en guardarse, y el aviso, que llegó 22 ms
> después, se procesó antes. No es un caso raro: es lo normal con webhooks
> separados.

## Cuándo usar esta skill

- Un proveedor manda **eventos sobre algo** (estado de un mensaje, de un pago, de
  un envío, de un documento) por un canal separado de **la cosa misma**.
- El código que procesa el evento hace "buscar la fila → si no está, ignorar".
- La fila la crea otro proceso que puede tardar: otro webhook, o tu propio
  servidor que guarda el id del proveedor recién cuando la API contesta
  (`insert` sin id → llamar a la API → `update` con el id).
- Síntoma: registros "atascados" en un estado intermedio, sin error en ningún log.

## Por qué "ignorar si no está" pierde datos

Nadie garantiza el orden entre dos webhooks, ni entre un webhook y tu propio
`update`. Y aunque lleguen en orden, **procesar** uno puede tardar más (buscar o
crear el contacto, bajar un archivo). Ignorar el evento huérfano convierte una
carrera de milisegundos en un dato perdido para siempre.

Tres salidas, y por qué se eligió la tercera:

| Opción | Problema |
|---|---|
| Devolver 500 para que el proveedor reintente | Los eventos de cosas que NUNCA vas a tener (mandadas por fuera de tu sistema, de antes de conectar) reintentan durante días; el proveedor puede degradar tu webhook por la tasa de fallas |
| Crear la fila con lo que trae el evento | El evento suele traer solo el id: inventás un registro vacío |
| **Guardar el evento y aplicarlo cuando aparece la fila** | Una tabla y un trigger. Cubre también tu propio `update` tardío |

## El patrón (Postgres)

**1. Tabla de pendientes**, con la llave natural del evento y limpieza:

```sql
create table public.estados_pendientes (
    tenant_id   uuid not null references tenants(id) on delete cascade,
    external_id text not null,
    estado      estado_enum not null,
    fecha       timestamptz not null,
    -- … lo demás que trae el evento
    recibido_at timestamptz not null default now(),
    primary key (tenant_id, external_id, estado)       -- el reintento del proveedor no duplica
);
alter table public.estados_pendientes enable row level security;
revoke all on table public.estados_pendientes from anon, authenticated;
```

**2. Función "aplicar o guardar"** que usa el webhook, envolviendo la que ya
aplicaba el estado (no la cambies si otros la usan):

```sql
create function aplicar_o_guardar_estado(...) returns text language plpgsql as $$
declare v text;
begin
    perform pg_advisory_xact_lock(hashtextextended('estado:' || p_external_id, 0));
    v := aplicar_estado(...);                         -- el UPDATE atómico de siempre
    if v is not null then return v; end if;
    insert into estados_pendientes (...) values (...) on conflict do nothing;
    delete from estados_pendientes where recibido_at < now() - interval '2 days';
    return null;                                      -- el webhook lo loguea como "guardado", no como error
end $$;
```

**3. Trigger que aplica lo pendiente** cuando aparece la fila, en los DOS caminos
por los que puede aparecer el id:

```sql
create function aplicar_estados_pendientes() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record;
begin
    perform pg_advisory_xact_lock(hashtextextended('estado:' || new.external_id, 0));
    for p in select * from estados_pendientes
              where tenant_id = new.tenant_id and external_id = new.external_id
              order by fecha
    loop
        perform aplicar_estado(p...);
        delete from estados_pendientes where … = p…;
    end loop;
    return null;
end $$;

create trigger trg_pendientes_ins after insert on mensajes for each row
    when (new.external_id is not null)
    execute function aplicar_estados_pendientes();

create trigger trg_pendientes_upd after update of external_id on mensajes for each row
    when (new.external_id is not null and old.external_id is distinct from new.external_id)
    execute function aplicar_estados_pendientes();
```

## Los detalles que deciden si funciona

- **El candado va en los dos lados, por la llave del evento.** Sin él queda una
  ventana: el evento no ve la fila (sin confirmar), el trigger no ve el
  pendiente (sin confirmar) y los dos se pierden. Con `pg_advisory_xact_lock`, el
  que llega segundo espera a que el primero confirme, y como en READ COMMITTED
  cada sentencia de plpgsql toma una foto nueva, ya ve lo que dejó el otro.
- **Por qué no hay deadlock:** el `UPDATE` del evento busca `external_id = X`; una
  fila recién insertada o recién modificada por otra transacción sin confirmar no
  es visible con ese valor, así que no espera su bloqueo de fila.
- **El trigger de UPDATE solo si el id CAMBIA.** Un update que reescribe el mismo
  id tendría la fila bloqueada mientras espera el candado, y un evento con el
  candado esperaría esa fila: ahí sí hay deadlock. Por eso son dos triggers y el
  segundo compara `old` con `new`.
- **`SECURITY DEFINER` en el trigger.** Si sesiones de usuarios escriben la tabla
  de mensajes, el trigger corre con sus permisos y la tabla de pendientes está
  cerrada para ellos: mandar un mensaje fallaría con "permission denied".
- **El aplicar de siempre no se recursa:** su `SET` no toca `external_id`, así que
  `update of external_id` no se vuelve a disparar.
- **Cargas masivas** (importar historial) que no pueden tener pendientes: el
  trigger sale temprano con la misma marca de transacción que usan los otros
  triggers.
- **Limpieza con techo:** los eventos de cosas que nunca vas a tener se borran a
  los 2 días; con índice por `recibido_at`.

## Cómo se probó

Bloque que siempre aborta contra la base viva, con la migración adentro:
1. Fila conocida → aplica directo, 0 pendientes.
2. Evento de fila desconocida → devuelve null, 1 pendiente.
3. `INSERT` de la fila → el estado quedó aplicado con su fecha, 0 pendientes.
4. Fila sin id + evento + `UPDATE` que pone el id → aplicado.
5. Carga masiva con la marca → no toca.
6. Limpieza de un pendiente de 3 días.
7. Permisos: anon y authenticated sin ejecutar ni leer; trigger con `prosecdef`.
8. **Control negativo:** borrando el trigger dentro del bloque, el pendiente queda
   sin aplicar y la fila en "enviado". Sin esto, los pasos 3 y 4 podrían estar
   verdes por otra razón.

Y después, en vivo: el evento quedó con motivo `estado_guardado_…`, la fila
terminó en "entregado", la tabla de pendientes vacía.

Para una prueba unitaria del lado del código, el control negativo barato es correr
la prueba nueva contra el archivo viejo: copiar la carpeta a un temporal y pisar
el archivo con `git show HEAD:ruta/archivo.ts`. Si la prueba pasa igual, no prueba
nada.

## Anti-patrones

- Loguear el evento huérfano con un motivo prolijo y darlo por manejado.
- Pedir reintento al proveedor para eventos que quizás nunca tengan dueño.
- Un solo trigger `after insert or update of external_id` sin comparar `old`.
- El trigger sin `SECURITY DEFINER` sobre una tabla que escriben usuarios.
- Cambiar la función compartida que usa otro proveedor en vez de envolverla.
