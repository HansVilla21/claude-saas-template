# Skill: Acciones en lote que no mienten ni tocan lo que no se ve

## Cuándo usar esta skill

- Vas a agregar **selección múltiple** + acciones masivas a una lista o tabla (etiquetar, cambiar estado, asignar, archivar, borrar).
- La pantalla tiene **filtros** o **búsqueda** y la selección puede sobrevivirlos.
- La operación es **irreversible o difícil de deshacer** (archivar, borrar, notificar).
- Hay **RLS o roles**: no todos los usuarios pueden tocar todas las filas del lote.

## Por qué existe esta skill

Capturada el **2026-08-13** en el CRM de Momentum (PR #111), construyendo las 5 acciones en lote de Contactos y del Inbox sobre agencias con hasta **579 leads**.

Las tres formas en que una feature de bulk sale mal, y ninguna es de diseño visual:

1. **Actúa sobre lo que el usuario ya no ve.** Marca 30, cambia el filtro, aprieta archivar → se archivan 30 filas que no estaban en pantalla. Para el usuario es irreversible **porque nunca supo cuáles eran**.
2. **Dice "50" cuando cambiaron 40.** Bajo RLS un `update` que filtra 10 filas **no da error**: afecta menos y devuelve éxito. Multiplicá el fallo silencioso de una fila por cincuenta.
3. **Es más permisiva que la app de a una fila.** Si el lote escribe con `admin client`, la RLS ya no te protege: el gate que escribas vos **es la única barrera**.

## Proceso

### 1. La selección se DERIVA, no se guarda

El instinto es guardar un `Set` de ids y limpiarlo con un `useEffect` cuando cambian los filtros. **No hagas eso**: ese efecto compite con el clic del usuario y podés perder la carrera.

En su lugar, todo lo que se muestra y todo lo que se manda al server pasa por la **intersección con lo visible ahora**:

```ts
export function effectiveSelection(selected: ReadonlySet<string>, visibleIds: readonly string[]) {
  return visibleIds.filter((id) => selected.has(id));   // + conserva el ORDEN de la pantalla
}
```

Así **lo que no se ve, no se puede tocar — por estructura**, no por disciplina. Efecto lateral buscado: volver al filtro anterior **recupera** lo marcado, que es lo que espera cualquiera que cambió de filtro por error.

Detalles que se agradecen: **Shift+clic** para rango (sin eso, mover 80 filas son 80 clics) y que "deseleccionar todo" solo saque **lo visible**, no lo marcado en otro filtro.

### 2. "Seleccionar todo" = lo filtrado, nunca la tabla entera

Decilo en la UI: *"Seleccionar las 47 de este filtro"*. Si tu producto necesita "las 579", eso es otra feature (con otra confirmación), no un checkbox.

### 3. El permiso se decide en código, y es explícito

Si escribís con `admin client` (necesario cuando la RLS bloquea operaciones legítimas), **la RLS dejó de protegerte**. El gate propio debe:

- resolver el `agency_id`/tenant **del contexto autenticado, NUNCA del navegador**;
- leer las filas pedidas **filtrando por ese tenant** — las que no vuelven cuentan como denegadas (no distingas "no existe" de "no es tuyo": esa diferencia filtra la existencia de datos ajenos);
- aplicar la **misma regla que ya usa el resto de la app** (un helper tipo `canEditConversation`), no una nueva;
- **validar el destino** (estado / etiqueta / persona) contra el tenant — sin eso, un cliente manipulado mueve 300 filas a la etapa de otro negocio;
- poner un **tope** por lote (ej. 1000) como cortafuegos.

Mantenelo **puro y testeable**: una función que recibe filas y devuelve `{ allowed, denied }`.

### 4. Reportar lo que la BASE dice que cambió

```ts
const { data } = await admin.from('leads').update({...})
  .eq('agency_id', ctx.agencyId).in('id', toWrite).select('id');   // ← la verdad
return { requested: ids.length, appliedIds: data.map(r => r.id), skipped: {...} };
```

Separá **antes de escribir** lo que ya estaba como se pidió (`ya estaban así`) — evita escrituras inútiles, sus eventos de realtime, y permite reportar honesto.

El mensaje al usuario, con los tres motivos:

```
40 de 50 contactos archivados (10 no son tuyos)
12 de 20 contactos marcados como leídos (3 sin conversación, 5 ya estaban así)
Los 6 ya estaban así                    ← éxito, NO fallo
```

**"Nada cambió porque ya estaban así" es un éxito.** Tratarlo como error entrena al usuario a ignorar los mensajes.

### 5. Aplicar en la UI solo lo confirmado

Acá **no** va el optimismo del resto de la app. Con 50 filas y resultado **parcial**, un rollback optimista no tiene a qué volver. Esperá la respuesta y aplicá **exactamente** los ids que devolvió la base.

Y deseleccioná **solo lo aplicado**: lo que quedó afuera **sigue marcado**, así el usuario ve sobre qué no se pudo actuar en vez de quedarse con un número y ninguna pista.

### 6. Confirmación y lenguaje

- Lo destructivo/disruptivo pide `<ConfirmDialog>` (nunca `window.confirm`); lo restaurativo (desarchivar) no.
- Si la acción es de otra entidad que la seleccionada, **cambiá el sustantivo**: *"18 conversaciones archivadas"* pero *"15 contactos etiquetados"* (deduplicaste conv→lead). Un número que baja sin explicación se lee como fallo.

### 7. Verificar

- **Lógica pura** con control negativo: *usar el Set crudo tocaría filas invisibles* · *reportar `requested` diría 50 donde hubo 40* · *con permisos de owner el agent tocaría la fila ajena*.
- **Semántica contra la base viva** (ver `probar-migracion-contra-base-viva-con-rollback` §bloque que siempre aborta): que el `on conflict do nothing … returning` devuelva **solo los nuevos**, que pedir ids de otro tenant actualice **menos**, que las "ya estaban así" no se toquen.
- **El alcance del gate, medido sobre datos reales.** No "el agente ve menos": *cada agente alcanza 5, 6 y 73 de los 579 leads*.

## Output esperado

- Motor compartido (`lib/bulk/` + hook + barra) usado por **todas** las pantallas con lote → no pueden divergir.
- Server actions que devuelven `{ requested, appliedIds, skipped: { sinPermiso, sinConversacion, sinCambio } }`.
- Un verify script con controles negativos + una medición del alcance real del gate.

## Ejemplo

**Input:** un agente selecciona 50 conversaciones en el inbox y aprieta Archivar.

**Output:**
```
⚠ 40 de 50 conversaciones archivadas (10 no son tuyos)
```
Las 10 que no se archivaron **siguen marcadas** en pantalla. El agente ve cuáles son.

## Regla de oro

**Un lote que dice "listo" sin haber contado no está listo: está adivinando.**
Y una selección que sobrevive a un cambio de filtro es una acción a ciegas esperando pasar.

## Skills relacionadas

- `detectar-escritura-filtrada-rls` — el mismo fallo silencioso, en una sola fila.
- `rls-write-bloqueada-por-policy-desalineada` — por qué la policy te filtra filas que creías tuyas.
- `dialogo-confirmacion-no-nativo` — el `<ConfirmDialog>` del design system.
- `probar-migracion-contra-base-viva-con-rollback` — probar la semántica SQL del lote sin tocar prod.
- `reporte-in-app-con-snapshot-efimero` — reusa esta misma garantía (derivar en vez de guardar) para
  elegir qué mensajes se adjuntan a un reporte.
