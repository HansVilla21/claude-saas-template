# Code Snippets Reutilizables para n8n

Fuente: `knowledge/04_PATRONES_TECNICOS_N8N.md` seccion 2

## Response Formatter

```javascript
let respuesta = $json.respuesta_agente || '';

// Remover bold markdown
respuesta = respuesta.replace(/\*\*(.*?)\*\*/g, '$1');
respuesta = respuesta.replace(/__(.*?)__/g, '$1');

// Remover bullets y listas
respuesta = respuesta.replace(/^[\-\*]\s/gm, '');
respuesta = respuesta.replace(/^\d+\.\s/gm, '');

// Remover headers markdown
respuesta = respuesta.replace(/^#+\s/gm, '');

// Limitar longitud (max ~500 chars)
if (respuesta.length > 500) {
  const cortado = respuesta.substring(0, 500);
  const ultimoPunto = cortado.lastIndexOf('.');
  const ultimoSalto = cortado.lastIndexOf('\n');
  const corte = Math.max(ultimoPunto, ultimoSalto);
  if (corte > 200) {
    respuesta = respuesta.substring(0, corte + 1);
  }
}

// Asegurar max 1 pregunta
const preguntas = respuesta.match(/\?/g);
if (preguntas && preguntas.length > 1) {
  const partes = respuesta.split('?');
  respuesta = partes.slice(0, -1).join('.') + '?' + (partes[partes.length-1] || '');
}

return { mensaje_formateado: respuesta.trim() };
```

## Discord Notification (String Detection)

```javascript
const respuesta = $json.respuesta_agente || '';
const nombre = $json.nombre_usuario || 'Usuario';
const telefono = $json.telefono || 'N/A';
let notificaciones = [];

if (respuesta.includes('wa.me/')) {
  notificaciones.push({
    tipo: 'LEAD_DERIVADO',
    mensaje: `🟢 **Lead derivado**\nNombre: ${nombre}\nTel: ${telefono}`
  });
}

if (respuesta.includes('calendly.com')) {
  notificaciones.push({
    tipo: 'CALENDLY_ENVIADO',
    mensaje: `📅 **Calendly enviado**\nNombre: ${nombre}\nTel: ${telefono}`
  });
}

if (respuesta.includes('lamentablemente') || respuesta.includes('no podemos')) {
  notificaciones.push({
    tipo: 'LEAD_DESCALIFICADO',
    mensaje: `🔴 **Lead descalificado**\nNombre: ${nombre}\nTel: ${telefono}`
  });
}

return { notificaciones, hay_notificacion: notificaciones.length > 0 };
```

## Round-Robin por Hora

```javascript
const hora = new Date().getHours();
const esHoraPar = hora % 2 === 0;

const vendedores = {
  par: { nombre: "Vendedor 1", whatsapp: "https://wa.me/506XXXXXXXX" },
  impar: { nombre: "Vendedor 2", whatsapp: "https://wa.me/506XXXXXXXX" }
};

const vendedor = esHoraPar ? vendedores.par : vendedores.impar;
return { vendedor_nombre: vendedor.nombre, vendedor_whatsapp: vendedor.whatsapp };
```

## Conversion Colones ↔ USD

```javascript
const texto = ($json.monto_mencionado || '').toLowerCase();
let monto_usd = null;

if (texto.includes('millones') || texto.includes('mill') || texto.includes('₡')) {
  const numeros = texto.match(/[\d.,]+/);
  if (numeros) {
    let valor = parseFloat(numeros[0].replace(',', '.'));
    if (texto.includes('millones') || texto.includes('mill')) valor *= 1000000;
    monto_usd = Math.round(valor / 500);
  }
}

if (texto.includes('k') || texto.includes('usd') || texto.includes('$')) {
  const numeros = texto.match(/[\d.,]+/);
  if (numeros) {
    let valor = parseFloat(numeros[0].replace(',', ''));
    if (texto.includes('k')) valor *= 1000;
    monto_usd = Math.round(valor);
  }
}

let rango = 'desconocido';
if (monto_usd !== null) {
  if (monto_usd < 100000) rango = '<100K';
  else if (monto_usd <= 150000) rango = '100K-150K';
  else if (monto_usd <= 200000) rango = '150K-200K';
  else rango = '>200K';
}

return { monto_usd, rango_presupuesto: rango };
```

## Extraccion de Datos del Mensaje

```javascript
const msg = $json.mensaje || '';
const datos = { nombre: null, email: null, telefono: null, ubicacion: null };

const emailMatch = msg.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
if (emailMatch) datos.email = emailMatch[0];

const telMatch = msg.match(/(?:\+?506\s?)?[2-8]\d{3}[\s-]?\d{4}/);
if (telMatch) datos.telefono = telMatch[0].replace(/[\s-]/g, '');

const nombrePatterns = [
  /(?:soy|me llamo|mi nombre es)\s+([A-ZÁÉÍÓÚa-záéíóú]+(?:\s[A-ZÁÉÍÓÚa-záéíóú]+)?)/i
];
for (const p of nombrePatterns) {
  const m = msg.match(p);
  if (m) { datos.nombre = m[1]; break; }
}

return datos;
```
