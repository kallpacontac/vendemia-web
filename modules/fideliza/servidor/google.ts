/**
 * ══════════════════════════════════════════════════════════════════════════
 * «GUARDAR CON GOOGLE» · la tarjeta del cliente (sql/0028)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 26-nov-2026 (Alvaro): que el cliente pueda recuperar su tarjeta en otro celular sin ir al local,
 * sin cuentas del panel y sin guardar sus datos de Google.
 *
 *   · Pide SOLO `openid`: Google devuelve un identificador opaco (`sub`), sin nombre, correo ni foto.
 *   · Se guarda su HUELLA (sha256 con prefijo), nunca el `sub`. El cliente NO es usuario de Supabase
 *     ni del panel: no hay sesión ni forma de entrar al panel por aquí.
 *   · El estado de la ida (qué tarjeta o qué negocio) va en una cookie cifrada, solo para esta
 *     ruta y 10 minutos. El enlace de la tarjeta nunca viaja a Google.
 *   · Mismo cliente OAuth que Google Calendar (GOOGLE_OAUTH_CLIENT_ID/SECRET). En Google Cloud hay
 *     que añadir el URI de redirección `${FIDELIZA_URL}/api/fideliza/publico/google`.
 */
import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { FIDELIZA_URL } from '@/modules/fideliza/dominio/config';

export function configGoogleTarjeta() {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID ?? '';
  const secreto = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '';
  return { id, secreto, listo: Boolean(id && secreto), vuelta: `${FIDELIZA_URL}/api/fideliza/publico/google` };
}

export const COOKIE = 'fz_g';
export const RUTA_COOKIE = '/api/fideliza/publico/google';
const DURA_MS = 10 * 60_000;

/** Lo que se recuerda entre la ida y la vuelta. `t`: enlace de la tarjeta (guardar); `s`: negocio (recuperar). */
export interface Ida {
  m: 'guardar' | 'recuperar';
  t?: string;
  s?: string;
  n: string; // el «state» que viaja a Google
  e: number; // caduca (ms)
}

const clave = () => createHash('sha256').update(`vendemia:fz-google:${configGoogleTarjeta().secreto}`).digest();

export function nuevaIda(m: Ida['m'], datos: { t?: string; s?: string }): Ida {
  return { m, ...datos, n: randomBytes(18).toString('base64url'), e: Date.now() + DURA_MS };
}

export function cookieDe(ida: Ida): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', clave(), iv);
  const datos = Buffer.concat([c.update(JSON.stringify(ida), 'utf8'), c.final()]);
  const valor = [iv.toString('base64url'), c.getAuthTag().toString('base64url'), datos.toString('base64url')].join('.');
  const segura = FIDELIZA_URL.startsWith('https://') ? '; Secure' : '';
  return `${COOKIE}=${valor}; Path=${RUTA_COOKIE}; HttpOnly; SameSite=Lax; Max-Age=${DURA_MS / 1000}${segura}`;
}

export const borrarCookie = () => `${COOKIE}=; Path=${RUTA_COOKIE}; HttpOnly; SameSite=Lax; Max-Age=0`;

/** La ida guardada en la cookie, si es válida, no caducó y su «state» coincide. */
export function leerIda(cabeceraCookie: string | null, state: string | null): Ida | null {
  const valor = (cabeceraCookie ?? '')
    .split(/;\s*/)
    .find((x) => x.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!valor || !state) return null;
  try {
    const [iv, tag, datos] = valor.split('.');
    const d = createDecipheriv('aes-256-gcm', clave(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    const ida = JSON.parse(Buffer.concat([d.update(Buffer.from(datos, 'base64url')), d.final()]).toString('utf8')) as Ida;
    const a = Buffer.from(ida.n ?? '');
    const b = Buffer.from(state);
    if (a.length !== b.length || !timingSafeEqual(a, b) || !(ida.e > Date.now())) return null;
    return ida;
  } catch {
    return null;
  }
}

export function urlAutorizar(state: string): string {
  const g = configGoogleTarjeta();
  const q = new URLSearchParams({
    client_id: g.id,
    redirect_uri: g.vuelta,
    response_type: 'code',
    scope: 'openid',
    prompt: 'select_account',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/**
 * Canjea el código y devuelve la HUELLA del `sub`. El id_token llega directo de Google por TLS
 * (flujo de servidor), así que basta con comprobar a quién va dirigido, quién lo emite y que no caducó.
 */
export async function huellaDeCodigo(codigo: string): Promise<string> {
  const g = configGoogleTarjeta();
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: codigo, client_id: g.id, client_secret: g.secreto, redirect_uri: g.vuelta, grant_type: 'authorization_code' }),
  });
  const j = (await r.json().catch(() => ({}))) as { id_token?: string; error?: string };
  if (!r.ok || !j.id_token) throw new Error(`google:canje:${j.error ?? r.status}`);
  const p = JSON.parse(Buffer.from(j.id_token.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
    sub?: string;
    aud?: string;
    iss?: string;
    exp?: number;
  };
  if (!p.sub || p.aud !== g.id || !['https://accounts.google.com', 'accounts.google.com'].includes(p.iss ?? '') || !(Number(p.exp) * 1000 > Date.now())) {
    throw new Error('google:id_token');
  }
  return huella(p.sub);
}

/** sha256 con prefijo del identificador de Google: lo único que se guarda (sql/0028). */
export const huella = (sub: string) => createHash('sha256').update(`vendemia:fideliza:google:${sub}`).digest('hex');
