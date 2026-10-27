import 'server-only';

// El link para cambiar o cancelar una reserva (`/r/cita/<token>`) y la huella
// de la IP para el tope de intentos.
//
// El token en claro solo lo tiene el cliente (en su WhatsApp y su correo). La
// base guarda su sha256 (`appointments.manage_token_hash`, 0162): quien lea la
// base no puede cancelarle la cita a nadie. 32 bytes al azar: adivinarlo no es
// un ataque posible, así que no hace falta contar los intentos fallidos.

import { createHash, createHmac, randomBytes } from 'node:crypto';

export function generarToken(): string {
  return randomBytes(32).toString('base64url');
}

/** El token tiene la forma que genera `generarToken` (43 caracteres base64url). */
export function tokenConForma(t: string | null | undefined): t is string {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t);
}

export function hashDeToken(t: string): string {
  return createHash('sha256').update(t).digest('hex');
}

/**
 * La IP pasada por un HMAC con un secreto del servidor: sirve para contar
 * intentos, no para saber quién es. Sin IP (o sin secreto), null: el tope por IP
 * no aplica y queda el tope por WhatsApp.
 */
export function hashDeIp(ip: string | null): string | null {
  const secreto = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!ip || !secreto) return null;
  return createHmac('sha256', secreto).update(`reservas:ip:${ip}`).digest('hex');
}

/** La IP de quien pide, según los encabezados que pone Vercel. */
export function ipDeEncabezados(h: Headers): string | null {
  const reenviada = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return reenviada || h.get('x-real-ip') || null;
}
