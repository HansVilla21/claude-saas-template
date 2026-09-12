# Skill: El nombre de relleno no es un nombre

> Nació el 2026-09-12 en el CRM de Momentum, en la primera importación real de
> chats viejos de WhatsApp. El founder miró la pantalla y dijo: *"creó todos los
> contactos con lead sin nombre. Eso no funciona muy bien"*. Tenía razón, y el
> problema era más grande de lo que se veía: el texto que el sistema pone cuando
> **no sabe** cómo se llama alguien ("Lead sin nombre") se estaba tratando como
> un nombre en diez lugares. En pantalla le ganaba al teléfono; en una plantilla
> salía **"Hola Lead,"** hacia el cliente; y la IA que redacta seguimientos
> recibía "Lead sin nombre" como si fuera el nombre de la persona. Nada de eso
> daba un error.

## Cuándo usar esta skill

- El sistema crea registros con un nombre por defecto ("Sin nombre", "Lead sin
  nombre", "Contacto de Instagram", "Usuario", "Cliente nuevo").
- Vas a importar datos que **no traen nombre** (chats viejos, CSV incompletos,
  webhooks sin perfil).
- Aparece `a.nombre || b.nombre || 'Sin nombre'` repetido en varios archivos.
- Un mensaje, plantilla o prompt usa el nombre del contacto.

## El error de fondo

Un relleno es un **valor que ocupa el lugar de un dato que falta**. Guardarlo en
la misma columna que el nombre real (para que la columna no quede vacía o por un
`NOT NULL`) lo convierte, para todo el código que lee esa columna, en un nombre.
Y ahí se rompen los tres usos del nombre:

| Uso | Qué hace con el relleno | Qué debería hacer |
|---|---|---|
| **Mostrar** quién es | Muestra "Lead sin nombre" y esconde el teléfono | Mostrar lo que SÍ identifica: el teléfono |
| **Dirigirse** a la persona (plantilla, IA, correo) | "Hola Lead," / la IA saluda a "Lead sin nombre" | Nada: "Hola," |
| **Buscar / exportar** | Cien filas con el mismo "nombre" | Tratarlo como vacío |

El fallback de siempre `display_name || full_name || phone` **no** lo arregla:
el relleno es un string no vacío, así que el teléfono nunca se alcanza.

## El arreglo: dos funciones, un solo lugar

```ts
// lib/format/nombre-lead.ts
// ⚠️ Los rellenos están escritos también en los webhooks y en SQL. Si cambia uno, cambian todos.
export const NOMBRES_DE_RELLENO = new Set(['Lead sin nombre', 'Contacto de Instagram', 'Contacto de Messenger']);

export function esNombreDeRelleno(nombre: string | null | undefined): boolean {
  return NOMBRES_DE_RELLENO.has((nombre ?? '').trim());
}

/** El nombre de verdad, si existe. Nunca un relleno. Sirve para DIRIGIRSE a la persona. */
export function nombreReal(l: { display_name?: string | null; full_name?: string | null } | null | undefined): string | null {
  for (const n of [l?.display_name, l?.full_name]) {
    const limpio = (n ?? '').trim();
    if (limpio && !esNombreDeRelleno(limpio)) return limpio;
  }
  return null;
}

/** Lo que se MUESTRA: el nombre de verdad, o el teléfono, o el relleno si no hay ni eso. */
export function nombreVisible(l: { display_name?: string | null; full_name?: string | null; phone?: string | null } | null | undefined, sinNada = 'Sin nombre'): string {
  const real = nombreReal(l);
  if (real) return real;
  const tel = prettyPhone(l?.phone ?? null);
  if (tel) return tel;
  return (l?.full_name ?? '').trim() || sinNada;  // un contacto de Instagram no tiene teléfono
}
```

Reglas de uso:
- **Pantallas** (listas, fichas, tareas, agenda, tablero): `nombreVisible`.
- **Selectores que ya muestran el teléfono al lado**: `nombreReal(l) ?? 'Sin nombre'`
  (si no, el teléfono sale dos veces).
- **Todo lo que le habla a la persona o a una IA**: `nombreReal`. Y la función que
  saca el primer nombre para saludar devuelve `null` para un relleno, igual que
  ya lo hacía para un teléfono.
- Si la tabla que armaba el nombre no traía `phone`, **agregarlo al select**: sin
  eso `nombreVisible` cae al relleno y el arreglo no se ve.

## Del lado del que escribe: completar el nombre cuando llega

Si el registro nació con relleno, el primer dato real tiene que **reemplazarlo**,
pero solo al relleno:

```ts
if (c.nombre) cambios.display_name = c.nombre;                       // perfil de WhatsApp
if (c.nombre && existente.full_name === NOMBRE_POR_DEFECTO[canal]) cambios.full_name = c.nombre;
```

- Nunca se pisa un nombre que alguien cargó a mano.
- Hay que traer `full_name` en el select del contacto existente para poder comparar.
- Si otra fuente también nombra (una agenda, un CRM externo), hace la misma
  comparación contra el relleno — en SQL: `where full_name = 'Lead sin nombre'`.

## Cómo encontrar todos los lugares

```bash
grep -rn "display_name ||\|full_name ||\|full_name ??\|'Sin nombre'\|Lead sin nombre" src --include=*.ts --include=*.tsx
```

En el CRM salieron diez: la bandeja, contactos, tareas, agenda, "Mi día", el
tablero de campañas, la lista de seguimientos, dos selectores, y el cron de
seguimientos con IA (el peor: `full_name ?? display_name`, con el relleno primero).
Revisar también: plantillas / variables, exportaciones, notificaciones al equipo,
prompts del bot.

## Verificación

- Pruebas del helper: relleno + teléfono → teléfono; perfil → perfil; nombre del
  negocio → nombre; Instagram sin teléfono → su relleno; nada → "Sin nombre";
  relleno con espacios → sigue siendo relleno.
- `tsc` y `eslint` (los selects con columnas nuevas cambian tipos).
- En la base: un contacto que vuelve a escribir pasa de relleno a su nombre
  (`full_name` y `display_name`); uno nombrado a mano no cambia.

## Anti-patrones

- **Borrar el relleno de la base** para "arreglar" la pantalla: otros sistemas
  (bots, flujos, SQL) comparan contra ese texto. Se deja y se deja de mostrar.
- **Arreglarlo en el componente** que se ve roto: hay otros nueve.
- **`nombre || telefono`** sin excluir el relleno: no cambia nada.
- **Usar el nombre visible para saludar**: "Hola +506 8821 7229,".

---

## Apéndice 2026-09-12 (tarde) — Los lugares que el grep de `src` no ve

Con las pantallas arregladas, el relleno seguía vivo en **cuatro lugares fuera
del front**. Ninguno lo encontraba el grep de arriba:

| Dónde | Qué hacía | Medido |
|---|---|---|
| **Otro webhook que escribe** (el del segundo proveedor) | Al llegar el nombre solo llenaba `display_name`; `full_name` quedaba en el relleno para siempre | 16 leads con el nombre guardado al lado del relleno |
| **El asistente de respuestas con IA** del inbox | Le decía al modelo *"El contacto se llama Lead sin nombre"* | — |
| **Funciones SQL** que arman textos (notificaciones, títulos de tareas) | `coalesce(display_name, full_name, 'el contacto')`: solo saltan `NULL`, el relleno pasa | 22 etiquetas con el relleno |
| **Edge Function** del aviso al equipo por WhatsApp | `full_name?.trim() \|\| …`: el relleno primero | — |

### Buscar en todas las capas

```bash
grep -rn "full_name\|display_name" supabase/functions --include=*.ts | grep -v test
```
```sql
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and prosrc ilike '%full_name%' and prosrc ilike '%leads%';
```
Y todo `select('full_name')` suelto en server actions: el que alimenta un prompt es
el peor, porque el modelo lo repite al cliente.

### En SQL: el mismo helper, una sola vez

```sql
-- ⚠️ Mismos rellenos que lib/format/nombre-lead.ts y los webhooks.
create or replace function public.nombre_real_lead(p_display_name text, p_full_name text)
returns text language sql immutable set search_path = public as $$
  select coalesce(
    case when btrim(coalesce(p_display_name, '')) not in ('', 'Lead sin nombre', 'Contacto de Instagram', 'Contacto de Messenger')
         then btrim(p_display_name) end,
    case when btrim(coalesce(p_full_name, '')) not in ('', 'Lead sin nombre', 'Contacto de Instagram', 'Contacto de Messenger')
         then btrim(p_full_name) end);
$$;
```

Más `telefono_legible(phone)`, copia en SQL del `prettyPhone` de la app,
**verificada contra salidas de referencia sacadas del TS con node** (8 casos).
Si no, la notificación dice `50672055814` y la pantalla `+506 7205 5814`.
Cada lector conserva su orden y su texto genérico:
`coalesce(nombre_real_lead(...), telefono_legible(phone), 'el contacto')`.

### El fallback depende de lo que ya muestra el mensaje

En el aviso de WhatsApp al agente el teléfono **ya va en su propia línea**. Caer
al teléfono en el nombre lo mostraba dos veces. Ahí va **"Sin nombre"**. Es la
misma regla de los selectores que ya muestran el teléfono al lado.

### Corregir lo que ya estaba: backfill medido

```sql
update leads set full_name = btrim(display_name)
 where btrim(coalesce(full_name, '')) in ('', 'Lead sin nombre', …)
   and nullif(btrim(display_name), '') is not null
   and btrim(display_name) not in ('Lead sin nombre', …);
```

Probado en el bloque que aborta: **16 afectadas, 0 nombres reales tocados,
segunda corrida 0**. El webhook que escribe se arregla con la misma regla del
apéndice de arriba, en un helper puro con prueba. El control negativo es el
comportamiento viejo (solo `display_name`), y con él fallan justo las pruebas
del relleno.

### Lo que NO se reescribe

Notificaciones y títulos de tareas **ya creados** quedan con el texto que tenían
(185 notificaciones en el CRM). Son historia, y reescribir notificaciones
re-emite su broadcast a las pantallas de los usuarios. Se arregla lo que se genera
de acá en adelante, y se avisa.

### De paso: mirá los permisos de la función que tocás

Al reemplazar `notif_lead_label` apareció que era SECURITY DEFINER y ejecutable
por `anon`. Devolvía nombre o teléfono de cualquier lead por id. Ver skill
`revocar-execute-incluye-public`.
