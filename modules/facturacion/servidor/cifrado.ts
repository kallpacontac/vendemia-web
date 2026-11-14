import 'server-only';
/**
 * El token de cada proveedor se guarda cifrado (AES-256-GCM). Con él se emiten
 * comprobantes a nombre del local: no puede quedar en claro en la base.
 *
 * La clave sale de FACTURACION_CLAVE (≥ 32 caracteres) si está puesta; si no,
 * de FIDELIZA_SERVER_KEY, que producción ya tiene. Cada texto cifrado lleva la
 * marca de con cuál se cifró ('f' o 's'), así que poner FACTURACION_CLAVE más
 * adelante no rompe los tokens ya guardados (se re-cifran al volver a guardarlos).
 *
 * ⚠️ Rotar la variable que se usó deja esos tokens ilegibles: habría que volver a
 * pegarlos en Ajustes.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

type Id = 'f' | 's';

function clave(id: Id): Buffer | null {
  const v = (process.env[id === 'f' ? 'FACTURACION_CLAVE' : 'FIDELIZA_SERVER_KEY'] ?? '').trim();
  return v.length >= 32 ? createHash('sha256').update(`vendemia-facturacion:${v}`).digest() : null;
}

export class SinClaveDeCifrado extends Error {
  constructor() {
    super('Falta FACTURACION_CLAVE (o FIDELIZA_SERVER_KEY) en el servidor para guardar tokens.');
  }
}

export function cifrar(texto: string): string {
  const id: Id = clave('f') ? 'f' : 's';
  const k = clave(id);
  if (!k) throw new SinClaveDeCifrado();
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k, iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', id, iv.toString('base64'), c.getAuthTag().toString('base64'), datos.toString('base64')].join(':');
}

export function descifrar(guardado: string): string {
  const [v, id, iv, tag, datos] = guardado.split(':');
  if (v !== 'v1' || (id !== 'f' && id !== 's') || !iv || !tag || !datos) throw new Error('Token guardado con un formato desconocido.');
  const k = clave(id);
  if (!k) throw new SinClaveDeCifrado();
  const d = createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(datos, 'base64')), d.final()]).toString('utf8');
}
