import 'server-only';

// Los links para gestionar una cita (`/r/cita/<token>`).
//
// El principal lo pone la reserva: su huella vive en `appointments.manage_token_hash`
// (0162) y es la que piden `reservas_mover` y `reservas_cancelar`. El token en
// claro solo existe en el momento de mandarlo, así que un recordatorio no puede
// repetir el de la confirmación: cada recordatorio lleva uno PROPIO y su huella
// queda en `cita_links` (0165). Los dos abren la misma cita.
//
// Quien llega con un link extra se traduce acá a la huella principal, y de ahí
// en adelante todo sigue igual que en la fase 2: las funciones de la base no
// cambiaron.

import { createAdminClient } from '@/lib/supabase/admin';
import { generarToken, hashDeToken } from '@/lib/reservas/pagina/token';

const HUELLA = /^[0-9a-f]{64}$/;

/** La huella principal de la cita a la que lleva `hash` (sea el principal o uno extra), o null. */
export async function huellaPrincipal(hash: string): Promise<string | null> {
  if (!HUELLA.test(hash)) return null;
  const db = createAdminClient();
  const { data: directa } = await db.from('appointments').select('id').eq('manage_token_hash', hash).maybeSingle();
  if (directa) return hash;
  const { data: extra } = await db.from('cita_links').select('appointment_id').eq('token_hash', hash).maybeSingle();
  if (!extra) return null;
  const { data: cita } = await db.from('appointments').select('manage_token_hash').eq('id', extra.appointment_id).maybeSingle();
  const principal = (cita?.manage_token_hash as string | null | undefined) ?? null;
  return principal && HUELLA.test(principal) ? principal : null;
}

/**
 * Un link nuevo para la cita (devuelve el token en claro). Una cita cargada a
 * mano no tiene ninguno: el primero pasa a ser el principal. Si no, es uno extra.
 * null si no se pudo guardar: sin huella guardada, el link no abriría nada.
 */
export async function nuevoLinkDeCita(
  db: ReturnType<typeof createAdminClient>,
  cita: { id: string; agencyId: string },
): Promise<string | null> {
  const token = generarToken();
  const hash = hashDeToken(token);
  // Condicional: si dos envíos se cruzan, solo uno pone el principal.
  const { data: puesto, error: errPuesto } = await db.from('appointments')
    .update({ manage_token_hash: hash }).eq('id', cita.id).is('manage_token_hash', null).select('id');
  if (errPuesto) return null;
  if ((puesto?.length ?? 0) > 0) return token;
  const { error } = await db.from('cita_links').insert({
    token_hash: hash, appointment_id: cita.id, agency_id: cita.agencyId, origen: 'recordatorio',
  });
  return error ? null : token;
}
