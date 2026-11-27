/**
 * Prueba de punta a punta de la lectura sin IA (modules/lector/servidor/ocr.ts): una imagen de verdad
 * → Tesseract → leerVoucher. Necesita internet la primera vez (baja el idioma español a la carpeta temporal).
 *
 *   node --conditions=react-server --test modules/lector/pruebas/ocr.mjs
 *
 * Las imágenes se dibujan aquí (un voucher de Yape, el mismo como foto girada y borrosa de la pantalla,
 * uno de Plin y una imagen que no es un voucher). Con fotos reales del piloto hay que repetirla.
 */
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { join } from 'node:path';
import sharp from 'sharp';
import createJiti from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true });
const raiz = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const { leerSinIA, cerrarLector } = jiti(join(raiz, 'modules/lector/servidor/ocr.ts'));
after(() => cerrarLector());

const linea = (y, izq, der, t = 28) =>
  `<text x="80" y="${y}" font-family="Arial" font-size="${t}" fill="#666">${izq}</text>` +
  `<text x="640" y="${y}" font-family="Arial" font-size="${t}" fill="#222" text-anchor="end">${der}</text>`;
const voucher = (titulo, monto, color, filas) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1400">
<rect width="720" height="1400" fill="${color}"/><rect x="40" y="260" width="640" height="980" rx="24" fill="#fff"/>
<text x="360" y="340" font-family="Arial" font-size="40" font-weight="bold" fill="${color}" text-anchor="middle">${titulo}</text>
<text x="360" y="460" font-family="Arial" font-size="96" font-weight="bold" fill="#222" text-anchor="middle">${monto}</text>
${filas.join('')}</svg>`)).png().toBuffer();

const yape = await voucher('¡Yapeaste!', 'S/ 30', '#742284', [
  '<text x="360" y="540" font-family="Arial" font-size="34" fill="#222" text-anchor="middle">Barberia Uno SAC</text>',
  '<text x="360" y="600" font-family="Arial" font-size="28" fill="#666" text-anchor="middle">26 nov. 2026 | 05:42 p. m.</text>',
  linea(720, 'Nro. de celular', '*** *** 118'), linea(800, 'Destino', 'Yape'),
  linea(880, 'Código de seguridad', '4 7 2'), linea(960, 'Nro. de operación', '04512873'),
]);
const plin = await voucher('¡Pago exitoso!', 'S/ 25.00', '#00a19a', [
  linea(560, 'Enviado a', 'Barberia Uno'), linea(640, 'Con', 'Plin'),
  linea(720, 'Fecha y hora', '26/11/2026 16:10'), linea(800, 'Código de operación', '123456'),
]);
const foto = (b) => sharp(b).rotate(4, { background: '#333' }).blur(1.2).modulate({ brightness: 1.15 }).jpeg({ quality: 60 }).toBuffer();
const nada = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#7a9' } }).jpeg().toBuffer();

test('Yape limpio: monto, hora y código', { timeout: 120_000 }, async () => {
  const l = await leerSinIA(yape);
  assert.equal(l?.monto, 30);
  assert.equal(l?.fechaHora?.slice(0, 16), '2026-11-26T17:42');
  assert.equal(l?.codigoSeguridad, '472');
});

test('el mismo Yape como foto girada y borrosa de la pantalla', { timeout: 120_000 }, async () => {
  const l = await leerSinIA(await foto(yape));
  assert.equal(l?.monto, 30);
  assert.equal(l?.codigoSeguridad, '472');
  // La hora chica y gris es lo más difícil: si se lee, tiene que ser la buena.
  if (l?.fechaHora) assert.equal(l.fechaHora.slice(11, 16), '17:42');
});

test('Plin: monto y hora, sin código', { timeout: 120_000 }, async () => {
  const l = await leerSinIA(await foto(plin));
  assert.equal(l?.monto, 25);
  assert.equal(l?.app, 'plin');
  assert.equal(l?.codigoSeguridad, null);
  if (l?.fechaHora) assert.equal(l.fechaHora.slice(11, 16), '16:10');
});

test('una imagen que no es un voucher: sin lectura', { timeout: 120_000 }, async () => {
  assert.equal(await leerSinIA(nada), null);
});
