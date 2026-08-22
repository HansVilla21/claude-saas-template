# Skill: Probar el motor de IA FUERA de la app (A/B barato sobre datos reales)

## Cuándo usar esta skill

- Querés comparar dos versiones de un prompt / receta / config de modelo **sobre datos reales de usuarios**, sin crear jobs falsos ni ensuciar la base.
- Necesitás evidencia visual para decidir (ver [[causa-raiz-mala-calidad-ia-esta-en-el-input]]) y probar por la UI cuesta créditos, tiempo y deja basura en producción.
- Estás por pedirle al founder que "pruebe de nuevo en la app" para validar un cambio tuyo. Casi siempre hay una forma más rápida.

## Por qué existe esta skill

Probar un cambio de motor por la UI de producción tiene 4 costos: pasás por auth, consumís créditos del usuario, escribís filas de `jobs`/`creatives` que después hay que limpiar, y **no podés correr las dos variantes con el mismo input** (el A y el B quedan en momentos distintos, con estado distinto).

En FreshAdFlow (2026-07-11) el A/B que destapó la causa raíz de los anuncios malos se corrió con un script standalone que importa el **mismo `recipes.ts` que corre en producción** — no una copia. Costó ~$0.06–0.09 por imagen y cero filas en la base.

**La clave:** importar el módulo REAL del producto, no reescribir el prompt en el script. Si el script tiene su propia copia de las recetas, estás probando otra cosa.

## Proceso

### 1. Que el motor sea importable sin arrastrar la app

El módulo de recetas/prompts debe ser **puro**: entra config, sale string. Sin `import "server-only"`, sin cliente de DB, sin `next/headers`. Si hoy no lo es, separarlo vale la pena por sí solo — es lo que hace el motor testeable.

```
src/server/engine/
  recipes.ts   <- puro: config -> prompt   (importable desde cualquier lado)
  openai.ts    <- solo la llamada HTTP
  images.ts    <- post-proceso
```

### 2. Importar el TypeScript real sin build

Node moderno corre `.ts` directamente quitando los tipos. Desde un script suelto, importalo por **file URL** (evita el infierno de los alias `@/` y del `tsconfig`):

```js
// scripts/ab-modo.mjs  ->  node --experimental-strip-types scripts/ab-modo.mjs
import { pathToFileURL } from "node:url";
import path from "node:path";

const recipes = await import(
  pathToFileURL(path.resolve("src/server/engine/recipes.ts")).href
);

const prompts = recipes.buildBatch({
  mode: "service",          // <- la UNICA variable que cambia entre A y B
  style: "premium",
  objetivo: "vender",
  count: 3,
  fields: { what: "masajes relajantes", benefit: "..." }, // datos REALES del usuario
});
```

> Si el runtime no soporta strip-types, la alternativa es `tsx scripts/ab.mjs` (dev dependency) o un `esbuild` de un solo archivo. Lo que **no** vale es copiar el prompt al script.

### 3. Un directorio de salida fechado por hipótesis

```
outputs/generaciones/
  <email>-2026-07-11/          <- lo que el usuario generó de verdad (control)
  PRUEBA-modo-correcto/        <- la variante B
```

Guardá junto al set el prompt exacto de cada imagen y la config. Sin eso, en dos semanas no vas a saber qué produjo qué.

### 4. Cambiar UNA variable

A y B comparten input, motor, versión y modelo. Si cambiás dos cosas, el resultado no prueba nada.

### 5. Reportar con la evidencia, no con la conclusión

El entregable es la carpeta comparable + una tabla de dos columnas. El founder decide mirando, no leyendo tu razonamiento.

## Gotchas

- **Cuesta plata de verdad.** Es la API real. Calculá antes: en FreshAdFlow ~$0.06/img cuadrada y ~$0.09 vertical, así que un A/B de 2 casos x 3 imágenes x 2 modos ≈ $0.80. Barato contra una sesión perdida, pero no es gratis.
- **El tope de gasto del proveedor puede tumbarte a mitad del test** — y con él, **producción**. Durante este mismo A/B la API empezó a devolver `400 billing_hard_limit_reached` y freshadflow.com no pudo generar **ni una** imagen para ningún usuario. Ver [[anti-abuso-costo-ia-saas]].
- **No escribas en Storage ni en la DB desde el script.** El punto es que no deje rastro. Escribí a disco local.
- **Ojo con el estado compartido:** si el módulo lee env vars, cargá el `.env` explícitamente en el script; no asumas que ya están.
- Este script es **desechable y valioso**: dejalo en `scripts/` con el nombre de la hipótesis (`ab-modo.mjs`), no en un scratchpad que se borra.

## Ejemplo (input -> output)

- **Input:** "¿el problema es el motor o el modo que eligió la usuaria?"
- **Proceso:** script que importa el `recipes.ts` real, corre los 2 casos reales en su modo correcto, escribe a `outputs/generaciones/PRUEBA-modo-correcto/`.
- **Output:** 6 imágenes comparables contra las 21 que generaron las usuarias, por ~$0.50, sin tocar la base. Decisión tomada en una sesión.

## Relacionadas

[[causa-raiz-mala-calidad-ia-esta-en-el-input]] · [[motor-de-recetas-de-prompts-para-imagen]] · [[gate-0-validar-motor-antes-de-construir]] · [[anti-abuso-costo-ia-saas]]
