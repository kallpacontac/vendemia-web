/**
 * ══════════════════════════════════════════════════════════════════════════
 * EL RESOLUTOR DE PLACAS · fideliza.vendemias.com/t/<token>
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Es la URL grabada en el chip y en el QR: no cambia nunca. Lo que cambia es
 * lo que hay detrás, y se decide aquí con los enlaces PUBLICADOS:
 *
 *   0 enlaces → página de «no disponible», sin nada de administración.
 *   1 enlace  → 302 directo. Ni intersticial, ni formulario, ni marca.
 *   2 o más   → la página del negocio con los botones.
 *
 * 302 y no 301: un 301 lo cachea el navegador para siempre, y el destino de
 * una placa es editable. `?o=qr` marca la apertura desde el QR impreso; sin
 * parámetro se cuenta como NFC/directo (no se puede distinguir más).
 */
import { FIDELIZA_URL } from '@/modules/fideliza/dominio/config';
import { destino, esc, noDisponible, pagina, paginaDeEnlaces, type EnlacePublico, type MarcaPublica } from '@/modules/fideliza/servidor/html';
import { huellaIp, limitar, log, NO_CACHE } from '@/modules/fideliza/servidor/http';
import { rpc, servidor } from '@/modules/fideliza/servidor/supabase';
import { whatsappUrl } from '@/lib/content';


interface Resuelto {
  status: 'ok' | 'unavailable' | 'not_found' | 'unclaimed';
  brand?: MarcaPublica & { slug: string; style?: Record<string, unknown> | null };
  title?: string;
  tagline?: string;
  links?: EnlacePublico[];
}

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const token = params.token;
  if (!/^[A-Za-z0-9_-]{22,64}$/.test(token)) return noDisponible(null, 404);
  const origen = new URL(req.url).searchParams.get('o') === 'qr' ? 'qr' : 'nfc';

  try {
    if (!(await limitar(`ip:${huellaIp(req)}:t`, 120, 60))) {
      return new Response('Demasiadas peticiones', { status: 429, headers: NO_CACHE });
    }
    const r = await rpc<Resuelto>(servidor(), 'loyalty_srv_resolve', { p_token: token, p_source: origen });
    if (r.status === 'not_found') return noDisponible(null, 404);
    if (r.status === 'unclaimed') return sinActivar();
    if (r.status !== 'ok' || !r.links?.length || !r.brand) return noDisponible(r.brand ?? null);

    if (r.links.length === 1) {
      const url = destino(r.links[0], r.brand.slug, FIDELIZA_URL, token);
      return new Response(null, { status: 302, headers: { Location: url, ...NO_CACHE, 'Referrer-Policy': 'no-referrer' } });
    }
    return paginaDeEnlaces({
      marca: r.brand,
      titulo: r.title,
      frase: r.tagline,
      links: r.links,
      base: FIDELIZA_URL,
      placa: token,
    });
  } catch (e) {
    log('resolver_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
    return noDisponible(null, 503);
  }
}

/**
 * Placa recién recibida: quien la acerca suele ser el dueño probándola. Se le
 * manda al panel; la vinculación exige sesión y el código impreso, así que
 * enseñar esto a un desconocido no le da nada.
 */
function sinActivar() {
  const sitio = (process.env.NEXT_PUBLIC_SITE_URL || 'https://vendemias.com').replace(/\/+$/, '');
  const panel = `${sitio}/panel/fideliza/placas?activar=1&origen=placa`;
  const soporte = whatsappUrl('Hola 👋 Necesito ayuda para activar una placa de Vendemia Fideliza.');
  return pagina({
    titulo: 'Placa sin activar',
    variante: 'vendemia',
    marca: {
      display_name: 'Fideliza',
      logo_url: `${sitio}/assets/logos/logo-naranja.webp`,
      bg_color: '#FF4900',
    },
    cuerpo: `<section class="caja placa-pendiente" aria-labelledby="titulo-placa">
<div class="placa-pendiente__icono" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18h.01M10 18h.01M14 18h.01M18 18h.01"/><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 13a4 4 0 0 1 4-4M8 9a8 8 0 0 1 8 8"/></svg></div>
<p class="placa-pendiente__etiqueta">Placa sin activar</p>
<h2 id="titulo-placa">Activa tu placa</h2>
<p class="placa-pendiente__intro">Vincúlala con tu negocio. Toma menos de un minuto.</p>
<ol class="placa-pendiente__pasos">
  <li><span>1</span>Entra o crea tu cuenta Vendemia.</li>
  <li><span>2</span>Escribe el código de la tarjeta.</li>
</ol>
<a class="btn prim" href="${esc(panel)}">Activar mi placa</a>
<a class="btn btn--soporte" href="${esc(soporte)}" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.5 9.5 0 0 1-4-.9L3 21l1.7-4.6A9 9 0 1 1 21 11.5Z"/><path d="M9 9.2c.4 2 1.8 3.5 3.8 4"/></svg>Hablar con soporte</a>
<p class="placa-pendiente__pie">¿No es tuya? Déjala aquí: todavía no dirige a ningún negocio.</p>
</section>`,
  });
}
