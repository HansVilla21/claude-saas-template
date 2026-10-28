// El contenido de un aviso push, armado a partir de una fila de `notifications`.
//
// Función pura: la usa /api/cron/push y la prueba la corre sin levantar Next.
// El service worker (public/sw.js) solo dibuja lo que viene acá; no decide nada.
//
// El destino sale de la MISMA función que usan la campana y el aviso de
// escritorio (`inboxHrefForNotification`), para que tocar el push lleve al
// mismo lugar que tocar la campana.

import { inboxHrefForNotification, notificationPresentation, type NotificationRow } from '@/lib/notifications/types';

export type AvisoPush = {
  /** El id de la notificación: el SO colapsa dos avisos con el mismo tag. */
  tag: string;
  title: string;
  body: string;
  /** Ruta relativa dentro del CRM, la que abre el toque. */
  url: string;
  /** Avisos sin leer de esa persona en ese negocio (el número sobre el ícono). */
  badge: number;
  /**
   * Mostrarlo aunque la persona tenga el CRM abierto delante. Solo el aviso de
   * prueba: se pide con el CRM abierto, y sin esto en Android no se veía nada.
   */
  siempre?: boolean;
};

// El servicio de push acepta ~4 KB cifrados. El texto se recorta mucho antes:
// la pantalla bloqueada muestra dos o tres líneas, y un mensaje largo de un
// cliente no tiene por qué viajar entero.
const TOPE_TITULO = 80;
const TOPE_TEXTO = 180;
// La Badging API acepta cualquier entero; arriba de 99 el número ya no se lee.
export const TOPE_BADGE = 99;

function recortar(texto: string, tope: number): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (limpio.length <= tope) return limpio;
  return `${limpio.slice(0, tope - 1).trimEnd()}…`;
}

export function armarAvisoPush(
  row: Pick<NotificationRow, 'id' | 'type' | 'title' | 'body' | 'resource_type' | 'data'>,
  agencySlug: string,
  sinLeer: number,
): AvisoPush {
  const etiqueta = notificationPresentation(row.type).label;
  const title = recortar(row.title?.trim() || etiqueta, TOPE_TITULO);
  const body = recortar(row.body?.trim() || row.data?.preview?.trim() || etiqueta, TOPE_TEXTO);
  return {
    tag: row.id,
    title,
    body,
    url: inboxHrefForNotification(row, agencySlug),
    badge: Math.max(0, Math.min(TOPE_BADGE, Math.trunc(sinLeer))),
  };
}

/**
 * ¿Hay que borrar la suscripción después de esta respuesta del servicio de push?
 * 404 y 410 dicen que el dispositivo ya no existe (desinstaló, borró datos,
 * revocó el permiso): reintentar es inútil para siempre.
 */
export function suscripcionMuerta(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}
