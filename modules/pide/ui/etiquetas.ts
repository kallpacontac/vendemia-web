/**
 * ══════════════════════════════════════════════════════════════════════════
 * LAS ETIQUETAS DE ENVÍO · para imprimir y pegar en el paquete
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Dos formatos:
 *   a4       4 etiquetas por hoja (A6 cada una), con línea de corte.
 *   termica  una por etiqueta, 10 × 15 cm (las impresoras de rollo de courier).
 *
 * Un envío de 3 bultos saca 3 etiquetas (1/3, 2/3, 3/3): cada paquete lleva
 * la suya. El QR abre ese envío en el panel para marcarlo recogido o
 * entregado.
 *
 * Mismo patrón que las hojas de placas de Fideliza (modules/fideliza/ui/
 * hojaLote.ts): HTML con @page, QR en SVG y window.print().
 */
import QRCode from 'qrcode';
import { fechaCorta, nombreFranja, telefonoBonito, type Envio } from '@/modules/pide/dominio/envio';

export type Formato = 'a4' | 'termica';

const esc = (t: unknown) => String(t ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const qr = (texto: string) => QRCode.toString(texto, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });

const CSS_COMUN = `
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#000}
.et{display:flex;flex-direction:column;gap:3.5mm;padding:5mm;break-inside:avoid;overflow:hidden}
.et-cab{display:flex;justify-content:space-between;align-items:flex-start;gap:3mm;border-bottom:.6mm solid #000;padding-bottom:2mm}
.et-neg{font-weight:800;font-size:12pt;line-height:1.1}
.et-rec{font-size:8.5pt;margin-top:1mm}
.et-cod{font-family:ui-monospace,Consolas,monospace;font-weight:800;font-size:15pt;letter-spacing:.5pt;text-align:right}
.et-bul{font-size:10pt;font-weight:700;text-align:right}
.et-qr svg{width:26mm;height:26mm;display:block}
.et-tit{font-size:7.5pt;font-weight:800;letter-spacing:.8pt;text-transform:uppercase;color:#444}
.et-para{font-size:19pt;font-weight:800;line-height:1.15}
.et-tel{font-size:15pt;font-weight:700}
.et-dir{font-size:13.5pt;line-height:1.25}
.et-dis{font-size:19pt;font-weight:800;text-transform:uppercase}
.et-ref{font-size:11pt;font-style:italic}
.et-de{font-size:9.5pt;border-top:.3mm dashed #000;padding-top:2mm}
.et-cobrar{border:.8mm solid #000;padding:2.5mm;text-align:center;font-size:17pt;font-weight:800}
.et-pie{display:flex;justify-content:space-between;align-items:flex-end;margin-top:auto}
.et-cont{font-size:9pt;max-width:60%}
@media screen{body{background:#eee}.pliego{background:#fff;margin:6mm auto;box-shadow:0 1px 6px rgba(0,0,0,.15)}}
`;

const CSS: Record<Formato, string> = {
  a4: `@page{size:A4;margin:0}
.pliego{width:210mm;height:297mm;display:grid;grid-template-columns:105mm 105mm;grid-template-rows:148.5mm 148.5mm;break-after:page}
.pliego .et{border:.2mm dashed #999;height:148.5mm}`,
  termica: `@page{size:100mm 150mm;margin:0}
.pliego{width:100mm;height:150mm;break-after:page}
.pliego .et{height:150mm}`,
};

async function etiqueta(e: Envio, negocio: string, i: number, base: string): Promise<string> {
  const total = e.bultos;
  return `<div class="et">
  <div class="et-cab">
    <div><div class="et-neg">${esc(negocio)}</div>
      <div class="et-rec">Recojo: ${esc(fechaCorta(e.recojo_fecha))} · ${esc(nombreFranja(e.recojo_franja))}</div></div>
    <div><div class="et-cod">${esc(e.codigo)}</div><div class="et-bul">Bulto ${i + 1}/${total}</div></div>
  </div>
  <div><div class="et-tit">Para</div>
    <div class="et-para">${esc(e.destinatario_nombre)}</div>
    <div class="et-tel">${esc(telefonoBonito(e.destinatario_telefono))}</div></div>
  <div><div class="et-dir">${esc(e.direccion)}</div>
    <div class="et-dis">${esc(e.distrito)}</div>
    ${e.referencia ? `<div class="et-ref">Ref.: ${esc(e.referencia)}</div>` : ''}</div>
  ${e.contra_entrega ? `<div class="et-cobrar">COBRAR S/ ${Number(e.contra_entrega).toFixed(2)}</div>` : ''}
  <div class="et-pie">
    <div class="et-cont">${e.contenido ? esc(e.contenido) : ''}
      <div class="et-de"><b>De:</b> ${esc(e.remitente_nombre)} · ${esc(telefonoBonito(e.remitente_telefono))}</div></div>
    <div class="et-qr">${await qr(`${base}/panel/pide?envio=${encodeURIComponent(e.codigo)}`)}</div>
  </div>
</div>`;
}

export async function hojaEtiquetas(envios: Envio[], negocio: string, formato: Formato, base: string): Promise<string> {
  const todas: string[] = [];
  for (const e of envios) for (let i = 0; i < e.bultos; i++) todas.push(await etiqueta(e, negocio, i, base));
  const porPliego = formato === 'a4' ? 4 : 1;
  const pliegos: string[] = [];
  for (let i = 0; i < todas.length; i += porPliego) pliegos.push(`<div class="pliego">${todas.slice(i, i + porPliego).join('')}</div>`);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas · ${esc(negocio)}</title>
<style>${CSS_COMUN}${CSS[formato]}</style></head><body>${pliegos.join('')}
<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},300)})</script></body></html>`;
}

/**
 * Abre la hoja en una pestaña nueva. La pestaña se abre ANTES de generar los
 * QR (que es asíncrono): abierta después, el navegador ya no la ve como
 * respuesta al clic y la bloquea como ventana emergente.
 */
export async function imprimir(generar: () => Promise<string>): Promise<boolean> {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write('<p style="font-family:system-ui;padding:24px">Preparando etiquetas…</p>');
  const html = await generar();
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
