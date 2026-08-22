# Skill: Transcripciones de reuniones al CRM (Fathom)

## Cuándo usar esta skill

- Un cliente quiere que las **transcripciones de sus llamadas** caigan solas en la
  ficha de cada persona.
- Aparece **Fathom**, Fireflies, Otter, Grain o cualquier grabador de reuniones.
- Vas a **recibir un webhook** de un servicio serio (los gotchas 1, 2 y 3 aplican a
  cualquiera).
- Vas a **emparejar por correo** dos sistemas que no se conocen.

> Capturada el 2026-07-17 del CRM de Josué R. Miranda. Cross-project: lo que casi
> mata esto no tiene nada que ver con ese cliente.

## Proceso

### 1. Contar ANTES de construir — y contar lo que DECIDE

Todo el diseño se apoya en emparejar por correo. Entonces:

```sql
select count(*), count(email) from leads where deleted_at is null;
-- y, más importante:
select lower(email), count(*) from leads group by 1 having count(*) > 1;
```

**Dos números y no uno.** Cuántos tienen correo (si son pocos, esto no se
construye) y **cuántos están repetidos** (si hay repetidos, el emparejamiento es
ambiguo y va a pegar la transcripción en la ficha equivocada — mucho peor que no
pegarla).

En Josué: **53 de 56 (95%), cero repetidos** → verde.

### 2. Buscar lo que ya existe ANTES de escribir

En Josué, **la mitad estaba construida**: la tabla ya aceptaba
`type='transcripcion'`, la tarjeta ya estaba en la ficha, y había un "agregar a
mano" que funcionaba. **Faltaba la cañería, no el destino.**

Y el webhook **también existía… y era una ficción** (ver Gotcha 7).

### 3. NO adivinar el payload. Ir a la doc.

Y si la doc no carga —pasó— **decirlo en el código** y leer a la defensiva. La
verdad llega con el primer webhook real.

### 4. El orden importa más que el código

1. Leer el **body crudo** (sin parsear).
2. **Verificar la firma** contra ese crudo.
3. **Guardar el crudo**, antes de entenderlo.
4. Recién ahí, interpretar y emparejar.

El paso 3 es la regla de oro: si mañana el proveedor cambia un campo, **la reunión
ya está en la base** y se puede reprocesar. Si validás primero, se pierde y no
queda rastro de qué llegó.

### 5. Tres estados, no dos

Un secreto de webhook **no se puede probar guardándolo**: solo se prueba
recibiendo un webhook. No hay a quién preguntarle (a diferencia de una API key).

```
sin_configurar → esperando_primer_evento → funcionando
```

**El del medio es el que importa.** Es la diferencia entre "lo configuré" y
"funciona". Sin él, la UI dice "conectado" en verde sobre algo que puede estar mal
escrito, y nadie se entera hasta que el cliente termina una reunión y no aparece.

### 6. Decidir qué NO entra — sin perder nada

Después de la venta, el cliente sigue teniendo reuniones y el webhook las sigue
recibiendo. Hay que filtrar, pero **filtrar no es tirar**: el crudo se guarda
siempre. El filtro solo decide si se crea la tarjeta en la ficha.

## Output esperado

- `verify.ts` (firma, **pura y testeable**), `payload.ts` (parseo, **puro**),
  `conexion.ts` (el secreto cifrado), `bandeja.ts` (las que no encontraron dueño).
- El webhook: crudo → firma → guardar → interpretar.
- Tarjeta con la **URL para copiar** y el **campo del secreto**, y los tres estados.
- Una **bandeja** para las que no encontraron lead.
- Dos suites: una **pura** (firma y parseo, sin base ni red) y una **e2e** contra el
  handler y la base reales, **con limpieza verificada**.
- **Probablemente cero migraciones.** Si ya tenés una tabla de eventos de
  integración, seguro tiene `payload`, `dedup_key` y un `lead_id` nullable — que es
  exactamente todo.

## Gotchas (los que cuestan caro)

**1. ⚠️ El body CRUDO, antes de `JSON.parse`.** La firma se calcula sobre esos
bytes exactos. Parsear y re-serializar cambia un espacio o el orden de una clave y
**la firma no valida nunca**. El bug se ve como *"el proveedor manda firmas malas"*,
que es lo último que uno sospecha. En Next: `req.text()`, jamás `req.json()`.

**2. ⚠️ Validá el timestamp, o el replay es gratis.** Sin tolerancia (~5 min),
cualquiera que capture una request válida la reenvía para siempre. **Y rechazá
también los del futuro:** un reloj adelantado es igual de sospechoso.

**3. El `webhook-id` ES tu clave de idempotencia.** Viene hecha. No inventes dedup
por título — dos reuniones distintas se llaman igual y las vas a colapsar (eso
hacía el código viejo).

**4. Devolvé 200 a casi todo.** Un 4xx/5xx hace reintentar. Si el problema es tuyo
(no encontraste el lead, cambió el payload), reintentar no arregla nada y genera
duplicados. **Los únicos que fallan cerrado son los de firma: 401.**

**5. 🔴 `ON DELETE CASCADE` en la tabla de eventos.** Si los eventos cuelgan de la
fila de la integración con cascade, **el botón de "quitar" borra el historial
entero**. En Josué habría borrado transcripciones de reuniones reales — y la misma
mina seguía armada para otro proveedor con 824 eventos. **Desconectar apaga
(`active=false`), no borra.** Verificalo:
```sql
select tc.table_name, rc.delete_rule from information_schema.referential_constraints rc
  join information_schema.table_constraints tc using (constraint_name);
```

**6. Preguntá por el HECHO, no por el nombre.** Para filtrar "ya compró", usá
`stages.is_won`, **no** `stage_id === 'cerrado'`. El id es un nombre y los nombres
cambian: si el cliente administra sus etapas, el día que renombre una, tu filtro
deja de filtrar **y nadie se entera**.

**7. 🔴 El código que "ya existe" puede ser una ficción.** El webhook de Fathom
estaba escrito y tenía **cinco invenciones**: esperaba campos que no existen, una
auth que el proveedor no usa, un tipo equivocado, y creía que no había columna de
texto largo (habría guardado **500 chars** de una transcripción de 45 minutos).
Nadie lo notó porque **nunca corrió**.
**La única diferencia entre código que funciona y código que miente es que uno se
ejecutó.** Antes de confiar en un archivo que no se ejecutó nunca: leelo contra la
doc del proveedor, línea por línea.

**8. Esconder sin avisar es borrar.** Si filtrás reuniones de la ficha, **decí
cuántas no mostrás**. Si el dueño busca la del martes y no aparece, va a pensar que
el sistema falla — y va a tener razón en dudar. Y **derivá el número** (recibidas −
mostradas): un contador guardado se desincroniza.

**9. La bandeja necesita "descartar".** No todo lo que graba el asistente es una
llamada de venta (reuniones internas, proveedores, pruebas). Sin descartar, la
bandeja acumula basura, el cliente deja de mirarla, **y una bandeja que nadie mira
es la peor forma de perder un aviso.** Descartar **marca**, no borra.

**10. El filtro que lista y el contador que avisa tienen que decir LO MISMO.** Me
lo comí: `descartar()` marcaba el evento y la lista no lo filtraba → las
descartadas se quedaban para siempre, y el aviso no se apagaba nunca. **Poné el
filtro en un solo lugar.**

## Ejemplo

**Input:**
"Quiero que las transcripciones de las llamadas caigan solas en la ficha del lead."

**Output (lo que pasó en el CRM de Josué, 2026-07-17):**

- El conteo dio **53/56 con correo, cero repetidos** → verde, y sin ambigüedad.
- **Cero migraciones**: la tabla de eventos ya tenía `payload`, `dedup_key` y
  `lead_id` nullable.
- El e2e (**47 aserciones**, contra el handler y la base REALES) emparejó a un lead
  de verdad por su correo, le pegó la transcripción **entera** (21.489 chars en una
  prueba — el código viejo habría guardado 500), rechazó el reintento, y **borró
  todo rastro**, verificando que los 824 eventos del otro proveedor y los 67 leads
  quedaron intactos.
- **El test cazó DOS bugs míos** el mismo día: `descartar` que no sacaba de la
  bandeja, y el contador del aviso que no se apagaba nunca.
- La restricción salió del cliente, no de mí: *"cuando ya es cliente, Josué sigue
  teniendo reuniones y eso va a seguir mandando todo al CRM"*. Su primera idea —
  *"si ya tiene una transcripción, no agregar más"*— **se descartó**: una venta
  necesita dos llamadas y esa regla habría tirado la segunda, que es la que cierra.
