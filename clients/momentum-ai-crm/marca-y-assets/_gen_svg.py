# Genera el SVG del isologo y VERIFICA la silueta contra el PNG original.
#
# Geometria: medida del PNG. Los arcos son circulos de verdad (ajuste < 2px
# sobre 2000). Se emiten como cubicas exactas para no depender de las banderas
# de barrido de <A>, que son la fuente clasica de arcos al reves.

from PIL import Image, ImageDraw
import math, json

Image.MAX_IMAGE_PIXELS = None
OUT = "C:/Users/hvill/AppData/Local/Temp/claude/D--Antigravity-0--Proyectos-Personales-Inmobilioaria-CRM/7ef58628-be7a-4cae-a51f-002f67c472e0/scratchpad/"
SRC = "C:/Users/hvill/Downloads/Momentum_isologo color.png"

M = json.load(open(OUT + "modelo.json"))
G = M["geom"]
W, H = G["W"], G["H"]
t, p, g = G["t"], G["p"], G["g"]
XL = [i * p for i in range(4)]
XR = [x + t for x in XL]
half = t / 2
rs = g / 2
Y_RAN = G["y_ranura"]     # centro del semicirculo de las ranuras de arriba
Y_LEN = G["y_lengua"]     # centro del semicirculo de la lengua de abajo
YC_TOP = t                # centro de las esquinas de arriba
YC_BOT = H - t            # centro de las esquinas de abajo
YC_CAP = H - half         # centro de los casquetes de las piernas 1 y 4

# ── arco de circulo -> cubicas ─────────────────────────────────────────────
K = 4 / 3 * (math.sqrt(2) - 1)

def arco(cx, cy, r, a0, a1, pasos=None):
    """Devuelve segmentos cubicos [(c1,c2,fin)] de a0 a a1 (radianes, y hacia abajo)."""
    total = a1 - a0
    n = pasos or max(1, math.ceil(abs(total) / (math.pi / 2) - 1e-9))
    segs = []
    for i in range(n):
        b0 = a0 + total * i / n
        b1 = a0 + total * (i + 1) / n
        da = b1 - b0
        k = 4 / 3 * math.tan(da / 4)
        p0 = (cx + r * math.cos(b0), cy + r * math.sin(b0))
        p3 = (cx + r * math.cos(b1), cy + r * math.sin(b1))
        c1 = (p0[0] - k * r * math.sin(b0), p0[1] + k * r * math.cos(b0))
        c2 = (p3[0] + k * r * math.sin(b1), p3[1] - k * r * math.cos(b1))
        segs.append((c1, c2, p3))
    return segs

d = []
def M_(x, y): d.append(f"M{x:.2f} {y:.2f}")
def L_(x, y): d.append(f"L{x:.2f} {y:.2f}")
def A_(cx, cy, r, a0, a1):
    for c1, c2, p3 in arco(cx, cy, r, a0, a1):
        d.append(f"C{c1[0]:.2f} {c1[1]:.2f} {c2[0]:.2f} {c2[1]:.2f} {p3[0]:.2f} {p3[1]:.2f}")

PI = math.pi
# Recorrido en sentido horario desde el borde izquierdo, a la altura del centro
# de la esquina superior izquierda.
M_(XL[0], YC_TOP)
A_(XR[0], YC_TOP, t, PI, 1.5 * PI)        # esquina sup izq del arco A
L_(XL[1], 0)                               # techo plano del arco A
A_(XL[1], YC_TOP, t, 1.5 * PI, 2 * PI)     # esquina sup der del arco A
L_(XR[1], Y_LEN)                           # baja por el borde der de la pierna 2
A_(XR[1] + rs, Y_LEN, rs, PI, 0)           # punta redonda de la lengua (por abajo)
L_(XL[2], YC_TOP)                          # sube por el borde izq de la pierna 3
A_(XR[2], YC_TOP, t, PI, 1.5 * PI)         # esquina sup izq del arco B
L_(XL[3], 0)                               # techo plano del arco B
A_(XL[3], YC_TOP, t, 1.5 * PI, 2 * PI)     # esquina sup der del arco B
L_(XR[3], YC_CAP)                          # baja por el borde der de la pierna 4
A_(XR[3] - half, YC_CAP, half, 0, PI)      # casquete inferior de la pierna 4
L_(XL[3], Y_RAN)                           # sube por el borde izq de la pierna 4
A_(XL[3] - rs, Y_RAN, rs, 0, -PI)          # punta redonda de la ranura del arco B
L_(XR[2], YC_BOT)                          # baja por el borde der de la pierna 3
A_(XR[2] - t, YC_BOT, t, 0, 0.5 * PI)      # esquina inf der de la U
L_(XR[1], H)                               # piso plano de la U
A_(XR[1], YC_BOT, t, 0.5 * PI, PI)         # esquina inf izq de la U
L_(XL[1], Y_RAN)                           # sube por el borde izq de la pierna 2
A_(XL[1] - rs, Y_RAN, rs, 0, -PI)          # punta redonda de la ranura del arco A
L_(XR[0], YC_CAP)                          # baja por el borde der de la pierna 1
A_(XR[0] - half, YC_CAP, half, 0, PI)      # casquete inferior de la pierna 1
d.append("Z")
CONTORNO = "".join(d)

# ── VERIFICACION: rasterizar el contorno y comparar con el alfa original ────
def puntos_del_path():
    """Aplana el path a poligono para poder rasterizarlo con PIL."""
    pts = []
    cur = None
    i = 0
    for cmd in d:
        if cmd == "Z": break
        k, resto = cmd[0], cmd[1:]
        n = [float(v) for v in resto.replace(",", " ").split()]
        if k == "M":
            cur = (n[0], n[1]); pts.append(cur)
        elif k == "L":
            cur = (n[0], n[1]); pts.append(cur)
        elif k == "C":
            p0 = cur; p1 = (n[0], n[1]); p2 = (n[2], n[3]); p3 = (n[4], n[5])
            for s in range(1, 41):
                u = s / 40
                x = ((1-u)**3*p0[0] + 3*(1-u)**2*u*p1[0] + 3*(1-u)*u*u*p2[0] + u**3*p3[0])
                y = ((1-u)**3*p0[1] + 3*(1-u)**2*u*p1[1] + 3*(1-u)*u*u*p2[1] + u**3*p3[1])
                pts.append((x, y))
            cur = p3
    return pts

mask = Image.new("L", (W, H), 0)
ImageDraw.Draw(mask).polygon(puntos_del_path(), fill=255)

orig = Image.open(SRC).convert("RGBA")
orig = orig.crop(orig.getchannel("A").getbbox())
orig = orig.resize((W, H), Image.LANCZOS)
oa = orig.getchannel("A").load()
ma = mask.load()
dentro = fuera = coincide = 0
for y in range(H):
    for x in range(W):
        o = oa[x, y] > 128
        m = ma[x, y] > 128
        if o and m: coincide += 1
        elif o and not m: fuera += 1
        elif m and not o: dentro += 1
tot = coincide + fuera + dentro
print("VERIFICACION DE LA SILUETA")
print(f"  coinciden ........ {coincide} px")
print(f"  faltan (PNG si, SVG no) .. {fuera} px  ({fuera*100/tot:.3f}%)")
print(f"  sobran (SVG si, PNG no) .. {dentro} px  ({dentro*100/tot:.3f}%)")
print(f"  IoU = {coincide/tot*100:.3f}%")
mask.save(OUT + "mascara_svg.png")

# ── SVG ────────────────────────────────────────────────────────────────────
def seam_path(pts, x_ini, x_fin):
    q = [f"M{x_ini:.2f} -40"]
    for x, y in pts[::6]:
        q.append(f"L{x:.2f} {y:.2f}")
    q.append(f"L{x_fin:.2f} {H+40:.2f}")
    q.append(f"L{W+40:.2f} {H+40:.2f}")
    q.append(f"L{W+40:.2f} -40")
    q.append("Z")
    return "".join(q)

seams = M["seams"]
regiones = [
    seam_path(seams["A"],  seams["A"][0][0],  XR[0]),
    seam_path(seams["U"],  XR[1],             seams["U"][-1][0]),
    seam_path(seams["B2"], seams["B2"][0][0], XR[2]),
    seam_path(seams["B"],  seams["B"][0][0],  XL[3]),
]

def grad_svg(i, G):
    ux, uy = G["u"]
    x1, y1 = ux * G["s0"], uy * G["s0"]
    x2, y2 = ux * G["s1"], uy * G["s1"]
    st = "".join(f'<stop offset="{o:.4f}" stop-color="#{c[0]:02x}{c[1]:02x}{c[2]:02x}"/>'
                 for o, c in G["stops"])
    return (f'<linearGradient id="mg{i}" gradientUnits="userSpaceOnUse" '
            f'x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}">{st}</linearGradient>')

grads = "".join(grad_svg(i, M["grads"][str(i)]) for i in range(5))
capas = "".join(f'<path d="{regiones[i-1]}" fill="url(#mg{i})"/>' for i in (1, 2, 3, 4))

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Momentum AI">
<title>Momentum AI</title>
<defs>{grads}<clipPath id="mclip"><path d="{CONTORNO}"/></clipPath></defs>
<g clip-path="url(#mclip)">
<rect x="0" y="0" width="{W}" height="{H}" fill="url(#mg0)"/>
{capas}
</g>
</svg>
'''
open(OUT + "momentum-isologo.svg", "w", encoding="utf-8").write(svg)
print(f"\nSVG escrito: {len(svg)/1024:.1f} KB")
