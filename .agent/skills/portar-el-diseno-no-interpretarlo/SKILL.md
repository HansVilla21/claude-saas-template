# Skill: Portar el diseño, no interpretarlo

## Cuándo usar esta skill

- El founder o el cliente te pasó un **diseño hecho**: un `.dc.html` de Claude Design, un export
  de Figma, un mockup, una captura anotada, un HTML de referencia.
- Vas a construir una pantalla **que ya existe en ese material**.
- El proyecto tiene **más de una superficie** (sitio público + panel de administración + app
  móvil) y estás por asumir que comparten estética.
- Ya entregaste una pantalla y la respuesta fue *"esto no es lo que te pasé"* / *"me creaste otra
  cosa"*.

**Costo de no usarla:** en Mueblería Pérez Luna se leyeron **solo las etiquetas de texto** del
diseño del panel y se armó la UI con la estética serif del sitio público. El diseño real tenía su
propio sistema —Inter/sans, índigo `#283479`, naranja `#BB6225`, fondo `#F5F5F7`, tarjetas con
chips de ícono, barras de progreso, pills—. El founder lo marcó fuerte: *"no está siguiendo
instrucciones... me creaste otra cosa"*. **Hubo que rehacer la pantalla entera.**

---

## Por qué existe esta skill

Cuando existe un diseño, el trabajo **no es diseñar**. Es portar. Y portar tiene un estándar
distinto: la unidad de verdad no es *"se ve bien"*, es *"se ve igual"*.

El fallo tiene una forma muy concreta y muy repetible:

1. Abrís el archivo del diseño y **grepeás los textos** — los títulos, los botones, las etiquetas.
2. Con esa lista armás la pantalla usando el sistema de diseño **que ya tenés en la cabeza**,
   que casi siempre es el de la última pantalla que construiste.
3. Queda una pantalla coherente, prolija... y **que no es la que te pasaron**.

Es un atajo que se siente productivo: leíste el archivo, sacaste lo que "importa", construiste
rápido. Pero el contenido es la parte que igual ibas a poder inferir. **Lo que solo está en el
archivo es todo lo demás**: la escala tipográfica, el color exacto, el espaciado, la forma de los
componentes, los íconos, los estados.

Y la trampa de segundo orden: **cada superficie puede tener su propio sistema de diseño.** El
panel de administración no tiene por qué parecerse al sitio público — muchas veces no debe. Asumir
continuidad estética entre superficies es exactamente el error que produjo la reescritura.

---

## Proceso

### 1. Leer el archivo ENTERO, no grepearlo

Antes de escribir una línea de código, abrí el archivo del diseño completo. Sí, entero. Si son
1.200 líneas de HTML con estilos inline, se leen las 1.200.

> Si el archivo es demasiado grande para leerlo de una, leelo por secciones — pero leelo. Un
> `grep` de textos te da el 10% que ibas a adivinar igual y te esconde el 90% que no.

### 2. Extraer los tokens ANTES de construir

Hacé la lista explícita, en un comentario o en un archivo de tokens:

```
fuente:        Inter (sans), NO la serif del sitio público
colores:       índigo #283479 (primario) · naranja #BB6225 (acento) · #F5F5F7 (fondo)
radios:        tarjetas 12px · pills 999px
componentes:   chip con ícono · barra de progreso · pill de estado · switch
espaciado:     ...
```

Tener los tokens escritos convierte "se parece" en algo verificable. Sin esa lista, la comparación
es de memoria contra memoria.

### 3. Replicar los componentes, no aproximarlos

Un chip con ícono **no** es un badge de texto. Una barra de progreso **no** es un porcentaje
escrito. Un switch **no** es un checkbox. Si el diseño trae un componente que tu librería no
tiene, se construye — es más barato que la ronda de correcciones.

Los **íconos SVG** van tal cual del archivo. Reemplazarlos por los de tu set de íconos es el
cambio que más rápido se nota y menos se justifica.

### 4. Comparar el resultado contra el archivo, midiendo

No de memoria. Abrí los dos, y verificá **los valores computados**: color exacto, tamaño de
fuente, radio, espaciado. Si el diseño dice `#283479`, tu pantalla dice `#283479`.

(Cómo medir el CSS que el server realmente sirvió: `verificar-frontend-sin-ver`.)

### 5. Lo que el diseño NO define, se pregunta o se decide explícito

Un mockup casi nunca cubre estados vacíos, errores, carga, o el responsive. Esos huecos son
**tuyos**, y ahí sí diseñás — pero decilo: *"el diseño no cubre el estado vacío de esta tabla;
lo resolví así"*. Que se sepa qué es porteo y qué es criterio propio.

### 6. Si vas a apartarte del diseño, avisá ANTES

A veces el diseño tiene un problema real: contraste insuficiente, un componente que no funciona en
móvil, una jerarquía que pelea con el contenido real. Está perfecto señalarlo — **antes de
construir otra cosa**, no después. Apartarse en silencio es lo que se lee como "no seguiste
instrucciones".

---

## Output esperado

- La pantalla construida con los **tokens del diseño**, no con los del resto del proyecto.
- Una lista de tokens escrita, para que la comparación sea verificable.
- Los componentes replicados, no aproximados; los SVG portados tal cual.
- Los huecos del diseño (vacíos, errores, responsive) resueltos **y señalados como decisión propia**.

---

## Gotchas / antipatrones

- 🔴 **Grepear los textos y construir con tu estética.** Es el antipatrón que esta skill existe
  para matar. Se siente rápido y cuesta la pantalla entera.
- 🔴 **Asumir que todas las superficies comparten el sistema de diseño.** El panel ≠ el sitio
  público. Cada archivo del handoff puede traer el suyo.
- 🔴 **Reemplazar los íconos por los de tu librería.** Es lo primero que se ve.
- ⚠️ **"Lo mejoré un poco".** Si no lo avisaste antes, no es una mejora: es un desvío.
- ⚠️ **Comparar de memoria.** Se compara midiendo, con los dos a la vista.
- ⚠️ **Tratar el diseño como referencia inspiracional.** Si te lo pasaron, es una especificación.

---

## Ejemplo concreto (Mueblería Pérez Luna, panel de gestión, 2026-07)

**Input:** un `.dc.html` de Claude Design para el gestor de inventario, con su propio sistema:
Inter, índigo `#283479`, naranja `#BB6225`, fondo `#F5F5F7`, tarjetas con chips de ícono, barras
de progreso y pills.

**Lo que se hizo mal:** se leyeron las etiquetas y se construyó con la estética **serif del sitio
público**, asumiendo continuidad de marca entre las dos superficies.

**Resultado:** *"no está siguiendo instrucciones... me creaste otra cosa"*. Pantalla rehecha entera.

**La regla que quedó:** antes de construir una pantalla que existe en el handoff, **leer el
archivo completo** y replicar sus estilos tal cual. Cada superficie del handoff puede tener su
propio sistema de diseño.

---

## Skills relacionadas

- `verificar-frontend-sin-ver` — cómo comprobar el CSS que el server realmente sirvió, sin
  pedirle capturas a nadie.
- `verificar-visual-midiendo-contraste` — medir en vez de estimar.
- `reskin-marca-coherente` — el caso inverso: cuando SÍ te toca imponer tu sistema sobre algo
  heredado.
- `ui-distintiva-no-ai-default` — cuando **no** hay diseño y hay que producir uno que no sea
  genérico.
