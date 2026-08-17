# Skill: Arreglar un problema de legibilidad MIDIENDO, no mirando

## Cuándo usar esta skill

- El founder (o un cliente) reporta *"casi no se ve"*, *"esas letras están muy oscuras"*, *"cambiale el color".*
- Vas a poner texto sobre un fondo **de color, degradado o translúcido**.
- Estás reusando un componente en dos superficies distintas (burbuja clara y burbuja oscura, card blanca y banner de color).
- Vas a elegir una opacidad "para que se vea más suave".

## Por qué existe esta skill

Capturada el **2026-07-16** en el CRM de Momentum. El founder reportó que la cita de una respuesta *"casi no se ve"* en su propia burbuja.

**Causa:** el bloque de cita estaba escrito para fondo claro (autor en `text-accent`, texto en `text-ink`), pero la burbuja saliente del agente es un **degradado morado con texto blanco**. El autor quedaba **morado sobre morado**.

**Lo que midiendo salió y a ojo NO habría salido:**

1. **El primer instinto —aclarar el velo del fondo— empeoraba las cosas.** `bg-white/20` sobre morado da **3.2:1**: mejor que invisible, pero **bajo el mínimo legible**. Oscurecerlo (`bg-black/20`) lo sube a **6.42:1**. Es además lo que hace WhatsApp: la cita es un tono **más oscuro**, no más claro.
2. **`text-white/85` se veía elegante y era ilegible: 3.01:1.** En blanco pleno: **6.42:1**.

Las dos decisiones "se veían bien" en la pantalla. Los números decían otra cosa.

## Proceso

### 1. Buscar si el componente YA tiene resuelto el problema

Antes de inventar: casi siempre existe el patrón. En este caso el archivo **ya tenía** `captionInk = isAgentOutbound ? 'text-white' : 'text-ink'` para los pies de foto — el mismo problema, ya resuelto. **Se había olvidado aplicarlo a la cita.**

### 2. Parametrizar por superficie, no hardcodear

```tsx
/** `onDark` NO es estético: la burbuja del agente es un degradado morado con
 *  texto blanco, y los colores de fondo claro quedan ilegibles ahí. */
function QuotedBlock({ onDark, … }) {
  <span className={onDark ? 'text-white' : 'text-accent'}>…</span>
}
```
Y pasar el flag desde la única fuente que lo sabe (`onDark={isAgentOutbound}`).

### 3. MEDIR el ratio real en el browser — componiendo el velo

El paso que nadie hace. Un velo translúcido **no es** el color que escribiste: es ese color **compuesto** sobre el fondo real.

```js
(() => {
  const lum = ([r,g,b]) => { const f=(v)=>{v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
  const ratio = (a,b) => { const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };
  const parse = (s) => s.match(/[\d.]+/g).map(Number);
  const over  = (fg,bg) => { const a = fg[3] ?? 1; return [0,1,2].map(i => a*fg[i] + (1-a)*bg[i]); };

  const el = document.querySelector('<selector>');
  const bgReal = [109, 94, 252];                       // el color del degradado
  const velo = parse(getComputedStyle(el).backgroundColor);
  const compuesto = velo.length === 4 ? over(velo, bgReal) : bgReal;
  const txt = parse(getComputedStyle(el.querySelector('span')).color);
  return ratio(over(txt, compuesto), compuesto).toFixed(2) + ':1';
})()
```

**Umbral:** **4.5:1** para texto normal. 3:1 solo para texto grande (≥18px, o ≥14px bold).

### 4. Medir SIEMPRE el control: la superficie que NO se reportó

El arreglo de un lado rompe el otro fácil. Montar las dos superficies y medir ambas.

### 5. Si un token queda corto, decirlo — no cambiarlo por tu cuenta

Medir sacó que el **acento sobre blanco da 3.95:1**, apenas bajo el ideal. Pero ese token se usa **en toda la app**: cambiarlo es una **decisión de paleta**, no de un fix puntual. Se reportó y se dejó.

## Output esperado

- El componente parametrizado por superficie (no un color hardcodeado).
- Una **tabla de ratios medidos**, del caso reportado **y** del control.
- Los tokens que quedan cortos, **reportados** al founder — no cambiados unilateralmente.

## Ejemplo

**Input:** *"le cambiaría el color a esas letras de la cita, casi no se ve"*.

**Output:**

| Burbuja | Autor | Texto |
|---|---|---|
| **Saliente (morada)** — lo reportado | **6.42:1** (antes: invisible) | **6.42:1** |
| Entrante (clara) — control | 3.95:1 | 7.76:1 |

Más el hallazgo: el velo va **más oscuro** (aclararlo daba 3.2:1) y el texto **no** puede ir a 85% (3.01:1). Y el reporte: el acento sobre blanco (3.95:1) es del token, decisión de paleta.

## Regla de oro

**"Se ve bien" no es una medida.** Un color sobre un degradado translúcido tiene un contraste que no podés estimar mirando — y tu instinto (aclarar el fondo) suele ir para el lado equivocado. Medilo en el browser, con el velo compuesto, y medí también el lado que no te reportaron.
