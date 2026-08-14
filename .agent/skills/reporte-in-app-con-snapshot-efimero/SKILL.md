# Skill: Reportar desde la app cuando lo que hay que reportar es EFÍMERO

## Cuándo usar esta skill

- Vas a agregar **"reportar un bug" / "mandar feedback"** dentro del producto, y el reporte tiene que llegar con la **evidencia**, no solo con la queja.
- El usuario está probando algo en un **playground / preview / simulador / vista previa** y lo que ve **no queda guardado en tu base**.
- Alguien te dice *"el bot me contestó cualquier cosa"* y no tenés forma de saber qué le contestó.
- Vas a construir el panel donde **vos** leés esos reportes.

## Por qué existe esta skill

Capturada el **2026-08-13** en el CRM de Momentum (PR #113), construyendo la sección de reportes del "Probar bot".

El pedido sonaba simple —*"un botón para reportar la conversación"*— hasta que se leyó el código del playground:

> `sendTestMessage` llama a n8n, devuelve las burbujas y **no escribe una sola fila**.
> La conversación vive en el estado de React y **muere con un F5**.

Ese hecho decide toda la arquitectura, y es exactamente el que se descubre tarde:

**El reporte NO puede ir a buscar la evidencia después. El snapshot VIAJA con el reporte, en el instante del clic.**

Corolario que sigue: la evidencia **la manda el cliente**, y no hay forma de que sea de otra manera.

## Proceso

### 1. Primero: ¿esto es reconstruible?

Antes de diseñar nada, una pregunta:

> *"Cuando reciba este reporte, ¿el servidor puede ir a buscar lo que el usuario vio?"*

| Respuesta | Diseño |
|---|---|
| **Sí** (los mensajes están en tu base) | guardá un **FK** al recurso y listo — no necesitás esta skill |
| **No** (vive en el navegador, en un tercero, o es una vista derivada) | **snapshot en `jsonb`**, y seguí leyendo |

Casos que caen del lado "no" con más frecuencia de lo que parece: playgrounds, previews, resultados de una API externa que no persistís, estado de un formulario a medio llenar, un cálculo que se muestra pero no se guarda.

### 2. Separar lo que manda el cliente de lo que sale del contexto

Es la línea que decide si esto es una feature o un agujero:

```ts
await supabase.from('bug_reports').insert({
  agency_id: ctx.agencyId,        // ← del CONTEXTO AUTENTICADO. Jamás del navegador.
  reported_by: ctx.userId,        // ← idem
  comment:    saneado.comment,    // ← del cliente, saneado
  transcript: saneado.bubbles,    // ← del cliente, saneado
  context:    { user_agent: h.get('user-agent'), ... },  // ← lo lee el SERVER
});
```

Un transcript inventado **solo ensucia el reporte de quien lo inventó**: no vale la pena defenderse de eso. Un `agency_id` del navegador **escribe en la cuenta de otro cliente**: eso sí.

Y el user agent lo lee el servidor de sus propios headers — no tiene sentido dejar que el navegador se autodescriba.

### 3. Sanear por FORMA y TAMAÑO — descartando, no rechazando

El riesgo real no es el atacante: es un `jsonb` de megabytes, o una estructura que después **rompe el render de tu propio panel**.

Dos reglas que parecen opuestas y no lo son:

- **Una burbuja rota se descarta en silencio.** Perder una burbuja rara es muchísimo mejor que perder el reporte entero — el usuario ya hizo el esfuerzo de escribir.
- **Lo que ni siquiera es un array SÍ falla.** Eso es tu front roto o alguien probando, y conviene enterarse.

```ts
if (!Array.isArray(raw)) return { ok: false, error: 'forma_invalida' };  // falla
for (const item of raw) { if (!valida(item)) { dropped++; continue; } }  // descarta
```

Guardá el conteo de descartadas en el `context` y mostralo en el panel: *"se descartaron 3 burbujas al guardar"*. Sin eso, un front que rompe burbujas es invisible para siempre.

Si el snapshot trae URLs, **solo `http(s)`**: un `javascript:` o un `data:` gigante no tienen nada que hacer en el `<img>` de tu panel.

### 4. ⭐ Al recortar por tamaño, tirá lo VIEJO

El detalle que nadie piensa y que decide si el reporte sirve:

```ts
while (bytes(trimmed) > MAX) trimmed = trimmed.slice(1);   // ← saca del PRINCIPIO
```

**El final de la conversación es donde el usuario vio el problema.** Cortar por el final tira justamente la evidencia y te deja el saludo inicial.

### 5. Congelar la selección al MONTAR, no con un efecto

Si el usuario elige qué adjuntar, esa lista debe quedar fija. El instinto es un `useEffect` que sincroniza el estado con `open` — y el linter de React tiene razón en rechazarlo (renders en cascada).

La solución es mejor **y** más simple: que el modal **se desmonte al cerrar**.

```tsx
export function ReportarModal(props) {
  if (!props.open) return null;          // ← el envoltorio decide
  return <ReportarModalInner {...props} />;
}
function ReportarModalInner({ messages = [] }) {
  const [frozen] = useState(() => messages);                        // foto al MONTAR
  const [selected, setSelected] = useState(() => new Set(messages.map(m => m.id)));
  // …el comentario a medio escribir también se limpia solo al cerrar
}
```

Y lo que se manda se **deriva** de la lista congelada, nunca del `Set` suelto — así es imposible adjuntar algo que el usuario no tuvo delante (la misma garantía estructural de `acciones-en-lote-seguras`).

**Todo marcado por defecto:** el caso común es *"mirá esta conversación"*, y desmarcar lo que sobra es menos trabajo que marcar lo que importa. Desmarcar todo debe dejar un **bug suelto** válido, no un error.

### 6. Dos puntos de entrada, UN modal

- Desde la pantalla con evidencia → llega con las burbujas.
- Desde cualquier otra pantalla (sidebar, menú) → llega vacío.

**El mismo componente para los dos.** Si los separás, en seis meses uno tiene un campo que el otro no.

Dos detalles: el acceso global va para **todos los roles, incluido el de solo lectura** (encontrar un bug no requiere permiso de escritura), y si el shell renderiza el sidebar dos veces —desktop + drawer mobile— el modal se monta **una sola vez**, fuera de esa función.

### 7. Del lado del que lo recibe

- **Renderizá el snapshot con la MISMA semántica visual que el original.** No es cosmético: cuando el reporte dice *"contestó cualquier cosa"*, hay que ver de un vistazo qué burbuja es de quién sin leer etiquetas.
- **Copiá nombre y correo del que reportó al reporte** (`reporter_name`, `reporter_email`), no los derives del join. Si mañana dan de baja a esa persona, el FK queda NULL y el reporte se vuelve **anónimo** — justo cuando querés repreguntarle.
- **El estado lo mueve solo quien gestiona.** Es de los pocos casos donde el `INSERT` y el `UPDATE` **no expresan el mismo permiso**: reportar es de todos, gestionar es del dueño del panel. Escribilas como policies **separadas** (no un `for all`) para que la diferencia sea explícita — dentro de cada una, `USING` y `WITH CHECK` siguen diciendo lo mismo.
- **Filtro en la URL**, no en estado de cliente: la vista queda linkeable y sobrevive al F5.
- **Tope por hora y por persona** (ej. 20). No es contra un atacante: es contra un bucle del front o un doble clic insistente llenando tu bandeja.

### 8. Verificar

Además del verify script puro (forma, topes, recorte por el lado correcto, control negativo):

- **Las policies bajo los roles REALES**, con el bloque que siempre aborta (ver `probar-migracion-contra-base-viva-con-rollback`): que el usuario común inserte en lo suyo, **lance 42501** en lo ajeno, y que su `update`/`delete` den **0 filas SIN error**.
- **⚠️ El join del panel bajo RLS.** Si el `join` con la tabla del tenant viniera vacío, **toda tu bandeja diría "Negocio eliminado"** — y ni `tsc` ni el build lo ven. Medilo bajo el rol real.
- Que las rutas nuevas **redirijan sin sesión** en vez de tirar 500.

## Output esperado

- Una tabla con `transcript jsonb` + `context jsonb`, con CHECK de forma y tope, y policies **separadas** para insert vs update.
- Un módulo **puro** de saneado (`lib/<dominio>/transcript.ts`) — sin DB, sin React — que el verify script pueda ejercitar.
- Un modal reusado por todos los puntos de entrada.
- Un panel que renderiza el snapshot con la semántica visual del original.

## Ejemplo

**Input:** el cliente prueba su bot, ve que le da el precio de otra propiedad, y aprieta *Reportar*.

**Output:** llega un reporte con su comentario, las 6 burbujas que eligió, y el rastro que él no sabría dar (pantalla, `session_id`, navegador). En el panel se ve la conversación tal como él la vio, y desde ahí se le cambia el estado y se le deja nota interna.

## Regla de oro

**Si el usuario tuvo que contarte con palabras lo que ya había en pantalla, el reporte llegó tarde.**
Y si lo que hay en pantalla no se puede reconstruir después, entonces tiene que viajar en el mismo clic — saneado, recortado por el principio, y con el tenant puesto por el servidor.

## Skills relacionadas

- `acciones-en-lote-seguras` — de dónde sale lo de **derivar** la selección en vez de guardarla.
- `probar-migracion-contra-base-viva-con-rollback` — el bloque que siempre aborta, para probar las policies.
- `detectar-escritura-filtrada-rls` — por qué el insert y el update piden `.select()` y cuentan filas.
- `dialogo-confirmacion-no-nativo` — el patrón de modal del design system.
- `debugging-silent-errors` — la familia de fallos que esta feature busca hacer visibles.
