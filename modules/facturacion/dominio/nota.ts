/**
 * ══════════════════════════════════════════════════════════════════════════
 * NOTA DE VENTA · el ticket del negocio, sin SUNAT (sql/0004)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The 24/7 (18-nov-2026): al cobrar se escoge «Nota de venta» o «Boleta electrónica». La nota es
 * lo cobrado, numerado NV-000001…, con los datos del negocio. Se imprime en la ticketera (mismo
 * formato que la boleta, dominio/impreso.ts) y se manda por WhatsApp con su enlace /nota/<id>,
 * que WhatsApp muestra como la imagen del ticket (app/nota/[id]/opengraph-image.tsx).
 */
import { cantidad, dinero, esc } from './impreso';

export interface NotaVenta {
  id: string;
  numero: number;
  lineas: { descripcion: string; cantidad: number; precio: number }[];
  total: number;
  cliente: string;
  telefono: string;
  atendio: string;
  emitida_at: string;
  negocio: { nombre: string; razon_social: string; ruc: string; direccion: string; ticket_ancho: number };
}

/** Lo que devuelve nota_emitir / nota_publica, con los números como números. */
export function notaDe(x: Record<string, unknown>): NotaVenta {
  const n = x as unknown as NotaVenta;
  return {
    ...n,
    numero: Number(n.numero),
    total: Number(n.total),
    lineas: (Array.isArray(n.lineas) ? n.lineas : []).map((l) => ({ descripcion: String(l.descripcion ?? ''), cantidad: Number(l.cantidad), precio: Number(l.precio) })),
    negocio: { ...n.negocio, ticket_ancho: Number(n.negocio?.ticket_ancho) === 58 ? 58 : 80 },
  };
}

/** NV-000007 */
export const numeroNota = (n: Pick<NotaVenta, 'numero'>) => `NV-${String(n.numero).padStart(6, '0')}`;

const fechaHora = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const f = d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' });
  const h = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima' });
  return `${f} ${h}`;
};

/** El ticket de la nota, HTML autónomo para imprimir o mostrar (como ticketHtml). */
export function notaHtml(n: NotaVenta): string {
  const ancho = n.negocio.ticket_ancho === 58 ? 58 : 80;
  const fuente = ancho === 58 ? 10 : 11.5;
  const e = n.negocio;
  const lineas = n.lineas
    .map((l) => `<tr><td class="c">${esc(cantidad(l.cantidad))}</td><td>${esc(l.descripcion)}<br><small>P.U. ${dinero(l.precio)}</small></td><td class="r">${dinero(l.cantidad * l.precio)}</td></tr>`)
    .join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(numeroNota(n))}</title><style>
@page{size:${ancho}mm auto;margin:0}
*{box-sizing:border-box}
body{width:${ancho}mm;padding:3mm ${ancho === 58 ? 2 : 4}mm;margin:0;font:${fuente}px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#000}
h1{font-size:1.25em;margin:0 0 2px;text-align:center}
.cen{text-align:center}
.doc{border:1px solid #000;padding:4px;margin:6px 0;text-align:center;font-weight:700}
hr{border:0;border-top:1px dashed #000;margin:6px 0}
table{width:100%;border-collapse:collapse}
td{vertical-align:top;padding:1px 0}
td.c{width:2.6em}
td.r{text-align:right;white-space:nowrap;padding-left:6px}
small{font-size:.85em}
.total td{font-weight:700;font-size:1.15em;padding-top:3px}
.pie{font-size:.9em;text-align:center;margin-top:6px}
@media screen{body{margin:12px auto;box-shadow:0 0 0 1px #ddd}}
</style></head><body>
<h1>${esc(e.nombre || e.razon_social)}</h1>
${e.razon_social && e.razon_social !== e.nombre ? `<div class="cen">${esc(e.razon_social)}</div>` : ''}
${e.ruc ? `<div class="cen">RUC ${esc(e.ruc)}</div>` : ''}
${e.direccion ? `<div class="cen"><small>${esc(e.direccion)}</small></div>` : ''}
<div class="doc">NOTA DE VENTA<br>${esc(numeroNota(n))}</div>
<div>Fecha: ${esc(fechaHora(n.emitida_at))}</div>
${n.cliente ? `<div>Cliente: ${esc(n.cliente)}</div>` : ''}
${n.atendio ? `<div>Atendió: ${esc(n.atendio)}</div>` : ''}
<hr>
<table><tr><td class="c"><b>Cant</b></td><td><b>Descripción</b></td><td class="r"><b>Importe</b></td></tr>${lineas}</table>
<hr>
<table><tr class="total"><td>TOTAL</td><td class="r">S/ ${dinero(n.total)}</td></tr></table>
<div class="pie">¡Gracias por tu visita!</div>
</body></html>`;
}

/** El mensaje de WhatsApp: el saludo, la nota y su enlace (que WhatsApp muestra como imagen). */
export function textoWhatsAppNota(n: NotaVenta, enlace: string): string {
  const quien = n.cliente ? `Hola ${n.cliente.split(' ')[0]}, ¡gracias` : '¡Gracias';
  return [
    `${quien} por tu visita a ${n.negocio.nombre || n.negocio.razon_social}!`,
    `Te dejamos tu nota de venta ${numeroNota(n)} por S/ ${n.total.toFixed(2)}:`,
    enlace,
  ].join('\n');
}
