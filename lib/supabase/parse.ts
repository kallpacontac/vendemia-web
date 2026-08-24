/**
 * Las tres rarezas del espejo, en un sitio.
 *
 * Todo lo que llega de Supabase pasa por aquí antes de tocar una pantalla: los
 * booleanos que son 0/1, los JSON que son text y las fechas que vienen dos
 * veces. Si esto se hace a mano en cada componente, tarde o temprano alguien
 * pinta "0" como si fuera verdadero.
 */

/** 0/1 de SQLite → boolean. `null` cuenta como false salvo que se diga otra cosa. */
export const bool = (v: number | null | undefined, pordefecto = false): boolean =>
  v === null || v === undefined ? pordefecto : v === 1;

/** boolean → 0/1, para mandarlo en un patch. */
export const b01 = (v: boolean): number => (v ? 1 : 0);

/**
 * JSON.parse() defensivo para los campos `text` que en realidad son JSON.
 *
 * Devuelve el valor por defecto si viene vacío O si el texto está corrupto. Que
 * un `payment_methods` mal formado deje la pantalla en blanco sería absurdo:
 * es el bot quien lo escribió, y el panel no puede arreglarlo.
 */
export function json<T>(texto: string | null | undefined, pordefecto: T): T {
  if (!texto) return pordefecto;
  try {
    const v = JSON.parse(texto);
    return (v ?? pordefecto) as T;
  } catch {
    return pordefecto;
  }
}

/** Fecha de un `x_ts` (timestamptz). Devuelve null si no hay nada usable. */
export function fecha(ts: string | null | undefined): Date | null {
  if (!ts) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}
