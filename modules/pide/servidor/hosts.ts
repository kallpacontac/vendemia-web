/**
 * ══════════════════════════════════════════════════════════════════════════
 * tienda.vendemias.com y agenda.vendemias.com · dos hosts, mismas rutas
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   · En cualquiera de los dos: /<negocio>/… se reescribe a /pide/<negocio>/…
 *     (el cliente ve la dirección corta). Los dos sirven la misma página; cuál
 *     se le da a cada negocio lo decide el panel (baseDe, dominio/config.ts).
 *     La raíz y todo lo que no sea una página de negocio va al dominio
 *     principal: el panel no se sirve bajo estos hosts.
 *   · En el dominio principal: /pide/… redirige a tienda.* (308). Aquí no se
 *     sabe el modo del negocio, y el otro host abre lo mismo.
 *
 * Solo actúa si NEXT_PUBLIC_TIENDA_URL / NEXT_PUBLIC_AGENDA_URL son hosts
 * propios. En local, o en los previews de Vercel, todo se sirve en
 * /pide/<negocio> sin traducir nada.
 *
 * Devuelve null cuando la petición no es asunto suyo, para que el middleware
 * pruebe el siguiente (Fideliza).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { SLUG } from '@/modules/pide/dominio/config';

const ESTATICOS = /^\/(_next\/|favicon|icon|apple-icon|robots\.txt$)/;
const API_PUBLICA = /^\/api\/pide\/publico\//;

const hostDe = (url: string | undefined) => {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

export function hostsPide(req: NextRequest): NextResponse | null {
  const tienda = process.env.NEXT_PUBLIC_TIENDA_URL;
  const propios = [hostDe(tienda), hostDe(process.env.NEXT_PUBLIC_AGENDA_URL)].filter((h): h is string => Boolean(h));
  if (!propios.length) return null;
  const host = req.headers.get('host') ?? '';
  const ruta = req.nextUrl.pathname;
  const local = (h: string) => /^(localhost|127\.0\.0\.1)(:|$)/.test(h);
  const principal = process.env.NEXT_PUBLIC_SITE_URL || 'https://vendemias.com';

  if (propios.includes(host)) {
    if (ESTATICOS.test(ruta) || API_PUBLICA.test(ruta)) return NextResponse.next();
    const negocio = ruta.split('/')[1] ?? '';
    if (!SLUG.test(negocio)) return NextResponse.redirect(new URL('/', principal), 308);
    const destino = req.nextUrl.clone();
    destino.pathname = `/pide${ruta}`;
    return NextResponse.rewrite(destino);
  }

  const hostTienda = hostDe(tienda);
  if (!tienda || !hostTienda) return null;
  if (local(host) || local(hostTienda) || host.endsWith('.vercel.app')) return null;
  if (ruta === '/pide' || ruta.startsWith('/pide/')) {
    return NextResponse.redirect(new URL((ruta.slice('/pide'.length) || '/') + req.nextUrl.search, tienda), 308);
  }
  return null;
}
