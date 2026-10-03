/*
 * Service worker de la tarjeta web de Fideliza. Ámbito: SOLO /m/.
 *
 * Qué hace y qué NO:
 *   · Cachea recursos estáticos con hash (/_next/static, /wallet). Nada más.
 *   · La tarjeta (/m/<token>) y las APIs van SIEMPRE a la red. Sin conexión se
 *     enseña un aviso, nunca un saldo guardado como si estuviera al día.
 *   · Recibe los avisos push y, al pulsarlos, abre la tarjeta.
 * No toca el panel, la caja ni las redirecciones de las placas: están fuera de
 * su ámbito y el navegador no le deja interceptarlas.
 */
const ESTATICOS = 'fz-estaticos-v1';
const META = 'fz-meta-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('fz-') && k !== ESTATICOS && k !== META).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.tipo === 'tarjeta' && typeof d.url === 'string' && /^\/m\/[A-Za-z0-9_-]{30,64}$/.test(d.url)) {
    e.waitUntil(caches.open(META).then((c) => c.put('/m/__tarjeta', new Response(d.url))));
  }
});

const SIN_CONEXION = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sin conexión</title><body style="font:16px system-ui;padding:32px 16px;max-width:420px;margin:auto;background:#F9F9F6">
<h1 style="font-size:20px">Sin conexión</h1><p>No podemos confirmar tu saldo ahora. Tu tarjeta y tus premios están a salvo: vuelve a abrirla cuando tengas datos o wifi.</p>
<button onclick="location.reload()" style="min-height:48px;padding:0 20px;border-radius:12px;border:1.5px solid #DEDED9;background:#fff;font:700 15px system-ui">Reintentar</button></body></html>`;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/wallet/')) {
    e.respondWith(
      caches.open(ESTATICOS).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const r = await fetch(req);
        if (r.ok) c.put(req, r.clone());
        return r;
      }),
    );
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => new Response(SIN_CONEXION, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })),
    );
  }
});

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch (_) {
    d = {};
  }
  e.waitUntil(
    self.registration.showNotification(d.title || 'Tu tarjeta', {
      body: d.body || '',
      icon: d.icon || '/wallet/logo-vendemia-1024.png',
      data: { campaign_id: d.campaign_id || null },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const campana = (e.notification.data || {}).campaign_id;
  e.waitUntil(
    caches
      .open(META)
      .then((c) => c.match('/m/__tarjeta'))
      .then((r) => (r ? r.text() : null))
      .then((ruta) => {
        if (!ruta) return null;
        return self.clients.openWindow(campana ? `${ruta}?c=${encodeURIComponent(campana)}` : ruta);
      }),
  );
});
