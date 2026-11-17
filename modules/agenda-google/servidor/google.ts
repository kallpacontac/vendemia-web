/**
 * ══════════════════════════════════════════════════════════════════════════
 * GOOGLE CALENDAR DEL NEGOCIO · como Calendly, sobre la agenda de Mi página
 * ══════════════════════════════════════════════════════════════════════════
 *
 * El dueño conecta su Google Calendar desde Configuración (un OAuth aparte del
 * «Entrar con Google»: ese solo da nombre y correo). Desde entonces:
 *   · las horas en que su Google Calendar dice «ocupado» no se ofrecen en su
 *     página (ocupadoDe → la agenda las trata como lleno, dominio/agenda.ts);
 *   · cada cita que entra por la página se crea en su calendario, con enlace de
 *     Google Meet si lo encendió (crearEvento).
 *
 * Nada de esto puede tumbar una reserva: si Google falla, se reserva igual con la
 * agenda de Vendemia y el fallo queda apuntado para el panel (gcal_srv_error).
 *
 * Variables (Vercel): GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET.
 * El token se guarda cifrado con una clave derivada del secreto: si se rota el
 * secreto, cada negocio tiene que volver a conectar.
 *
 * Las horas son texto local de Lima ('YYYY-MM-DD HH:MM'), como toda la agenda.
 * Perú no cambia de hora: siempre UTC−5.
 */
import 'server-only';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { unstable_cache } from 'next/cache';
import { rpc, servidor, log } from '@/modules/tu-pagina/servidor/supabase';
import type { Ocupado } from '@/modules/tu-pagina/dominio/agenda';

export const ALCANCES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
];

export function configGoogle() {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID ?? '';
  const secreto = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '';
  const sitio = (process.env.NEXT_PUBLIC_SITE_URL || 'https://vendemias.com').replace(/\/+$/, '');
  return { id, secreto, listo: Boolean(id && secreto), vuelta: `${sitio}/api/google-calendar/vuelta`, sitio };
}

const clave = (uso: string) => createHash('sha256').update(`vendemia:${uso}:${configGoogle().secreto}`).digest();

// ── El token, cifrado (AES-256-GCM) ─────────────────────────────────────────
export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', clave('gcal-token'), iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), datos.toString('base64url')].join('.');
}
export function descifrar(guardado: string): string {
  const [v, iv, tag, datos] = guardado.split('.');
  if (v !== 'v1' || !iv || !tag || !datos) throw new Error('gcal:token_invalido');
  const d = createDecipheriv('aes-256-gcm', clave('gcal-token'), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(datos, 'base64url')), d.final()]).toString('utf8');
}

// ── El «state» de la ida a Google: firmado, con caducidad ───────────────────
export interface Estado {
  c: string; // compañía
  u: string; // usuario (sub)
  e: number; // caduca (ms)
}
export function firmarEstado(e: Estado): string {
  const cuerpo = Buffer.from(JSON.stringify(e)).toString('base64url');
  return `${cuerpo}.${createHmac('sha256', clave('gcal-state')).update(cuerpo).digest('base64url')}`;
}
export function leerEstado(s: string): Estado | null {
  const [cuerpo, firma] = (s ?? '').split('.');
  if (!cuerpo || !firma) return null;
  const esperada = createHmac('sha256', clave('gcal-state')).update(cuerpo).digest();
  const dada = Buffer.from(firma, 'base64url');
  if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) return null;
  try {
    const e = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as Estado;
    return typeof e.c === 'string' && typeof e.u === 'string' && e.e > Date.now() ? e : null;
  } catch {
    return null;
  }
}

export function urlAutorizar(estado: string): string {
  const g = configGoogle();
  const q = new URLSearchParams({
    client_id: g.id,
    redirect_uri: g.vuelta,
    response_type: 'code',
    scope: ALCANCES.join(' '),
    access_type: 'offline',
    // Sin «consent» Google no vuelve a dar el token de renovación a quien ya autorizó.
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: estado,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

// ── Tokens ──────────────────────────────────────────────────────────────────
export async function canjearCodigo(codigo: string): Promise<{ renovacion: string; cuenta: string; alcances: string }> {
  const g = configGoogle();
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: codigo, client_id: g.id, client_secret: g.secreto, redirect_uri: g.vuelta, grant_type: 'authorization_code' }),
  });
  const j = (await r.json().catch(() => ({}))) as { refresh_token?: string; id_token?: string; scope?: string; error?: string };
  if (!r.ok || !j.refresh_token) throw new Error(`gcal:canje:${j.error ?? r.status}`);
  let cuenta = '';
  try {
    cuenta = (JSON.parse(Buffer.from((j.id_token ?? '').split('.')[1] ?? '', 'base64url').toString('utf8')) as { email?: string }).email ?? '';
  } catch {
    cuenta = '';
  }
  return { renovacion: j.refresh_token, cuenta, alcances: j.scope ?? '' };
}

/** Token de acceso a partir del de renovación. Se recuerda unos minutos por proceso. */
const accesos = new Map<string, { token: string; vence: number }>();
async function acceso(cifrado: string): Promise<string> {
  const c = accesos.get(cifrado);
  if (c && c.vence > Date.now() + 60_000) return c.token;
  const g = configGoogle();
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: descifrar(cifrado), client_id: g.id, client_secret: g.secreto, grant_type: 'refresh_token' }),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !j.access_token) throw new Error(`gcal:acceso:${j.error ?? r.status}`);
  accesos.set(cifrado, { token: j.access_token, vence: Date.now() + (j.expires_in ?? 3000) * 1000 });
  return j.access_token;
}

export async function revocar(cifrado: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(descifrar(cifrado))}`, { method: 'POST' }).catch(() => undefined);
}

// ── Horas de Lima ↔ Google ──────────────────────────────────────────────────
/** 'YYYY-MM-DD HH:MM' de Lima → RFC 3339 con su desfase. */
export const aGoogle = (local: string) => `${local.replace(' ', 'T')}:00-05:00`;
/** Un instante de Google → 'YYYY-MM-DD HH:MM' de Lima. */
export function deGoogle(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 5 * 3600_000);
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

// ── La conexión de un negocio, por el slug de su página ─────────────────────
interface Conexion {
  status: 'ok' | 'no';
  company_id?: string;
  token?: string;
  calendario?: string;
  con_meet?: boolean;
}
async function conexion(slug: string): Promise<Conexion | null> {
  if (!configGoogle().listo) return null;
  try {
    const c = await rpc<Conexion>(servidor(), 'gcal_srv_de', { p_slug: slug });
    return c.status === 'ok' && c.token ? c : null;
  } catch {
    // Sin sql/0028 todavía, o la base no responde: la agenda sigue sin Google.
    return null;
  }
}

async function apuntarError(company: string | undefined, e: unknown) {
  if (!company) return;
  const m = e instanceof Error ? e.message : String(e);
  const texto = /invalid_grant/.test(m)
    ? 'Google retiró el permiso (se revocó o caducó). Vuelve a conectar tu Google Calendar.'
    : /403|insufficient/i.test(m)
      ? 'Google no dejó usar tu calendario. Vuelve a conectar y acepta los permisos.'
      : 'Google Calendar no respondió. Lo reintentamos en la próxima cita.';
  await rpc(servidor(), 'gcal_srv_error', { p_company: company, p_error: texto }).catch(() => undefined);
}

/**
 * Lo ocupado en el Google Calendar del negocio entre dos días (Lima, inclusive).
 * Vacío si no conectó o si Google falla (entonces manda la agenda de Vendemia).
 */
export async function ocupadoDe(slug: string, desde: string, hasta: string): Promise<Ocupado[]> {
  const c = await conexion(slug);
  if (!c) return [];
  try {
    const r = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { authorization: `Bearer ${await acceso(c.token!)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ timeMin: aGoogle(`${desde} 00:00`), timeMax: aGoogle(`${hasta} 23:59`), timeZone: 'America/Lima', items: [{ id: c.calendario || 'primary' }] }),
      signal: AbortSignal.timeout(4000),
    });
    const j = (await r.json().catch(() => ({}))) as { calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }> };
    if (!r.ok) throw new Error(`gcal:freebusy:${r.status}`);
    const cal = j.calendars?.[c.calendario || 'primary'];
    if (cal?.errors?.length) throw new Error('gcal:freebusy:calendario');
    return (cal?.busy ?? []).map((b) => ({ inicio: deGoogle(b.start), fin: deGoogle(b.end), empleado: '', todo: true }));
  } catch (e) {
    log('gcal_ocupado_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
    await apuntarError(c.company_id, e);
    return [];
  }
}

/** Igual, cacheado 60 s por negocio para pintar páginas. Reservar vacía la etiqueta. */
export const ocupadoCacheado = (slug: string, desde: string, hasta: string) =>
  unstable_cache(() => ocupadoDe(slug, desde, hasta), ['gcal-ocupado', slug, desde, hasta], {
    tags: [`tu-pagina:${slug}`],
    revalidate: 60,
  })();

/**
 * La cita recién reservada, en el calendario del negocio. El id del evento sale
 * del código: un reintento de la misma reserva no la duplica (Google responde 409).
 * Devuelve el enlace de Meet si lo hay.
 */
export async function crearEvento(
  slug: string,
  cita: { codigo: string; inicio: string; fin: string; servicio: string; nombre: string; telefono: string; apartada: boolean },
): Promise<{ meet?: string } | null> {
  const c = await conexion(slug);
  if (!c) return null;
  const id = `vd${createHash('sha1').update(`${slug}:${cita.codigo}`).digest('hex')}`;
  const cuerpo: Record<string, unknown> = {
    id,
    summary: `${cita.servicio} · ${cita.nombre}`,
    description: [
      `Cliente: ${cita.nombre}`,
      `WhatsApp: +${cita.telefono.replace(/\D/g, '')} · https://wa.me/${cita.telefono.replace(/\D/g, '')}`,
      `Código: ${cita.codigo}`,
      cita.apartada ? 'Apartada: falta el adelanto.' : '',
      'Agendada desde tu página de Vendemia.',
    ].filter(Boolean).join('\n'),
    start: { dateTime: aGoogle(cita.inicio), timeZone: 'America/Lima' },
    end: { dateTime: aGoogle(cita.fin), timeZone: 'America/Lima' },
    status: cita.apartada ? 'tentative' : 'confirmed',
    source: { title: 'Vendemia', url: `https://agenda.vendemias.com/${slug}` },
  };
  if (c.con_meet) cuerpo.conferenceData = { createRequest: { requestId: id, conferenceSolutionKey: { type: 'hangoutsMeet' } } };
  try {
    const cal = encodeURIComponent(c.calendario || 'primary');
    const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${cal}/events?conferenceDataVersion=1`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await acceso(c.token!)}`, 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(5000),
    });
    if (r.status === 409) return {};
    const j = (await r.json().catch(() => ({}))) as { hangoutLink?: string };
    if (!r.ok) throw new Error(`gcal:evento:${r.status}`);
    await rpc(servidor(), 'gcal_srv_error', { p_company: c.company_id, p_error: null }).catch(() => undefined);
    return { meet: j.hangoutLink && /^https:\/\/meet\.google\.com\//.test(j.hangoutLink) ? j.hangoutLink : undefined };
  } catch (e) {
    log('gcal_evento_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
    await apuntarError(c.company_id, e);
    return null;
  }
}
