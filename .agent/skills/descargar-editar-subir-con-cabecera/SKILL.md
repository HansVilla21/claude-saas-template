# Skill: Bajar, editar afuera y volver a subir, con cabecera de versión

## Cuándo usar esta skill

- Alguien **no técnico** del equipo tiene que cambiar un texto largo que vive en la base (el prompt de un bot, una plantilla, un contrato, una config en markdown) y hoy depende de un desarrollador o del repo para hacerlo.
- La solución barata que piden es "bajo el archivo, lo edito con mi IA y lo vuelvo a subir", sin un editor dentro del producto.
- Es **multi-tenant**: el mismo panel sirve a muchos clientes, y subir el archivo de uno en otro es el error más caro posible.
- Puede haber **dos personas** editando lo mismo, o una editando durante una hora mientras otra ya subió un cambio.
- El texto vigente **no tiene respaldo** (las copias del repo están desfasadas o no existen).

## Por qué existe esta skill

Capturada el 2026-10-15 de MOM-78 en el CRM de Momentum: el equipo comercial (Pietro) tenía que pasarle cada cambio del prompt de un cliente al founder por WhatsApp, y el founder lo aplicaba con scripts. Se resolvió con un "Descargar / Subir nuevo" en el panel master, más un skill de Claude para editar el archivo. Lo que se aprendió construyéndolo:

| Lo que parecía suficiente | Lo que hizo falta |
|---|---|
| El nombre del archivo dice de qué cliente es | El nombre se cambia sin querer. **El archivo tiene que decirlo adentro**: una cabecera de una línea |
| Comparar contra lo que muestra la pantalla | La pantalla puede tener horas abierta. **Se compara contra la versión desde la que se EDITÓ**, y eso viaja en la cabecera |
| Un `update` de la columna jsonb | Pisa las demás llaves del jsonb y no guarda lo anterior. **Una función en la base** que bloquea la fila, compara, archiva y escribe con `jsonb_set` |
| Un error por cada problema del archivo | Con el archivo de OTRO cliente salían dos errores ("es de otro" y "es igual al actual") y el segundo confundía. **Si es el archivo equivocado, se dice solo eso** |
| Revisar en el navegador | El navegador no tiene el texto vigente (puede pesar 50 mil caracteres): solo su **largo** y su md5. Y el servidor **revisa de nuevo** |

> La idea central: **el archivo lleva su propia identidad y su punto de partida.** Todo lo demás (bloquear el cliente equivocado, no pisar la edición de otro, guardar la anterior) sale de eso.

## Proceso

### 1. La cabecera: una línea, arriba de todo, que el editor no rompe

```
<!-- momentum-prompt negocio=givi pieza=principal base=<md5 del vigente> bajado=2026-10-15 -->
```

- Un **comentario** (en markdown no se ve) en la **primera línea**. Lleva: el tenant (slug), la pieza (si hay más de un archivo por tenant), el **md5 de la versión desde la que se bajó** y la fecha.
- El md5 lo calcula **el servidor** al bajar (`createHash('md5').update(texto, 'utf8')` en Node da lo mismo que `md5(texto)` en Postgres: verificado). El navegador nunca calcula hashes.
- Al subir se **normaliza** antes de todo: sin BOM, `\r\n` → `\n`, sin espacios en los bordes. Los editores de Windows y las IAs cambian eso y no es un cambio real.
- **Sin cabecera también se sube** (el editor la borró, o se escribió de cero): se compara contra el md5 que mostraba la pantalla. Pero se avisa que así se pierde la protección.

### 2. Errores que no dejan subir, avisos que se confirman

Una función **pura** (la usan el navegador y el servidor) devuelve `{ errores, avisos }`:

- **Errores:** cabecera de otro tenant u otra pieza (y si es eso, **no se sigue revisando**), vacío, más largo que el tope, bloques que el sistema agrega solo (quedarían dos veces), igual al vigente.
- **Avisos:** variables que el sistema no reemplaza (con una prueba que verifique que el motor resuelve cada variable de la lista: si no, la revisión deja pasar una que queda literal), sintaxis vieja, **mucho más corto que el vigente** ("¿se cortó al copiar?", con el largo alcanza), contenido duplicado con otra pieza.
- En el navegador el texto vigente no está: la función acepta `actual: null` y `largoActual`.
- El servidor **revisa de nuevo** con el texto real. Lo que dijo el navegador no es la última palabra.

### 3. Guardar en la base: una función, una transacción

```sql
create or replace function public.guardar_x(p_tenant uuid, p_pieza text, p_texto text,
  p_md5_base text, p_autor uuid, p_motivo text default 'subida') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_config jsonb; v_actual text; v_md5 text;
begin
  -- validar pieza y motivo; texto vacío → {ok:false, motivo:'vacio'}
  select coalesce(config, '{}') into v_config from tenants where id = p_tenant for update;
  v_actual := v_config #>> array['piezas', p_pieza];
  v_md5 := md5(coalesce(v_actual, ''));
  if p_md5_base is not null and p_md5_base <> v_md5 then
    return jsonb_build_object('ok', false, 'motivo', 'cambio_en_el_medio');
  end if;
  if v_actual is not distinct from p_texto then return jsonb_build_object('ok', false, 'motivo', 'sin_cambios'); end if;
  if coalesce(btrim(v_actual), '') <> '' then
    insert into versiones (tenant_id, pieza, contenido, reemplazado_por, motivo) values (...);
  end if;
  -- si config->'piezas' no es un objeto, crearlo antes del jsonb_set
  update tenants set config = jsonb_set(v_config, array['piezas', p_pieza], to_jsonb(p_texto)) where id = p_tenant;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function ... from public, anon, authenticated;
grant execute on function ... to service_role;
```

- La tabla de **versiones guarda lo ANTERIOR** (lo vigente vive en su lugar de siempre). RLS prendido y **sin policies a propósito**: solo el servidor la toca, detrás del gate de rol. Escribilo en el comentario de la migración, o alguien va a "arreglar" el deny-all.
- `for update` sobre la fila: dos subidas a la vez no se pisan.
- Si hay un **trigger que bloquea esa columna** a los usuarios con sesión (en Momentum, el candado de 0142), una función `security definer` llamada por service_role pasa sin tocarlo. Verificalo, no lo supongas.

### 4. La pantalla

- **«Descargar»** (deshabilitado si no hay nada cargado) y **«Subir nuevo»**: un `<label>` con el `<input type="file">` adentro, que abre el selector sin JS extra. Reseteá `input.value` después de leer, o elegir el mismo archivo dos veces no dispara nada.
- **Confirmación** con el antes/después en caracteres y los avisos en amarillo. Con errores no se abre: va un aviso con el primero.
- **Historial** con «Bajar» y «Volver a esta». Volver a una versión pasa por la misma función (motivo `restaurar`), así que lo vigente queda en el historial y nada se pierde.
- Una cuenta de **solo lectura** puede bajar, no subir (el gate lo decide en el servidor, no la pantalla).
- Los textos por pieza llevan **su artículo y su concordancia** en un mapa ("las nuevas objeciones", "el nuevo prompt principal"): armarlos con `toLowerCase()` dio "¿Subir el nuevo objeciones?".
- En el celular, el texto de cada fila va **arriba a todo el ancho** y los botones abajo (`basis-full sm:basis-0 sm:flex-1`): con `flex-1 min-w-0` el texto quedaba en una columna de 130 px.

### 5. El editor de afuera (si es una IA, con su skill)

Si el equipo edita con Claude, armale un skill que se baje del mismo panel (un `.zip` con `carpeta/SKILL.md`):
- **La cabecera se devuelve idéntica, en la primera línea.** Y si el panel rechaza el archivo "por ser de otro cliente", **nunca cambiar la cabecera para que pase**: es la forma más probable de saltarse la protección sin querer.
- Cambios quirúrgicos con herramienta de código (reemplazar el fragmento exacto), nunca reescribir el archivo entero a mano: en miles de caracteres siempre se cambia algo.
- Devolver el archivo **completo** como descargable, con el conteo antes/después.
- El SKILL.md vive como `.md` en el repo y un script lo pasa a un módulo TS (`JSON.stringify`); una prueba compara los dos y falla si alguien edita el `.md` sin regenerar.

## Cómo se prueba

1. **La función, contra la base viva, en un bloque que siempre aborta** (`DO` que termina en `raise exception` con el reporte): md5 viejo no pisa · md5 correcto escribe, archiva la anterior y deja iguales las demás llaves y las demás piezas · mismo texto no escribe · una pieza que no existía se crea sin versión · restaurar · vacío · y con `set local role authenticated`: ni leer la tabla ni ejecutar la función. En Momentum: **8/8**. Después confirmar que producción quedó intacta.
2. **En pantalla, con un tenant de prueba**, simulando el archivo elegido (`DataTransfer` + `dispatchEvent('change')`) y capturando lo que se baja (envolver `URL.createObjectURL`): subir → la base tiene exactamente eso; bajar → cabecera correcta y **md5 igual al de `md5()` en la base**; archivo con otro tenant → rechazado sin abrir la confirmación; edición normal → la anterior en el historial con su autor; **el archivo viejo otra vez → "alguien cambió…" y nada escrito**; volver a una versión → vuelve, y la que estaba queda en el historial.
3. **Dejar el tenant de prueba como estaba**, con un `update` guardado por el contenido exacto de la prueba (si es otro texto, no toca nada).

## Output esperado

- Una tarjeta en el panel interno con bajar, subir (con revisión y confirmación) e historial.
- Una migración con la tabla de versiones (solo service_role) y la función de guardado.
- Un módulo puro con armar/leer el archivo y la revisión, con sus pruebas.
- Opcional: el skill para el editor, empaquetado desde el mismo panel.

## Ejemplo

**Input:** "Pietro quiere cambiarle al bot de Givi que ya no hay descuento en efectivo, sin pedírmelo a mí."

**Output:** Pietro entra a Master → Givi → Bot → «Descargar» (`prompt-givi-principal-2026-10-15.md`, con la cabecera `negocio=givi pieza=principal base=…`). Se lo pasa a Claude con el skill: "ya no hay descuento en efectivo". Claude cambia la regla y el mensaje de ejemplo, y devuelve el archivo completo (18.432 → 18.447 caracteres). «Subir nuevo» → la confirmación dice "Givi: 18.432 → 18.447 caracteres, la revisión no encontró nada raro" → «Subir y usar». El bot lo usa desde el próximo mensaje y la versión anterior queda en el historial. Si mientras tanto Hans hubiera subido otro cambio, la subida de Pietro se rechaza con "Alguien cambió este prompt después de que lo bajaste" y no se pierde nada.

**Implementación de referencia** (repo `momentum-ai-crm`, PR #411): `src/lib/prompt-del-bot/archivo.ts`, `src/app/master/_actions/prompt-del-bot.ts`, `src/app/master/clientes/[slug]/_components/prompt-del-bot-card.tsx` e `historial-prompt.tsx`, migración `0145_historial_prompt_del_bot.sql`, y el skill en `src/lib/prompt-del-bot/skill/SKILL.md`.
