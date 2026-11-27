/**
 * Pruebas del lector de vouchers sin IA (modules/lector/dominio/leerVoucher.ts). Sin base ni internet.
 *
 *   npm run test:lector
 *
 * Los textos «foto…» son lo que Tesseract sacó de verdad el 26-nov-2026 de la foto girada y borrosa
 * de un voucher de Yape (modules/lector/servidor/ocr.ts).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import createJiti from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true });
const raiz = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const { leerVoucher, montoDe, fechaHoraDe, codigoDe, destinoDe, importe, juntar, decisionSinIA } =
  jiti(join(raiz, 'modules/lector/dominio/leerVoucher.ts'));

const HOY = new Date('2026-11-26T22:00:00Z'); // 5:00 pm en Lima

test('voucher de Yape limpio: todo', () => {
  const l = leerVoucher('¡Yapeaste! S/ 30 Barberia Uno SAC 26 nov. 2026 | 05:42 p. m. Nro. de celular *** *** 118 Destino Yape Código de seguridad 472 Nro. de operación 04512873', HOY);
  assert.equal(l.monto, 30);
  assert.equal(l.app, 'yape');
  assert.equal(l.estado, 'completado');
  assert.equal(l.fechaHora, '2026-11-26T17:42:00-05:00');
  assert.equal(l.codigoSeguridad, '472');
  assert.equal(l.operacion, '04512873');
  assert.equal(l.destino, '118');
});

test('foto de la pantalla (texto real de Tesseract): hora sin «:», código partido', () => {
  const l = leerVoucher('¡Yapeaste! S/ 30 Barberia Uno SAC 26 nov 2026 | 05 42 p. m Nro. de celular ".* .... 118 Destino Yape Código « de seguridad 472 Nro. de Opera', HOY);
  assert.equal(l.monto, 30);
  assert.equal(l.fechaHora, '2026-11-26T17:42:00-05:00');
  assert.equal(l.codigoSeguridad, '472');
});

test('foto peor: sin fecha ni hora → monto y código, hora null', () => {
  const l = leerVoucher('¡Yapeaste! S/ 30 Barberia Uno SAC "". e... 118 Yape 472 04512873', HOY);
  assert.equal(l.monto, 30);
  assert.equal(l.fechaHora, null);
  assert.equal(l.codigoSeguridad, null); // sin la palabra «seguridad» no se adivina
  assert.equal(decisionSinIA(l), 'revisar');
});

test('sin importe: la foto no se leyó', () => {
  assert.equal(leerVoucher('¡Yapeaste! Barberia Uno SAC 26 nov. 2026 | 05:42 p. m.', HOY), null);
  assert.equal(decisionSinIA(null), 'revisar');
});

test('importes: céntimos, miles y la S mal leída', () => {
  assert.equal(montoDe('S/ 30.00'), 30);
  assert.equal(montoDe('S/30,50'), 30.5);
  assert.equal(montoDe('5/ 45'), 45);
  assert.equal(montoDe('$/ 12.5'), 12.5);
  assert.equal(montoDe('S/ 1,250.50'), 1250.5);
  assert.equal(montoDe('S/ 1.250,50'), 1250.5);
  assert.equal(montoDe('Monto 25.00'), 25);
  assert.equal(montoDe('Nro. de operación 04512873'), null);
  assert.equal(importe('0'), null);
  // El primero (el grande de arriba) manda sobre el de abajo.
  assert.equal(montoDe('S/ 30 … Comisión S/ 0.00'), 30);
});

test('fechas y horas en los formatos de Yape, Plin y bancos', () => {
  assert.equal(fechaHoraDe('26 nov. 2026 | 05:42 p. m.', HOY), '2026-11-26T17:42:00-05:00');
  assert.equal(fechaHoraDe('26 de noviembre de 2026 - 11:05 a. m.', HOY), '2026-11-26T11:05:00-05:00');
  assert.equal(fechaHoraDe('Fecha y hora 26/11/2026 17:42', HOY), '2026-11-26T17:42:00-05:00');
  assert.equal(fechaHoraDe('26-11-26 09:07', HOY), '2026-11-26T09:07:00-05:00');
  assert.equal(fechaHoraDe('1 dic. 2026 | 12:10 a. m.', HOY), '2026-12-01T00:10:00-05:00');
  assert.equal(fechaHoraDe('3 set. 2026 | 12:30 p. m.', HOY), '2026-09-03T12:30:00-05:00');
  // Sin fecha, una hora con «:» se toma de hoy (Lima).
  assert.equal(fechaHoraDe('Pagado 05:42 pm', HOY), '2026-11-26T17:42:00-05:00');
  // Lo que no es una hora no se inventa.
  assert.equal(fechaHoraDe('Nro. de operación 04512873', HOY), null);
  assert.equal(fechaHoraDe('26 nov. 2026 | 25:99', HOY), null);
});

test('Tesseract desordena: el valor antes de la etiqueta (texto real del 26-nov)', () => {
  const l = leerVoucher('¡Yapeaste! S/ 30 Barberia Uno SAC 26 nov. 2026 | 05:42 p. m. Nro. de celular Xxx kx 118 Destino Yape 472 Código de seguridad 04512873 Nro. de operación ', HOY);
  assert.equal(l.codigoSeguridad, '472');
  assert.equal(l.operacion, '04512873');
  assert.equal(l.fechaHora, '2026-11-26T17:42:00-05:00');
  // Un número largo pegado a la etiqueta no es el código.
  assert.equal(codigoDe('Nro 04512873 Código de seguridad'), null);
  assert.equal(codigoDe('celular 118 Código de seguridad 472'), '472');
});

test('código de seguridad y destino', () => {
  assert.equal(codigoDe('Código de seguridad 4 7 2'), '472');
  assert.equal(codigoDe('Cód. de seguridad: 031'), '031');
  assert.equal(codigoDe('Código de seguridad 4721'), null); // 4 dígitos no es el código
  assert.equal(destinoDe('*** *** 118'), '118');
  assert.equal(destinoDe('Nro. de celular ".* .... 118'), '118');
  assert.equal(destinoDe('sin número'), '');
});

test('Plin: sin código de seguridad aunque haya 3 dígitos', () => {
  const l = leerVoucher('¡Pago exitoso! Plin S/ 25.00 Enviado a Barberia Uno 26/11/2026 16:10 Código de operación 123456', HOY);
  assert.equal(l.app, 'plin');
  assert.equal(l.monto, 25);
  assert.equal(l.codigoSeguridad, null);
  assert.equal(l.fechaHora, '2026-11-26T16:10:00-05:00');
  assert.equal(decisionSinIA(l), 'aprobar');
});

test('un pago que falló no vale', () => {
  assert.equal(decisionSinIA(leerVoucher('Yape S/ 30 La operación fue rechazada 26 nov. 2026 | 05:42 p. m.', HOY)), 'rechazar');
});

test('juntar dos pasadas: lo que falta en una lo pone la otra', () => {
  const a = leerVoucher('¡Yapeaste! S/ 30 Código de seguridad 472', HOY);
  const b = leerVoucher('S/ 30 26 nov 2026 | 05 42 p. m', HOY);
  const j = juntar(a, b);
  assert.equal(j.codigoSeguridad, '472');
  assert.equal(j.fechaHora, '2026-11-26T17:42:00-05:00');
  assert.equal(juntar(null, b), b);
});
