/**
 * El middleware del sitio. Separa los hosts públicos del dominio principal:
 *   · tienda.vendemias.com y agenda.vendemias.com → modules/pide/servidor/hosts.ts
 *   · fideliza.vendemias.com → modules/fideliza/servidor/hosts.ts
 * Cada uno devuelve su respuesta o deja pasar al siguiente.
 */
import type { NextRequest } from 'next/server';
import { hostsFideliza } from '@/modules/fideliza/servidor/hosts';
import { hostsPide } from '@/modules/pide/servidor/hosts';

export function middleware(req: NextRequest) {
  return hostsPide(req) ?? hostsFideliza(req);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
