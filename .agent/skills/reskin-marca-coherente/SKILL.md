# Skill: Re-skin de Marca Coherente

## Cuándo usar esta skill

- Heredaste un template/prototipo y le pegaste tu marca encima, pero "no se siente tuyo".
- La landing usa un color, pero el interior de la app se ve de otro (la marca "cambia" al loguearse).
- Querés migrar un sistema de diseño de un acento a otro (ej: morado → teal) y que **todo** quede coherente.
- Síntoma típico: cambiaste las variables de marca en `:root` y aun así siguen apareciendo colores del tema viejo.

## Principio rector

Cambiar los tokens **NO alcanza**. El 80% del trabajo es **encontrar lo que se salta los tokens**:
colores hardcodeados en estilos inline, sombras con el tinte del tema viejo, y —el asesino
silencioso— **overrides de variables CSS en runtime**.

## Proceso

### Paso 1 — Mapear la capa de tokens (fuente de verdad)

Abrí el CSS global (`:root`). Identificá las 4 familias y detectá tintes heredados:

- **Acentos (marca):** el/los color(es) de marca + sus tintes (`--accent`, `--accent-2`, `--accent-soft`).
- **Neutros:** fondo, tintas de texto, líneas. ¿El "blanco" es en realidad lavanda (`#f4f3fb`)? ¿Las tintas tienen matiz morado (`#15131f`)?
- **Sombras:** casi siempre llevan el tinte del tema viejo (ej: `rgba(80,60,180,…)` morado). Hay que re-teñirlas al color nuevo o a un carbón con un toque del tinte de marca.
- **Superficies oscuras:** pills de nav, tarjetas-héroe, toasts → suelen ser un gris/morado del template.

### Paso 2 — Cazar lo que se salta los tokens (CRÍTICO)

Los tokens propagan solo si los componentes los **usan**. Buscá lo que no:

```bash
# colores hardcodeados en componentes (inline styles)
grep -rn "#[0-9a-fA-F]\{6\}" src/components
grep -rn "rgba(" src/components
# overrides de variables CSS en runtime — EL ASESINO SILENCIOSO
grep -rn -- "--accent\|setProperty\|color-mix" src
```

**El patrón asesino** — un objeto de estilo que re-define la variable de marca en runtime:

```ts
const rootStyle = { "--accent": T.accent }   // T.accent = "#6d5efc" (¡morado!)
```

Esto pinta **todo el subárbol** con el color viejo por más que `:root` diga otra cosa. La landing
(fuera de ese árbol) se ve bien; la app (dentro) no. **Si la marca "cambia" al entrar a la app,
buscá esto PRIMERO** — suele ser la causa raíz de la incoherencia.

### Paso 3 — Ejecutar el cambio de forma sistemática

- **Tuplas de sombra repetidas** → `replace_all` por prefijo: `rgba(20,16,50,` → `rgba(14,38,32,`
  (atrapa todas las opacidades de un solo pase, sin tocar el resto).
- **Gradientes / hex literales** (pills, tarjetas, blooms del fondo) → edición puntual.
- **Override en runtime** → eliminarlo para que herede `:root`, o apuntarlo a los tokens de marca.
- **Legibilidad:** si el acento se usa como **texto** (links, tags), creá una variante un punto más
  oscura (`--accent-strong`) para pasar contraste AA. El acento de marca como texto chico casi nunca pasa.

### Paso 4 — Verificar (no confíes, comprobá)

- `grep` de los hex viejos → debe dar **cero**.
- `grep` amplio de hex en componentes → revisá a ojo que no quede ningún tono del tema viejo
  (lavandas/índigos sueltos en sparkbars, barras de progreso, hovers, mini-charts).
- Typecheck (`tsc --noEmit`): el cambio del override en runtime suele tocar TS.
- Build de **preview** antes de prod.

### Paso 5 — Deploy seguro

Rama `feat/` → push → preview → verificar READY por SHA → `push feat:main` → prod.
(Ver skill `deploy-seguro-vercel-preview-prod`.)

## Errores típicos

- Cambiar `:root` y cantar victoria sin barrer inline styles ni overrides en runtime.
- Re-teñir sombras a negro puro (se ve duro): mejor un carbón con un toque del tinte de marca.
- Olvidar el `themeColor` del `<meta>` (la barra del navegador en móvil queda del color viejo).
- Olvidar el **favicon** (queda con el color/glifo del template heredado).
- Romper contraste al usar el acento de marca como texto.

## Resultado

Una sola marca, coherente de la landing al interior de la app. Si alguien entra y "se siente otra
app" al loguearse, esta skill todavía no terminó.
