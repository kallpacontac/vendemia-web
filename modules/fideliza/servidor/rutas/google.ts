/**
 * «Guardar con Google» y «Recuperar con Google» (ver servidor/google.ts y sql/0028).
 *
 *   POST /api/fideliza/publico/google  { accion: 'guardar', token }  → { url } de Google
 *        (el enlace de la tarjeta va en el CUERPO y en la cookie cifrada, nunca en una URL)
 *   GET  /api/fideliza/publico/google?ir=recuperar&slug=<negocio>   → a Google
 *   GET  /api/fideliza/publico/google?code&state                    → la vuelta:
 *        guardar   → /m/<token>?google=ok
 *        recuperar → /m/<enlace nuevo>?google=recuperada, o al alta con ?google=sin
 */
import 'server-only';
import { z } from 'zod';
import { pagina } from '@/modules/fideliza/servidor/html';
import { cuerpo as leerCuerpo, fallo, huellaIp, limitar, log, NO_CACHE, ok } from '@/modules/fideliza/servidor/http';
import { rpc, servidor } from '@/modules/fideliza/servidor/supabase';
import { borrarCookie, configGoogleTarjeta, cookieDe, huellaDeCodigo, leerIda, nuevaIda, urlAutorizar } from '@/modules/fideliza/servidor/google';

const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const TOKEN = /^[A-Za-z0-9_-]{30,64}$/;

const Guardar = z.object({ accion: z.literal('guardar'), token: z.string().regex(TOKEN) });

function ir(destino: string, cookie: string, status = 302) {
  return new Response(null, {
    status,
    headers: { Location: destino, 'Set-Cookie': cookie, ...NO_CACHE, 'Referrer-Policy': 'no-referrer' },
  });
}

function aviso(texto: string, status = 400) {
  const r = pagina({
    titulo: 'Tu tarjeta',
    status,
    cuerpo: `<div class="caja"><p class="premio">${texto}</p><p class="nota">Vuelve a abrir tu tarjeta e inténtalo otra vez. Si sigue sin funcionar, pide ayuda en el local.</p></div>`,
  });
  r.headers.append('Set-Cookie', borrarCookie());
  return r;
}

export async function POST(req: Request) {
  try {
    if (!configGoogleTarjeta().listo) return fallo('google_off', 503);
    if (!(await limitar(`ip:${huellaIp(req)}:google`, 20, 600))) return fallo('rate_limited', 429);
    const d = Guardar.safeParse(await leerCuerpo(req, 1000));
    if (!d.success) return fallo('invalid_input');
    // La tarjeta tiene que existir antes de mandar a nadie a Google.
    const t = await rpc<{ status: string }>(servidor(), 'loyalty_srv_tarjeta_extras', { p_card_token: d.data.token });
    if (t.status !== 'ok') return fallo('not_found', 404);
    const ida = nuevaIda('guardar', { t: d.data.token });
    const r = ok({ url: urlAutorizar(ida.n) });
    r.headers.append('Set-Cookie', cookieDe(ida));
    return r;
  } catch (e) {
    log('google_ida_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
    return fallo('unavailable', 503);
  }
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (!configGoogleTarjeta().listo) return aviso('Esta opción no está disponible ahora.', 503);
  if (!(await limitar(`ip:${huellaIp(req)}:google`, 20, 600))) return aviso('Demasiados intentos. Espera unos minutos.', 429);

  // La ida para recuperar: no lleva nada secreto.
  if (q.get('ir') === 'recuperar') {
    const slug = (q.get('slug') ?? '').toLowerCase();
    if (!SLUG.test(slug)) return aviso('Ese enlace no es válido.', 404);
    const ida = nuevaIda('recuperar', { s: slug });
    return ir(urlAutorizar(ida.n), cookieDe(ida));
  }

  // La vuelta de Google.
  const ida = leerIda(req.headers.get('cookie'), q.get('state'));
  if (!ida) return aviso('Se cortó la conexión con Google.');
  const volver = ida.m === 'guardar' ? `/m/${ida.t}` : `/n/${ida.s}/unirse`;
  if (q.get('error') || !q.get('code')) return ir(`${volver}?google=cancelado`, borrarCookie());
  try {
    const h = await huellaDeCodigo(q.get('code')!);
    if (ida.m === 'guardar' && ida.t && TOKEN.test(ida.t)) {
      const r = await rpc<{ status: string }>(servidor(), 'loyalty_srv_google_vincular', { p_card_token: ida.t, p_huella: h });
      return ir(`${volver}?google=${r.status === 'ok' ? 'ok' : 'error'}`, borrarCookie(), 303);
    }
    if (ida.m === 'recuperar' && ida.s && SLUG.test(ida.s)) {
      const r = await rpc<{ status: string; card_token?: string }>(servidor(), 'loyalty_srv_google_recuperar', { p_slug: ida.s, p_huella: h });
      if (r.status === 'ok' && r.card_token) return ir(`/m/${r.card_token}?google=recuperada`, borrarCookie(), 303);
      return ir(`${volver}?google=sin`, borrarCookie(), 303);
    }
    return aviso('Ese enlace no es válido.');
  } catch (e) {
    log('google_vuelta_error', { modo: ida.m, mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
    return ir(`${volver}?google=error`, borrarCookie(), 303);
  }
}
