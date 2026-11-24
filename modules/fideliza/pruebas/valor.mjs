/**
 * Pruebas de dominio/valor.ts: «Plata que volvió» y «Escríbeles hoy» (npm run test:fideliza).
 */
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import createJiti from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true });
const raiz = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const valor = jiti(join(raiz, 'modules/fideliza/dominio/valor.ts'));

// «Hoy» fijo: 23-nov-2026, 15:00 en Lima.
const AHORA = Date.parse('2026-11-23T15:00:00-05:00');
const en = (fecha, hora = '12:00') => new Date(Date.parse(`${fecha}T${hora}:00-05:00`)).toISOString();
const v = (m, fecha, soles = 0) => ({ member_id: m, created_at: en(fecha), amount_cents: soles * 100 });

test('plata que volvió: la primera visita no cuenta; se suma lo de quien vuelve este mes', () => {
  const r = valor.plataQueVolvio([
    v('ana', '2026-10-05', 30), v('ana', '2026-11-03', 35), v('ana', '2026-11-20', 35), // vuelve 2 veces
    v('beto', '2026-11-10', 40), // primera visita: llegó, no volvió
    v('caro', '2026-08-01', 30), v('caro', '2026-11-18', 50), // 109 días sin venir: recuperada
  ], AHORA);
  assert.equal(r.mes, 'noviembre');
  assert.equal(r.mesAnterior, 'octubre');
  assert.equal(r.plata, 12000);
  assert.equal(r.visitas, 3);
  assert.equal(r.clientes, 2);
  assert.equal(r.conImporte, 3);
  assert.deepEqual(r.recuperados, { clientes: 1, plata: 5000 });
  // Semanas del mes: 1–7 · 8–14 · 15–21 · 22–fin. Hoy (23) es la cuarta.
  assert.deepEqual(r.semanas, [3500, 0, 8500, 0]);
  assert.equal(r.semanaActual, 3);
});

test('plata que volvió: compara con los mismos días del mes anterior, no con el mes entero', () => {
  const r = valor.plataQueVolvio([
    v('ana', '2026-09-01', 10),
    v('ana', '2026-10-10', 20), // del 1 al 23 de octubre: cuenta
    v('ana', '2026-10-28', 99), // después del 23: no cuenta
    v('ana', '2026-11-02', 25),
  ], AHORA);
  assert.equal(r.plataAntes, 2000);
  assert.equal(r.visitasAntes, 1);
  assert.equal(r.plata, 2500);
});

test('plata que volvió: sin importes se cuentan visitas; enero compara con diciembre', () => {
  const sin = valor.plataQueVolvio([v('a', '2026-11-01'), v('a', '2026-11-09'), v('a', '2026-11-16')], AHORA);
  assert.equal(sin.conImporte, 0);
  assert.equal(sin.plata, 0);
  assert.equal(sin.visitas, 2);
  assert.deepEqual(sin.semanas, [0, 1, 1, 0]);
  const enero = valor.plataQueVolvio([], Date.parse('2027-01-05T10:00:00-05:00'));
  assert.equal(enero.mes, 'enero');
  assert.equal(enero.mesAnterior, 'diciembre');
});

test('escríbeles hoy: orden, motivos y quién no sale', () => {
  const miembros = [
    { id: 'premio', alias: 'Renato Salas', created_at: en('2026-06-01'), rewards_available: 1 },
    { id: 'atrasado', alias: 'Luis', created_at: en('2026-06-01'), rewards_available: 0 },
    { id: 'fiel', alias: 'Carlos', created_at: en('2026-06-01'), rewards_available: 0 },
    { id: 'nuevo', alias: 'Andrés', created_at: en('2026-11-17'), rewards_available: 0 },
    { id: 'recien', alias: 'Hoy', created_at: en('2026-11-22'), rewards_available: 0 },
    { id: 'linea', alias: 'Línea', created_at: en('2026-06-01'), rewards_available: 1, parent_member_id: 'premio' },
    { id: 'escrito', alias: 'Ya', created_at: en('2026-06-01'), rewards_available: 1 },
  ];
  const visitas = [
    v('premio', '2026-11-14'),
    // Luis venía cada 10 días y lleva 23 sin venir: se está atrasando (con 31 ya sería «dormido»).
    v('atrasado', '2026-10-01'), v('atrasado', '2026-10-11'), v('atrasado', '2026-10-21'), v('atrasado', '2026-10-31'),
    v('fiel', '2026-11-02'), v('fiel', '2026-11-09'), v('fiel', '2026-11-16'), v('fiel', '2026-11-22'),
  ];
  const r = valor.aQuienEscribir(visitas, miembros, { escrito: en('2026-11-20') }, AHORA);
  assert.deepEqual(r.map((c) => [c.id, c.motivo]), [['premio', 'premio'], ['atrasado', 'atrasado'], ['nuevo', 'sin_venir']]);
  assert.equal(valor.motivoTexto(r[1]), '23 días sin venir');
  assert.equal(valor.motivoTexto(r[2]), 'Sacó su tarjeta hace 6 días y no vino');
  // Lo escrito hace más de 14 días vuelve a salir.
  const despues = valor.aQuienEscribir(visitas, miembros, { escrito: en('2026-11-01') }, AHORA);
  assert.ok(despues.some((c) => c.id === 'escrito'));
});

test('escríbeles hoy: el mensaje y el enlace de WhatsApp', () => {
  const c = { id: 'x', nombre: 'Renato Salas', motivo: 'premio', dias: 9 };
  const m = valor.mensajePara(c, { negocio: 'Don Lucho', club: 'Club Don Lucho', premio: 'Corte gratis' });
  assert.equal(m, 'Hola Renato 👋 Tu corte gratis te espera en Don Lucho. ¿Cuándo vienes por él?');
  assert.equal(valor.mensajePara({ ...c, nombre: null }, { negocio: '', club: '', premio: '' }).startsWith('Hola 👋'), true);
  assert.equal(valor.enlaceWhatsapp('987 654 321', 'Hola'), 'https://wa.me/51987654321?text=Hola');
  assert.equal(valor.enlaceWhatsapp('+51987654321', 'a b'), 'https://wa.me/51987654321?text=a%20b');
  assert.equal(valor.enlaceWhatsapp('123', 'x'), null);
});

const numeros = jiti(join(raiz, 'modules/fideliza/dominio/numeros.ts'));

test('números: franjas del día, días de la semana y los 4 grupos', () => {
  const calor = Array.from({ length: 7 }, () => Array(24).fill(0));
  calor[5][13] = 4; // sábado 1 pm → almuerzo
  calor[5][14] = 2; // sábado 2 pm → almuerzo
  calor[0][9] = 1; // lunes 9 am → mañana
  calor[2][19] = 3; // miércoles 7 pm → noche
  const { franjas, celdas } = numeros.porFranja(calor);
  assert.deepEqual(franjas.map((f) => f.id), ['manana', 'media', 'almuerzo', 'tarde', 'noche']);
  assert.equal(celdas[2][5], 6);
  assert.equal(celdas[0][0], 1);
  assert.equal(celdas[4][2], 3);
  calor[3][1] = 1; // jueves 1 am → aparece la madrugada
  assert.equal(numeros.porFranja(calor).franjas.length, 6);
  assert.deepEqual(numeros.porDia(calor), [1, 0, 3, 1, 0, 6, 0]);
  const seg = { nuevos: 2, fieles: 3, regulares: 5, atrasados: 4, dormidos: 1, no_regresaron: 7, sin_visitas: 9 };
  assert.deepEqual(numeros.grupos(seg).map((g) => [g.id, g.valor]), [['vienen', 10], ['yendo', 5], ['una', 7], ['nunca', 9]]);
});
