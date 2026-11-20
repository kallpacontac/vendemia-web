/**
 * Lo que se le dice al service worker del panel (public/panel-sw.js) sobre el
 * modo sin conexión, y la marca de quién lo tiene encendido en este celular.
 */
import type { Session } from '@supabase/supabase-js';
import { esErrorDeRed } from './red';

/** '1' = esta persona (dueño o admin) tiene el modo sin conexión en este celular. */
export const claveActivo = (usuario: string) => `vm-sin-conexion:${usuario}`;

export function aviseAlWorker(mensaje: Record<string, unknown>) {
  try {
    void navigator.serviceWorker?.ready.then((reg) => reg.active?.postMessage(mensaje));
  } catch {
    /* sin service worker */
  }
}

/** Al salir de la cuenta: fuera las copias guardadas. Lo anotado sin subir se queda: es de esa persona. */
export function olvidarCopias() {
  aviseAlWorker({ tipo: 'vm-olvidar' });
}

/**
 * Sin red y con el token caducado, supabase-js no puede renovarlo y getSession()
 * da null aunque la sesión siga guardada y viva. Para quien usa la caja sin
 * conexión, eso no puede mandarle al login en pleno apagón: se usa la guardada
 * (sus lecturas salen de las copias del service worker, y nada se escribe sin
 * renovarla antes). Con la red de vuelta, supabase-js la renueva sola; si ya no
 * vale, cierra la sesión como siempre.
 */
export function sesionSinConexion(error: unknown, claveSesion: string): Session | null {
  const sinRed = (typeof navigator !== 'undefined' && navigator.onLine === false)
    || (error as { name?: string } | null)?.name === 'AuthRetryableFetchError'
    || esErrorDeRed(error);
  if (!sinRed) return null;
  try {
    const s = JSON.parse(localStorage.getItem(claveSesion) ?? 'null') as Session | null;
    const id = s?.user?.id;
    if (!id || !s.refresh_token) return null;
    return localStorage.getItem(claveActivo(id)) === '1' ? s : null;
  } catch {
    return null;
  }
}
