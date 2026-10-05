import 'server-only';
import { createHash, randomUUID } from 'crypto';
import { codigoDe, mensajeDe } from '../dominio/errores';
import { FaltaConfiguracion, entorno } from './entorno';
import { ErrorRpc, rpc, servidor } from './supabase';

/**
 * Respuestas y errores de las rutas de Fideliza.
 *
 * Al cliente nunca le llega un stack ni un mensaje crudo de Postgres: un código
 * (`codigo`) y una frase. Al log, una línea JSON con ids técnicos y sin datos
 * personales — ni teléfonos, ni tokens, ni JWT.
 */
export const NO_CACHE = { 'Cache-Control': 'private, no-store, max-age=0' };

export function ok(datos: unknown, status = 200) {
  return Response.json(datos, { status, headers: NO_CACHE });
}

export function fallo(codigo: string, status = 400, extra?: Record<string, unknown>) {
  return Response.json({ codigo, error: mensajeDe(codigo), ...extra }, { status, headers: NO_CACHE });
}

export function log(evento: string, datos: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ app: 'fideliza', evento, at: new Date().toISOString(), ...datos }));
}

/** Traduce cualquier excepción a una respuesta segura. */
export function desdeError(e: unknown, ruta: string) {
  if (e instanceof FaltaConfiguracion) {
    log('config_missing', { ruta, variable: e.variable });
    return fallo(
      e.variable === 'FIDELIZA_SERVER_KEY' ? 'server_key' : e.variable === 'GOOGLE_PLACES_API_KEY' ? 'places_not_configured' : 'wallet_not_configured',
      503,
    );
  }
  const mensaje = e instanceof Error ? e.message : String(e);
  const codigo = codigoDe(mensaje);
  if (codigo) {
    const status = ['forbidden', 'forbidden_location', 'forbidden_demo_class'].includes(codigo)
      ? 403
      : codigo === 'server_key'
        ? 503
        : codigo.endsWith('not_found')
          ? 404
          : 409;
    return fallo(codigo, status);
  }
  if (e instanceof ErrorRpc && e.code === 'PGRST301') return fallo('unauthenticated', 401);
  const ref = randomUUID().slice(0, 8);
  log('error', { ruta, ref, code: e instanceof ErrorRpc ? e.code : undefined, mensaje: mensaje.slice(0, 300) });
  return Response.json(
    { codigo: 'internal', error: `No se pudo completar. Referencia ${ref}.` },
    { status: 500, headers: NO_CACHE },
  );
}

/** La IP no se guarda: solo su hash con sal, para los límites. */
export function huellaIp(req: Request): string {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
  return createHash('sha256').update(`${entorno.salIp()}|${ip}`).digest('base64url').slice(0, 22);
}

/**
 * Límite por ventana fija, guardado en Postgres (no hay Redis). Si la base no
 * contesta, se deja pasar: un límite caído no debe tumbar la caja. Las RPC de
 * escritura siguen siendo idempotentes, que es lo que protege de verdad.
 */
export async function limitar(cubo: string, maximo: number, ventanaS: number): Promise<boolean> {
  try {
    return await rpc<boolean>(servidor(), 'loyalty_srv_rate_hit', {
      p_bucket: cubo,
      p_limit: maximo,
      p_window_s: ventanaS,
    });
  } catch (e) {
    if (e instanceof FaltaConfiguracion) throw e;
    log('rate_limit_unavailable', { cubo: cubo.split(':')[0] });
    return true;
  }
}

/** Cuerpo JSON con tope de tamaño. Un cuerpo enorme no llega a parsearse. */
export async function cuerpo(req: Request, maxBytes = 32_000): Promise<unknown> {
  const texto = await req.text();
  if (texto.length > maxBytes) throw new Error('loyalty:invalid_input');
  try {
    return texto ? JSON.parse(texto) : {};
  } catch {
    throw new Error('loyalty:invalid_input');
  }
}

export function jwtDe(req: Request): string | null {
  const j = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  return j && j.split('.').length === 3 ? j : null;
}

/** El `sub` del JWT, SOLO para nombrar cubos de límite. No es autenticación: eso lo hace Postgres. */
export function subDe(jwt: string): string {
  try {
    const p = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')) as { sub?: string };
    return (p.sub ?? 'anon').slice(0, 40);
  } catch {
    return 'anon';
  }
}
