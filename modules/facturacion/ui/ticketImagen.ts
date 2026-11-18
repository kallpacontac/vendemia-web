'use client';
/**
 * El TICKET IMPRESO convertido en imagen (PNG), para mandarlo por WhatsApp (18-nov-2026, The 24/7:
 * «debe ser el mismo ticket de la NV o la boleta electrónica», no un resumen).
 *
 * Sin librerías: es el mismo HTML que se imprime (dominio/impreso.ts, dominio/nota.ts), que ya es
 * autónomo (estilos dentro, el QR como data:). Se mide en un marco invisible, se mete en un SVG
 * (<foreignObject>) y se pinta en un canvas a 3× para que se lea nítido. Todo en el navegador.
 */

const MM_A_PX = 96 / 25.4;
const ESCALA = 3;

/** Lo que mide el ticket de alto, renderizado de verdad (el QR incluido). */
function medir(html: string, anchoPx: number): Promise<number> {
  return new Promise((resolver) => {
    const marco = document.createElement('iframe');
    marco.setAttribute('aria-hidden', 'true');
    marco.style.cssText = `position:fixed;left:-10000px;top:0;width:${anchoPx}px;height:200px;border:0;visibility:hidden`;
    marco.srcdoc = html.replace('</head>', '<style>body{margin:0!important;box-shadow:none!important}</style></head>');
    let listo = false;
    const acabar = (alto: number) => {
      if (listo) return;
      listo = true;
      marco.remove();
      resolver(alto);
    };
    // Por si el marco no avisa (algún navegador): con lo que haya medido a los 2,5 s.
    window.setTimeout(() => acabar(Math.ceil(marco.contentDocument?.body?.scrollHeight || 640)), 2500);
    marco.onload = () => {
      const doc = marco.contentDocument;
      const imgs = Array.from(doc?.images ?? []);
      Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))))
        .then(() => {
          acabar(Math.ceil(doc?.body.scrollHeight || 640));
        });
    };
    document.body.appendChild(marco);
  });
}

/** El HTML del ticket → File PNG. null si el navegador no pudo. */
export async function ticketAImagen(html: string, anchoMm: number, nombre: string): Promise<File | null> {
  try {
    const anchoPx = Math.round(anchoMm * MM_A_PX);
    const alto = await medir(html, anchoPx);

    // Lo de dentro del ticket, en XHTML (lo exige el SVG), con sus estilos: «body» pasa a ser «.tk».
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const css = Array.from(doc.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .join('\n')
      .replace(/@page\s*\{[^}]*\}/g, '')
      .replace(/@media\s+screen\s*\{[^{}]*\{[^}]*\}\s*\}/g, '')
      .replace(/(^|[}\s,])body\s*\{/g, '$1.tk{');
    const xs = new XMLSerializer();
    const cuerpo = Array.from(doc.body.childNodes).map((n) => xs.serializeToString(n)).join('');
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${anchoPx}" height="${alto}">` +
      `<foreignObject x="0" y="0" width="100%" height="100%">` +
      `<div xmlns="http://www.w3.org/1999/xhtml" class="tk" style="margin:0;background:#fff">` +
      `<style>${css.replace(/</g, '&lt;')}</style>${cuerpo}</div></foreignObject></svg>`;

    const img = new Image();
    img.decoding = 'sync';
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();

    const lienzo = document.createElement('canvas');
    lienzo.width = anchoPx * ESCALA;
    lienzo.height = alto * ESCALA;
    const ctx = lienzo.getContext('2d');
    if (!ctx) return null;
    ctx.scale(ESCALA, ESCALA);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, anchoPx, alto);
    ctx.drawImage(img, 0, 0, anchoPx, alto);
    const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, 'image/png'));
    return blob ? new File([blob], `${nombre}.png`, { type: 'image/png' }) : null;
  } catch {
    return null;
  }
}
