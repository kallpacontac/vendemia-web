/**
 * ══════════════════════════════════════════════════════════════════════════
 * pide.vendemias.com · un host, mismas rutas del proyecto
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   · En pide.*: /<negocio>/… se reescribe a /pide/<negocio>/… (el cliente ve
 *     la dirección corta). La raíz y todo lo que no sea una página de negocio
 *     va al dominio principal: el panel no se sirve bajo este host.
 *   · En el dominio principal: /pide/… redirige a pide.* (308).
 *
 * Solo actúa si NEXT_PUBLIC_PIDE_URL es un host propio. En local, o en los
 * previews de Vercel, todo se sirve en /pide/<negocio> sin traducir nada.
 *
 * Devuelve null cuando la petición no es asunto suyo, para que el middleware
 * pruebe el siguiente (Fideliza).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { SLUG } from '@/modules/pide/dominio/config';

const ESTATICOS = /^\/(_next\/|favicon|icon|apple-icon|robots\.txt$)/;
const API_PUBLICA = /^\/api\/pide\/publico\//;

export function hostsPide(req: NextRequest): NextResponse | null {
  const pide = process.env.NEXT_PUBLIC_PIDE_URL;
  if (!pide) return null;
  let hostPide: string;
  try {
    hostPide = new URL(pide).host;
  } catch {
    return null;
  }
  const host = req.headers.get('host') ?? '';
  const ruta = req.nextUrl.pathname;
  const local = (h: string) => /^(localhost|127\.0\.0\.1)(:|$)/.test(h);
  const principal = process.env.NEXT_PUBLIC_SITE_URL || 'https://vendemias.com';

  if (host === hostPide) {
    if (ESTATICOS.test(ruta) || API_PUBLICA.test(ruta)) return NextResponse.next();
    const negocio = ruta.split('/')[1] ?? '';
    if (!SLUG.test(negocio)) return NextResponse.redirect(new URL('/', principal), 308);
    const destino = req.nextUrl.clone();
    destino.pathname = `/pide${ruta}`;
    return NextResponse.rewrite(destino);
  }

  if (local(host) || local(hostPide) || host.endsWith('.vercel.app')) return null;
  if (ruta === '/pide' || ruta.startsWith('/pide/')) {
    return NextResponse.redirect(new URL((ruta.slice('/pide'.length) || '/') + req.nextUrl.search, pide), 308);
  }
  return null;
}
