/**
 * Conectar y desconectar el Google Calendar del negocio (ver google.ts).
 *
 *   POST /api/google-calendar/conectar     { companyId } + sesión → { url } de Google
 *   GET  /api/google-calendar/vuelta       ?code&state → guarda el token y vuelve al panel
 *   POST /api/google-calendar/desconectar  { companyId } + sesión → revoca y borra
 *
 * Quién puede: dueño o administrador. Lo decide Postgres (gcal_panel →
 * tu_pagina_autorizar) con la sesión del usuario; aquí no hay una segunda regla.
 * La vuelta no trae sesión: confía en el «state», firmado al salir y con 10 min.
 */
import 'server-only';
import { z } from 'zod';
import { deUsuario, rpc, servidor } from '@/modules/fideliza/servidor/supabase';
import { huellaIp, jwtDe, limitar, log, subDe } from '@/modules/fideliza/servidor/http';
import { canjearCodigo, cifrar, configGoogle, firmarEstado, leerEstado, revocar, urlAutorizar } from './google';

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const Cuerpo = z.object({ companyId: z.string().min(1).max(80) });

/** Sesión válida y dueño/admin de esa compañía, o la respuesta de error. */
async function autorizar(req: Request): Promise<{ jwt: string; companyId: string } | Response> {
  const jwt = jwtDe(req);
  if (!jwt) return json({ error: 'Vuelve a entrar al panel.' }, 401);
  let companyId: string;
  try {
    companyId = Cuerpo.parse(await req.json()).companyId;
  } catch {
    return json({ error: 'Datos incompletos.' }, 400);
  }
  if (!(await limitar(`u:${subDe(jwt)}:gcal`, 20, 600))) return json({ error: 'Demasiados intentos. Espera unos minutos.' }, 429);
  try {
    await rpc(deUsuario(jwt), 'gcal_panel', { p_company: companyId });
  } catch (e) {
    const m = e instanceof Error ? e.message : '';
    if (/gcal_panel|schema cache|could not find/i.test(m)) return json({ error: 'Falta aplicar modules/tu-pagina/sql/0028_google_calendar.sql.' }, 503);
    return json({ error: 'Solo el dueño o el administrador del negocio puede conectar el calendario.' }, 403);
  }
  return { jwt, companyId };
}

export async function conectar(req: Request) {
  if (!configGoogle().listo) return json({ error: 'Falta configurar GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET.' }, 503);
  const a = await autorizar(req);
  if (a instanceof Response) return a;
  const estado = firmarEstado({ c: a.companyId, u: subDe(a.jwt), e: Date.now() + 10 * 60_000 });
  return json({ url: urlAutorizar(estado) });
}

export async function vuelta(req: Request) {
  const q = new URL(req.url).searchParams;
  const panel = (r: string) => Response.redirect(`${configGoogle().sitio}/panel/configuracion?google=${r}#google-calendar`, 302);
  if (!(await limitar(`ip:${huellaIp(req)}:gcal-vuelta`, 20, 600))) return panel('error');
  const e = leerEstado(q.get('state') ?? '');
  if (!e) return panel('caducado');
  if (q.get('error')) return panel('cancelado');
  const codigo = q.get('code');
  if (!codigo) return panel('error');
  try {
    const t = await canjearCodigo(codigo);
    // Sin el permiso del calendario (quitó la casilla en la pantalla de Google) no sirve de nada.
    if (!/calendar\.events/.test(t.alcances)) {
      await revocar(cifrar(t.renovacion));
      return panel('sin-permiso');
    }
    const usuario = /^[0-9a-f-]{36}$/i.test(e.u) ? e.u : null;
    const r = await rpc<{ status: string }>(servidor(), 'gcal_srv_guardar', { p_company: e.c, p_usuario: usuario, p_cuenta: t.cuenta, p_token: cifrar(t.renovacion) });
    return panel(r.status === 'ok' ? 'ok' : 'error');
  } catch (err) {
    log('gcal_vuelta_error', { mensaje: err instanceof Error ? err.message.slice(0, 120) : 'x' });
    return panel('error');
  }
}

export async function desconectar(req: Request) {
  const a = await autorizar(req);
  if (a instanceof Response) return a;
  try {
    const t = await rpc<{ status: string; token?: string }>(servidor(), 'gcal_srv_token', { p_company: a.companyId });
    if (t.status === 'ok' && t.token && configGoogle().listo) await revocar(t.token).catch(() => undefined);
    await rpc(servidor(), 'gcal_srv_borrar', { p_company: a.companyId });
    return json({ ok: true });
  } catch (err) {
    log('gcal_desconectar_error', { mensaje: err instanceof Error ? err.message.slice(0, 120) : 'x' });
    return json({ error: 'No se pudo desconectar. Inténtalo otra vez.' }, 503);
  }
}
