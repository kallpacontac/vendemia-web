/**
 * La página pública de un negocio: fideliza.vendemias.com/n/<slug>.
 * Los enlaces publicados de su perfil por defecto, y el alta si hay programa.
 */
import { FIDELIZA_URL } from '@/modules/fideliza/dominio/config';
import { fraseRegla } from '@/modules/fideliza/dominio/formato';
import { esc, listaEnlaces, noDisponible, pagina, type Negocio } from '@/modules/fideliza/servidor/html';
import { huellaIp, limitar, log } from '@/modules/fideliza/servidor/http';
import { rpc, servidor } from '@/modules/fideliza/servidor/supabase';


export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug.toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) return noDisponible(null, 404);
  try {
    if (!(await limitar(`ip:${huellaIp(req)}:n`, 120, 60))) return new Response('Demasiadas peticiones', { status: 429 });
    const n = await rpc<Negocio>(servidor(), 'loyalty_srv_business', { p_slug: slug, p_event: 'links_view' });
    if (n.status !== 'ok') return noDisponible(null, 404);
    const programa = n.program
      ? `<section class="caja"><p class="nota">${esc(n.program.name)}</p><p class="premio">${esc(fraseRegla(n.program))}</p>
         <a class="btn prim" href="/n/${esc(slug)}/unirse">Crear mi tarjeta</a></section>`
      : '';
    const enlaces = n.links.length ? listaEnlaces(n.links, slug, FIDELIZA_URL) : '';
    if (!programa && !enlaces) return noDisponible(n.brand);
    return pagina({
      titulo: n.title || n.brand.display_name,
      marca: { ...n.brand, tagline: n.tagline || n.brand.tagline },
      cuerpo: programa + enlaces,
      indexable: true,
    });
  } catch (e) {
    log('business_page_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
    return noDisponible(null, 503);
  }
}
