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
  assert.equal(botones.aUrl('whatsapp', '123'), '');
  assert.equal(botones.aUrl('instagram', ''), '');
});

test('11 · botones: al volver a editar se reconoce el tipo y el dato', () => {
  assert.deepEqual(botones.deUrl('https://wa.me/51987654321', 'url'), { tipo: 'whatsapp', valor: '987654321' });
  assert.deepEqual(botones.deUrl('https://instagram.com/barberia.centro', 'url'), { tipo: 'instagram', valor: '@barberia.centro' });
  assert.deepEqual(botones.deUrl('https://www.tiktok.com/@barberia', 'url'), { tipo: 'tiktok', valor: '@barberia' });
  assert.equal(botones.deUrl('https://g.page/r/abc123/review', 'url').tipo, 'resenas');
  assert.equal(botones.deUrl('https://maps.app.goo.gl/xyz', 'url').tipo, 'maps');
  assert.equal(botones.deUrl(null, 'join').tipo, 'tarjeta');
  // Ida y vuelta: lo que se guarda vuelve a dar la misma URL.
  for (const [t, v] of [['whatsapp', '987654321'], ['instagram', '@a.b'], ['tiktok', '@x']]) {
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
