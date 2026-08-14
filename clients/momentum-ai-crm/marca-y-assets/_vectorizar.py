# Vectorizador del isologo de Momentum AI.
#
# La geometria es exacta (medida del PNG: arcos de circulo que ajustan a ~1px).
# El color NO es un degradado unico: el liston se dobla sobre si mismo y hay
# costuras duras. Este script las detecta, ajusta un degradado por region, y
# VERIFICA rasterizando el modelo y comparandolo pixel a pixel con el original.

from PIL import Image
import math, json, sys

Image.MAX_IMAGE_PIXELS = None
SRC = "C:/Users/hvill/Downloads/Momentum_isologo color.png"
OUT = "C:/Users/hvill/AppData/Local/Temp/claude/D--Antigravity-0--Proyectos-Personales-Inmobilioaria-CRM/7ef58628-be7a-4cae-a51f-002f67c472e0/scratchpad/"

S = 2000
im = Image.open(SRC).convert("RGBA")
im = im.crop(im.getchannel("A").getbbox())
im = im.resize((S, round(S * im.size[1] / im.size[0])), Image.LANCZOS)
W, H = im.size
px = im.load()

# ── Geometria medida ────────────────────────────────────────────────────────
t = (W - 3 * ((W - 409.5) / 3 - 409.5 + 409.5)) / 4  # placeholder, se fija abajo
t = 409.5
p = (W - t) / 3.0          # paso entre piernas
g = p - t                  # hueco
XL = [i * p for i in range(4)]            # borde izq de cada pierna
XR = [x + t for x in XL]                  # borde der
rs = g / 2.0                              # radio de la ranura
Y_RANURA = 368.7                          # centro del semicirculo de la ranura de arriba
Y_LENGUA = 1168.2                         # centro del semicirculo de la lengua de abajo


# Las costuras del arte original se ven como una BAJADA de alfa a ~250 mas un
# salto de color. Por eso "dentro" acepta alfa >= 200 en toda la vecindad (asi
# no confunde con la silueta exterior, donde el alfa cae a 0) y el salto se mide
# entre x-3 y x+3, SALTANDOSE el pixel mezclado de la costura.
def dentro(x, y):
    if x < 5 or x > W - 6 or y < 5 or y > H - 6:
        return False
    return all(px[x + dx, y][3] >= 200 for dx in range(-5, 6))


def traza(y0, y1, xlo, xhi, umbral=25):
    pts = []
    for y in range(y0, y1, 2):
        mejor = (0, None)
        for x in range(max(6, xlo), min(W - 6, xhi)):
            if not dentro(x, y):
                continue
            c0 = px[x - 3, y][:3]; c1 = px[x + 3, y][:3]
            d = sum(abs(a - b) for a, b in zip(c0, c1))
            if d > mejor[0]:
                mejor = (d, x)
        if mejor[1] and mejor[0] > umbral:
            pts.append((mejor[1], y))
    return pts


print("trazando costuras...")
seamA = traza(6, 400, 380, 940)
seamU = traza(1145, 1545, 900, 1450)
seamB = traza(6, 400, 1480, 1960)      # ventana a la derecha: en las filas de
                                       # arriba hay OTRA costura mas fuerte y el
                                       # trazador se enganchaba a la equivocada
seamB2 = traza(6, 120, 1150, 1470)     # la segunda costura del arco derecho
for n, s in (("A", seamA), ("U", seamU), ("B2", seamB2), ("B", seamB)):
    print(f"  {n}: {len(s)} pts", (f"{s[0]} -> {s[-1]}" if s else "VACIA"))

# Suavizado + funcion x = f(y) con extension fuera del rango trazado.
def hacer_f(pts, x_abajo, x_arriba):
    if not pts:
        return (lambda y: x_abajo), []
    pts = sorted(pts, key=lambda q: q[1])
    # media movil para quitar el ruido de 1px
    xs = [q[0] for q in pts]; ys = [q[1] for q in pts]
    k = 5
    sx = [sum(xs[max(0, i - k):i + k + 1]) / len(xs[max(0, i - k):i + k + 1]) for i in range(len(xs))]
    def f(y):
        if y <= ys[0]:  return x_arriba if x_arriba is not None else sx[0]
        if y >= ys[-1]: return x_abajo if x_abajo is not None else sx[-1]
        lo, hi = 0, len(ys) - 1
        while hi - lo > 1:
            m = (lo + hi) // 2
            if ys[m] <= y: lo = m
            else: hi = m
        u = (y - ys[lo]) / max(1e-9, ys[hi] - ys[lo])
        return sx[lo] * (1 - u) + sx[hi] * u
    return f, list(zip(sx, ys))

fA, ptsA = hacer_f(seamA, XR[0], None)      # abajo sigue por el borde der de la pierna 1
fU, ptsU = hacer_f(seamU, None, XR[1])      # arriba sigue por el borde der de la pierna 2
fB, ptsB = hacer_f(seamB, XL[3], None)      # abajo sigue por el borde izq de la pierna 4
fB2, ptsB2 = hacer_f(seamB2, XR[2], None)   # la segunda, mas a la izquierda


def capa(x, y):
    """A que region pertenece el pixel (orden a lo largo del liston)."""
    if x > fB(y): return 4
    if x > fB2(y): return 3
    if x > fU(y): return 2
    if x > fA(y): return 1
    return 0


# ── Ajuste de un degradado lineal por region ────────────────────────────────
def ajustar(region):
    muestras = []
    for y in range(4, H - 4, 3):
        for x in range(4, W - 4, 3):
            if px[x, y][3] < 250: continue
            if capa(x, y) != region: continue
            muestras.append((x, y, px[x, y][:3]))
    if len(muestras) < 50:
        return None
    # direccion: minimos cuadrados por canal, se toma el de mayor variacion
    n = len(muestras)
    mx = sum(m[0] for m in muestras) / n
    my = sum(m[1] for m in muestras) / n
    mejor = None
    for ch in range(3):
        mc = sum(m[2][ch] for m in muestras) / n
        Sxx = Syy = Sxy = Sxc = Syc = 0.0
        for x, y, c in muestras:
            dx, dy, dc = x - mx, y - my, c[ch] - mc
            Sxx += dx * dx; Syy += dy * dy; Sxy += dx * dy
            Sxc += dx * dc; Syc += dy * dc
        det = Sxx * Syy - Sxy * Sxy
        if abs(det) < 1e-9: continue
        a = (Syy * Sxc - Sxy * Syc) / det
        b = (Sxx * Syc - Sxy * Sxc) / det
        mag = math.hypot(a, b)
        if mejor is None or mag > mejor[0]:
            mejor = (mag, a, b)
    _, a, b = mejor
    L = math.hypot(a, b)
    ux, uy = a / L, b / L
    ss = [ux * x + uy * y for x, y, c in muestras]
    s0, s1 = min(ss), max(ss)
    NB = 12
    acum = [[0, 0, 0, 0] for _ in range(NB)]
    for (x, y, c), s in zip(muestras, ss):
        i = min(NB - 1, int((s - s0) / max(1e-9, s1 - s0) * NB))
        acum[i][0] += c[0]; acum[i][1] += c[1]; acum[i][2] += c[2]; acum[i][3] += 1
    stops = []
    for i, (r, gg, bb, k) in enumerate(acum):
        if k == 0: continue
        off = (i + 0.5) / NB
        stops.append((off, (round(r / k), round(gg / k), round(bb / k))))
    return {"u": (ux, uy), "s0": s0, "s1": s1, "stops": stops, "n": n}


print("\najustando degradados...")
grads = {}
for r in range(5):
    grads[r] = ajustar(r)
    if grads[r]:
        st = grads[r]["stops"]
        print(f"  region {r}: {grads[r]['n']} px | dir=({grads[r]['u'][0]:.2f},{grads[r]['u'][1]:.2f}) "
              f"| {'#%02x%02x%02x' % st[0][1]} -> {'#%02x%02x%02x' % st[-1][1]}")

# ── Rasterizar el modelo y comparar ────────────────────────────────────────
def color_de(r, x, y):
    G = grads[r]
    if not G: return (0, 0, 0)
    ux, uy = G["u"]
    s = (ux * x + uy * y - G["s0"]) / max(1e-9, G["s1"] - G["s0"])
    st = G["stops"]
    if s <= st[0][0]: return st[0][1]
    if s >= st[-1][0]: return st[-1][1]
    for i in range(len(st) - 1):
        if st[i][0] <= s <= st[i + 1][0]:
            u = (s - st[i][0]) / (st[i + 1][0] - st[i][0])
            return tuple(round(st[i][1][k] * (1 - u) + st[i + 1][1][k] * u) for k in range(3))
    return st[-1][1]


print("\nverificando contra el original...")
mod = Image.new("RGB", (W, H), (255, 255, 255))
mp = mod.load()
tot = err = peor = 0
hist = [0] * 6
for y in range(H):
    for x in range(W):
        if px[x, y][3] < 250: continue
        c = color_de(capa(x, y), x, y)
        mp[x, y] = c
        d = sum(abs(a - b) for a, b in zip(c, px[x, y][:3])) / 3
        tot += 1; err += d; peor = max(peor, d)
        hist[min(5, int(d // 4))] += 1
mod.save(OUT + "modelo.png")
print(f"  pixeles: {tot}")
print(f"  error medio por canal: {err/tot:.2f} / 255  ({err/tot/255*100:.2f}%)")
print(f"  error maximo: {peor:.0f}")
print(f"  <4: {hist[0]*100/tot:.1f}%  4-8: {hist[1]*100/tot:.1f}%  8-12: {hist[2]*100/tot:.1f}%  "
      f"12-16: {hist[3]*100/tot:.1f}%  16-20: {hist[4]*100/tot:.1f}%  >20: {hist[5]*100/tot:.1f}%")

json.dump({"grads": {str(k): v for k, v in grads.items()},
           "seams": {"A": ptsA, "U": ptsU, "B2": ptsB2, "B": ptsB},
           "geom": {"W": W, "H": H, "t": t, "p": p, "g": g,
                    "y_ranura": Y_RANURA, "y_lengua": Y_LENGUA}},
          open(OUT + "modelo.json", "w"))
print("\nmodelo guardado")
