# Marca — Momentum AI

Los archivos originales de la marca, tal como los entregó el diseño. **Esta carpeta es
la fuente de verdad**: hasta el 2026-08-14 vivían únicamente en `Downloads` del founder,
mezclados con logos de otros clientes y con 4 a 8 copias duplicadas de cada uno
(`Momentum (1).png`, `(2)`, `(3)`…). El día que se limpiara esa carpeta, se perdían.

Acá está **una sola copia de cada variante**, verificada por checksum: los duplicados
eran byte por byte idénticos.

## Qué es cada archivo

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

## Lo que falta

**No hay SVG.** Todo el kit es PNG, incluso los masters. Para web es aceptable —los
tamaños que usa el CRM ya están generados— pero para impresión grande o para animar la
marca hace falta el vector. Si aparece el `.ai` / `.svg` original, va acá.
