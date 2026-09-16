# Skill: El bot lee el PDF que le manda el cliente

## Cuándo usar esta skill

- Un bot de WhatsApp (o de cualquier canal) recibe **documentos** —estudios médicos, cotizaciones, comprobantes— y contesta **sin saber qué dicen**.
- El archivo le llega a la persona del equipo **sin una línea de qué es**, y tiene que abrirlo para enterarse de lo básico.
- El bot responde a un documento con "no pude abrirlo" o "contamelo por texto".
- Ya describís fotos o transcribís audios y te falta el tercer tipo de medio.

**No usar** para extraer datos estructurados de un catálogo o importar un PDF a la base: eso es `catalogo-desde-pdf-del-cliente`. Esta skill es para **entender** un documento dentro de una conversación.

## Por qué existe esta skill

Capturada el **2026-09-15** en el CRM, a partir de la queja de un cliente de **fisioterapia**, con capturas del chat. Sus pacientes mandaban la resonancia en PDF y pasaban dos cosas:

- El bot contestaba **sin saber qué decía** el archivo. En la versión vieja pedía que se lo contaran por texto.
- La conversación pasaba al profesional **con el archivo pegado y ninguna línea de contexto**. Tenía que abrirlo para saber de quién era, de qué parte del cuerpo y qué decía el informe.

Justo eso es lo que un modelo puede resumir en una frase antes de pasar la conversación.

## La idea: el documento se resume UNA vez, al llegar

Igual que una foto se **describe** y una nota de voz se **transcribe**, el PDF se **resume** en cuanto llega, y el resumen se guarda como texto:

- en el **registro del turno** (`bot_turns.metadata.texto_modelo`, más `documento` con el resultado y `documento_costo_usd`),
- en la **memoria conversacional** del bot, como parte de lo que dijo el cliente.

Los turnos siguientes, el proceso que analiza la conversación y quien decide si pasarla a una persona leen **"es un informe de resonancia de rodilla"** como texto. **Nadie vuelve a mandar el archivo al modelo.** Si el cliente manda el PDF y enseguida un texto, el turno del PDF se retira y el que contesta es el del texto: tiene que leer el resumen ya guardado en vez de pagar la lectura dos veces. Eso **no sale solo**: ver el paso 5.

## Proceso

### 1. Medir qué formatos llegan de verdad

No supongas que "documento" quiere decir PDF. Contalo:

```sql
select coalesce(media_mime, '(sin tipo)') as tipo, count(*)
from public.messages
where kind = 'document' and direction = 'inbound'
  and created_at > now() - interval '120 days'
group by 1 order by 2 desc;
```

Medido: **9 de 9 documentos entrantes en 120 días eran PDF (100 %)**. Por eso la skill lee **solo PDF**: es el único formato que el modelo abre directo, y es todo lo que llega. Un Word o un Excel caen al texto de respaldo (paso 4), que ya no dice "no pude abrirlo".

### 2. El lector, con las guardas en este orden

```ts
export const MODELO_DOCUMENTO = 'gpt-4.1-mini';        // abre PDF y cuesta ~5 veces menos que el conversacional
export const MAX_BYTES_DOCUMENTO = 10 * 1024 * 1024;   // el tope de la API es 32 MB; 10 cubre un estudio escaneado

export async function leerDocumento(o: {
  mediaUrl: string; mime?: string | null; nombre?: string | null;
  instruccion?: string | null; timeoutMs?: number;
}): Promise<ResultadoDocumento> {
  const clave = process.env.OPENAI_API_KEY;
  if (!clave) return { ok: false, error: 'sin_clave' };            // (a) sin clave no se baja nada

  if (o.mime && !esPdf(o.mime)) return { ok: false, error: 'formato' };  // (b) el tipo ANTES de bajar

  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), o.timeoutMs ?? 30_000); // (c) por debajo de la espera del lote (45 s)
  try {
    const descarga = await fetch(o.mediaUrl, { signal: control.signal });
    if (!descarga.ok) return { ok: false, error: 'descarga', detalle: `HTTP ${descarga.status}` };
    const bytes = await descarga.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES_DOCUMENTO) return { ok: false, error: 'muy_grande' };   // (d)
    if (!esPdf(o.mime, descarga.headers.get('content-type'))) return { ok: false, error: 'formato' }; // (e)

    const dataUrl = `data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}`;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clave}` },
      body: JSON.stringify({
        model: MODELO_DOCUMENTO,
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: 'system', content: o.instruccion?.trim() || INSTRUCCION_DOCUMENTO_POR_DEFECTO },
          { role: 'user', content: [
            { type: 'file', file: { filename: nombreDeArchivo(o.nombre), file_data: dataUrl } },
            { type: 'text', text: 'Resumí este documento.' },
          ] },
        ],
      }),
      signal: control.signal,
    });
    if (!res.ok) return { ok: false, error: 'http', detalle: `${res.status}` };
    const cuerpo = await res.json();
    const texto = (cuerpo.choices?.[0]?.message?.content ?? '').trim();
    if (!texto) return { ok: false, error: 'vacio' };                 // (f) vacío NO es éxito
    return { ok: true, texto, uso: cuerpo.usage, modelo: MODELO_DOCUMENTO };
  } catch (err) {
    return { ok: false, error: 'red', detalle: (err as Error).name === 'AbortError' ? 'timeout' : undefined };
  } finally {
    clearTimeout(reloj);
  }
}
```

Por qué cada guarda:

- **(a)** Bajar un archivo que no se va a poder leer es tráfico y tiempo tirados.
- **(b)** El webhook ya guardó el MIME. **Un video de 60 MB no se descarga para descubrir que no es un PDF.** Esta guarda tiene su propio test con un fetch espía que cuenta descargas: tiene que dar **0**.
- **(c)** Un informe de varias páginas tarda más que una foto, pero el techo real es la **espera del lote** (el turno junta mensajes durante 45 s). Si la lectura termina después, el turno siguiente no encuentra el resumen.
- **(d)** Corta un catálogo enorme **antes** de pagarlo.
- **(e)** Si el MIME no vino en la fila, se mira el `content-type` de la descarga. Un archivo que dice ser PDF y no lo es se corta acá.
- **(f)** Con un resumen vacío el modelo conversacional recibiría "Esto es lo que dice:" y nada, y **contestaría sobre un documento que nadie leyó**.

**Por qué data URL y no el link:** el link del proveedor de WhatsApp **vence a los 7 días** (`bsp-media-expira-archivar-propio`) y el del storage propio está **firmado**. No se le pide al modelo que abra un link: se le mandan los bytes. Y **el `filename` tiene que terminar en `.pdf`**, o la API rechaza el archivo.

**Errores discriminados** (`sin_clave | descarga | muy_grande | formato | http | vacio | red`): la descarga que falla y el modelo que falla se distinguen, y el motivo queda en el registro del turno. Un solo `false` no te dice qué arreglar.

### 3. La instrucción del lector: decir qué es, copiar lo que se lee, no opinar

```ts
export const INSTRUCCION_DOCUMENTO_POR_DEFECTO = [
  'Un cliente le mandó este documento a un negocio por WhatsApp. Resumilo en español en 1 a 4 frases cortas, para que quien atiende la conversación sepa qué es sin abrirlo.',
  '- Decí primero qué TIPO de documento es: un informe médico, un resultado de laboratorio, una receta, una cotización, una factura, un comprobante de pago, un contrato, un currículum, etc.',
  '- Copiá tal cual los datos que importan y se leen: nombre, fecha, montos, códigos, la parte del cuerpo estudiada, y la conclusión o el diagnóstico que el documento ya trae escrito.',
  '- No inventes lo que no se lee. Si el documento está borroso o vacío, decilo.',
  '- No des diagnósticos, pronósticos ni opiniones médicas o legales tuyas: solo lo que el documento dice.',
].join('\n');
```

La instrucción **no es de un rubro**: sirve para una clínica y para una inmobiliaria. El negocio que quiera otra la carga en su config (`bot_config.media_prompts.documento`) y reemplaza a esta.

### 4. Lo que le llega al modelo que conversa

Dos textos, según si la lectura funcionó:

```ts
case 'document': {
  const resumen = (o.resumenDocumento ?? '').trim();
  const marcador = resumen
    ? `[El lead mandó un documento. Esto es lo que dice: ${resumen}. No opinar sobre su contenido ni dar diagnósticos, valoraciones ni conclusiones propias. Si el negocio tiene una regla para documentos, estudios o exámenes, aplicarla. Si no, confirmar que llegó y preguntar con naturalidad en qué le puede ayudar con eso.]`
    : elegir(mp.document, POR_DEFECTO.document);
  return cuerpo ? `${marcador}\nJunto al documento escribio: ${cuerpo}` : marcador;
}

// El texto de respaldo, para cuando no se leyó:
document:
  '[El lead mandó un documento, y esta vez no se pudo leer lo que dice, así que no inventar su contenido. Nunca decir que no se pudo abrir ni pedir que lo pase todo por texto. Si el negocio tiene una regla para documentos, estudios o exámenes, aplicarla. Si no, confirmar que llegó y preguntar con naturalidad en qué le puede ayudar con eso.]',
```

Tres decisiones que no son obvias:

- **El texto prohíbe opinar.** El bot no da el diagnóstico ni valora el estudio. La **regla del negocio** (en el caso de fisioterapia: *un estudio se le pasa al profesional*) se aplica **sobre el resumen**, que ahora trae de qué se trata.
- **Si la lectura falla, se dice que llegó sin inventar qué dice, y nunca "no pude abrirlo".** Para una persona, un estudio médico es algo que se revisa, no un archivo roto.
- **El comentario que acompaña al archivo se conserva** ("es la de mi rodilla"). Un marcador que reemplaza todo pierde lo que el cliente escribió.

Y una trampa de config: si el negocio tiene cargado un texto propio de "no pude abrirlo" para los tipos desconocidos (`unsupported`), **ese texto no puede alcanzar a los documentos**. Los tipos con texto propio (documento, sticker, video) se resuelven antes que el comodín. Ver `clasificar-por-lista-no-por-fallback`.

### 5. Los tres lugares que tienen que conocer el tipo nuevo

Sumar un tipo de medio no es solo escribir el lector. En un bot que **junta los mensajes seguidos en un lote** hay tres lugares que enumeran tipos, y hay que tocar los tres:

1. **Quién se lee al llegar**: `if (kind === 'document') leerDocumento(...)`.
2. **Qué texto recibe el modelo**: el `case 'document'` del paso 4.
3. **Qué mensajes del lote traen su texto ya guardado por otro turno.** Este es el que se olvida:

```ts
// Los OTROS mensajes del lote no traen su texto en la fila: lo produjo el turno
// que los leyó y lo dejó en bot_turns.metadata.texto_modelo.
const conTextoGuardado = pendientes
  .filter((m) => (
    m.kind === 'audio' || m.kind === 'image' || m.kind === 'sticker'
    || m.kind === 'document'          // ← sin esta línea, el resumen se pierde en el lote
    || tieneLink(m.body)
  ) && m.id !== mensajeActual)
  .map((m) => m.id);
```

Sin el tercero, el caso más común (el cliente manda el PDF y enseguida escribe *"es la de mi rodilla"*) sale así: el turno del PDF lee el documento, guarda el resumen y se retira porque llegó un mensaje más nuevo. El turno del texto arma el lote, no busca el texto guardado del PDF, y el modelo recibe el **texto de respaldo** ("no se pudo leer lo que dice"). Se pagó la lectura y el bot contesta como si no hubiera leído nada. Y como ese lote es lo que se escribe en la memoria, el resumen tampoco queda para los turnos siguientes.

La primera versión tocó los lugares 1 y 2 y no el 3. **No falla ninguna prueba del lector**, porque el lector funciona. Se detectó leyendo el código del lote al capturar esta skill. La prueba que lo agarra es de **lote**: un PDF y un texto dentro de la misma espera, y assertar que el texto final trae *"Esto es lo que dice"*. El reflejo que sirve para cualquier tipo nuevo: `grep` de `'sticker'` (o del último tipo que se agregó) en todo el código del bot. Cada lugar donde aparece es un lugar donde el tipo nuevo tiene que decidir qué hacer.

### 6. El nombre del archivo lo puso el cliente: se limpia

```ts
export function nombreDeArchivo(nombre: string | null | undefined): string {
  const limpio = (nombre ?? '')
    .split(/[\\/]/).pop()!                      // solo el último segmento: ni "../../" ni "C:\Users\..."
    .replace(/[^\p{L}\p{N} ._-]/gu, '')          // sin comillas ni símbolos
    .trim()
    .slice(0, 80);
  if (!limpio || limpio === '.pdf') return 'documento.pdf';
  // La extensión siempre en minúscula; el resto se conserva, porque es dato:
  // "ColLumbar" ya dice qué estudio es.
  return limpio.toLowerCase().endsWith('.pdf') ? `${limpio.slice(0, -4)}.pdf` : `${limpio}.pdf`;
}
```

Casos probados: `null` o espacios → `documento.pdf` · `informe` → `informe.pdf` · `Reporte_MR.PDF` → `Reporte_MR.pdf` · `../../etc/passwd` → `passwd.pdf` · `estudio "de" Ana.pdf` → `estudio de Ana.pdf` · `C:\Users\ana\informe.pdf` → `informe.pdf`.

**Y el nombre NO va al log.** El cliente suele ponerle su nombre o su número de identificación al archivo. El log de error lleva el id del mensaje y el motivo, nada más.

### 7. Probar contra la API real sin datos reales

Un script que lee un PDF **de disco** y lo manda como data URL, que es exactamente como viaja en producción. Así se verifica el contrato de la API (que acepte el PDF y devuelva un resumen) **sin depender de un link vivo y sin mandar el estudio de un paciente real**:

```ts
// node --experimental-strip-types scripts/probar-documento.ts estudio-falso.pdf
const bytes = fs.readFileSync(process.argv[2]);
const dataUrl = `data:application/pdf;base64,${bytes.toString('base64')}`;
const t0 = Date.now();
const r = await leerDocumento({ mediaUrl: dataUrl, mime: 'application/pdf', nombre: 'estudio-falso.pdf' });
console.log(r.ok ? `ok en ${Date.now() - t0} ms · ${r.uso.prompt_tokens} tokens` : `FALLO ${r.error}`);
if (r.ok) console.log(r.texto);
```

(`fetch` abre una data URL igual que un link, así que el lector no necesita un camino aparte para la prueba.)

El estudio de prueba es **inventado** y se genera con Python puro, sin librerías: los objetos del PDF escritos a mano con su tabla `xref`. El script completo está al lado de esta skill, listo para correr: **`generar_estudio_falso.py`** (`python generar_estudio_falso.py estudio-falso.pdf`). Lo que tiene de no obvio:

```python
# catálogo → páginas → página (con fuente Helvetica) → stream de texto → fuente
texto = "BT /F1 11 Tf 14 TL 60 720 Td " + " ".join(f"({esc(l)}) Tj T*" for l in lineas) + " ET"

pdf = bytearray(b"%PDF-1.4\n")
offsets = []
for i, cuerpo in enumerate(objetos, start=1):
    offsets.append(len(pdf))                      # el byte exacto donde arranca "N 0 obj"
    pdf += b"%d 0 obj\n" % i + cuerpo + b"\nendobj\n"

inicio_xref = len(pdf)
pdf += b"xref\n0 %d\n" % (len(objetos) + 1)
pdf += b"0000000000 65535 f \n"                   # cada entrada mide 20 bytes exactos
for off in offsets:
    pdf += b"%010d 00000 n \n" % off
pdf += b"trailer\n<< /Size %d /Root 1 0 R >>\n" % (len(objetos) + 1)
pdf += b"startxref\n%d\n%%%%EOF\n" % inicio_xref
```

Lo que hay que respetar para que un lector lo abra:

- `BT … ET` es el bloque de texto: `/F1 11 Tf` elige fuente y tamaño, `14 TL` el interlineado, `60 720 Td` la posición inicial, y cada `(línea) Tj T*` escribe y baja un renglón.
- La tabla `xref` guarda el **byte exacto** donde empieza cada objeto, y cada entrada mide **20 bytes**. Un offset corrido y el lector no encuentra el objeto.
- El `trailer` lleva `Size` (objetos + 1) y `Root`. `startxref` apunta al byte donde empieza `xref`.
- Helvetica con codificación estándar: **escribí el texto sin tildes** o elegí otra codificación.

Validado: la tabla cuadra objeto por objeto y `pypdf` extrae las cinco líneas.

**Medido contra la API real:** **2,7 s, 547 tokens, USD 0,0004 por PDF.** El resumen sacó el tipo de estudio, la fecha, los hallazgos y la conclusión.

### 8. Las pruebas, y el assert que falla con el código bien

| Caso | Qué se asserta |
|---|---|
| PDF leído | vuelve el resumen, el modelo y los tokens |
| el archivo viaja como data URL | `file_data` empieza con `data:application/pdf;base64,` y `filename` termina en `.pdf` |
| lo que no es PDF | `error: 'formato'` y **0 descargas** |
| dice PDF y no lo es | se corta después de bajarlo |
| PDF gigante | `muy_grande`, no se llama al modelo |
| sin clave | `sin_clave` y 0 llamadas |
| descarga caída vs modelo caído | `descarga` vs `http` |
| resumen de solo espacios | `vacio` |
| instrucción propia del negocio | llega como `system` |
| foto, audio o texto | **nunca** se mandan a leer como documento |
| PDF + texto en la misma espera | el texto final del lote trae el resumen, no el respaldo (paso 5) |

⚠️ **El gotcha:** el texto de respaldo **contiene** la frase *"Nunca decir que no se pudo abrir"*. Un assert del tipo `!texto.includes('no se pudo abrir')` **falla aunque el comportamiento esté bien**, porque la instrucción que lo prohíbe usa esas mismas palabras. Se asserta la **instrucción** y la **ausencia de "Esto es lo que dice"** (que probaría que se inventó un contenido):

```ts
assert.ok(t.texto.includes('Nunca decir que no se pudo abrir'));
assert.ok(!t.texto.includes('Esto es lo que dice'), 'inventaría el contenido de un PDF que no se leyó');
```

La regla general: cuando el texto que le das al modelo **nombra lo prohibido para prohibirlo**, un assert por ausencia de esas palabras no mide nada.

## Privacidad: avisar antes de prenderlo

Un estudio médico es un **dato de salud**, y esto lo manda a un tercero (el proveedor del modelo). En Costa Rica los datos de salud son **datos sensibles** según la Ley 8968 de Protección de la Persona frente al Tratamiento de sus Datos Personales. **Avisale al cliente antes de prender la lectura**, y que lo decida él. En otro país, revisá la ley local equivalente antes de asumir que se puede.

## Output esperado

- `documento.ts`: el lector con las guardas en orden, errores discriminados y la instrucción por defecto reemplazable por negocio.
- El marcador del documento en el texto que ve el modelo conversacional: con resumen (y la prohibición de opinar) o de respaldo (sin inventar y sin "no pude abrirlo").
- El resumen guardado en el registro del turno y en la memoria, con su costo aparte del costo del turno.
- El tipo agregado en los **tres** lugares del paso 5, incluido el filtro del lote.
- `scripts/probar-documento.ts` + el generador del estudio inventado.
- Pruebas de la tabla del paso 8.
- El aviso de privacidad hecho al cliente antes de prenderlo.

## Ejemplo

**Input:** *"Un paciente mandó su resonancia en PDF y el bot le dijo que no podía abrir el archivo. Al profesional le llegó la conversación sin saber qué era."*

**Output:**

1. El conteo da 9 de 9 documentos en PDF: se lee solo PDF.
2. El PDF se resume al llegar, en 2,7 s y por USD 0,0004, con un texto del estilo de (ilustrativo): *"Informe de resonancia magnética de columna lumbar, fecha 01/01/2026. Hallazgos: leve protrusión discal L4-L5 sin compromiso radicular. Conclusión: cambios degenerativos leves."*
3. El modelo conversacional recibe ese resumen con la prohibición de opinar, aplica la regla del negocio (pasarle los estudios al profesional) y contesta algo como *"Recibido, se lo paso al fisio para que lo revise"*.
4. El profesional abre la conversación y el pase ya dice qué estudio es (ver `marca-del-pase-en-el-chat`).

## Skills relacionadas

`bsp-media-expira-archivar-propio` (por qué data URL y no el link) · `clasificar-por-lista-no-por-fallback` (por qué el documento tiene texto propio y no cae al "no pude abrirlo") · `probar-motor-ia-fuera-de-la-app` (el mismo patrón de script contra el módulo real) · `key-de-ia-en-configuracion` (de dónde sale la clave) · `marca-del-pase-en-el-chat` · `escribir-toma-la-conversacion` · `catalogo-desde-pdf-del-cliente` (el otro uso de un PDF: importar datos, no entenderlos).
