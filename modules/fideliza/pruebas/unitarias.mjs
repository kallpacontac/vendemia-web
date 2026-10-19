/**
 * ══════════════════════════════════════════════════════════════════════════
 * PRUEBAS DE FIDELIZA QUE NO NECESITAN BASE DE DATOS
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   npm run test:fideliza            (después de `npm run build` para la 7)
 *
 * Lo que toca a Postgres (idempotencia, canjes simultáneos, RLS entre
 * compañías…) está en modules/fideliza/sql/tests/pruebas.sql y se ejecuta contra
 * una base de staging. Ver modules/fideliza/sql/README.md.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import createJiti from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true });
const raiz = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const cargar = (p) => jiti(join(raiz, p));

const payload = cargar('modules/fideliza/dominio/wallet-payload.ts');
const formato = cargar('modules/fideliza/dominio/formato.ts');
const errores = cargar('modules/fideliza/dominio/errores.ts');
const botones = cargar('modules/fideliza/dominio/botones.ts');
const pagina = cargar('modules/fideliza/dominio/paginaPublica.ts');
const activacion = cargar('modules/fideliza/dominio/activacion.ts');
const config = cargar('modules/fideliza/dominio/config.ts');

const MIEMBRO_ID = '9f1c2d3e-4b5a-4c6d-8e7f-001122334455';
const marca = { slug: 'barberia-centro', display_name: 'Barbería Centro', logo_url: 'https://x.com/l.png', bg_color: '#112233', support_url: null };

test('1 · el objeto de Wallet lleva el token opaco en el QR y nunca el id interno', () => {
  const o = payload.cuerpoObjeto(
    {
      member: { public_code: 'VDM-A7K9P2', alias: 'Ana', status: 'active', balance: 7, rewards_available: 1, qr_token: 'vqABCDEFGHIJKLMNOPQRSTUVWX' },
      program: { name: 'Club', status: 'active', rule_type: 'stamps', threshold: 10, reward: 'Corte gratis' },
      brand: marca,
    },
    '3388000000023213846.vf_x',
    { urlNegocio: 'https://fideliza.vendemias.com/n/barberia-centro' },
  );
  assert.equal(o.barcode.value, 'vqABCDEFGHIJKLMNOPQRSTUVWX');
  assert.equal(o.accountId, 'VDM-A7K9P2');
  assert.equal(o.state, 'ACTIVE');
  assert.deepEqual(o.loyaltyPoints.balance, { int: 7 });
  assert.ok(!JSON.stringify(o).includes(MIEMBRO_ID));
  assert.ok(!('rewardsTier' in o), 'no se usa rewards tier para simular saldos');
});

test('2 · suspendido o borrado → INACTIVE y sin QR utilizable', () => {
  for (const status of ['suspended', 'deleted']) {
    const o = payload.cuerpoObjeto(
      { member: { public_code: 'VDM-A7K9P2', alias: null, status, balance: 0, rewards_available: 0, qr_token: 'vq' + 'x'.repeat(24) }, program: null, brand: marca },
      'c',
      { urlNegocio: 'https://a.b' },
    );
    assert.equal(o.state, 'INACTIVE');
    assert.equal(o.barcode, undefined);
  }
});

test('3 · ids de clase y objeto: estables, válidos para Google y sin el id del miembro', () => {
  const re = /^[0-9]+\.[A-Za-z0-9._-]+$/;
  const c = payload.idClase('3388000000023213846', '0b5e2c1a-1111-4222-8333-944455556666');
  const o = payload.idObjeto('3388000000023213846', '7c7c7c7c-1111-4222-8333-944455556666');
  assert.match(c, re);
  assert.match(o, re);
  assert.equal(c, payload.idClase('3388000000023213846', '0b5e2c1a-1111-4222-8333-944455556666'));
});

test('4 · clase: marca del comercio solo con logo válido; la demo siempre con Vendemia', () => {
  const d = { program_id: 'p', program_name: 'Club Centro', reward: 'x', threshold: 10, rule_type: 'stamps', brand: marca };
  const op = { urlNegocio: 'https://a.b', logoVendemia: 'https://vendemias.com/wallet/logo-vendemia-1024.png' };
  assert.equal(payload.cuerpoClase({ ...d, logo_valido: true }, { ...op, demo: false }).programLogo.sourceUri.uri, marca.logo_url);
  assert.equal(payload.cuerpoClase({ ...d, logo_valido: false }, { ...op, demo: false }).programLogo.sourceUri.uri, op.logoVendemia);
  const demo = payload.cuerpoClase({ ...d, logo_valido: true }, { ...op, demo: true });
  assert.equal(demo.issuerName, 'Vendemia');
  assert.equal(demo.hexBackgroundColor, '#FF4900');
  assert.ok(!('reviewStatus' in demo), 'reviewStatus solo al crear');
});

test('5 · importes en céntimos, sin decimales flotantes', () => {
  assert.equal(formato.aCentimos('35'), 3500);
  assert.equal(formato.aCentimos('35,5'), 3550);
  assert.equal(formato.aCentimos('0.07'), 7);
  assert.equal(formato.aCentimos('12.345'), null);
  assert.equal(formato.aCentimos('-3'), null);
  assert.equal(formato.aCentimos('abc'), null);
});

test('6 · los errores de Postgres se traducen y nunca se enseñan crudos', () => {
  assert.equal(errores.codigoDe('loyalty:duplicate_reference'), 'duplicate_reference');
  assert.match(errores.mensajeDe('duplicate_reference'), /comprobante/);
  assert.equal(errores.mensajeDe('permission denied for table loyalty_members'), 'No se pudo completar. Inténtalo otra vez.');
});

const SECRETOS = [
  'FIDELIZA_SERVER_KEY',
  'GOOGLE_WALLET_CREDENTIALS_JSON_BASE64',
  'WEB_PUSH_VAPID_PRIVATE_KEY',
  'CRON_SECRET',
  'x-fideliza-key',
  'BEGIN PRIVATE KEY',
  'private_key_id',
];

function* ficheros(dir, ext = /\.(js|css|html|json)$/) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* ficheros(p, ext);
    else if (ext.test(n)) yield p;
  }
}

test('7 · ningún secreto ni su nombre llega al JavaScript del navegador', (t) => {
  const estaticos = join(raiz, '.next', 'static');
  if (!existsSync(estaticos)) return t.skip('Falta .next/static: ejecuta `npm run build` antes.');
  for (const f of ficheros(estaticos)) {
    const s = readFileSync(f, 'utf8');
    for (const x of SECRETOS) assert.ok(!s.includes(x), `${x} aparece en ${f}`);
  }
});

test('8 · ninguna variable secreta se declara con NEXT_PUBLIC_', () => {
  const env = readFileSync(join(raiz, '.env.example'), 'utf8');
  for (const x of ['SERVER_KEY', 'CREDENTIALS', 'VAPID_PRIVATE', 'CRON_SECRET']) {
    assert.ok(!new RegExp(`NEXT_PUBLIC_[A-Z_]*${x}`).test(env), x);
  }
});

test('9 · el código del panel nunca usa la service_role', () => {
  const malos = [];
  for (const dir of ['app', 'lib', 'components', 'modules']) {
    for (const f of ficheros(join(raiz, dir), /\.(ts|tsx|js|mjs)$/)) {
      if (f.endsWith('unitarias.mjs')) continue; // este fichero contiene el patrón que busca
      if (/service_role|SUPABASE_SERVICE/i.test(readFileSync(f, 'utf8').replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ''))) malos.push(f);
    }
  }
  assert.deepEqual(malos, []);
});

test('10 · botones: el dato del dueño se convierte en la URL correcta', () => {
  assert.equal(botones.aUrl('whatsapp', '987 654 321'), 'https://wa.me/51987654321');
  assert.equal(botones.aUrl('whatsapp', '+51 987654321'), 'https://wa.me/51987654321');
  assert.equal(botones.aUrl('instagram', '@barberia.centro'), 'https://instagram.com/barberia.centro');
  assert.equal(botones.aUrl('tiktok', 'barberia'), 'https://www.tiktok.com/@barberia');
  assert.equal(botones.aUrl('web', 'barberia.pe'), 'https://barberia.pe');
  assert.equal(botones.aUrl('web', 'http://barberia.pe'), 'https://barberia.pe');
  assert.equal(botones.aUrl('yape', '987 654 321'), 'https://fideliza.vendemias.com/pagar/987654321');
  assert.equal(botones.aUrl('yape', '+51 987 654 321'), 'https://fideliza.vendemias.com/pagar/987654321');
  assert.equal(botones.aUrl('yape', '123'), '');
  assert.equal(botones.aUrl('whatsapp', '123'), '');
  assert.equal(botones.aUrl('instagram', ''), '');
  assert.equal(botones.urlAyuda('987 654 321'), 'https://wa.me/51987654321');
  assert.equal(botones.urlAyuda('+51 987 654 321'), 'https://wa.me/51987654321');
  assert.equal(botones.urlAyuda('barberia.pe'), 'https://barberia.pe');
  assert.equal(botones.urlAyuda('123'), '');
});

test('11 · botones: al volver a editar se reconoce el tipo y el dato', () => {
  assert.deepEqual(botones.deUrl('https://wa.me/51987654321', 'url'), { tipo: 'whatsapp', valor: '987654321' });
  assert.deepEqual(botones.deUrl('https://instagram.com/barberia.centro', 'url'), { tipo: 'instagram', valor: '@barberia.centro' });
  assert.deepEqual(botones.deUrl('https://www.tiktok.com/@barberia', 'url'), { tipo: 'tiktok', valor: '@barberia' });
  assert.equal(botones.deUrl('https://g.page/r/abc123/review', 'url').tipo, 'resenas');
  assert.equal(botones.deUrl('https://maps.app.goo.gl/xyz', 'url').tipo, 'maps');
  assert.deepEqual(botones.deUrl('https://fideliza.vendemias.com/pagar/987654321', 'url'), {
    tipo: 'yape',
    valor: '987654321',
  });
  assert.equal(botones.deUrl(null, 'join').tipo, 'tarjeta');
  // Ida y vuelta: lo que se guarda vuelve a dar la misma URL.
  for (const [t, v] of [['whatsapp', '987654321'], ['yape', '987654321'], ['instagram', '@a.b'], ['tiktok', '@x']]) {
    const url = botones.aUrl(t, v);
    const d = botones.deUrl(url, 'url');
    assert.equal(botones.aUrl(d.tipo, d.valor), url);
  }
});

test('12 · botones: la dirección se sugiere a partir del nombre', () => {
  assert.equal(botones.slugDe('Barbería El Centro'), 'barberia-el-centro');
  assert.equal(botones.slugDe('  Café & Té  '), 'cafe-te');
});

test('13 · página pública: nada de lo que escribe el dueño se ejecuta', () => {
  const html = pagina.htmlPagina({
    nombre: '<script>alert(1)</script>',
    bio: '"><img src=x onerror=alert(1)>',
    logo: 'javascript:alert(1)',
    color: 'red;}body{display:none',
    estilo: { plantilla: 'vidrio', fondo: 'http://inseguro.com/a.jpg', categoria: '<b>x</b>' },
    redes: [{ tipo: 'instagram', url: 'https://instagram.com/a' }],
    botones: [{ tipo: 'web', label: '<i>hola</i>', url: 'https://a.pe' }],
  });
  assert.ok(!html.includes('<script>alert'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('http://inseguro.com'), 'solo imágenes https');
  assert.ok(!html.includes('display:none'), 'el color se valida antes de llegar al CSS');
  assert.ok(html.includes('&lt;i&gt;hola&lt;/i&gt;'));
});

test('14 · página pública: cada plantilla pinta redes con logo y la vista previa no navega', () => {
  for (const plantilla of ['clasica', 'oscura', 'vidrio', 'foto', 'marco', 'color']) {
    const html = pagina.htmlPagina(
      { nombre: 'Negocio', color: '#FF4900', estilo: { plantilla }, redes: [{ tipo: 'instagram', url: 'https://instagram.com/a' }], botones: [] },
      { vista: true },
    );
    assert.match(html, /<nav class="redes"[^>]*>.*<svg viewBox="0 0 24 24" fill="currentColor"/s);
    assert.ok(html.includes('a{pointer-events:none}'));
  }
});

test('15 · botones: redes nuevas y enlaces de Google desde el place_id', () => {
  assert.equal(botones.aUrl('youtube', '@canal'), 'https://www.youtube.com/@canal');
  assert.equal(botones.aUrl('x', '@cuenta'), 'https://x.com/cuenta');
  assert.equal(botones.aUrl('telegram', 'grupo'), 'https://t.me/grupo');
  assert.equal(botones.urlResenas('ChIJ123'), 'https://search.google.com/local/writereview?placeid=ChIJ123');
  assert.equal(botones.deUrl(botones.urlResenas('ChIJ123'), 'url').tipo, 'resenas');
  assert.equal(botones.deUrl(botones.urlMapa('ChIJ123', 'Barbería'), 'url').tipo, 'maps');
});

test('16 · el avatar abre historias sin aceptar destinos falsos', () => {
  const base = {
    nombre: 'Negocio',
    logo: 'https://res.cloudinary.com/demo/image/upload/logo.png',
    color: '#FF4900',
    botones: [],
  };
  const instagram = pagina.htmlPagina({
    ...base,
    estilo: { plantilla: 'clasica', historia: 'instagram' },
    redes: [{ tipo: 'instagram', url: 'https://instagram.com/barberia.centro' }],
  });
  assert.ok(instagram.includes('href="https://www.instagram.com/stories/barberia.centro/"'));
  assert.ok(instagram.includes('av--historia av--instagram'));
  assert.ok(instagram.includes('story-badge'));

  const tiktok = pagina.htmlPagina({
    ...base,
    estilo: { plantilla: 'clasica', historia: 'tiktok' },
    redes: [{ tipo: 'tiktok', url: 'https://www.tiktok.com/@barberia' }],
  });
  assert.ok(tiktok.includes('href="https://www.tiktok.com/@barberia"'));
  assert.ok(tiktok.includes('aria-label="Abrir TikTok"'));

  const falso = pagina.htmlPagina({
    ...base,
    estilo: { plantilla: 'clasica', historia: 'instagram' },
    redes: [{ tipo: 'instagram', url: 'https://example.com/barberia' }],
  });
  assert.ok(!falso.includes('<a class="av av--historia'));
});

test('17 · la firma de Vendemia lleva a la web oficial', () => {
  const html = pagina.htmlPagina({
    nombre: 'Negocio',
    color: '#FF4900',
    redes: [],
    botones: [],
  });
  assert.ok(html.includes('<a class="pie" href="https://vendemias.com"'));
  assert.ok(html.includes('>Creado con Vendemia</a>'));
});

test('18 · guardar el acceso a historias pasa la validación sin enseñar detalles internos', () => {
  const acciones = readFileSync(join(raiz, 'modules/fideliza/servidor/acciones.ts'), 'utf8');
  const editor = readFileSync(join(raiz, 'modules/fideliza/ui/paginas/MiPagina.tsx'), 'utf8');
  assert.match(acciones, /historia:\s*z\.enum\(\['instagram', 'tiktok', ''\]\)\.optional\(\)/);
  assert.ok(!editor.includes('falta aplicar la migración 0008'));
});

test('19 · la ruta pública resuelve el estilo guardado y nunca usa caché de página', () => {
  const servidor = readFileSync(join(raiz, 'modules/fideliza/servidor/html.ts'), 'utf8');
  const ruta = readFileSync(join(raiz, 'app/(fideliza)/n/[slug]/route.ts'), 'utf8');
  assert.match(servidor, /const estilo = resolverEstilo\(estiloEntrada\)/);
  assert.match(servidor, /'X-Vendemia-Template': estilo\.plantilla/);
  assert.match(ruta, /export const revalidate = 0/);
});

test('20 · las imágenes de plantillas usan variantes pequeñas y precargadas', () => {
  const original = 'https://res.cloudinary.com/demo/image/upload/v123/brand/negocio/logo.png';
  assert.equal(
    pagina.imagenPagina(original, 'avatar'),
    'https://res.cloudinary.com/demo/image/upload/c_limit,h_384,w_384/f_auto,q_auto:good/v123/brand/negocio/logo.png',
  );
  assert.equal(
    pagina.imagenPagina(original, 'fondo'),
    'https://res.cloudinary.com/demo/image/upload/c_limit,w_1200/f_auto,q_auto:good/v123/brand/negocio/logo.png',
  );
  assert.equal(pagina.imagenPagina('https://imagenes.ejemplo.com/logo.png', 'avatar'), 'https://imagenes.ejemplo.com/logo.png');

  const html = pagina.htmlPagina({ nombre: 'Negocio', logo: original, color: '#FF4900', redes: [], botones: [] });
  assert.ok(html.includes('rel="preconnect" href="https://res.cloudinary.com"'));
  assert.ok(html.includes('rel="preload" as="image"'));
  assert.ok(html.includes('fetchpriority="high"'));
  assert.ok(html.includes('width="104" height="104"'));
  assert.ok(!html.includes(`src="${original}"`), 'no descarga el PNG original de 1000 px en el avatar');
});

test('21 · Yape / Plin se abre y copia dentro de la plantilla', () => {
  const datos = {
    nombre: 'Negocio',
    color: '#FF4900',
    estilo: { plantilla: 'clasica' },
    redes: [],
    botones: [{ tipo: 'yape', label: 'Yape / Plin', url: 'https://fideliza.vendemias.com/pagar/987654321' }],
  };
  const html = pagina.htmlPagina(datos);
  assert.ok(html.includes('class="bt bt--tarjeta pago-abrir"'));
  assert.ok(html.includes('data-numero="987654321"'));
  assert.ok(html.includes('<dialog class="pago-modal"'));
  assert.ok(html.includes('Copiar número'));
  assert.ok(html.includes('modal.showModal()'));
  assert.ok(html.includes('background:#FFFFFF;color:#14110F'), 'el popup siempre conserva fondo blanco y texto negro');
  assert.ok(html.includes('.pago-cerrar{') && html.includes('background:#FFFFFF;color:#14110F'));
  assert.ok(html.includes('color:#14110F;background:#FAF8F4'), 'el número nunca queda blanco sobre blanco');
  assert.ok(!html.includes('href="https://fideliza.vendemias.com/pagar/987654321"'));

  const vista = pagina.htmlPagina(datos, { vista: true });
  assert.ok(vista.includes('.pago-abrir{pointer-events:none}'));
  assert.ok(!vista.includes('<script>'), 'el iframe de vista previa no necesita ejecutar JavaScript');
});

test('22 · una placa libre entra directo al alta de Fideliza conservando QR o NFC', () => {
  assert.equal(
    activacion.rutaActivacionPlaca('nfc'),
    '/panel/fideliza/placas?activar=1&origen=placa&fuente=nfc',
  );
  assert.equal(
    activacion.rutaActivacionPlaca('qr'),
    '/panel/fideliza/placas?activar=1&origen=placa&fuente=qr',
  );
  assert.equal(activacion.fuenteDeRuta('/panel/fideliza/placas?activar=1&origen=placa&fuente=qr'), 'qr');
  assert.equal(activacion.fuenteDeRuta('/panel/fideliza/placas?activar=1&origen=placa'), 'nfc');

  const ruta = readFileSync(join(raiz, 'modules/fideliza/servidor/rutas/placa.ts'), 'utf8');
  assert.match(ruta, /r\.status === 'unclaimed'\) return irAlAlta\(origen\)/);
  assert.match(ruta, /status:\s*302/);
});

test('23 · el chip y el QR declaran su origen con el mismo parámetro', () => {
  assert.equal(config.urlPlaca('TOKEN'), `${config.FIDELIZA_URL}/t/TOKEN?o=nfc`);
  assert.equal(config.urlPlacaQr('TOKEN'), `${config.FIDELIZA_URL}/t/TOKEN?o=qr`);
});
