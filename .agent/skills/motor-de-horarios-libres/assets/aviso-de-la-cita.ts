// El aviso mínimo en la cita a mano (decisión de Hans, 2026-11-04). PURO: lo usan
// la ventana, para decirlo antes, y la server action, que es la que decide.
//
//   · A uno mismo se le puede agendar dentro del aviso: sale una advertencia y se
//     guarda (un cliente al teléfono que pide una llamada ya).
//   · A OTRA persona, no: «tampoco quiero que se me agenden cosas literalmente a 20
//     minutos». En «Todos juntos» se mira a cada uno, también si quien agenda es
//     parte del equipo.
//   · Manda el aviso más largo entre el del servicio y el de la persona.
//   · Un espacio no tiene a quién proteger: solo advierte.
//   · Editar solo se revisa si cambia la hora o si se suma a alguien. Cambiar una
//     nota, o sacar a alguien de la cita, nunca bloquea.
//   · Una hora que ya pasó no está «dentro del aviso»: anotar lo que ya ocurrió se
//     puede, como siempre.
//
// Los botones de horarios libres son otra cosa: esos corren el motor y respetan el
// aviso de todos.

// Los dos textos van acá para que el archivo se copie solo. En el CRM viven en
// `lib/agenda/equipo-cita.ts` y `lib/reservas/textos.ts`.
function listaDeNombres(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? '';
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

function avisoTexto(min: number): string {
  if (min % (24 * 60) === 0) {
    const d = min / (24 * 60);
    return d === 1 ? '1 día' : `${d} días`;
  }
  if (min % 60 === 0) {
    const h = min / 60;
    return h === 1 ? '1 hora' : `${h} horas`;
  }
  return `${min} min`;
}

export type PersonaConAviso = { userId: string; nombre: string; avisoMin: number };

export type EntradaAviso = {
  inicioMs: number;
  ahoraMs: number;
  /** El aviso del servicio de la cita. 0 si no tiene servicio. */
  avisoServicioMin: number;
  /** Las personas que van a tener la cita. */
  personas: readonly PersonaConAviso[];
  /** Quien está agendando. */
  yo: string;
  /** Cómo estaba la cita, si se está editando. */
  antes: { inicioMs: number; userIds: readonly string[] } | null;
};

export type RevisionAviso =
  | { tipo: 'nada' }
  | { tipo: 'advertir'; avisoMin: number }
  | { tipo: 'bloquear'; nombres: string[]; avisoMin: number };

const NADA: RevisionAviso = { tipo: 'nada' };

export function revisarAvisoDeLaCita(e: EntradaAviso): RevisionAviso {
  if (e.inicioMs <= e.ahoraMs) return NADA;

  const misma = e.antes !== null && e.antes.inicioMs === e.inicioMs;
  const antes = e.antes?.userIds ?? [];
  const aRevisar = misma ? e.personas.filter((p) => !antes.includes(p.userId)) : e.personas;
  // A la misma hora y sin nadie nuevo no cambió nada que revisar.
  if (misma && aRevisar.length === 0) return NADA;

  const dentro = (avisoMin: number) => e.inicioMs < e.ahoraMs + avisoMin * 60_000;
  const avisoDe = (p: PersonaConAviso) => Math.max(e.avisoServicioMin, p.avisoMin);

  const otros = aRevisar.filter((p) => p.userId !== e.yo && dentro(avisoDe(p)));
  if (otros.length > 0) {
    // Se nombra solo a quien tiene el más largo: decir «1 día para Pietro y Cristel»
    // le atribuiría a Cristel un aviso que no es el suyo, y pasado ese aviso los dos
    // quedan libres.
    const avisoMin = Math.max(...otros.map(avisoDe));
    return { tipo: 'bloquear', nombres: otros.filter((p) => avisoDe(p) === avisoMin).map((p) => p.nombre), avisoMin };
  }
  const propio = aRevisar.find((p) => p.userId === e.yo && dentro(avisoDe(p)));
  if (propio) return { tipo: 'advertir', avisoMin: avisoDe(propio) };
  if (e.personas.length === 0 && dentro(e.avisoServicioMin)) return { tipo: 'advertir', avisoMin: e.avisoServicioMin };
  return NADA;
}

/**
 * Las personas de una cita: las de sus recursos (en orden) y su encargado, sin
 * repetir. Un espacio no es una persona, y alguien que no está en la agenda no
 * tiene aviso propio que respetar.
 */
export function personasDeLaCita(
  recursos: readonly { id: string; tipo: 'persona' | 'espacio'; userId: string | null; nombre: string; avisoMinimoMin: number }[],
  recursoIds: readonly string[],
  asignadoA: string | null,
): PersonaConAviso[] {
  const elegidos = [
    ...recursoIds.flatMap((id) => recursos.filter((r) => r.id === id)),
    ...(asignadoA ? recursos.filter((r) => r.userId === asignadoA) : []),
  ];
  const out = new Map<string, PersonaConAviso>();
  for (const r of elegidos) {
    if (r.tipo === 'persona' && r.userId && !out.has(r.userId)) {
      out.set(r.userId, { userId: r.userId, nombre: r.nombre, avisoMin: r.avisoMinimoMin });
    }
  }
  return [...out.values()];
}

/** La cita tal como quedaría. */
export type CitaARevisar = {
  inicioMs: number;
  servicioId: string | null;
  /** Sus recursos: quien la tiene y el resto de su equipo. */
  recursoIds: readonly string[];
  asignadoA: string | null;
};

/** La cita como estaba, si se está editando. */
export type CitaAnterior = {
  inicioMs: number;
  recursoIds: readonly string[];
  asignadoA: string | null;
};

type PedidoCita = { inicioMs: number; equipo?: readonly string[] };
const soloIds = (ids: readonly (string | null | undefined)[]) => ids.filter((x): x is string => Boolean(x));
const texto = (v: unknown) => (typeof v === 'string' ? v : null);

/** Qué revisar al crear: `fila` es lo que se va a insertar, ya validado. */
export function citaNuevaARevisar(d: PedidoCita, fila: Record<string, unknown>): CitaARevisar {
  return {
    inicioMs: d.inicioMs,
    servicioId: texto(fila.booking_type_id),
    recursoIds: d.equipo ?? soloIds([texto(fila.resource_id)]),
    asignadoA: texto(fila.assigned_user_id),
  };
}

/**
 * Qué revisar al editar. Lo que no mandó el navegador sigue como estaba. Sin
 * recurso en el pedido, la persona sale del encargado: al guardar, el recurso viejo
 * se reemplaza si la cita cambió de manos.
 */
export function citaEditadaARevisar(
  d: PedidoCita,
  fila: Record<string, unknown>,
  actual: {
    starts_at: unknown;
    resource_id: unknown;
    booking_type_id: unknown;
    assigned_user_id: unknown;
    cita_equipo?: readonly { resource_id: string }[] | null;
  },
): { cita: CitaARevisar; antes: CitaAnterior } {
  const resto = (actual.cita_equipo ?? []).map((e) => e.resource_id);
  const recursoAntes = texto(actual.resource_id);
  const recursoDespues = 'resource_id' in fila ? texto(fila.resource_id) : null;
  return {
    cita: {
      inicioMs: d.inicioMs,
      servicioId: 'booking_type_id' in fila ? texto(fila.booking_type_id) : texto(actual.booking_type_id),
      recursoIds: d.equipo ?? soloIds([recursoDespues, ...resto]),
      asignadoA: texto(fila.assigned_user_id),
    },
    antes: {
      inicioMs: Date.parse(actual.starts_at as string),
      recursoIds: soloIds([recursoAntes, ...resto]),
      asignadoA: texto(actual.assigned_user_id),
    },
  };
}

/** Lo que se le dice a quien agenda. null si no hay nada que decir. */
export function textoDelAviso(r: RevisionAviso): string | null {
  if (r.tipo === 'nada') return null;
  const aviso = avisoTexto(r.avisoMin);
  return r.tipo === 'advertir'
    ? `Esa hora está dentro del aviso mínimo de ${aviso}. Igual se puede agendar.`
    : `Esa hora está dentro del aviso mínimo de ${aviso} para ${listaDeNombres(r.nombres)}. Elegí una hora más adelante.`;
}
