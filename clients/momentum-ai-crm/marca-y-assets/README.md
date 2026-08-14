# Marca — Momentum AI

Los archivos originales de la marca, tal como los entregó el diseño. **Esta carpeta es
la fuente de verdad**: hasta el 2026-08-14 vivían únicamente en `Downloads` del founder,
mezclados con logos de otros clientes y con 4 a 8 copias duplicadas de cada uno
(`Momentum (1).png`, `(2)`, `(3)`…). El día que se limpiara esa carpeta, se perdían.

Acá está **una sola copia de cada variante**, verificada por checksum: los duplicados
eran byte por byte idénticos.

## Vectores (SVG) — agregados el 2026-08-14

El kit del diseño no traía vector: eran **todos PNG, incluso los masters**. Estos SVG se
**vectorizaron del original** y están verificados contra él (ver "Cómo se hicieron").

| Archivo | Qué es | Peso |
|---|---|---|
| `momentum-isologo.svg` | ⭐ **El isologo a todo color, vectorial.** El que hay que usar. | 5,8 KB |
| `momentum-isologo-mono.svg` | La silueta con `fill="currentColor"`: sirve de blanco, de negro o de cualquier color, sin archivos aparte. | 1,0 KB |
| `momentum-icono.svg` | El mismo isologo **encuadrado en un cuadrado** con 6 % de aire — para favicon o ícono de app. | 5,9 KB |

⚠️ **Estos SVG son una reconstrucción, no el archivo del diseñador.** Son fieles (números
abajo) y sirven para web, impresión y animación. Pero **los PNG siguen siendo los masters**:
si mañana aparece el `.ai` o el `.svg` original, ese manda y estos se reemplazan.

## Qué es cada archivo (los PNG originales)

| Archivo | Qué es | Tamaño |
|---|---|---|
| `Momentum_isologo color.png` | ⭐ **El isologo, relleno, a todo color.** El principal. De acá salen los íconos del CRM. | 5681×4269 |
| `Momentum_isologo blanco.png` | El isologo en blanco sólido — para fondos oscuros o de color. | 5677×4394 |
| `Momentum_isologo negro.png` | El isologo en negro sólido — para impresión a una tinta o fondos muy claros. | 5793×4230 |
| `momentum-logo.png` | El isologo **ya encuadrado** y con aire, listo para usar como ícono. Bajo (471px). | 471×470 |
| `Momentum.png` | Variante de **contorno** (línea, sin relleno), con degradado violeta→coral. | 5793×4230 |
| `Momentum_color horizontal.png` | Lockup horizontal (isologo + palabra), a color. | 22241×4377 |
| `Momentum_Blanco horizontal.png` | El mismo lockup en blanco. | 22290×4377 |
| `Momentum_Negro horizontal.png` | El mismo lockup en negro. | 21902×4265 |
| `Momentum-19.png` | Lockup horizontal en variante de **contorno**. | 22024×4377 |

Los nombres se dejaron **tal cual los entregó el diseño**, a propósito: renombrarlos
rompe la trazabilidad con el entregable original si mañana hay que pedir un ajuste.

## Dónde se usa hoy

El CRM (`crm-v2`) genera sus íconos **del `isologo color`**, no de `momentum-logo.png`:

```
src/app/favicon.ico       .ico multi-tamaño (16 → 256)
src/app/icon.png          512px — el <link rel="icon"> que prefieren los navegadores
src/app/apple-icon.png    180px sobre BLANCO (en iOS lo transparente sale negro)
public/brand/isologo.png  256px — la marca que usa la UI (barra, login, reset)
```

**Por qué del original y no del ya-encuadrado:** en `momentum-logo.png` la marca ocupa
apenas el **67% × 52%** del cuadro, así que a 16px —el tamaño de una pestaña— queda
diminuta y se lee como una mancha. Los del CRM se recortan al contenido real
(5285×4099 tras quitar el alfa vacío) y se encuadran con 6% de aire, sin deformar:
se escala por el lado que toca primero y se centra.

## Cómo regenerar los íconos

Si algún día cambia la marca, desde `crm-v2/`:

```python
from PIL import Image
im = Image.open("<ruta>/Momentum_isologo color.png").convert("RGBA")
im = im.crop(im.getchannel("A").getbbox())        # recorte al contenido real

def cuadrado(img, lado, margen=0.08, fondo=None):
    util = int(lado * (1 - 2 * margen))
    w, h = img.size
    esc = min(util / w, util / h)                 # NO deforma
    red = img.resize((round(w * esc), round(h * esc)), Image.LANCZOS)
    lienzo = Image.new("RGBA", (lado, lado), fondo or (0, 0, 0, 0))
    lienzo.paste(red, ((lado - red.width) // 2, (lado - red.height) // 2), red)
    return lienzo

cuadrado(im, 256).save("public/brand/isologo.png", optimize=True)
cuadrado(im, 512, margen=0.06).save("src/app/icon.png", optimize=True)
cuadrado(im, 180, margen=0.12, fondo=(255,255,255,255)).convert("RGB").save("src/app/apple-icon.png")
cuadrado(im, 256, margen=0.06).save("src/app/favicon.ico",
                                    sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
```

Después **mirar el resultado a 16 y 32px**, que es donde una marca fina se convierte en
manchas. Ahí se decide el margen, no en el archivo grande.

## Cómo se hicieron los SVG (y qué tan fieles son)

**No fue un autotrace.** Un trazado automático deja cientos de nodos con curvas
aproximadas; esto se midió y se reconstruyó.

**La geometría resultó ser exacta.** Cuatro piernas de ancho `t = 409,5` con paso
`530,17` (en un ancho de 2000); esquinas superiores de radio `= t` — y no un
semicírculo: hay un **techo plano** del ancho del hueco entre piernas; ranuras y lengua
con semicírculos de radio `g/2`. Los arcos ajustan a **círculos de verdad**, con menos de
2px de error sobre 2000. El SVG tiene ~30 nodos, no cientos.

**El color no es un degradado.** El listón se dobla sobre sí mismo y en cada doblez hay
una costura dura — en el PNG se ven como una caída del alfa a ~250 más un salto de color
de **hasta 235/255**. Se detectaron las 4, se trazaron, y cada tramo lleva su propio
degradado lineal ajustado por mínimos cuadrados sobre los píxeles reales.

**Los arcos se emiten como cúbicas calculadas, no como `<A>`:** las banderas de barrido
de los arcos SVG son la fuente clásica de arcos dibujados al revés.

| Verificación | Resultado |
|---|---|
| silueta, contra el canal alfa del PNG | **IoU 99,625 %** |
| color | error medio **0,37/255 (0,15 %)**; 99,4 % de los píxeles bajo 4/255 |
| en un navegador real (dibujado en `<canvas>`, 19 puntos) | diferencia **máxima 7/255** — y los 2 puntos que pasan de 3 están pegados a una costura |

Los scripts quedan acá: `_vectorizar.py` (mide, detecta costuras, ajusta degradados y
compara píxel a píxel) y `_gen_svg.py` (arma el path y verifica la silueta). Se corren con
Python + Pillow, nada más.

## Dónde se usan los SVG hoy

```
crm-v2/src/app/icon.svg          favicon vectorial (el <link> que prefiere el navegador)
crm-v2/public/brand/isologo.svg  la marca de la UI: barra, login y reset
```

Los PNG del CRM (`icon.png`, `apple-icon.png`, `favicon.ico`) quedan como respaldo para
navegadores viejos y para iOS, que no acepta SVG en el ícono de inicio.

## Lo que falta

**El vector ORIGINAL del diseñador.** Los SVG de acá son una reconstrucción fiel, no el
archivo fuente. Si aparece el `.ai` o el `.svg` original, reemplaza a estos y este README
se actualiza.
