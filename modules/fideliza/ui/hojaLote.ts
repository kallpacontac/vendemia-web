/**
 * Hojas A4 para imprimir un lote de placas sin dueño.
 *
 *   frentes    → el QR público de cada placa (?o=qr). Se puede mandar a la
 *                imprenta: no lleva nada secreto.
 *   activacion → la tarjeta PRIVADA de cada placa: su código y un QR que abre
 *                el panel y la activa. Va dentro del sobre, nunca a la vista.
 *
 * Cada placa lleva un número (#01, #02…) en las dos hojas para emparejar el
 * frente con su tarjeta al empaquetar.
 */
import QRCode from 'qrcode';
import { urlPlacaQr } from '@/modules/fideliza/dominio/config';

export interface PlacaDelLote {
  public_token: string;
  activation_code: string;
}

const svg = (texto: string) => QRCode.toString(texto, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
const num = (i: number, total: number) => '#' + String(i + 1).padStart(Math.max(2, String(total).length), '0');
const escHtml = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const CSS = `
@page{size:A4;margin:10mm}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#14110F}
.aviso{margin:0 0 4mm;font-size:11px;color:#555}
.rejilla{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm}
.celda{border:1px dashed #bbb;border-radius:3mm;padding:4mm;text-align:center;break-inside:avoid;height:49mm;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2mm}
.celda svg{width:32mm;height:32mm;display:block}
.t{font-weight:700;font-size:12px}
.n{font-size:9px;color:#777}
.cod{font-family:ui-monospace,Consolas,monospace;font-weight:700;font-size:13px;letter-spacing:.5px}
.celda--priv svg{width:24mm;height:24mm}
@media screen{body{padding:10mm;background:#f4f4f4}.rejilla{background:#fff;padding:4mm}}
`;

function hoja(titulo: string, aviso: string, celdas: string[]) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escHtml(titulo)}</title><style>${CSS}</style></head>
<body><p class="aviso">${aviso}</p><div class="rejilla">${celdas.join('')}</div>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},300)})</script></body></html>`;
}

export async function hojaFrentes(placas: PlacaDelLote[], lote: string) {
  const celdas = await Promise.all(
    placas.map(
      async (p, i) =>
        `<div class="celda">${await svg(urlPlacaQr(p.public_token))}<span class="t">Escanéame</span><span class="n">${num(i, placas.length)} · ${escHtml(lote)}</span></div>`,
    ),
  );
  return hoja(`Frentes · ${lote}`, `Lote «${escHtml(lote)}» · ${placas.length} QR. Recorta por la línea. Se puede enviar a la imprenta.`, celdas);
}

export async function hojaActivacion(placas: PlacaDelLote[], lote: string, enlaceActivar: (codigo: string) => string) {
  const celdas = await Promise.all(
    placas.map(
      async (p, i) =>
        `<div class="celda celda--priv"><span class="n">${num(i, placas.length)} · PRIVADO</span>${await svg(enlaceActivar(p.activation_code))}<span class="t">Activa tu placa</span><span class="cod">${escHtml(p.activation_code)}</span></div>`,
    ),
  );
  return hoja(
    `Activación · ${lote}`,
    `PRIVADO · lote «${escHtml(lote)}». Cada tarjeta va DENTRO del sobre de su placa (mismo número). Quien tenga el código se queda la placa: no la envíes a la imprenta ni la dejes a la vista.`,
    celdas,
  );
}

/** Descarga el HTML: se abre en el navegador y sale el diálogo de imprimir (o «Guardar como PDF»). */
export function descargarHtml(html: string, nombre: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
