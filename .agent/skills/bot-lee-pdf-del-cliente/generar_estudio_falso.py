# Un PDF de texto, sin librerias, con datos INVENTADOS.
#   python generar_estudio_falso.py estudio-falso.pdf
import sys

lineas = [
    "INFORME DE RESONANCIA MAGNETICA",
    "Paciente: Paciente de Prueba    Fecha: 01/01/2026",
    "Estudio: columna lumbar",
    "Hallazgos: leve protrusion discal L4-L5, sin compromiso radicular.",
    "Conclusion: cambios degenerativos leves.",
]

def esc(s):
    # En un string de PDF, la barra y los parentesis se escapan.
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

texto = "BT /F1 11 Tf 14 TL 60 720 Td " + " ".join(f"({esc(l)}) Tj T*" for l in lineas) + " ET"
stream = texto.encode("latin-1")

objetos = [
    b"<< /Type /Catalog /Pages 2 0 R >>",                                   # 1 catalogo
    b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",                           # 2 paginas
    b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "                # 3 pagina
    b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",  # 4 texto
    b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",              # 5 fuente
]

pdf = bytearray(b"%PDF-1.4\n")
offsets = []
for i, cuerpo in enumerate(objetos, start=1):
    offsets.append(len(pdf))  # el byte exacto donde arranca "N 0 obj"
    pdf += b"%d 0 obj\n" % i + cuerpo + b"\nendobj\n"

inicio_xref = len(pdf)
pdf += b"xref\n0 %d\n" % (len(objetos) + 1)
pdf += b"0000000000 65535 f \n"            # cada entrada mide 20 bytes exactos
for off in offsets:
    pdf += b"%010d 00000 n \n" % off
pdf += b"trailer\n<< /Size %d /Root 1 0 R >>\n" % (len(objetos) + 1)
pdf += b"startxref\n%d\n%%%%EOF\n" % inicio_xref

with open(sys.argv[1] if len(sys.argv) > 1 else "estudio-falso.pdf", "wb") as f:
    f.write(pdf)
