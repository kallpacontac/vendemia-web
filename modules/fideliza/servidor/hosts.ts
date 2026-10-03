/**
 * ══════════════════════════════════════════════════════════════════════════
 * DOS HOSTS, UN PROYECTO
 * ══════════════════════════════════════════════════════════════════════════
 *
 * vendemias.com y fideliza.vendemias.com apuntan al mismo despliegue.
 *
 *   · En fideliza.* solo existen las rutas públicas de Fideliza (/t, /n, /m,
 *     su API pública y estáticos). Todo lo demás —el panel, el login, la
 *     landing— se manda al dominio principal: el panel no se sirve bajo el
 *     host de las placas.
 *   · En el dominio principal, /t /n /m redirigen a fideliza.* (308 para las
 *     páginas; las placas usan fideliza.* desde el primer día).
 *
 * Solo actúa si NEXT_PUBLIC_FIDELIZA_URL es otro host que el de la petición:
 * en local (todo en localhost:3000) no hace nada.
 */
import { NextResponse, type NextRequest } from 'next/server';

const PUBLICAS = /^\/(t|n|m)\/|^\/api\/fideliza\/(publico|cron)\/|^\/_next\/|^\/wallet\/|^\/favicon|^\/icon|^\/apple-icon|^\/robots\.txt$/;

export function hostsFideliza(req: NextRequest) {
  const fz = process.env.NEXT_PUBLIC_FIDELIZA_URL;
  if (!fz) return NextResponse.next();
  let hostFz: string;
  try {
    hostFz = new URL(fz).host;
  } catch {
    return NextResponse.next();
  }
  const host = req.headers.get('host') ?? '';
  const ruta = req.nextUrl.pathname;
  const local = (h: string) => /^(localhost|127\.0\.0\.1)(:|$)/.test(h);

  if (host === hostFz) {
    if (PUBLICAS.test(ruta)) return NextResponse.next();
    const principal = process.env.NEXT_PUBLIC_SITE_URL || 'https://vendemias.com';
    return NextResponse.redirect(new URL(ruta + req.nextUrl.search, principal), 308);
  }
  // En local, o con previews de Vercel, cada host sirve todo.
  if (local(host) || local(hostFz) || host.endsWith('.vercel.app')) return NextResponse.next();
  if (/^\/(t|n|m)\//.test(ruta)) {
    // 307 para /t: es la placa y su destino cambia; 308 para lo demás.
    return NextResponse.redirect(new URL(ruta + req.nextUrl.search, fz), ruta.startsWith('/t/') ? 307 : 308);
  }
  return NextResponse.next();
}
