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
import { destino, esc, listaEnlaces, noDisponible, pagina, type EnlacePublico, type MarcaPublica } from '@/modules/fideliza/servidor/html';
import { huellaIp, limitar, log, NO_CACHE } from '@/modules/fideliza/servidor/http';
import { rpc, servidor } from '@/modules/fideliza/servidor/supabase';


interface Resuelto {
  status: 'ok' | 'unavailable' | 'not_found' | 'unclaimed';
  brand?: MarcaPublica & { slug: string };
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
    return pagina({
      titulo: r.title || r.brand.display_name,
      marca: { ...r.brand, tagline: r.tagline || r.brand.tagline },
      cuerpo: listaEnlaces(r.links, r.brand.slug, FIDELIZA_URL, token),
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
  const panel = `${(process.env.NEXT_PUBLIC_SITE_URL || 'https://vendemias.com').replace(/\/+$/, '')}/panel/fideliza/placas?activar=1`;
  return pagina({
    titulo: 'Placa sin activar',
    marca: null,
    cuerpo: `<div class="caja"><p class="premio">Esta placa aún no está activada.</p>
<p class="nota">¿Es tuya? Actívala en un minuto: entra en tu panel de Vendemia y escribe el código de activación que viene con la placa.</p>
<a class="btn prim" href="${esc(panel)}">Activar mi placa</a>
<p class="nota">Si no es tuya, pregunta en el local: todavía no lleva a ninguna parte.</p></div>`,
  });
}
