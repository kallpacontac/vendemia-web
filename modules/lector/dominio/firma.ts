import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * La firma de Vendemia Caja (vendemia-caja/app/.../Envio.kt): `X-Vendemia-Firma` = HMAC-SHA256 en
 * hexadecimal de `<X-Vendemia-Fecha>.<cuerpo>` con la clave del celular. La fecha (ms) no puede
 * estar a más de 10 minutos de la nuestra: una petición copiada no se puede repetir mañana. Lo que
 * sí se puede repetir dentro de esos 10 minutos lo para la base (cada aviso se guarda una vez).
 */
export const MARGEN_MS = 10 * 60_000;

export function firmar(clave: string, fecha: string, cuerpo: string): string {
  return createHmac('sha256', clave).update(`${fecha}.${cuerpo}`).digest('hex');
}

export type Comprobacion = 'ok' | 'sin_firma' | 'fecha' | 'firma';

export function comprobar(clave: string, fecha: string | null, firma: string | null, cuerpo: string, ahora = Date.now()): Comprobacion {
  if (!fecha || !firma || !/^[0-9a-f]{64}$/i.test(firma)) return 'sin_firma';
  const ms = Number(fecha);
  if (!/^\d{10,16}$/.test(fecha) || Math.abs(ahora - ms) > MARGEN_MS) return 'fecha';
  const esperada = Buffer.from(firmar(clave, fecha, cuerpo), 'hex');
  const dada = Buffer.from(firma.toLowerCase(), 'hex');
  return dada.length === esperada.length && timingSafeEqual(dada, esperada) ? 'ok' : 'firma';
}

/** Un uuid como los que genera la app (java.util.UUID). */
export const esUuid = (s: unknown): s is string =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
