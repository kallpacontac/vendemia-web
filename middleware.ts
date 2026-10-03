/**
 * El middleware del sitio. Hoy solo lo usa Fideliza para separar
 * vendemias.com de fideliza.vendemias.com: ver modules/fideliza/servidor/hosts.ts.
 * Si otra parte del sitio necesita middleware, se encadena aquí.
 */
import type { NextRequest } from 'next/server';
import { hostsFideliza } from '@/modules/fideliza/servidor/hosts';

export function middleware(req: NextRequest) {
  return hostsFideliza(req);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
