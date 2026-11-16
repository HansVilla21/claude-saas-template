# Skill: SEO local y Google Search Console para el sitio de una PYME

Cuando el dueño pregunta "¿cómo salimos primeros en Google cuando alguien busca *mueblerías en
Sarchí*?". Esta skill trae la respuesta honesta, lo que se arregla en el código en una hora, cómo se
conecta Search Console sin pedirle contraseñas a nadie, y qué decirle al cliente.

Capturada el 2026-10-28 en Mueblería Pérez Luna (Next.js 15 en Vercel). Todo se hizo en producción
y se verificó en vivo.

## Cuándo usar esta skill

- El cliente pregunta por "salir en Google", Analytics o "las herramientas de Google".
- Entregás un sitio nuevo, o el sitio cambió de dominio.
- Hay una copia vieja del sitio todavía en línea (otro proyecto de Vercel, un `*.vercel.app`, un
  hosting anterior).

## Lo primero: dónde se gana de verdad

En una búsqueda local ("mueblería en X", "dentista cerca"), arriba de todo sale un **mapa con tres
negocios**. Ese lugar lo decide la **ficha de Google Maps** (Perfil de Negocio de Google), no la
página web:

1. **La ficha:** que esté completa (categoría correcta, horario, fotos, enlace al dominio propio).
2. **Las reseñas:** son lo que más pesa. Hay que pedirlas después de cada entrega y contestarlas.
3. **La cercanía:** quien busca cerca del negocio lo ve más arriba, y eso no se controla.

Decíselo al cliente en la primera respuesta. Si no, espera que "la página nueva" lo ponga primero y
a las tres semanas cree que no funcionó. El sitio suma, pero en lo local la ficha y las reseñas
pesan más.

## Lo que se arregla en el código (≈1 h)

### 1. La copia vieja que compite con el dominio propio — lo más urgente

**Cómo se detecta:**

```bash
curl -s https://<viejo>.vercel.app/ | grep -o '<link rel="canonical"[^>]*>'
```

Si la copia vieja se declara canónica a sí misma, Google ve dos sitios iguales y reparte la fuerza
entre los dos. En MPL pasaba exactamente eso: el proyecto viejo seguía en línea después de mudarse
al dominio propio.

**La solución:** un 308 por host, en el código que comparten los dos proyectos. Va primero en
`redirects()`:

```js
// Next ancla el valor (^…$): no toca otros hosts de vercel.app (previews, git-main).
const HOST_SITIO_VIEJO = "muebleria-perez-luna\\.vercel\\.app";
// …
{ source: "/:path*", has: [{ type: "host", value: HOST_SITIO_VIEJO }],
  destination: "https://dominio-propio.com/:path*", permanent: true },
```

- **El escape:** en el `.mjs` va `\\.`. Con `\.` JavaScript se come la barra, y el punto pasa a
  significar «cualquier carácter».
- **La prueba:** que la regla sea la primera y que el regex anclado acepte el host viejo y rechace
  `*-git-main.vercel.app` y el dominio propio.
- **Cómo verificarlo en local:** `curl -H "Host: <viejo>.vercel.app" localhost:<puerto>/x` tiene
  que devolver 308 al dominio, conservando la ruta y la query.
- **Gotcha de Vercel Hobby:** el proyecto viejo despliega desde otro repo, y el push queda
  **BLOCKED** porque el autor del commit no es el dueño de la cuenta (por ejemplo, un merge hecho
  con el token de la cuenta del cliente). La salida es crear el deploy por API, o con el MCP de
  Vercel `create_deployment`, con `gitSource {org, repo, ref, sha}` y `target: "production"`.

### 2. Títulos con lo que la gente escribe, no con el lema

El título de la pestaña es lo que Google muestra en el resultado. Un lema de portada («El arte de
la madera») no lo busca nadie.

| Página | Patrón | Ejemplo |
|---|---|---|
| Inicio | Marca · qué vende + dónde (absoluto, ≤ 60 caracteres) | Mueblería Pérez Luna · Muebles de madera maciza en Sarchí |
| Catálogo | Qué hay + marca | Catálogo de muebles de madera maciza · Mueblería Pérez Luna |
| Categoría | Categoría + material \| Marca, Ciudad (absoluto) | Camas en madera maciza \| Mueblería Pérez Luna, Sarchí |
| Producto | Nombre · Categoría, **solo si el nombre no dice qué es** | Contemporáneo · Cómodas (pero «Cama Trineo» queda igual) |

**Cómo saber si el nombre ya dice qué es:** se compara con la categoría en singular, palabra por
palabra y sin tildes.

```ts
const cat = sinTildes(categoria).split(/\s+/)
  .map((w) => w.replace(/(?<=[rlndjz])es$|s$/, "")).join(" ");
// «Mesas de centro» → «mesa de centro», «Recibidores» → «recibidor», «Camas» → «cama»
return sinTildes(nombre).includes(cat) ? nombre : `${nombre} · ${categoria}`;
```

Si solo quitás la `s` final de la frase entera, «Mesas de centro» no matchea con «MESA DE CENTRO
VALLE», y «Recibidores» no matchea con «Recibidor Verona».

**Descripciones:**
- La del inicio dice qué es, dónde está, desde cuándo y qué ofrece.
- El producto sin descripción lleva una que nombra el material y la ciudad, y se reutiliza en su
  JSON-LD. Usá una forma neutra («Cama Trineo: mueble en madera maciza…»), porque «hecho» falla
  con nombres femeninos.

**Lo que no se toca sin el OK del dueño:** el H1 visible de la portada. Los títulos y las
descripciones no cambian nada en pantalla, pero el H1 es diseño.

### 3. El mito del "un solo H1"

Lo correcto es **uno por página**, no uno en todo el sitio. Google aclaró que tener varios no
castiga, pero uno solo y claro ayuda al buscador y a los lectores de pantalla. Se revisa con `curl`
y contando los `<h1`, página por página. Lo que suele fallar no es la cantidad sino lo que dice:
«Nuestros diseños», o un producto llamado «Contemporáneo». Para eso, la convención de nombres
«Tipo + Modelo» que se le propone al cliente rinde más que cualquier etiqueta.

### 4. Lo que tiene que estar (revisar, casi siempre ya está)

- **JSON-LD del negocio** con el subtipo de `LocalBusiness` que corresponda (`FurnitureStore`,
  `Dentist`…): dirección, horario, teléfono, `hasMap` a la ficha y `sameAs` a las redes.
- **JSON-LD del producto:** `offers` solo si hay precio (un precio inventado en Google es peor que
  ninguno), más `BreadcrumbList`.
- **`robots.txt`** con la línea `Sitemap:`.
- **El sitemap,** pedido haciéndose pasar por Googlebot: tiene que dar 200, `application/xml`, y
  todas las URLs del dominio propio.

## Google Search Console (lo hace el founder; el agente guía y verifica)

El agente **no** inicia sesión por nadie. Le da los pasos al founder y verifica desde afuera lo que
se puede ver desde afuera.

1. **Con qué cuenta:** con la de Google **del cliente**, para que la herramienta quede a su nombre.
   El founder se agrega después como propietario, en Settings › Users and permissions.
2. **Agregar propiedad › «Dominio»** (no «Prefijo de URL»): cubre `www`, el subdominio del panel y
   `http`. Google entrega un TXT `google-site-verification=…`.
3. **En el DNS** (Hostinger, Cloudflare…) se agrega un registro **nuevo**: TXT, nombre `@`, ese
   valor. **No se edita ni se borra el SPF** (`v=spf1 …`) ni los MX, porque de ellos depende el
   correo. Antes de tocar nada, mirá lo que hay:
   ```bash
   nslookup -type=TXT dominio.com 8.8.8.8
   ```
   Después de agregarlo, la misma consulta tiene que mostrar los dos registros.
4. **«Verify».** Si no lo encuentra, se espera un rato y se reintenta, porque el DNS tarda.
5. **Sitemaps:** como la propiedad es de dominio, va la **URL completa**
   (`https://dominio.com/sitemap.xml`). Puede aparecer **«Couldn't fetch»**: en una propiedad
   recién creada es lo normal y se resuelve solo en uno o dos días. No es un error si el sitemap
   responde 200 a Googlebot.
6. **Inspección de URL** del inicio › **«Test live URL»**. Tiene que decir «URL is available to
   Google». Después, **«Request indexing»**, para el inicio y el catálogo. No hace falta producto
   por producto: los encuentra con el sitemap.
7. **«URL has no enhancements» en el inicio** es normal. Las migas y el producto con precio
   aparecen en las fichas.

**El seguimiento:** un recordatorio una semana después para mirar Performance (búsquedas, posición
y clics), Sitemaps (que diga «Success») y Pages (cuántas indexó). Si el sitemap sigue en
«Couldn't fetch», se borra y se vuelve a enviar.

## Analytics: qué decirle al cliente

- **Google Analytics mide, no posiciona.** Dice cuánta gente entra, de dónde viene y cuántos tocan
  WhatsApp, pero no sube el sitio en Google.
- **Usa cookies:** el aviso de privacidad tiene que nombrarlo. Si el aviso todavía no está, no lo
  instales.
- **La alternativa sin cookies** es la medición de Vercel (Web Analytics), que alcanza para
  empezar.

## Lo que se le dice al cliente (en su idioma, sin jerga)

- **Al preguntar:**
  > «Sí se puede. La página ya está lista para Google; lo que más pesa para salir primeros es la
  > ficha de Google Maps y las reseñas. ¿Quién tiene el acceso a la ficha? Y pídanle una reseña a
  > cada cliente contento.»
- **Al conectar Search Console** (una línea, con la captura de «Ownership verified»):
  > «Ya conectamos la página con Google: ahora la tiene registrada y nos va a mostrar con qué
  > búsquedas aparece la mueblería y en qué posición, para ir mejorando.»
- **Siempre se aclara que tarda:** Google refleja los cambios en semanas, no en días.

## Gotchas

| Síntoma | Causa | Qué hacer |
|---|---|---|
| El dominio propio no sube y la copia vieja aparece en Google | La copia vieja sigue en línea y se declara canónica | 308 por host (punto 1) |
| El deploy del proyecto viejo queda BLOCKED | Vercel Hobby solo despliega commits del dueño de la cuenta | Deploy por API con `gitSource` |
| La regla de host no matchea o matchea de más | `\.` en vez de `\\.` dentro del string | Escapar doble y probar con el regex anclado |
| «Couldn't fetch» en el sitemap | La propiedad es nueva | Esperar 1–2 días; antes, verificar con un `curl` como Googlebot |
| El correo deja de llegar después de verificar | Se editó el SPF en vez de agregar un TXT nuevo | Restaurar el `v=spf1 …` original; el de Google va aparte |
| El cliente espera estar primero la semana siguiente | Nadie le dijo que lo local depende de la ficha y que tarda semanas | Decirlo en la primera respuesta |

## Relacionadas

- `reporte-de-estado-para-cliente-no-tecnico`: el resumen para el dueño cuando esto ya está hecho.
- `panel-en-subdominio-por-middleware`: el host del panel. La redirección por host convive con el
  matcher de ese middleware.
- `completitud-de-contenido-en-el-panel`: las descripciones de producto, lo siguiente que más
  rinde en búsquedas de cola larga.
