/**
 * ══════════════════════════════════════════════════════════════════════════
 * ¿HAY CONEXIÓN? · y si no, ¿de cuándo es lo que se ve?
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `navigator.onLine` no basta: con el wifi del local encendido y la fibra
 * cortada dice «en línea» y cada consulta se cuelga. Así que se juntan tres
 * señales:
 *
 *   · el navegador (online / offline);
 *   · el service worker (public/panel-sw.js), que dice cuándo tuvo que
 *     entregar una copia guardada y de qué hora era;
 *   · los fallos de red de verdad, que apunta quien los ve (`marcarSinRed`).
 *
 * Una respuesta buena del servidor lo devuelve todo a «en línea».
 */

export interface EstadoRed {
  enLinea: boolean;
  /** Lo que se ve viene de una copia de esta hora (ms). null = es de ahora. */
  copiaDesde: number | null;
}

let estado: EstadoRed = {
  enLinea: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  copiaDesde: null,
};
const oyentes = new Set<(e: EstadoRed) => void>();

function poner(nuevo: EstadoRed) {
  if (nuevo.enLinea === estado.enLinea && nuevo.copiaDesde === estado.copiaDesde) return;
  estado = nuevo;
  oyentes.forEach((f) => f(estado));
}

export const estadoRed = (): EstadoRed => estado;

/** Sin red seguro, o lo último que se intentó falló. Aquí se decide si una operación va a la bandeja. */
export const sinRed = (): boolean =>
  !estado.enLinea || (typeof navigator !== 'undefined' && navigator.onLine === false);

export function marcarSinRed(copia?: number) {
  const copiaDesde = copia ? Math.min(copia, estado.copiaDesde ?? copia) : estado.copiaDesde;
  poner({ enLinea: false, copiaDesde });
}

export function marcarEnLinea() {
  poner({ enLinea: true, copiaDesde: null });
}

export function oirRed(f: (e: EstadoRed) => void): () => void {
  oyentes.add(f);
  return () => oyentes.delete(f);
}

/**
 * ¿Este error es de la red (no llegó) y no del servidor (llegó y dijo que no)?
 * Lo que devuelve supabase-js cuando el fetch revienta: «TypeError: Failed to
 * fetch» (Chrome), «Load failed» (Safari), «NetworkError…» (Firefox).
 */
export function esErrorDeRed(e: unknown): boolean {
  if (!e) return false;
  if (e instanceof TypeError) return true;
  const m = typeof e === 'string' ? e : (e as { message?: unknown }).message;
  return typeof m === 'string' && /failed to fetch|load failed|networkerror|network request failed|fetch failed|err_internet|err_network/i.test(m);
}

let escuchando = false;
/** Se engancha una sola vez, desde ProveedorSinConexion. */
export function escucharRed() {
  if (escuchando || typeof window === 'undefined') return;
  escuchando = true;
  window.addEventListener('offline', () => marcarSinRed());
  // «online» solo dice que hay wifi: la próxima respuesta del servidor confirma (vm-red).
  window.addEventListener('online', () => poner({ ...estado, enLinea: true }));
  navigator.serviceWorker?.addEventListener('message', (ev: MessageEvent) => {
    const d = ev.data as { tipo?: string; ok?: boolean; copia?: number } | null;
    if (!d || d.tipo !== 'vm-red') return;
    if (d.ok) marcarEnLinea();
    else marcarSinRed(d.copia || undefined);
  });
}
