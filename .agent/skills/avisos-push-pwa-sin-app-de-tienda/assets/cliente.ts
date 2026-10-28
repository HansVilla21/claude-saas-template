// Lo que hace el navegador para los avisos push (0168): saber si se puede,
// registrar el service worker, suscribir este dispositivo y olvidarlo.
//
// Todo guardeado contra SSR (`window`/`navigator` no existen en el server). El
// permiso del sistema se pide SOLO desde un toque (`suscribirEsteDispositivo`
// lo llama el botón): pedirlo al cargar hace que el navegador lo bloquee.

export type EstadoSoporte =
  /** Se puede: hay service worker, PushManager y Notification. */
  | 'ok'
  /** iPhone o iPad en Safari sin instalar: iOS solo deja suscribirse instalado. */
  | 'ios-sin-instalar'
  /** El navegador no tiene avisos push (o estamos en el server). */
  | 'sin-soporte';

/** El evento que avisa a la campana que este dispositivo se anotó o se borró. */
export const EVENTO_PUSH_CAMBIO = 'momentum:push-cambio';

export function esIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // El iPad con iPadOS se presenta como Mac; lo delata la pantalla táctil.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function estaInstalada(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

export function estadoSoporte(): EstadoSoporte {
  if (typeof window === 'undefined') return 'sin-soporte';
  if (esIOS() && !estaInstalada()) return 'ios-sin-instalar';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'sin-soporte';
  return 'ok';
}

/** Registra /sw.js (idempotente). Sin soporte devuelve null. */
export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  } catch (e) {
    console.warn('[push] no se pudo registrar el service worker', e);
    return null;
  }
}

/** La suscripción de ESTE dispositivo, si la hay. */
export async function suscripcionActual(): Promise<PushSubscription | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  if (!reg || !('pushManager' in reg)) return null;
  return reg.pushManager.getSubscription();
}

// La clave pública VAPID viene en base64url; PushManager la quiere en bytes.
function base64UrlABytes(base64: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
  const crudo = atob((base64 + relleno).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
  return bytes;
}

export type DatosSuscripcion = { endpoint: string; p256dh: string; auth: string };

export type ResultadoSuscribir =
  | { ok: true; datos: DatosSuscripcion }
  | { ok: false; motivo: 'sin-soporte' | 'sin-clave' | 'denegado' | 'fallo' };

/**
 * Pide el permiso (si hace falta) y suscribe este dispositivo. Llamar SOLO
 * desde un onClick. No guarda nada en el servidor: eso lo hace quien llama.
 */
export async function suscribirEsteDispositivo(clavePublica: string | undefined): Promise<ResultadoSuscribir> {
  if (estadoSoporte() !== 'ok') return { ok: false, motivo: 'sin-soporte' };
  if (!clavePublica) return { ok: false, motivo: 'sin-clave' };

  const permiso = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permiso !== 'granted') return { ok: false, motivo: 'denegado' };

  try {
    await registrarServiceWorker();
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlABytes(clavePublica) }));
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return { ok: false, motivo: 'fallo' };
    return { ok: true, datos: { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth } };
  } catch (e) {
    console.warn('[push] no se pudo suscribir', e);
    return { ok: false, motivo: 'fallo' };
  }
}

/** Avisa a la campana (mismo documento) que cambió la suscripción. */
export function avisarCambioPush(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_PUSH_CAMBIO));
}

/** El número de no leídos sobre el ícono de la app instalada. */
export function ponerBadge(n: number): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  if (!nav.setAppBadge || !nav.clearAppBadge) return;
  const p = n > 0 ? nav.setAppBadge(Math.min(99, n)) : nav.clearAppBadge();
  p.catch(() => {});
}
