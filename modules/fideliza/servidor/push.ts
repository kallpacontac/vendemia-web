import 'server-only';
import webpush from 'web-push';
import { entorno, FaltaConfiguracion } from './entorno';

/**
 * Web Push con VAPID. La clave privada solo existe aquí. Sin claves, no se
 * finge nada: el worker deja el trabajo en `dead` con «No configurado».
 */
export interface Suscripcion {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface ResultadoPush {
  aceptados: number;
  caducados: string[];
  error: string | null;
}

let configurado = false;

export function pushConfigurado() {
  return Boolean(entorno.vapidPublica() && entorno.vapidPrivada());
}

export async function enviarPush(subs: Suscripcion[], mensaje: Record<string, unknown>): Promise<ResultadoPush> {
  if (!pushConfigurado()) throw new FaltaConfiguracion('WEB_PUSH_VAPID_PUBLIC_KEY / WEB_PUSH_VAPID_PRIVATE_KEY');
  if (!configurado) {
    webpush.setVapidDetails(entorno.vapidSujeto(), entorno.vapidPublica(), entorno.vapidPrivada());
    configurado = true;
  }
  const r: ResultadoPush = { aceptados: 0, caducados: [], error: null };
  const cuerpo = JSON.stringify(mensaje);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpo, {
          TTL: 60 * 60 * 12,
          timeout: 10_000,
        });
        r.aceptados++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 404/410: el navegador ya no existe o quitó el permiso. Se da de baja.
        if (status === 404 || status === 410) r.caducados.push(s.endpoint);
        else r.error = `HTTP ${status ?? '?'}`;
      }
    }),
  );
  return r;
}
