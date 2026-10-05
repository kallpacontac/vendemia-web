/**
 * La página pública de un negocio: fideliza.vendemias.com/n/<slug>.
 * Los enlaces publicados de su perfil por defecto, y el alta si hay programa.
 */
import { FIDELIZA_URL } from '@/modules/fideliza/dominio/config';
import { noDisponible, paginaDeEnlaces, type Negocio } from '@/modules/fideliza/servidor/html';
import { huellaIp, limitar, log } from '@/modules/fideliza/servidor/http';
import { rpc, servidor } from '@/modules/fideliza/servidor/supabase';


export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug.toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) return noDisponible(null, 404);
  try {
    if (!(await limitar(`ip:${huellaIp(req)}:n`, 120, 60))) return new Response('Demasiadas peticiones', { status: 429 });
    const n = await rpc<Negocio>(servidor(), 'loyalty_srv_business', { p_slug: slug, p_event: 'links_view' });
    if (n.status !== 'ok') return noDisponible(null, 404);
    if (!n.program && !n.links.length) return noDisponible(n.brand);
    return paginaDeEnlaces({
      marca: n.brand,
      titulo: n.title,
      frase: n.tagline,
      links: n.links,
      programa: n.program,
      base: FIDELIZA_URL,
      indexable: true,
    });
  } catch (e) {
    log('business_page_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
    return noDisponible(null, 503);
  }
}
