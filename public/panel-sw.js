/*
 * Service worker del PANEL (el dueño del negocio). Ámbito: /panel.
 *
 * Qué hace y qué NO:
 *   · Recibe los avisos push y, al pulsarlos, abre la pantalla donde se actúa
 *     (la conversación, la caja, la agenda). Si el panel ya está abierto, lo
 *     reutiliza en vez de abrir otra ventana.
 *   · NO cachea nada ni intercepta peticiones: el panel enseña dinero y citas,
 *     y una copia vieja sería peor que un error de red.
 *   · No toca /m/ (la tarjeta de Fideliza tiene su propio worker, public/m/sw.js).
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { title: 'Vendemia', body: e.data ? e.data.text() : '' };
  }
  const url = typeof d.url === 'string' && d.url.startsWith('/panel') ? d.url : '/panel';
  e.waitUntil(
    self.registration.showNotification(d.title || 'Vendemia', {
      body: d.body || '',
      icon: '/icons/panel-192.png',
      badge: '/icons/panel-192.png',
      tag: d.tag || undefined,
      // Un aviso nuevo del mismo tipo reemplaza al anterior sin volver a sonar
      // si no hay nada nuevo que mirar.
      renotify: Boolean(d.tag),
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/panel';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if (new URL(v.url).pathname.startsWith('/panel') && 'focus' in v) {
          v.navigate(url).catch(() => {});
          return v.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
