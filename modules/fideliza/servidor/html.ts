import 'server-only';
import { NO_CACHE } from './http';
import { htmlPagina, type BotonPagina } from '../dominio/paginaPublica';
import { deUrl } from '../dominio/botones';
import { resolverEstilo, type Estilo } from '../dominio/estilo';
import { fraseRegla } from '../dominio/formato';
import type { TipoRegla } from '../dominio/formato';

/**
 * Páginas públicas en HTML plano: placas, página de enlaces y alta.
 *
 * Sin React ni bundle: el resolutor de una placa tiene que abrir en un Android
 * de gama media con datos móviles en lo que tarda en levantar la mano. Todo lo
 * que entra en el HTML pasa por esc(). El color va validado (#RRGGBB) antes de
 * llegar a la hoja de estilos.
 */
export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface MarcaPublica {
  display_name: string;
  tagline?: string;
  logo_url: string | null;
  bg_color: string;
}

const color = (c: string | undefined) => (/^#[0-9A-Fa-f]{6}$/.test(c ?? '') ? c! : '#FF4900');

/** ¿Texto oscuro o claro encima del color de marca? Contraste WCAG simple. */
function tintaSobre(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.055 ? '#FFFFFF' : '#1A0A00';
}

export function pagina(o: { titulo: string; marca?: MarcaPublica | null; cuerpo: string; status?: number; indexable?: boolean }) {
  const c = color(o.marca?.bg_color);
  const html = `<!doctype html>
<html lang="es-PE"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(o.titulo)}</title>
${o.indexable ? '' : '<meta name="robots" content="noindex,nofollow">'}
<meta name="theme-color" content="${c}">
<style>
:root{--marca:${c};--sobre:${tintaSobre(c)};--tinta:#0A0A0A;--suave:#5C5C5C;--fondo:#F9F9F6}
*{box-sizing:border-box;margin:0}
body{font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--fondo);color:var(--tinta);min-height:100vh;display:flex;flex-direction:column;align-items:center}
.cab{width:100%;background:var(--marca);color:var(--sobre);padding:32px 16px 56px;text-align:center}
.logo{width:88px;height:88px;border-radius:50%;object-fit:cover;background:#fff;border:3px solid #fff;display:block;margin:0 auto 12px}
h1{font-size:22px;line-height:1.2}
.lema{opacity:.9;margin-top:6px;font-size:15px}
main{width:100%;max-width:440px;padding:0 16px 32px;margin-top:-32px}
.caja{background:#fff;border-radius:20px;box-shadow:0 8px 28px rgba(10,10,10,.08);padding:20px;margin-bottom:16px}
.btn{display:flex;align-items:center;justify-content:center;min-height:54px;width:100%;border-radius:14px;border:1.5px solid #DEDED9;background:#fff;color:var(--tinta);font:600 16px system-ui,sans-serif;text-decoration:none;margin-top:10px;padding:12px 16px;text-align:center;cursor:pointer}
.btn.prim{background:var(--marca);border-color:var(--marca);color:var(--sobre)}
.btn:focus-visible,input:focus-visible{outline:3px solid #0A0A0A;outline-offset:2px}
label{display:block;font-weight:600;font-size:14px;margin:14px 0 6px}
input[type=text]{width:100%;min-height:50px;border:1.5px solid #DEDED9;border-radius:12px;padding:10px 14px;font:16px system-ui,sans-serif}
.nota{color:var(--suave);font-size:13.5px;margin-top:10px}
.premio{font-size:18px;font-weight:700;margin:6px 0}
.pie{color:#93938C;font-size:12px;margin:8px 0 24px;text-align:center}
.pie a{color:inherit}
</style></head><body>
<header class="cab">
${o.marca?.logo_url ? `<img class="logo" src="${esc(o.marca.logo_url)}" alt="" width="88" height="88">` : ''}
<h1>${esc(o.marca?.display_name ?? 'Vendemia Fideliza')}</h1>
${o.marca?.tagline ? `<p class="lema">${esc(o.marca.tagline)}</p>` : ''}
</header>
<main>${o.cuerpo}</main>
<p class="pie">Fideliza · <a href="https://vendemias.com/privacidad">Privacidad</a></p>
</body></html>`;
  return new Response(html, {
    status: o.status ?? 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...NO_CACHE,
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'",
      ...(o.indexable ? {} : { 'X-Robots-Tag': 'noindex, nofollow' }),
    },
  });
}

export interface EnlacePublico {
  label: string;
  kind: 'url' | 'join';
  url: string | null;
  is_primary?: boolean;
  /** sql/0008: las versiones publicadas antes no los traen. */
  icon?: string | null;
  subtitle?: string | null;
  placement?: 'button' | 'social';
}

/** El destino real de un enlace publicado. «join» es el alta del propio negocio. */
export function destino(l: EnlacePublico, slug: string, base: string, placa?: string): string {
  if (l.kind === 'join') return `${base}/n/${slug}/unirse${placa ? `?d=${encodeURIComponent(placa)}` : ''}`;
  return l.url ?? '#';
}

export function listaEnlaces(links: EnlacePublico[], slug: string, base: string, placa?: string): string {
  const orden = [...links.filter((l) => l.is_primary), ...links.filter((l) => !l.is_primary)];
  return `<nav class="caja" aria-label="Enlaces">${orden
    .map(
      (l) =>
        `<a class="btn${l.is_primary ? ' prim' : ''}" href="${esc(destino(l, slug, base, placa))}" rel="noopener">${esc(l.label)}</a>`,
    )
    .join('')}</nav>`;
}

export function noDisponible(marca: MarcaPublica | null, status = 200) {
  return pagina({
    titulo: 'No disponible',
    marca,
    status,
    cuerpo: `<div class="caja"><p class="premio">Esta placa no está disponible ahora.</p><p class="nota">Pregunta en el local: pueden ayudarte en persona.</p></div>`,
  });
}

/** Lo que devuelve loyalty_srv_business. */
export interface Negocio {
  status: 'ok' | 'not_found';
  brand: MarcaPublica & { slug: string; style?: Record<string, unknown> | string | null };
  title: string | null;
  tagline: string | null;
  links: EnlacePublico[];
  program: {
    name: string;
    description: string;
    rule_type: TipoRegla;
    threshold: number;
    reward: string;
    stamps_per_purchase: number;
    points_per_unit: number;
    unit_cents: number;
    min_purchase_cents: number;
  } | null;
}

/**
 * La página de enlaces con su plantilla (dominio/paginaPublica): la de
 * /n/<negocio> y la de una placa con varios enlaces. Las redes van como fila
 * de iconos; el resto, como botones. Si hay programa de puntos y el dueño no
 * puso el botón de alta, se añade uno destacado.
 */
export function paginaDeEnlaces(o: {
  marca: MarcaPublica & { slug: string; style?: Record<string, unknown> | string | null };
  titulo?: string | null;
  frase?: string | null;
  links: EnlacePublico[];
  programa?: Negocio['program'];
  base: string;
  placa?: string;
  indexable?: boolean;
}) {
  /**
   * Resuelve aquí, en el límite entre Supabase y el HTML, además de hacerlo en
   * `htmlPagina`. Así una respuesta JSONB serializada o incompleta nunca hace
   * que la página pública vuelva silenciosamente a «Clásica».
   */
  let estiloEntrada: Partial<Estilo> | null = null;
  if (o.marca.style && typeof o.marca.style === 'object' && !Array.isArray(o.marca.style)) {
    estiloEntrada = o.marca.style as Partial<Estilo>;
  } else if (typeof o.marca.style === 'string') {
    try {
      const leido = JSON.parse(o.marca.style) as unknown;
      if (leido && typeof leido === 'object' && !Array.isArray(leido)) estiloEntrada = leido as Partial<Estilo>;
    } catch {
      estiloEntrada = null;
    }
  }
  const estilo = resolverEstilo(estiloEntrada);
  const tipoDe = (l: EnlacePublico) => l.icon || deUrl(l.url, l.kind).tipo;
  const botones: BotonPagina[] = o.links
    .filter((l) => l.placement !== 'social')
    .map((l) => ({
      tipo: tipoDe(l),
      label: l.label,
      url: destino(l, o.marca.slug, o.base, o.placa),
      subtitulo: l.subtitle ?? undefined,
      destacado: Boolean(l.is_primary),
    }));
  if (o.programa && !o.links.some((l) => l.kind === 'join')) {
    botones.unshift({
      tipo: 'tarjeta',
      label: 'Crear mi tarjeta de puntos',
      url: destino({ label: '', kind: 'join', url: null }, o.marca.slug, o.base, o.placa),
      subtitulo: fraseRegla(o.programa),
      destacado: true,
    });
  }
  const html = htmlPagina(
    {
      nombre: o.titulo || o.marca.display_name,
      bio: o.frase || o.marca.tagline,
      logo: o.marca.logo_url,
      color: o.marca.bg_color,
      estilo,
      redes: o.links.filter((l) => l.placement === 'social' && l.url).map((l) => ({ tipo: tipoDe(l), url: l.url! })),
      botones,
    },
    { indexable: o.indexable },
  );
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Vendemia-Template': estilo.plantilla,
      ...NO_CACHE,
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'",
      ...(o.indexable ? {} : { 'X-Robots-Tag': 'noindex, nofollow' }),
    },
  });
}
