import 'server-only';
import { createSign } from 'crypto';
import { credenciales } from './credenciales';

/**
 * Google Wallet REST, sin SDK: OAuth con JWT RS256 firmado con `crypto` de Node
 * (el runtime de estas rutas es nodejs, nunca edge) y fetch a walletobjects.
 */
const API = 'https://walletobjects.googleapis.com/walletobjects/v1';
const SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer';

const b64url = (x: Buffer | string) => Buffer.from(x).toString('base64url');

export function firmarJwt(payload: Record<string, unknown>): string {
  const c = credenciales();
  const header = { alg: 'RS256', typ: 'JWT', ...(c.keyId ? { kid: c.keyId } : {}) };
  const datos = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const firma = createSign('RSA-SHA256').update(datos).sign(c.clave);
  return `${datos}.${b64url(firma)}`;
}

let token: { valor: string; caduca: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && token.caduca > Date.now() + 60_000) return token.valor;
  const c = credenciales();
  const ahora = Math.floor(Date.now() / 1000);
  const assertion = firmarJwt({
    iss: c.clientEmail,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: ahora,
    exp: ahora + 3600,
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new ErrorWallet(r.status, 'oauth', await textoError(r));
  const j = (await r.json()) as { access_token: string; expires_in: number };
  token = { valor: j.access_token, caduca: Date.now() + j.expires_in * 1000 };
  return token.valor;
}

/**
 * Un error de Google, ya clasificado. `permanente` = reintentar no lo arregla
 * (credenciales, permisos, datos rechazados) y el outbox lo manda a `dead`.
 */
export class ErrorWallet extends Error {
  permanente: boolean;
  constructor(
    public status: number,
    public operacion: string,
    detalle: string,
  ) {
    super(`Google Wallet ${operacion}: HTTP ${status} ${detalle}`.slice(0, 400));
    this.permanente = status === 400 || status === 401 || status === 403;
  }
}

/** Solo el `message` del error de Google, recortado y sin direcciones de correo. */
async function textoError(r: Response): Promise<string> {
  try {
    const j = (await r.json()) as { error?: { message?: string; status?: string } | string; error_description?: string };
    const m = typeof j.error === 'string' ? `${j.error} ${j.error_description ?? ''}` : `${j.error?.status ?? ''} ${j.error?.message ?? ''}`;
    return m.replace(/[\w.+-]+@[\w.-]+/g, '<correo>').trim().slice(0, 240);
  } catch {
    return '';
  }
}

async function llamar(metodo: string, ruta: string, cuerpo?: unknown): Promise<{ status: number; datos: unknown }> {
  const r = await fetch(`${API}/${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(15_000),
  });
  if (r.status === 404 || r.status === 409) return { status: r.status, datos: null };
  if (!r.ok) throw new ErrorWallet(r.status, `${metodo} ${ruta.split('/')[0]}`, await textoError(r));
  return { status: r.status, datos: await r.json() };
}

type Recurso = 'loyaltyClass' | 'loyaltyObject';

/**
 * Crear o actualizar SIN duplicar: PATCH primero; si no existe, INSERT; si el
 * INSERT choca (otro proceso lo creó entre medias), PATCH otra vez. El id lo
 * ponemos nosotros y es estable, así que un reintento cae siempre en el mismo.
 */
export async function upsert(recurso: Recurso, id: string, cuerpo: Record<string, unknown>, alInsertar: Record<string, unknown> = {}) {
  const ruta = `${recurso}/${encodeURIComponent(id)}`;
  const p = await llamar('PATCH', ruta, cuerpo);
  if (p.status !== 404) return { creado: false, datos: p.datos as Record<string, unknown> };
  const i = await llamar('POST', recurso, { ...cuerpo, ...alInsertar, id });
  if (i.status === 409) {
    const p2 = await llamar('PATCH', ruta, cuerpo);
    return { creado: false, datos: p2.datos as Record<string, unknown> };
  }
  return { creado: true, datos: i.datos as Record<string, unknown> };
}

/** El enlace del botón «Agregar a Google Wallet». Solo referencia el objeto (JWT corto). */
export function enlaceGuardar(objectId: string, origen: string): string {
  const c = credenciales();
  const jwt = firmarJwt({
    iss: c.clientEmail,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(Date.now() / 1000),
    origins: [origen],
    payload: { loyaltyObjects: [{ id: objectId }] },
  });
  return `https://pay.google.com/gp/v/save/${jwt}`;
}
