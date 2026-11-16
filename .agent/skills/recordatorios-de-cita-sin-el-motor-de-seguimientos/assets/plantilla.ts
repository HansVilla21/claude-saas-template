// Qué dice el WhatsApp de un recordatorio. PURO.
//
// Dos casos:
//   · La plantilla de la agenda (`recordatorio_cita`), POSICIONAL como
//     `reserva_confirmada`: {{1}} nombre, {{2}} servicio, {{3}} fecha y hora, y
//     el botón «Cambiar o cancelar» con el token. Es la que viene elegida.
//   · Otra plantilla aprobada del negocio, de las que el CRM sabe completar
//     (variables con nombre: {{nombre}}, {{negocio}}, {{agente}}; sin botones con
//     variables). La regla es la MISMA de los seguimientos
//     (`resolverPlantillaDelEnvio`): si divergieran, una plantilla que sirve en
//     un flujo fallaría acá.
//
// El nombre (Hans, 27-10) sale de la CITA, lo que la persona escribió al
// reservar; si es una cita cargada a mano, del contacto. Sin ninguno, el
// WhatsApp no sale y queda anotado por qué.

import { firstName } from '@/lib/plantillas/variables';
import { resolverPlantillaDelEnvio } from '@/lib/seguimientos/plantilla-del-envio';
import type { PlantillaMeta } from '@/lib/secuencias/tipos';
import { PLANTILLA_RECORDATORIO } from './tipos';

export type ContenidoWhatsApp =
  | { accion: 'enviar'; params: string[]; texto: string; conBoton: boolean }
  | { accion: 'omitir'; motivo: 'sin_nombre' | 'plantilla_no_elegible' };

/** El texto de la agenda, por si la copia local de la plantilla no trae el cuerpo. */
export const TEXTO_RECORDATORIO =
  'Hola {{1}}, un recordatorio de la cita de {{2}} el {{3}}. Si hace falta cambiar la hora o cancelar, se puede desde el botón de abajo.';

/**
 * La fecha como parámetro de una plantilla de cita. `fechaDeCitaEnZona` termina en
 * «a. m.» / «p. m.» y las dos plantillas siguen con un punto («el {{3}}. Si hace
 * falta…»): sin sacarle el suyo, el cliente leía «10:00 a. m.. Si hace falta».
 */
export const fechaParaPlantilla = (fecha: string) => fecha.replace(/\.+$/, '');

/** El nombre para el saludo: el primer nombre de lo que escribió al reservar, o el del contacto. */
export function nombreDelRecordatorio(nombreEnLaCita: string | null | undefined, nombreDelContacto: string | null): string | null {
  return firstName(nombreEnLaCita) ?? firstName(nombreDelContacto);
}

export function contenidoWhatsAppDelRecordatorio(
  plantilla: PlantillaMeta,
  d: { nombre: string | null; servicio: string; fecha: string; negocio: string; agente: string | null },
): ContenidoWhatsApp {
  if (plantilla.name === PLANTILLA_RECORDATORIO) {
    if (!d.nombre) return { accion: 'omitir', motivo: 'sin_nombre' };
    const params = [d.nombre, d.servicio, fechaParaPlantilla(d.fecha)];
    const cuerpo = plantilla.body || TEXTO_RECORDATORIO;
    return {
      accion: 'enviar',
      params,
      texto: cuerpo.replace(/\{\{(\d+)\}\}/g, (todo, n: string) => params[Number(n) - 1] ?? todo),
      conBoton: true,
    };
  }
  const r = resolverPlantillaDelEnvio(plantilla, { nombre: d.nombre, negocio: d.negocio, agente: d.agente });
  if (r.accion === 'cancelar') return { accion: 'omitir', motivo: r.motivo };
  return { accion: 'enviar', params: r.params, texto: r.texto ?? plantilla.body, conBoton: false };
}
