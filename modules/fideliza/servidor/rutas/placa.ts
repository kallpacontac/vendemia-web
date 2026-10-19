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
 * una placa es editable. `?o=qr` marca la apertura desde el QR impreso y
 * `?o=nfc` la del chip. Las placas antiguas sin parámetro siguen contando como
 * NFC para no romper nada ya grabado.
 */
import { FIDELIZA_URL } from '@/modules/fideliza/dominio/config';
import { rutaActivacionPlaca, type FuentePlaca } from '@/modules/fideliza/dominio/activacion';
import { destino, noDisponible, paginaDeEnlaces, type EnlacePublico, type MarcaPublica } from '@/modules/fideliza/servidor/html';
import { huellaIp, limitar, log, NO_CACHE } from '@/modules/fideliza/servidor/http';
import { rpc, servidor } from '@/modules/fideliza/servidor/supabase';


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
    if (r.status === 'unclaimed') return irAlAlta(origen);
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
 * Placa recién recibida: se entra directamente al alta de Fideliza. El panel
 * conserva este destino durante login/Google, crea el negocio si hace falta y
 * pide el código privado de la tarjeta antes de reclamar la placa.
 */
function irAlAlta(origen: FuentePlaca) {
  const sitio = (process.env.NEXT_PUBLIC_SITE_URL || 'https://vendemias.com').replace(/\/+$/, '');
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${sitio}${rutaActivacionPlaca(origen)}`,
      ...NO_CACHE,
      'Referrer-Policy': 'no-referrer',
    },
  });
}
