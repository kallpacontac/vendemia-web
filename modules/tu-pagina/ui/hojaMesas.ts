/**
 * Los QR de las mesas para imprimir y pegar: 6 por hoja A4, con línea de corte.
 * Mismo patrón que las etiquetas de envío (etiquetas.ts): HTML con @page, QR en SVG
 * y window.print(), en una pestaña abierta antes de generar los QR.
 */
import QRCode from 'qrcode';
import { imprimir } from '@/modules/tu-pagina/ui/etiquetas';

const esc = (t: unknown) => String(t ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface MesaParaQr { salon: string; numero: string; url: string }

export function imprimirMesas(negocio: string, mesas: MesaParaQr[]): Promise<boolean> {
  return imprimir(async () => {
    const tarjetas = await Promise.all(mesas.map(async (m) => `
      <article class="m">
        <p class="n">${esc(negocio)}</p>
        <div class="q">${await QRCode.toString(m.url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })}</div>
        <h1>Mesa ${esc(m.numero)}</h1>
        ${m.salon ? `<p class="s">${esc(m.salon)}</p>` : ''}
        <p class="a">Escanea para ver la carta, llamar al mozo o pedir la cuenta</p>
      </article>`));
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR de las mesas</title><style>
@page{size:A4;margin:8mm}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#000}
main{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:92mm}
.m{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.5mm;padding:4mm;border:.2mm dashed #888;text-align:center;break-inside:avoid}
.n{margin:0;font-weight:800;font-size:12pt}
.q{width:50mm;height:50mm}
.q svg{width:100%;height:100%;display:block}
h1{margin:1mm 0 0;font-size:21pt;line-height:1}
.s{margin:0;font-size:11pt}
.a{margin:1mm 0 0;font-size:9pt;max-width:70mm}
</style></head><body><main>${tarjetas.join('')}</main>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},300)})</script></body></html>`;
  });
}
