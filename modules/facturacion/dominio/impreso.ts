/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA REPRESENTACIÓN IMPRESA · el ticket que se le da al cliente
 * ══════════════════════════════════════════════════════════════════════════
 *
 * SUNAT fija QUÉ datos lleva (emisor, número, cliente, detalle, IGV, total, QR,
 * hash y la frase «Representación impresa…»), no el diseño. Lo hacemos nosotros,
 * igual para cualquier proveedor, en 80 mm o 58 mm (ticketera) y sirve también
 * para «Guardar como PDF» desde el navegador.
 *
 * Es un HTML completo y autónomo: se abre en una ventana aparte y se imprime,
 * sin depender de los estilos del panel. Todo texto que viene de fuera se escapa.
 */
import { CODIGO_COMPROBANTE, CODIGO_DOC_CLIENTE, LEYENDAS, NOMBRE_COMPROBANTE, NOMBRE_DOC_CLIENTE } from './catalogos';
import { montoEnLetras } from './letras';
import type { ComprobanteGuardado } from './tipos';

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const dinero = (n: number) => n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const cantidad = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString('es-PE', { maximumFractionDigits: 3 }));
const fechaPe = (iso: string) => {
  const [a, m, d] = iso.split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
};

/** El texto del QR según SUNAT: RUC|TIPO|SERIE|NÚMERO|IGV|TOTAL|FECHA|TIPO DOC|N° DOC|HASH| */
export function textoQr(c: ComprobanteGuardado): string {
  const sinDoc = c.cliente.tipoDoc === 'sin_documento';
  return [
    c.emisor.ruc,
    CODIGO_COMPROBANTE[c.tipo],
    c.serie,
    String(c.numero),
    c.totales.igv.toFixed(2),
    c.totales.total.toFixed(2),
    c.fecha,
    sinDoc ? '-' : CODIGO_DOC_CLIENTE[c.cliente.tipoDoc],
    sinDoc ? '-' : c.cliente.numDoc,
    c.hash,
  ].join('|') + '|';
}

export interface OpcionesImpreso {
  ancho: 58 | 80;
  /** data:image/png;base64,… del QR (lo genera quien llama: en el navegador, la librería qrcode). */
  qrDataUrl: string;
}

export function ticketHtml(c: ComprobanteGuardado, o: OpcionesImpreso): string {
  const e = c.emisor;
  const anulado = c.estado === 'anulado' || c.estado === 'anulando';
  const noVale = c.estado === 'rechazado' || c.estado === 'error' || c.estado === 'por_enviar';
  const sinDoc = c.cliente.tipoDoc === 'sin_documento';
  const fuente = o.ancho === 58 ? 10 : 11.5;

  // En prueba no se marca nada (18-nov, The 24/7: «no me pongas nada, ya lo saben»): el ticket de
  // prueba sale igual que el real. El panel sí lo dice (badge «Pruebas» en Boletas y Ajustes).
  const aviso = anulado
      ? 'COMPROBANTE ANULADO'
      : noVale
        ? 'AÚN NO ACEPTADO POR SUNAT'
        : '';

  const lineas = c.lineas
    .map(
      (l) => `<tr><td class="c">${esc(cantidad(l.cantidad))}</td><td>${esc(l.descripcion)}<br><small>P.U. ${dinero(
        l.precio,
      )}</small></td><td class="r">${dinero(l.importe)}</td></tr>`,
    )
    .join('');

  const filasTotales = [
    c.totales.opGravadas ? ['Op. gravada', c.totales.opGravadas] : null,
    c.totales.opExoneradas ? ['Op. exonerada', c.totales.opExoneradas] : null,
    c.regimen.tipo === 'gravado' ? [`IGV ${c.regimen.porcentaje}%`, c.totales.igv] : null,
  ]
    .filter(Boolean)
    .map((f) => `<tr><td>${esc((f as [string, number])[0])}</td><td class="r">S/ ${dinero((f as [string, number])[1])}</td></tr>`)
    .join('');

  const leyendas = c.leyendas
    .map((l) => LEYENDAS[l])
    .filter(Boolean)
    .map((t) => `<p class="ley">${esc(t)}</p>`)
    .join('');

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.serie)}-${esc(c.numero)}</title>
<style>
@page{size:${o.ancho}mm auto;margin:0}
*{box-sizing:border-box}
html,body{margin:0;background:#fff;color:#000}
body{width:${o.ancho}mm;padding:3mm ${o.ancho === 58 ? 2 : 4}mm;font:${fuente}px/1.35 ui-monospace,Menlo,Consolas,monospace}
h1{font-size:1.25em;margin:0 0 2px;text-align:center}
.cen{text-align:center}
.doc{border:1px solid #000;padding:4px;margin:6px 0;text-align:center;font-weight:700}
.aviso{border:2px solid #000;padding:4px;margin:6px 0;text-align:center;font-weight:700}
hr{border:0;border-top:1px dashed #000;margin:6px 0}
table{width:100%;border-collapse:collapse}
td{vertical-align:top;padding:1px 0}
td.c{width:2.6em}
td.r{text-align:right;white-space:nowrap;padding-left:6px}
small{font-size:.85em}
.total td{font-weight:700;font-size:1.15em;padding-top:3px}
.ley{margin:4px 0;font-size:.9em}
.qr{display:block;margin:6px auto;width:${o.ancho === 58 ? 30 : 34}mm;height:auto}
.pie{font-size:.85em;text-align:center}
.hash{word-break:break-all}
@media screen{body{margin:12px auto;box-shadow:0 0 0 1px #ddd}}
</style></head><body>
<h1>${esc(e.nombreComercial || e.razonSocial)}</h1>
${e.nombreComercial && e.nombreComercial !== e.razonSocial ? `<div class="cen">${esc(e.razonSocial)}</div>` : ''}
<div class="cen">RUC ${esc(e.ruc)}</div>
<div class="cen"><small>${esc(e.direccion)}</small></div>
<div class="doc">${esc(NOMBRE_COMPROBANTE[c.tipo].toUpperCase())}<br>${esc(c.serie)}-${esc(c.numero)}</div>
${aviso ? `<div class="aviso">${esc(aviso)}</div>` : ''}
<div>Fecha: ${esc(fechaPe(c.fecha))} ${esc(c.hora.slice(0, 5))}</div>
${
  sinDoc
    ? '<div>Cliente: CLIENTES VARIOS</div>'
    : `<div>${esc(NOMBRE_DOC_CLIENTE[c.cliente.tipoDoc])}: ${esc(c.cliente.numDoc)}</div><div>Cliente: ${esc(c.cliente.nombre)}</div>${
        c.cliente.direccion && c.cliente.direccion !== '-' ? `<div><small>${esc(c.cliente.direccion)}</small></div>` : ''
      }`
}
<div>Moneda: SOLES · Pago: CONTADO</div>
<hr>
<table><tr><td class="c"><b>Cant</b></td><td><b>Descripción</b></td><td class="r"><b>Importe</b></td></tr>${lineas}</table>
<hr>
<table>${filasTotales}<tr class="total"><td>TOTAL</td><td class="r">S/ ${dinero(c.totales.total)}</td></tr></table>
<p class="ley">${esc(montoEnLetras(c.totales.total))}</p>
${leyendas}
<hr>
${o.qrDataUrl ? `<img class="qr" src="${esc(o.qrDataUrl)}" alt="">` : ''}
<div class="pie">Representación impresa de la ${esc(NOMBRE_COMPROBANTE[c.tipo].toLowerCase())}.<br>Consulte su validez en www.sunat.gob.pe</div>
${c.hash ? `<div class="pie hash">Hash: ${esc(c.hash)}</div>` : ''}
</body></html>`;
}
