// Service worker del CRM (0168): avisos push con el CRM cerrado.
//
// Solo hace dos cosas, a propósito: no cachea nada ni intercepta pedidos (el
// CRM no funciona sin conexión y un caché viejo de pantallas haría más daño
// que bien).
//   1. `push`: muestra el aviso que armó el servidor (lib/push/aviso.ts) y pone
//      el número de no leídos sobre el ícono.
//   2. `notificationclick`: lleva a la pantalla del aviso, reusando una ventana
//      abierta del CRM si la hay.
//
// El texto y el destino los decide el servidor. Acá no hay lógica de negocio.

self.addEventListener('install', () => {
  // Una versión nueva toma el control sin esperar a que se cierren las ventanas.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function ponerBadge(n) {
  if (!('setAppBadge' in self.navigator)) return Promise.resolve();
  const num = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  const p = num > 0 ? self.navigator.setAppBadge(num) : self.navigator.clearAppBadge();
  return p.catch(() => {});
}

// Safari (iPhone y Mac) revoca el permiso si un push llega y no se muestra
// ningún aviso. Chrome y Firefox no, si hay una ventana del CRM en primer plano.
function esSafari() {
  const ua = self.navigator.userAgent || '';
  return /AppleWebKit/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|SamsungBrowser|Firefox|FxiOS/.test(ua);
}

self.addEventListener('push', (event) => {
  let aviso = null;
  try {
    aviso = event.data ? event.data.json() : null;
  } catch {
    aviso = null;
  }
  if (!aviso || typeof aviso !== 'object') {
    aviso = { title: 'Momentum', body: 'Tenés un aviso nuevo', url: '/', tag: 'momentum' };
  }

  event.waitUntil(
    (async () => {
      await ponerBadge(aviso.badge);
      // Si la persona está mirando el CRM en este momento, la campana ya le
      // muestra el aviso: un banner encima sería repetirlo. El aviso de prueba
      // (`siempre`) sale igual: se pide justo con el CRM abierto.
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const mirando = ventanas.some((c) => c.focused && c.visibilityState === 'visible');
      if (mirando && !esSafari() && !aviso.siempre) return;
      await self.registration.showNotification(aviso.title || 'Momentum', {
        body: aviso.body || '',
        tag: aviso.tag || undefined,
        icon: '/pwa/icon-192.png',
        badge: '/pwa/badge-96.png',
        data: { url: typeof aviso.url === 'string' ? aviso.url : '/' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
  // Nunca abrir algo fuera del CRM, aunque el aviso lo pidiera.
  if (destino.origin !== self.location.origin) return;

  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const propia = ventanas.find((c) => new URL(c.url).origin === self.location.origin);
      if (propia) {
        await propia.focus();
        if ('navigate' in propia) {
          try {
            await propia.navigate(destino.href);
            return;
          } catch {
            // Una ventana que este service worker no controla no se deja
            // navegar: se abre una nueva.
          }
        }
      }
      await self.clients.openWindow(destino.href);
    })(),
  );
});

