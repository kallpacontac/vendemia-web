/**
 * Adelanto para separar una CITA desde la página (secciones.citas), con el comprobante subido ahí.
 *
 * Pedido por Alvaro el 14-nov-2026 para The 24/7 Barber Shop: «50 % de adelanto obligatorio» y
 * «hay que asegurarnos que adjunten las evidencias». La cita nace apartada (pending_payment, con
 * «Requerir pago para confirmar» encendido en el negocio), el cliente yapea el adelanto y sube la
 * captura en la misma página; el dueño la mira en Agenda → «Comprobantes por revisar» y la aprueba.
 * Sin IA: la validación es siempre a mano salvo que alguien ponga `validacion: 'automatica'`.
 *
 * Es lo mismo que el adelanto de las canchas (dominio/canchas.ts), pero en porcentaje del precio
 * del servicio y no en soles fijos. Postgres aplica la misma cuenta (v2_adelanto_minimo, sql/0021).
 */

export interface ConfigCitas {
  /** Porcentaje del precio que confirma la cita (1–100). 0 o vacío = sin adelanto. */
  adelanto?: number;
  /** Dónde llega la captura. Hoy solo la página. */
  comprobante?: 'pagina';
  /** 'manual' (por defecto): la revisa el dueño. 'automatica': la lee la IA como en canchas. */
  validacion?: 'manual' | 'automatica';
  /** «Antes de tu cita»: lo que se le dice al terminar de reservar (tolerancia, sede…). */
  indicaciones?: string[];
}

/** Las indicaciones que se enseñan: texto, sin vacías, como mucho 6 de 200 caracteres. */
export function indicacionesDe(cfg: unknown): string[] {
  const l = (cfg as ConfigCitas | null | undefined)?.indicaciones;
  if (!Array.isArray(l)) return [];
  return l.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).slice(0, 6).map((t) => t.trim().slice(0, 200));
}

/** El porcentaje vigente, o 0 si no hay adelanto. */
export function porcentajeAdelanto(cfg: unknown): number {
  const n = Number((cfg as ConfigCitas | null | undefined)?.adelanto);
  return Number.isFinite(n) && n >= 1 && n <= 100 ? Math.round(n) : 0;
}

/** Soles que confirman una cita de `precio` con ese porcentaje. Igual que round(…, 2) en Postgres. */
export function montoAdelanto(precio: number | null | undefined, porcentaje: number): number {
  const p = Number(precio);
  if (!(porcentaje > 0) || !Number.isFinite(p) || p <= 0) return 0;
  return Math.round(p * porcentaje) / 100;
}
