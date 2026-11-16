// El envío de los avisos push (0168).
//
//   · enviarAvisosPush: lo llama /api/cron/push con los ids de las
//     notificaciones recién creadas cuyos dueños tienen algún dispositivo.
//   · enviarPruebaPush: el botón «Mandarme un aviso de prueba» del perfil.
//
// Lo que el servicio de push responde decide el destino de cada suscripción:
//   · 201/200 → listo; si venía fallando, se le limpia el contador.
//   · 404/410 → el dispositivo ya no existe: se borra la fila.
//   · cualquier otra cosa → se anota la falla y se sigue (puede ser pasajera).
//
// Las claves VAPID viven en Vercel (NEXT_PUBLIC_VAPID_PUBLIC_KEY y
// VAPID_PRIVATE_KEY). Sin ellas no se manda nada y se dice por qué.

import webpush, { WebPushError } from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import { armarAvisoPush, suscripcionMuerta, TOPE_BADGE, type AvisoPush } from '@/lib/push/aviso';
import type { NotificationRow } from '@/lib/notifications/types';

// El contacto que exige el protocolo: el servicio de push escribe acá si
// nuestros envíos le dan problemas.
const VAPID_SUBJECT = 'mailto:<tu-correo>';
// Un aviso de hace más de 12 horas ya no sirve: si el celular estuvo apagado,
// mejor que no le lleguen de golpe los de ayer.
const TTL_SEGUNDOS = 12 * 60 * 60;
// Techo de un lote: un evento repartido a todo un equipo grande cabe de sobra.
export const TOPE_IDS = 500;

export type ResumenEnvio = {
  notificaciones: number;
  enviados: number;
  borrados: number;
  fallas: number;
  sinClaves?: true;
};

type Suscripcion = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; failure_count: number };
type Claves = { publica: string; privada: string };
type Envio = { sub: Suscripcion; aviso: AvisoPush };

const COLUMNAS_SUB = 'id, user_id, endpoint, p256dh, auth, failure_count';

function clavesVapid(): Claves | null {
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privada = process.env.VAPID_PRIVATE_KEY?.trim();
  return publica && privada ? { publica, privada } : null;
}

// Manda cada aviso a su dispositivo y deja la tabla al día con lo que contestó
// el servicio de push. Devuelve cuántos salieron, cuántos se borraron y cuántos
// fallaron.
async function despachar(admin: SupabaseClient, claves: Claves, envios: Envio[]) {
  const r = { enviados: 0, borrados: 0, fallas: 0 };
  const muertas = new Set<string>();
  const fallidas = new Map<string, number>();
  const sanas = new Set<string>();

  await Promise.all(
    envios.map(({ sub, aviso }) =>
      webpush
        .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(aviso), {
          vapidDetails: { subject: VAPID_SUBJECT, publicKey: claves.publica, privateKey: claves.privada },
          TTL: TTL_SEGUNDOS,
          urgency: 'high',
        })
        .then(() => {
          r.enviados++;
          if (sub.failure_count > 0) sanas.add(sub.id);
        })
        .catch((e: unknown) => {
          const status = e instanceof WebPushError ? e.statusCode : undefined;
          if (suscripcionMuerta(status)) {
            muertas.add(sub.id);
          } else {
            r.fallas++;
            fallidas.set(sub.id, sub.failure_count);
            console.error('[push] envío fallido', status ?? (e instanceof Error ? e.message : e));
          }
        }),
    ),
  );

  // Una suscripción puede caer en varias listas si el lote traía varias
  // notificaciones del mismo dueño: borrar gana, después fallar.
  const escrituras: PromiseLike<unknown>[] = [];
  if (muertas.size > 0) {
    escrituras.push(admin.from('push_subscriptions').delete().in('id', [...muertas]));
    r.borrados = muertas.size;
  }
  const ahora = new Date().toISOString();
  for (const [id, previas] of fallidas) {
    if (muertas.has(id)) continue;
    escrituras.push(admin.from('push_subscriptions').update({ last_failure_at: ahora, failure_count: previas + 1 }).eq('id', id));
  }
  const limpiar = [...sanas].filter((id) => !muertas.has(id) && !fallidas.has(id));
  if (limpiar.length > 0) {
    escrituras.push(admin.from('push_subscriptions').update({ failure_count: 0 }).in('id', limpiar));
  }
  await Promise.all(escrituras);
  return r;
}

// Lo no leído de una persona en un negocio, para el número del ícono. Se piden
// a lo sumo TOPE_BADGE+1 ids: alcanza para saber "99 o más" sin contar los miles
// de avisos viejos de quien nunca abre la campana.
async function contarSinLeer(admin: SupabaseClient, userId: string, agencyId: string): Promise<number> {
  const { data } = await admin
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('agency_id', agencyId)
    .is('read_at', null)
    .limit(TOPE_BADGE + 1);
  return data?.length ?? 0;
}

export async function enviarAvisosPush(admin: SupabaseClient, ids: string[]): Promise<ResumenEnvio> {
  const resumen: ResumenEnvio = { notificaciones: 0, enviados: 0, borrados: 0, fallas: 0 };
  const claves = clavesVapid();
  if (!claves) return { ...resumen, sinClaves: true };
  if (ids.length === 0) return resumen;

  const { data: filas, error } = await admin
    .from('notifications')
    .select('id, agency_id, user_id, type, title, body, resource_type, data')
    .in('id', ids.slice(0, TOPE_IDS));
  if (error) throw new Error(`notifications: ${error.message}`);
  const notifs = (filas ?? []) as Pick<NotificationRow, 'id' | 'agency_id' | 'user_id' | 'type' | 'title' | 'body' | 'resource_type' | 'data'>[];
  resumen.notificaciones = notifs.length;
  if (notifs.length === 0) return resumen;

  const usuarios = [...new Set(notifs.map((n) => n.user_id))];
  const agencias = [...new Set(notifs.map((n) => n.agency_id))];
  const pares = [...new Set(notifs.map((n) => `${n.user_id}|${n.agency_id}`))];
  const [subsRes, agRes, conteos] = await Promise.all([
    admin.from('push_subscriptions').select(COLUMNAS_SUB).in('user_id', usuarios),
    admin.from('agencies').select('id, slug').in('id', agencias),
    Promise.all(pares.map(async (par) => [par, await contarSinLeer(admin, ...(par.split('|') as [string, string]))] as const)),
  ]);
  if (subsRes.error) throw new Error(`push_subscriptions: ${subsRes.error.message}`);
  if (agRes.error) throw new Error(`agencies: ${agRes.error.message}`);

  const subsPorUsuario = new Map<string, Suscripcion[]>();
  for (const s of (subsRes.data ?? []) as Suscripcion[]) {
    subsPorUsuario.set(s.user_id, [...(subsPorUsuario.get(s.user_id) ?? []), s]);
  }
  const slugPorAgencia = new Map((agRes.data ?? []).map((a) => [a.id as string, a.slug as string]));
  const sinLeer = new Map(conteos);

  const envios: Envio[] = [];
  for (const n of notifs) {
    const slug = slugPorAgencia.get(n.agency_id);
    if (!slug) continue;
    const aviso = armarAvisoPush(n, slug, sinLeer.get(`${n.user_id}|${n.agency_id}`) ?? 0);
    for (const sub of subsPorUsuario.get(n.user_id) ?? []) envios.push({ sub, aviso });
  }

  return { ...resumen, ...(await despachar(admin, claves, envios)) };
}

/**
 * El aviso de prueba del perfil: llega a TODOS los dispositivos de la persona y
 * al tocarlo vuelve al perfil. No crea una notificación (no ensucia la campana).
 */
export async function enviarPruebaPush(
  admin: SupabaseClient,
  userId: string,
  agencySlug: string,
): Promise<{ ok: true; dispositivos: number; enviados: number } | { ok: false; error: 'vapid_no_configurado' | 'sin_dispositivos' | 'no_llego' }> {
  const claves = clavesVapid();
  if (!claves) return { ok: false, error: 'vapid_no_configurado' };
  const { data, error } = await admin.from('push_subscriptions').select(COLUMNAS_SUB).eq('user_id', userId);
  if (error) throw new Error(`push_subscriptions: ${error.message}`);
  const subs = (data ?? []) as Suscripcion[];
  if (subs.length === 0) return { ok: false, error: 'sin_dispositivos' };

  const aviso: AvisoPush = {
    tag: `prueba-${Date.now()}`,
    title: 'Los avisos ya llegan a este celular',
    body: 'Así te vamos a avisar cuando un cliente escriba o necesite a alguien del equipo.',
    url: `/a/${agencySlug}/settings/perfil`,
    badge: 0,
    siempre: true,
  };
  const r = await despachar(admin, claves, subs.map((sub) => ({ sub, aviso })));
  if (r.enviados === 0) return { ok: false, error: 'no_llego' };
  return { ok: true, dispositivos: subs.length, enviados: r.enviados };
}
