/**
 * ══════════════════════════════════════════════════════════════════════════
 * A DÓNDE IBA · el panel recuerda la pantalla que pediste antes del login
 * ══════════════════════════════════════════════════════════════════════════
 *
 * El caso que lo motiva: el dueño acerca el móvil a una placa nueva, pulsa
 * «Activar mi placa» y llega a /panel/fideliza/placas?activar=1#codigo=…
 * sin sesión. La guardia lo manda al login (o a Google, o a confirmar el
 * correo) y, sin esto, al volver acababa en /panel a secas: perdía el
 * «activar» y el código.
 *
 * Va en localStorage y no en `?next=` porque el viaje puede pasar por Google y
 * por el enlace del correo de confirmación, y cada `redirectTo` distinto
 * tendría que estar en la lista blanca de Supabase. Mismo navegador siempre
 * (el flujo PKCE ya lo exige), así que localStorage llega.
 *
 * Solo se aceptan rutas del panel: nada de `//otro-sitio` ni URLs absolutas,
 * que convertirían esto en un redirector abierto.
 */
const CLAVE = 'vendemia_destino';
/** Pasado este tiempo, el destino ya no es «lo que acabas de pedir». */
const VIGENCIA_MS = 60 * 60 * 1000;

const valido = (ruta: string) => /^\/panel(?:[/?#]|$)/.test(ruta) && !ruta.startsWith('//') && !/[\\\s]/.test(ruta);

export function guardarDestino(ruta: string) {
  if (!valido(ruta) || ruta === '/panel') return;
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ ruta, en: Date.now() }));
  } catch {
    /* sin almacenamiento: se vuelve a /panel, como antes */
  }
}

/** Mira el destino guardado sin borrarlo (para adaptar el texto del login). */
export function verDestino(): string | null {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const { ruta, en } = JSON.parse(crudo) as { ruta?: string; en?: number };
    return typeof ruta === 'string' && valido(ruta) && en && Date.now() - en <= VIGENCIA_MS ? ruta : null;
  } catch {
    return null;
  }
}

/** Devuelve el destino guardado (y lo borra), o null. */
export function tomarDestino(): string | null {
  try {
    const crudo = localStorage.getItem(CLAVE);
    localStorage.removeItem(CLAVE);
    if (!crudo) return null;
    const { ruta, en } = JSON.parse(crudo) as { ruta?: string; en?: number };
    if (typeof ruta !== 'string' || !valido(ruta) || !en || Date.now() - en > VIGENCIA_MS) return null;
    return ruta;
  } catch {
    return null;
  }
}

/** La ruta actual completa, con búsqueda y fragmento (el código va en el fragmento). */
export function rutaActual() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}
