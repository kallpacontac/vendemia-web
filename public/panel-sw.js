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

/*
 * Al tocar un aviso: la pantalla donde se actúa, CARGADA DE NUEVO (lo que se ve
 * es lo de ahora, no lo que había cuando se abrió la app hace una hora).
 * `navigate` recarga aunque ya esté en esa misma dirección. Si no se puede
 * (una ventana que este worker no controla), se abre una nueva: nunca se queda
 * en la pantalla vieja sin decir nada.
 */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/panel';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (ventanas) => {
      const panel = ventanas.find((v) => new URL(v.url).pathname.startsWith('/panel'));
      if (panel) {
        try {
          await panel.focus();
          const nueva = await panel.navigate(url);
          if (nueva) return;
        } catch {
          /* no la controla este worker: abajo, una nueva */
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
