/**
 * El cartel del mostrador: A4 para imprimir (o guardar como PDF) con el QR de
 * la página del negocio, la regla del club y la marca. Lo que el cliente ve
 * junto a la caja: «Escanéalo con tu cámara».
 */
import QRCode from 'qrcode';
import { colorValido, mezcla, tintaSobre } from '@/modules/fideliza/dominio/estilo';
import { trazoSello, type Sello } from '@/modules/fideliza/dominio/sellos';

export interface DatosCartel {
  negocio: string;
  url: string;
  color: string;
  logo?: string | null;
  sello: Sello;
  /** «Junta 8 sellos y gana» … */
  meta?: number | null;
  premio?: string | null;
  unidad?: string;
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const https = (u?: string | null) => (u && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : '');

export async function htmlCartel(d: DatosCartel): Promise<string> {
  const color = colorValido(d.color);
  const tinta = tintaSobre(color);
  const suave = mezcla(color, '#FFFFFF', 0.86);
  const qr = await QRCode.toString(d.url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#14110F', light: '#FFFFFF' } });
  const logo = https(d.logo);
  const icono = (s: Sello, lleno: boolean) =>
    `<span class="s${lleno ? ' s--l' : ''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${trazoSello(s)}</svg></span>`;
  const n = Math.min(Math.max(d.meta ?? 6, 3), 10);
  const sellos = Array.from({ length: n }, (_, i) => icono(i === n - 1 ? 'regalo' : d.sello, i < 2)).join('');
  const regla = d.meta && d.premio ? `${d.meta} ${esc(d.unidad ?? 'sellos')} · ${esc(d.premio)}` : 'Suma con cada compra y gana premios';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cartel · ${esc(d.negocio)}</title>
<style>
@page{size:A4;margin:0}
*{box-sizing:border-box}
html,body{margin:0;background:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#14110F;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hoja{width:210mm;min-height:297mm;margin:0 auto;padding:22mm 20mm 16mm;display:flex;flex-direction:column;align-items:center;text-align:center;background:${suave}}
.logo{width:34mm;height:34mm;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:${color};color:${tinta};font-weight:800;font-size:16mm;box-shadow:0 0 0 2.5mm #fff,0 0 0 3.2mm ${color}}
.logo img{width:100%;height:100%;object-fit:cover;background:#fff}
.club{margin:9mm 0 0;font-size:4.2mm;letter-spacing:.35em;font-weight:700;color:${mezcla(color, '#14110F', 0.35)}}
h1{margin:1.5mm 0 0;font-size:15mm;line-height:1.05;color:${mezcla(color, '#14110F', 0.25)}}
.sub{margin:4mm 0 0;font-size:6mm;color:#3d3a37}
.pild{margin:6mm 0 0;display:inline-block;padding:2.6mm 6mm;border-radius:99mm;background:${color};color:${tinta};font-weight:700;font-size:5.4mm}
.sellos{display:flex;flex-wrap:wrap;justify-content:center;gap:3mm;margin:8mm 0 0;max-width:150mm}
.s{display:grid;place-items:center;width:13mm;height:13mm;border-radius:50%;border:.7mm dashed ${mezcla(color, '#FFFFFF', 0.35)};color:${mezcla(color, '#FFFFFF', 0.2)}}
.s svg{width:7mm;height:7mm}
.s--l{border:none;background:${color};color:${tinta}}
.qr{margin:10mm 0 0;padding:6mm;border-radius:7mm;background:#fff;box-shadow:0 2mm 8mm rgba(0,0,0,.08)}
.qr svg{display:block;width:78mm;height:78mm}
.esc{margin:7mm 0 0;font-size:7mm;font-weight:800}
.nota{margin:2.5mm 0 0;font-size:4.4mm;color:#5b5651;max-width:130mm}
.pie{margin-top:auto;padding-top:10mm;font-size:3.4mm;color:#8a857f}
@media screen{body{background:#e9e7e3}.hoja{margin:10mm auto;box-shadow:0 4mm 20mm rgba(0,0,0,.15)}}
</style></head><body><div class="hoja">
<div class="logo">${logo ? `<img src="${esc(logo)}" alt="">` : esc(d.negocio.trim().slice(0, 1).toUpperCase() || '★')}</div>
<p class="club">CLUB DE</p>
<h1>${esc(d.negocio)}</h1>
<p class="sub">Junta sellos en cada visita y gana.</p>
<span class="pild">${regla}</span>
<div class="sellos">${sellos}</div>
<div class="qr">${qr}</div>
<p class="esc">Escanéalo con tu cámara</p>
<p class="nota">Te unes gratis, sin descargar nada. Tu tarjeta vive en tu teléfono y puedes guardarla en Google Wallet.</p>
<p class="pie">Creado con Vendemia</p>
</div>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},400)})</script>
</body></html>`;
}

/**
 * Abre el cartel en una pestaña nueva (se abre ANTES de generar, para que el
 * navegador no lo bloquee como ventana emergente). Si no se puede, se descarga.
 */
export async function abrirCartel(d: DatosCartel) {
  const w = window.open('', '_blank');
  const html = await htmlCartel(d);
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = `cartel-${d.negocio.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`;
  a.click();
}
