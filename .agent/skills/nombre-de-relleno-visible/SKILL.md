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
