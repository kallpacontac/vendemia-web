import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';
import { FIDELIZA_URL } from '../../dominio/config';
import { leerDatosArte, type ArteWallet } from '../../dominio/wallet-arte';
import { entorno, FaltaConfiguracion } from '../entorno';

const firma = (datos: string) => {
  const clave = entorno.claveServidor();
  if (clave.length < 32) throw new FaltaConfiguracion('FIDELIZA_SERVER_KEY');
  return createHmac('sha256', clave).update(`fideliza-wallet-arte:v1:${datos}`).digest('base64url');
};

/** Imagen pública del pase: color, plantilla, regla, meta, icono y cuántos sellos van; nunca quién es el cliente. */
export function urlArteWallet(arte: ArteWallet): string {
  const datos = Buffer.from(JSON.stringify(arte)).toString('base64url');
  const u = new URL('/api/fideliza/publico/wallet-arte', FIDELIZA_URL);
  u.searchParams.set('d', datos);
  u.searchParams.set('s', firma(datos));
  return u.toString();
}

export function leerArteWallet(datos: string | null, sello: string | null): ArteWallet | null {
  if (!datos || !sello || datos.length > 512 || !/^[A-Za-z0-9_-]+$/.test(datos) || !/^[A-Za-z0-9_-]{43}$/.test(sello)) return null;
  const esperado = firma(datos);
  if (!timingSafeEqual(Buffer.from(sello), Buffer.from(esperado))) return null;
  try {
    const bruto = Buffer.from(datos, 'base64url');
    if (bruto.toString('base64url') !== datos) return null;
    const arte: unknown = JSON.parse(bruto.toString('utf8'));
    return leerDatosArte(arte);
  } catch {
    return null;
  }
}
