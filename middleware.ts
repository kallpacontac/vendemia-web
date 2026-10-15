/**
 * El middleware del sitio. Separa los hosts públicos del dominio principal:
 *   · tienda.vendemias.com y agenda.vendemias.com → modules/tu-pagina/servidor/hosts.ts
 *   · fideliza.vendemias.com → modules/fideliza/servidor/hosts.ts
 * Cada uno devuelve su respuesta o deja pasar al siguiente.
 */
import type { NextRequest } from 'next/server';
import { hostsFideliza } from '@/modules/fideliza/servidor/hosts';
import { hostsTuPagina } from '@/modules/tu-pagina/servidor/hosts';

export function middleware(req: NextRequest) {
  return hostsTuPagina(req) ?? hostsFideliza(req);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
