/**
 * Cobrar una reserva de cancha desde el panel: qué montos ofrecer con un toque y qué le pasará
 * a la reserva con ese pago. Lo comparten «Por revisar» (comprobante subido en la página) y
 * «Validar pago» (el dueño vio el Yape o recibió efectivo). Sin React ni red: se prueba solo.
 *
 * La regla es la misma que aplica Postgres (v2_comprobante_aplicar): una reserva apartada se
 * confirma cuando lo pagado llega al adelanto, o al total si el total es menor.
 */
export const soles = (n: number) => `S/ ${Number.isInteger(n) ? n : n.toFixed(2)}`;

export interface Cobro {
  total: number;
  pagado: number;
  /** El adelanto de Mi página. 0 = sin adelanto. */
  adelanto: number;
  /** true si todavía está apartada (sin confirmar). */
  apartada: boolean;
}

export const faltaDe = (c: Cobro) => Math.max(c.total - c.pagado, 0);

/** Lo mínimo que la confirma. 0 si ya está confirmada o no hay adelanto. */
export function minimoParaConfirmar(c: Cobro): number {
  if (!c.apartada || !(c.adelanto > 0)) return 0;
  return Math.max(Math.min(c.adelanto, c.total) - c.pagado, 0);
}

/** Los botones de monto: «Adelanto» (si aún está apartada) y «Completo» / «Lo que falta». */
export function opcionesDeMonto(c: Cobro): { clave: 'adelanto' | 'completo'; etiqueta: string; monto: number }[] {
  const falta = faltaDe(c);
  if (falta <= 0) return [];
  const minimo = minimoParaConfirmar(c);
  const opciones: { clave: 'adelanto' | 'completo'; etiqueta: string; monto: number }[] = [];
  if (minimo > 0 && minimo < falta) opciones.push({ clave: 'adelanto', etiqueta: 'Adelanto', monto: minimo });
  opciones.push({ clave: 'completo', etiqueta: c.pagado > 0 ? 'Lo que falta' : 'Completo', monto: falta });
  return opciones;
}

/** Qué pasará con la reserva si se registra `monto`. Frase para el «¿Seguro?». */
export function efectoDelPago(c: Cobro, monto: number): string {
  const quedara = faltaDe(c) - monto;
  if (quedara <= 0) return 'La reserva quedará confirmada y pagada completa.';
  const minimo = minimoParaConfirmar(c);
  if (c.apartada && minimo > 0 && monto < minimo) {
    return `No alcanza el adelanto: faltarán ${soles(minimo - monto)} para confirmarla y seguirá apartada.`;
  }
  return `${c.apartada ? 'La reserva quedará confirmada. ' : ''}Faltarán ${soles(quedara)} por cobrar en la cancha.`;
}

/** El monto escrito, o un mensaje claro si no vale. */
export function leerMonto(texto: string, c: Cobro): { monto: number } | { error: string } {
  const n = Number(texto.replace(',', '.').trim());
  if (!texto.trim() || !Number.isFinite(n) || n <= 0) return { error: 'Elige Adelanto o Completo, o escribe el monto que recibiste.' };
  const falta = faltaDe(c);
  if (n > falta) return { error: `Solo le faltan ${soles(falta)}: no se puede registrar más que eso.` };
  return { monto: Math.round(n * 100) / 100 };
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «2026-11-11 21:00» → «mié 11 nov · 21:00». */
export function fechaCorta(slot: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/.exec(slot);
  if (!m) return slot;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${DIAS[d.getUTCDay()]} ${Number(m[3])} ${MESES[Number(m[2]) - 1]} · ${m[4]}`;
}

export const NOMBRE_METODO: Record<string, string> = { yape: 'Yape', plin: 'Plin', cash: 'Efectivo', bank_transfer: 'Transferencia' };
