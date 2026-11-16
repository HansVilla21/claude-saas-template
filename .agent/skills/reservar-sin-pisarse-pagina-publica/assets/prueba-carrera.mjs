// Prueba de carrera: varias reservas al MISMO horario, en paralelo, cada una en
// su propia conexión (PostgREST). Lee las llaves del .env.local sin imprimirlas.
import fs from 'node:fs';
import crypto from 'node:crypto';

const envPath = process.argv[2];
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('faltan variables');

const AG = '<agency_id>';
const SV = '<booking_type_id>';
const PI = '<recurso_1>';
const HA = '<recurso_2>';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function reservar(inicio, recursos, n) {
  const r = await fetch(`${url}/rest/v1/rpc/reservas_reservar`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_agency_id: AG, p_booking_type_id: SV, p_recursos: recursos, p_inicio: inicio,
      p_nombre: `Carrera ${n}`, p_telefono: `5068888${String(n).padStart(4, '0')}`,
      p_correo: `carrera${n}@ejemplo.com`, p_zona_cliente: 'America/Costa_Rica',
      p_respuestas: [], p_token_hash: sha(`carrera-${n}-${Date.now()}-${Math.random()}`), p_ip_hash: `prueba-carrera-${n}`,
    }),
  });
  const body = await r.json();
  return { status: r.status, ok: body.ok, motivo: body.motivo ?? null, recurso: body.recurso_id === PI ? 'Pietro' : body.recurso_id === HA ? 'Hans' : null };
}

const rondas = [];
let n = 100;
// 5 rondas: 3 reservas a la vez, solo con Pietro → tiene que entrar UNA.
for (const hora of [16, 17, 18, 19, 20]) {
  const inicio = `2027-03-02T${hora}:00:00Z`;
  const t0 = Date.now();
  const res = await Promise.all([1, 2, 3].map(() => reservar(inicio, [PI], n++)));
  rondas.push({ inicio, solo: 'Pietro', ms: Date.now() - t0, entraron: res.filter((x) => x.ok).length, res });
}
// 2 rondas: 4 a la vez con Pietro y Hans → tienen que entrar DOS, una con cada uno.
for (const hora of [16, 17]) {
  const inicio = `2027-03-03T${hora}:00:00Z`;
  const t0 = Date.now();
  const res = await Promise.all([1, 2, 3, 4].map(() => reservar(inicio, [PI, HA], n++)));
  rondas.push({ inicio, solo: 'Pietro y Hans', ms: Date.now() - t0, entraron: res.filter((x) => x.ok).length, res });
}
console.log(JSON.stringify(rondas, null, 1));
