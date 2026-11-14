/**
 * Pruebas de boletas y facturas que no necesitan base ni internet.
 *
 *   npm run test:facturacion
 *
 * Lo que de verdad dirá si Lucode y APIsPerú aceptan nuestro JSON son sus sandbox:
 * ver docs/pruebas-facturacion.md.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import createJiti from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true });
const raiz = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const cargar = (p) => jiti(join(raiz, p));

const { calcular, calcularLinea } = cargar('modules/facturacion/dominio/montos.ts');
const { montoEnLetras } = cargar('modules/facturacion/dominio/letras.ts');
const { rucValido, erroresCliente, erroresLineas } = cargar('modules/facturacion/dominio/validar.ts');
const { cuerpoLucode } = cargar('modules/facturacion/proveedores/lucode.ts');
const { cuerpoApisPeru } = cargar('modules/facturacion/proveedores/apisperu.ts');
const { ticketHtml, textoQr } = cargar('modules/facturacion/dominio/impreso.ts');

const G18 = { tipo: 'gravado', porcentaje: 18, leyendaAmazonia: null };
const MYPE = { tipo: 'gravado', porcentaje: 10.5, leyendaAmazonia: null };
const AMAZONIA = { tipo: 'exonerado', porcentaje: 0, leyendaAmazonia: '2002' };

test('el importe con IGV es exactamente lo cobrado', () => {
  for (const precio of [35, 0.5, 1.1, 9.9, 118, 276.27, 1234.56, 19.99]) {
    for (const cantidad of [1, 2, 3, 7, 0.25]) {
      for (const r of [G18, MYPE, AMAZONIA]) {
        const l = calcularLinea({ descripcion: 'x', cantidad, precio, unidad: 'NIU' }, r);
        assert.equal(Math.round((l.valorVenta + l.igv) * 100), Math.round(precio * cantidad * 100), `${precio}×${cantidad}`);
        // El IGV no se aleja más de un céntimo de valor × tasa (tolerancia SUNAT: 1 sol).
        assert.ok(Math.abs(l.igv - l.valorVenta * (r.tipo === 'exonerado' ? 0 : r.porcentaje / 100)) <= 0.011);
      }
    }
  }
});

test('118 con IGV 18 % son 100 + 18', () => {
  const { lineas, totales } = calcular([{ descripcion: 'Corte', cantidad: 1, precio: 118, unidad: 'ZZ' }], G18);
  assert.deepEqual(totales, { opGravadas: 100, opExoneradas: 0, igv: 18, total: 118 });
  assert.equal(lineas[0].valorUnitario, 100);
});

test('exonerado (Amazonía): sin IGV y el total va entero a op. exonerada', () => {
  const { totales } = calcular(
    [{ descripcion: 'Menú', cantidad: 2, precio: 15, unidad: 'NIU' }, { descripcion: 'Gaseosa', cantidad: 1, precio: 3.5, unidad: 'NIU' }],
    AMAZONIA,
  );
  assert.deepEqual(totales, { opGravadas: 0, opExoneradas: 33.5, igv: 0, total: 33.5 });
});

test('monto en letras', () => {
  assert.equal(montoEnLetras(118), 'SON CIENTO DIECIOCHO CON 00/100 SOLES');
  assert.equal(montoEnLetras(100), 'SON CIEN CON 00/100 SOLES');
  assert.equal(montoEnLetras(21.5), 'SON VEINTIUNO CON 50/100 SOLES');
  assert.equal(montoEnLetras(1001), 'SON MIL UNO CON 00/100 SOLES');
  assert.equal(montoEnLetras(21000), 'SON VEINTIUN MIL CON 00/100 SOLES');
  assert.equal(montoEnLetras(2_500_000.05), 'SON DOS MILLONES QUINIENTOS MIL CON 05/100 SOLES');
  assert.equal(montoEnLetras(0.3), 'SON CERO CON 30/100 SOLES');
});

test('RUC: dígito verificador', () => {
  assert.ok(rucValido('20100070970')); // SUPERMERCADOS PERUANOS (público)
  assert.ok(rucValido('20131312955')); // SUNAT
  assert.ok(!rucValido('20131312954'));
  assert.ok(!rucValido('2013131295'));
  assert.ok(!rucValido('30131312955'));
});

test('reglas del cliente', () => {
  const sinDoc = { tipoDoc: 'sin_documento', numDoc: '', nombre: '', direccion: '' };
  assert.deepEqual(erroresCliente('boleta', sinDoc, 700), []);
  assert.equal(erroresCliente('boleta', sinDoc, 700.01).length, 1);
  assert.equal(erroresCliente('factura', { tipoDoc: 'dni', numDoc: '12345678', nombre: 'Ana', direccion: '' }, 10).length, 1);
  assert.deepEqual(erroresCliente('factura', { tipoDoc: 'ruc', numDoc: '20131312955', nombre: 'SUNAT', direccion: '' }, 10), []);
  assert.equal(erroresLineas([]).length, 1);
  assert.equal(erroresLineas([{ descripcion: ' ', cantidad: 0, precio: 1, unidad: 'NIU' }]).length, 2);
});

function doc(regimen, tipo = 'boleta', cliente = { tipoDoc: 'dni', numDoc: '45678912', nombre: 'Ana Ríos', direccion: '' }) {
  const { lineas, totales } = calcular(
    [{ descripcion: 'Corte de cabello', cantidad: 1, precio: 35, unidad: 'ZZ' }, { descripcion: 'Cera', cantidad: 2, precio: 12.5, unidad: 'NIU' }],
    regimen,
  );
  return {
    tipo, serie: tipo === 'boleta' ? 'B001' : 'F001', numero: 7, fecha: '2026-11-11', hora: '15:04:05', moneda: 'PEN',
    cliente, lineas, totales, regimen, leyendas: regimen.leyendaAmazonia ? [regimen.leyendaAmazonia] : [],
    emisor: { ruc: '20131312955', razonSocial: 'MI EMPRESA S.A.C.', nombreComercial: 'Barbería <Uno>', direccion: 'Jr. Lima 123',
      ubigeo: '160101', departamento: 'Loreto', provincia: 'Maynas', distrito: 'Iquitos' },
  };
}

test('Lucode: el JSON sigue su documentación', () => {
  const b = cuerpoLucode(doc(G18));
  assert.equal(b.documento, 'boleta');
  assert.equal(b.cliente_tipo_de_documento, '1');
  assert.equal(b.items[0].valor_unitario, '29.661017');
  assert.equal(b.items[0].porcentaje_igv, '18');
  assert.equal(b.items[0].codigo_tipo_afectacion_igv, '10');
  assert.equal(b.total, '60.00');
  assert.equal(b.leyendas, undefined);

  const m = cuerpoLucode(doc(MYPE));
  assert.equal(m.items[0].porcentaje_igv, '10.50');

  const a = cuerpoLucode(doc(AMAZONIA, 'boleta', { tipoDoc: 'sin_documento', numDoc: '', nombre: '', direccion: '' }));
  assert.equal(a.items[0].codigo_tipo_afectacion_igv, '20');
  assert.equal(a.items[0].nombre_tributo, 'EXO');
  assert.equal(a.items[0].porcentaje_igv, '0');
  assert.deepEqual(a.leyendas, ['2002']);
  assert.equal(a.cliente_numero_de_documento, '99999999');
  assert.equal(a.cliente_denominacion, 'CLIENTE VARIOS');
});

test('APIsPerú: montos completos, leyenda 1000 y emisor con ubigeo', () => {
  const b = cuerpoApisPeru(doc(G18, 'factura', { tipoDoc: 'ruc', numDoc: '20100070970', nombre: 'SUPERMERCADOS PERUANOS', direccion: '' }));
  assert.equal(b.tipoDoc, '01');
  assert.equal(b.client.tipoDoc, '6');
  assert.equal(b.company.address.ubigueo, '160101');
  assert.equal(b.mtoImpVenta, 60);
  assert.equal(Math.round((b.mtoOperGravadas + b.mtoIGV) * 100), 6000);
  assert.equal(b.legends[0].code, '1000');
  assert.equal(b.legends[0].value, 'SON SESENTA CON 00/100 SOLES');
  const suma = b.details.reduce((s, d) => s + d.mtoValorVenta, 0);
  assert.equal(Math.round(suma * 100), Math.round(b.mtoOperGravadas * 100));
  assert.equal(b.fechaEmision, '2026-11-11T15:04:05-05:00');

  const a = cuerpoApisPeru(doc(AMAZONIA));
  assert.equal(a.mtoOperExoneradas, 60);
  assert.equal(a.mtoOperGravadas, undefined);
  assert.equal(a.details[0].tipAfeIgv, 20);
  assert.deepEqual(a.legends.map((l) => l.code), ['1000', '2002']);
});

test('ticket impreso: escapa, avisa en pruebas y lleva el QR de SUNAT', () => {
  const c = {
    ...doc(G18),
    id: 'x', proveedor: 'simulado', ambiente: 'pruebas', estado: 'aceptado', mensaje: '', observaciones: [], hash: 'abc=',
    xmlUrl: '', cdrUrl: '', pdfUrl: '', ticketBaja: '', motivoBaja: '', refTipo: '', refId: '', creadoAt: '',
  };
  const html = ticketHtml(c, { ancho: 80, qrDataUrl: '' });
  assert.ok(html.includes('Barbería &lt;Uno&gt;'));
  assert.ok(!html.includes('<Uno>'));
  assert.ok(html.includes('SIN VALOR TRIBUTARIO'));
  assert.ok(html.includes('B001-7'));
  assert.ok(html.includes('SON SESENTA CON 00/100 SOLES'));
  assert.equal(textoQr(c), '20131312955|03|B001|7|9.15|60.00|2026-11-11|1|45678912|abc=|');
  const real = ticketHtml({ ...c, proveedor: 'lucode', ambiente: 'produccion' }, { ancho: 58, qrDataUrl: '' });
  assert.ok(!real.includes('SIN VALOR'));
  assert.ok(real.includes('size:58mm'));
});

test('régimen: de Ajustes manda la tasa de hoy (mype); de un comprobante, la suya', () => {
  const { regimenDe } = cargar('modules/facturacion/dominio/fila.ts');
  const mype = regimenDe({ igv_tipo: 'mype', igv_porcentaje: '18.00', igv_tasa_hoy: '10.5' });
  assert.deepEqual(mype, { tipo: 'gravado', porcentaje: 10.5, leyendaAmazonia: null });
  assert.equal(regimenDe({ igv_tipo: 'gravado', igv_porcentaje: '18.00', igv_tasa_hoy: 18 }).porcentaje, 18);
  assert.equal(regimenDe({ igv_tipo: 'gravado', igv_porcentaje: '15.00' }).porcentaje, 15);
  const exo = regimenDe({ igv_tipo: 'exonerado', igv_porcentaje: 18, igv_tasa_hoy: 0, leyenda_amazonia: '2002' });
  assert.deepEqual(exo, { tipo: 'exonerado', porcentaje: 0, leyendaAmazonia: '2002' });
});
