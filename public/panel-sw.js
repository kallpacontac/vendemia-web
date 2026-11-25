/*
 * Service worker del PANEL (el dueño del negocio). Ámbito: /panel.
 *
 * Dos trabajos:
 *
 *   1 · LOS AVISOS. Recibe los push y, al pulsarlos, abre la pantalla donde se actúa (la
 *       conversación, la caja, la agenda), reutilizando el panel si ya está abierto.
 *
 *   2 · SIN CONEXIÓN (19-nov-2026, apagones y cortes). Solo para el DUEÑO y el ADMINISTRADOR,
 *       y solo si la página lo encendió (mensaje `vm-sin-conexion`, ver
 *       components/panel/SinConexion.tsx). Apagado, este worker no toca ninguna petición.
 *
 *       · La app abre sin red: las páginas de la Caja y la Agenda y sus archivos (/_next/static)
 *         se guardan al usarlas. Con red siempre se pide la versión nueva primero.
 *       · Lo que se LEE de Supabase se guarda; con red manda la red. Sin red, o si no contesta en
 *         unos segundos, se entrega la última copia y se le dice a la página de cuándo es
 *         (`vm-red`), para que lo enseñe arriba: «lo que ves es de las 3:40 pm». Antes este
 *         worker no guardaba nada porque «una copia vieja sería peor que un error»: sigue
 *         siéndolo si no se dice, y por eso siempre se dice.
 *       · Lo que ESCRIBE nunca se guarda ni se finge: pasa a la red y, sin red, falla. Las
 *         lecturas se reconocen por lista (LECTURAS), no por el nombre: hay funciones como
 *         `pedidos_web_estado` que parecen lecturas y escriben. Una función que falte en la
 *         lista solo se queda sin copia; una escritura en ella mentiría.
 *       · Al salir de la cuenta, o si entra otra persona, las copias se borran (`vm-olvidar`).
 *
 * No toca /m/ (la tarjeta de Fideliza tiene su propio worker, public/m/sw.js).
 */
const VERSION = '2026-11-19';
const CACHE_APP = `vm-panel-app-${VERSION}`;
const CACHE_DATOS = 'vm-panel-datos';
const CACHE_AJUSTES = 'vm-panel-ajustes';
const CLAVE_AJUSTES = '/__vm/sin-conexion';

/** Cuánto esperar a la red antes de enseñar la copia (wifi sin internet: el fetch se cuelga). */
const ESPERA_DATOS_MS = 8000;
const ESPERA_PAGINA_MS = 6000;
/** Copias más viejas que esto no se enseñan: después de 4 días ya no sirven para cobrar. */
const EDAD_MAXIMA_MS = 4 * 24 * 3600 * 1000;

/**
 * Las funciones de Supabase que SOLO LEEN. Comprobado el 19-nov-2026 en su definición: `stable`, o
 * sin insert/update/delete. Añadir aquí solo después de mirarla.
 */
const LECTURAS = new Set([
  'agenda_adelantos_sin_usar', 'agenda_en_nube', 'analytics_products', 'analytics_serie', 'avisame_panel',
  'caja_ingresos_leer', 'caja_mas_vendidos', 'cancha_buscar', 'cancha_codigos', 'canchas_fijas_panel',
  'catalogo_del_equipo', 'cobro_foto_modo', 'cobro_fotos_del_dia', 'comision_cierres_leer', 'comprobantes_panel',
  'comprobantes_por_cotejar', 'config_en_nube', 'empleado_fichas_leer', 'empleado_saldos', 'empleado_sueldos_leer',
  'equipo_accesos_leer', 'equipo_fichas', 'equipo_listar', 'es_admin_plataforma', 'factura_ajustes_leer', 'factura_lista',
  'gcal_panel', 'loyalty_avisos_guardados_leer', 'loyalty_birthday_get', 'loyalty_role', 'menu_orden',
  'mesa_panel_historial', 'mesa_panel_mesas', 'mesa_panel_usa', 'mesa_panel_vivo', 'mi_agenda_sin_cita_datos',
  'mi_negocio', 'mi_por_cobrar', 'mis_clientes',
]);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) =>
  e.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(nombres.filter((n) => n.startsWith('vm-panel-app-') && n !== CACHE_APP).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  ),
);

/* ══ Los avisos ══════════════════════════════════════════════════════════════ */

/** Solo rutas de este sitio: un aviso no carga imágenes de fuera. */
const propio = (v) => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v : '');

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { title: 'Vendemia', body: e.data ? e.data.text() : '' };
  }
  const url = typeof d.url === 'string' && d.url.startsWith('/panel') ? d.url : '/panel';
  e.waitUntil((async () => {
    // Con el panel a la vista, suena EL DE VENDEMIA (24-nov-2026, Alvaro: «aparece pero no suena
    // nuestro sonido»): se le pide a la ventana que lo toque, y si contesta que sonó, la
    // notificación sale callada (un solo sonido). Si no hay panel, o no pudo sonar (nadie tocó la
    // pantalla todavía), suena la del celular como siempre.
    let sono = false;
    try {
      sono = await pedirSonido(d);
    } catch {
      sono = false;
    }
    const titulo = d.title || 'Vendemia';
    const opciones = {
      body: d.body || '',
      // Marca propia: el logo del negocio, si el aviso lo trae (lib/panel/marcaPropia.ts). Se había
      // perdido al rehacer este worker para «sin conexión» (44df7b0); vuelto el 21-nov-2026.
      icon: propio(d.icon) || '/icons/panel-192.png',
      badge: propio(d.badge) || '/icons/panel-192.png',
      tag: d.tag || undefined,
      // Un aviso nuevo del mismo tipo reemplaza al anterior en la bandeja, pero VUELVE a avisar:
      // es otra reserva.
      renotify: Boolean(d.tag),
      data: { url },
    };
    // ⚠️ `silent: true` con `vibrate` es un TypeError (lo dice la especificación) y el aviso NO
    // salía (24-nov-2026: «suena pero no veo la notificación»). Callada: sin vibrate. Con sonido
    // del celular: vibra como siempre.
    if (sono) opciones.silent = true;
    else opciones.vibrate = [200, 100, 200];
    try {
      await self.registration.showNotification(titulo, opciones);
    } catch {
      // Pase lo que pase, el aviso tiene que verse: lo mínimo.
      await self.registration.showNotification(titulo, { body: d.body || '', icon: '/icons/panel-192.png', data: { url } });
    }
  })());
});

/**
 * Le pide a UN panel abierto que suene: primero el que está a la vista, luego los de fondo
 * (minimizado, otra pestaña, la app en segundo plano: 24-nov-2026, Alvaro). De uno en uno, para
 * que dos pestañas no suenen a la vez. true si alguno contestó que sonó (≤ 400 ms cada uno).
 * Con el panel CERRADO no hay a quién pedírselo: suena la del celular (la web no puede elegirla).
 */
async function pedirSonido(d) {
  let ventanas = [];
  try {
    ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  } catch {
    return false;
  }
  const paneles = ventanas
    .filter((v) => new URL(v.url).pathname.startsWith('/panel'))
    .sort((a, b) => (a.visibilityState === 'visible' ? 0 : 1) - (b.visibilityState === 'visible' ? 0 : 1));
  for (const v of paneles) {
    const sono = await new Promise((ok) => {
      const canal = new MessageChannel();
      const reloj = setTimeout(() => ok(false), 400);
      canal.port1.onmessage = (m) => { clearTimeout(reloj); ok(Boolean(m.data && m.data.sono)); };
      try {
        v.postMessage({ tipo: 'vm-aviso', titulo: d.title || '' }, [canal.port2]);
      } catch {
        clearTimeout(reloj);
        ok(false);
      }
    });
    if (sono) return true;
  }
  return false;
}

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

/* ══ Sin conexión: los ajustes que manda la página ═══════════════════════════ */

/** `undefined` = aún sin leer (el worker acaba de despertar). */
let ajustes;
const leyendoAjustes = (async () => {
  try {
    const c = await caches.open(CACHE_AJUSTES);
    const r = await c.match(CLAVE_AJUSTES);
    ajustes = r ? await r.json() : { activo: false, usuario: '' };
  } catch {
    ajustes = { activo: false, usuario: '' };
  }
})();

async function guardarAjustes(nuevos) {
  ajustes = nuevos;
  const c = await caches.open(CACHE_AJUSTES);
  await c.put(CLAVE_AJUSTES, new Response(JSON.stringify(nuevos), { headers: { 'content-type': 'application/json' } }));
}

async function olvidarDatos() {
  await caches.delete(CACHE_DATOS);
}

self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.tipo === 'vm-olvidar') {
    e.waitUntil(Promise.all([olvidarDatos(), guardarAjustes({ activo: false, usuario: '' })]));
    return;
  }
  if (d.tipo === 'vm-sin-conexion') {
    e.waitUntil(
      (async () => {
        await leyendoAjustes;
        const usuario = String(d.usuario || '');
        // Otra persona en este celular: lo que se guardó de la anterior no es suyo.
        if (ajustes.usuario && ajustes.usuario !== usuario) await olvidarDatos();
        if (!d.activo) await olvidarDatos();
        await guardarAjustes({ activo: Boolean(d.activo), usuario });
        if (d.activo && Array.isArray(d.rutas)) await precalentar(d.rutas.filter((r) => typeof r === 'string' && r.startsWith('/panel')));
      })().catch(() => {}),
    );
  }
});

/* ══ Sin conexión: qué se intercepta ═════════════════════════════════════════ */

self.addEventListener('fetch', (e) => {
  const req = e.request;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  const tipo = clasificar(req, url);
  if (!tipo) return;
  // Con los ajustes ya leídos y apagado, ni se toca: el panel funciona como siempre.
  if (ajustes && !ajustes.activo) return;
  e.respondWith(
    (async () => {
      await leyendoAjustes;
      if (!ajustes.activo) return fetch(req);
      try {
        if (tipo === 'estatico') return await estatico(req);
        if (tipo === 'pagina') return await pagina(req, url);
        if (tipo === 'rsc') return await rsc(req);
        return await datos(req, url, e.clientId);
      } catch {
        return fetch(req);
      }
    })(),
  );
});

function clasificar(req, url) {
  const mismo = url.origin === self.location.origin;
  if (mismo) {
    if (req.method !== 'GET') return null;
    if (url.pathname.startsWith('/_next/static/')) return 'estatico';
    if (!url.pathname.startsWith('/panel')) return null;
    if (req.mode === 'navigate') return 'pagina';
    if (req.headers.get('RSC') === '1') return 'rsc';
    return null;
  }
  if (!url.pathname.startsWith('/rest/v1/')) return null;
  if (req.method === 'GET' || req.method === 'HEAD') return 'datos';
  if (req.method === 'POST' && url.pathname.startsWith('/rest/v1/rpc/') && LECTURAS.has(url.pathname.slice('/rest/v1/rpc/'.length))) {
    return 'datos';
  }
  return null;
}

/** Los archivos con hash no cambian nunca: si ya está, no se pide. */
async function estatico(req) {
  const c = await caches.open(CACHE_APP);
  const guardado = await c.match(req);
  if (guardado) return guardado;
  const r = await fetch(req);
  if (r.ok) await c.put(req, r.clone());
  return r;
}

/** Una pantalla del panel: la nueva si hay red; si no, la guardada; si tampoco, el aviso. */
async function pagina(req, url) {
  const c = await caches.open(CACHE_APP);
  const clave = new Request(url.origin + url.pathname);
  try {
    const r = await conEspera(fetch(req), ESPERA_PAGINA_MS);
    if (r.ok && !r.redirected && (r.headers.get('content-type') || '').includes('text/html')) await c.put(clave, r.clone());
    return r;
  } catch {
    const guardada = await c.match(clave);
    if (guardada) return guardada;
    return paginaSinConexion(c);
  }
}

/**
 * La navegación interna de Next (RSC). Su respuesta depende de desde dónde se navega, así que no
 * se guarda: sin red falla enseguida y Next hace una navegación completa, que sí tiene su copia.
 */
async function rsc(req) {
  if (self.navigator && self.navigator.onLine === false) return Response.error();
  return conEspera(fetch(req), ESPERA_PAGINA_MS).catch(() => Response.error());
}

/** Una lectura de Supabase: la red manda; sin ella, la última copia, dicha. */
async function datos(req, url, clientId) {
  const clave = await claveDe(req, url);
  const c = await caches.open(CACHE_DATOS);
  const red = fetch(req).then(async (r) => {
    if (r.status === 200 || r.status === 206) await c.put(clave, await conFecha(r.clone()));
    return r;
  });
  let respuesta;
  try {
    respuesta = await conEspera(red, ESPERA_DATOS_MS);
  } catch {
    respuesta = null;
  }
  // Contestó (aunque sea un 401 o un 400: eso es un error de verdad y se entrega tal cual). Solo
  // un servidor caído (5xx) se trata como sin red.
  if (respuesta && respuesta.status < 500) {
    avisar(clientId, { tipo: 'vm-red', ok: true });
    return respuesta;
  }
  const copia = await c.match(clave);
  const fecha = copia ? Number(copia.headers.get('x-vm-guardado')) || 0 : 0;
  if (copia && Date.now() - fecha < EDAD_MAXIMA_MS) {
    avisar(clientId, { tipo: 'vm-red', ok: false, copia: fecha });
    return copia;
  }
  if (respuesta) return respuesta;
  // Sin copia: se espera a la red de verdad (puede que solo fuera lenta).
  try {
    const r = await red;
    avisar(clientId, { tipo: 'vm-red', ok: r.status < 500 });
    return r;
  } catch (e) {
    avisar(clientId, { tipo: 'vm-red', ok: false, copia: 0 });
    throw e;
  }
}

/** La misma consulta = la misma clave: dirección, cuerpo y las cabeceras que cambian la forma. */
async function claveDe(req, url) {
  const cuerpo = req.method === 'POST' ? await req.clone().text() : '';
  const texto = [req.method, url.href, req.headers.get('Accept') || '', req.headers.get('Prefer') || '',
    req.headers.get('Accept-Profile') || '', cuerpo].join('\n');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return new Request(`${self.location.origin}/__vm/datos/${hex}`);
}

async function conFecha(r) {
  const h = new Headers(r.headers);
  h.set('x-vm-guardado', String(Date.now()));
  return new Response(await r.blob(), { status: r.status, statusText: r.statusText, headers: h });
}

function conEspera(promesa, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('espera')), ms);
    promesa.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

async function avisar(clientId, mensaje) {
  try {
    const c = clientId ? await self.clients.get(clientId) : null;
    if (c) return c.postMessage(mensaje);
    const todas = await self.clients.matchAll({ type: 'window' });
    todas.forEach((v) => v.postMessage(mensaje));
  } catch {
    /* sin ventana a quien decírselo */
  }
}

/**
 * Deja guardadas las pantallas que sirven sin red y todos sus archivos, para que abran aunque
 * nunca se hayan visitado en este celular. Y borra los archivos de versiones anteriores.
 */
async function precalentar(rutas) {
  if (!rutas.length || (self.navigator && self.navigator.onLine === false)) return;
  const c = await caches.open(CACHE_APP);
  const usados = new Set();
  let todas = true;
  for (const ruta of rutas) {
    try {
      const r = await fetch(ruta, { credentials: 'same-origin' });
      if (!r.ok || !(r.headers.get('content-type') || '').includes('text/html')) {
        todas = false;
        continue;
      }
      const html = await r.clone().text();
      await c.put(new Request(self.location.origin + ruta), r);
      for (const m of html.matchAll(/\/_next\/static\/[^"'\\\s)<>]+/g)) usados.add(m[0]);
    } catch {
      todas = false;
    }
  }
  const faltan = [];
  for (const ruta of usados) if (!(await c.match(ruta))) faltan.push(ruta);
  // De cuatro en cuatro: no saturar el celular ni la red del local.
  for (let i = 0; i < faltan.length; i += 4) {
    await Promise.all(
      faltan.slice(i, i + 4).map(async (ruta) => {
        try {
          const r = await fetch(ruta);
          if (r.ok) await c.put(ruta, r);
        } catch {
          /* la próxima vez */
        }
      }),
    );
  }
  // Limpieza: cada despliegue deja archivos nuevos y los viejos se acumulan. Solo cuando ya son
  // muchos, y solo si se pudieron leer todas las pantallas (si no, no se sabe qué sigue en uso).
  // Lo que no sale en ninguna pantalla guardada es de una versión anterior o de una pantalla que
  // no sirve sin red: con red se vuelve a pedir solo.
  if (!todas) return;
  const estaticos = (await c.keys()).filter((r) => new URL(r.url).pathname.startsWith('/_next/static/'));
  if (estaticos.length < 400) return;
  for (const req of estaticos) {
    const p = new URL(req.url).pathname;
    if (!usados.has(p) && !p.startsWith('/_next/static/media/')) await c.delete(req);
  }
}

async function paginaSinConexion(c) {
  const guardadas = (await c.keys()).map((r) => new URL(r.url).pathname).filter((p) => p.startsWith('/panel'));
  const nombre = { '/panel': 'Inicio', '/panel/caja': 'Caja', '/panel/agenda': 'Agenda' };
  const enlaces = guardadas
    .filter((p) => nombre[p])
    .map((p) => `<a href="${p}">${nombre[p]}</a>`)
    .join('');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sin conexión · Vendemia</title><style>
body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#F9F9F7;color:#1A1A1A;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}
main{max-width:420px;text-align:center}h1{font-size:22px;margin:0 0 8px}p{color:#555;margin:0 0 20px}
nav{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}a{display:inline-block;padding:12px 18px;border-radius:10px;background:#1A1A1A;color:#fff;text-decoration:none;font-weight:600}
</style></head><body><main><h1>Sin conexión</h1><p>Esta pantalla necesita internet.${enlaces ? ' Estas sí funcionan sin conexión:' : ' Vuelve a intentarlo cuando regrese la señal.'}</p><nav>${enlaces}</nav></main></body></html>`;
  return new Response(html, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
