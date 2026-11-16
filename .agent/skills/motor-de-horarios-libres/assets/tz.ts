// Zonas horarias sin librería: Intl con `timeZone`, tomando solo NÚMEROS
// (`formatToParts` en en-US). Sacado de `crm-v2/src/lib/format/tz.ts`.
//
// Por qué no `toLocaleString` ni `setHours`: el texto localizado de Intl cambia
// con la versión de ICU (Node y Chrome no traen la misma) y rompe la
// hidratación; `setHours` usa la zona del PROCESO (UTC en Vercel).

/** Si el negocio no tiene zona (o no es válida): la de todos los clientes actuales. */
export const ZONA_POR_DEFECTO = 'America/Costa_Rica';

// Construir un Intl.DateTimeFormat es caro: uno por zona, cacheado.
const FORMATOS = new Map<string, Intl.DateTimeFormat>();

function formatoDe(zona: string): Intl.DateTimeFormat | null {
  const hecho = FORMATOS.get(zona);
  if (hecho) return hecho;
  try {
    const nuevo = new Intl.DateTimeFormat('en-US', {
      timeZone: zona,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
      hourCycle: 'h23',
    });
    FORMATOS.set(zona, nuevo);
    return nuevo;
  } catch {
    return null; // RangeError: zona que Intl no conoce
  }
}

/** La zona si Intl la conoce; si viene vacía o inválida, `ZONA_POR_DEFECTO`. */
export function resolverZona(zona: string | null | undefined): string {
  return zona && formatoDe(zona) ? zona : ZONA_POR_DEFECTO;
}

export type PartesEnZona = {
  anio: number;
  /** 0 = enero … 11 = diciembre (como `Date`). */
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  /** 0 = domingo … 6 = sábado (como `Date`). */
  diaSemana: number;
};

const DIA_SEMANA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Calendario y reloj del instante `ms`, vistos en `zona`. Igual en servidor y navegador. */
export function partesEnZona(ms: number, zona: string): PartesEnZona {
  const formato = formatoDe(zona) ?? (formatoDe(ZONA_POR_DEFECTO) as Intl.DateTimeFormat);
  const partes = formato.formatToParts(ms);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? '';
  const hora = Number(valor('hour'));
  return {
    anio: Number(valor('year')),
    mes: Number(valor('month')) - 1,
    dia: Number(valor('day')),
    hora: hora === 24 ? 0 : hora, // algún motor devuelve 24 a medianoche
    minuto: Number(valor('minute')),
    diaSemana: DIA_SEMANA[valor('weekday')] ?? 0,
  };
}

const dos = (n: number) => String(n).padStart(2, '0');

/** 'HH:MM' en 24 h, en la zona. */
export function horaEnZona(ms: number, zona: string): string {
  const p = partesEnZona(ms, zona);
  return `${dos(p.hora)}:${dos(p.minuto)}`;
}

/** 'YYYY-MM-DD' del día al que pertenece el instante en la zona. Sirve de llave. */
export function claveDiaEnZona(ms: number, zona: string): string {
  const p = partesEnZona(ms, zona);
  return `${p.anio}-${dos(p.mes + 1)}-${dos(p.dia)}`;
}

/**
 * El instante (epoch ms) de la fecha `fechaISO` ('YYYY-MM-DD') a la hora
 * `hhmm` ('HH:MM') en `zona`: la inversa de `partesEnZona`. Es lo que el
 * negocio elige en un selector ("viernes 3 a las 10:00") pasado a un instante
 * real, sin depender de la zona del proceso (MOM-121).
 *
 * Primero toma esa hora como si fuera UTC y la corrige por el desfase que la
 * zona tiene EN ese instante; dos pasadas alcanzan con horario de verano. Una
 * hora que existe dos veces (fin del verano) cae en la primera. Null si la
 * fecha o la hora no existen.
 */
export function instanteEnZona(fechaISO: string, hhmm: string, zona: string): number | null {
  const f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaISO);
  const h = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!f || !h) return null;
  const anio = Number(f[1]);
  const mes = Number(f[2]) - 1;
  const dia = Number(f[3]);
  const control = new Date(Date.UTC(anio, mes, dia));
  if (control.getUTCMonth() !== mes || control.getUTCDate() !== dia) return null; // 30 de febrero
  const z = resolverZona(zona);
  const deseado = Date.UTC(anio, mes, dia, Number(h[1]), Number(h[2]));
  let t = deseado;
  for (let i = 0; i < 2; i++) {
    const p = partesEnZona(t, z);
    t += deseado - Date.UTC(p.anio, p.mes, p.dia, p.hora, p.minuto);
  }
  return t;
}
