/**
 * Con qué se pagó una cita o un pedido, para la caja del día.
 *
 * Los valores son los que acepta `marcar_pagado` en el bot (METODOS_PAGO) y
 * los mismos de `payment_methods.type` en la configuración del negocio. Uno
 * distinto lo rechaza el bot con `metodo_pago inválido`.
 */
export type MetodoPago = 'cash' | 'yape' | 'plin' | 'bank_transfer' | 'cod';

export const METODO_LABEL: Record<MetodoPago, string> = {
  cash: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  bank_transfer: 'Transferencia',
  cod: 'Contra entrega',
};

/**
 * Los que se ofrecen al cobrar una CITA. Efectivo primero porque en el local es
 * lo normal. Sin «contra entrega»: eso es de pedidos con reparto.
 */
export const METODOS_CITA: MetodoPago[] = ['cash', 'yape', 'plin', 'bank_transfer'];

export const etiquetaMetodo = (m: string | null | undefined): string =>
  m && m in METODO_LABEL ? METODO_LABEL[m as MetodoPago] : 'Sin método';

/**
 * ¿Falta apuntar el cobro de esta cita?
 *
 * No es lo mismo que `faltaCobrar` (lib/panel/confirmacion.ts). Aquel mira el
 * ESTADO: una cita `confirmed` ya cuenta como ingreso aunque nadie haya cobrado
 * nada. La caja pide más: que conste quién lo cobró (`pagado_por`). En una
 * barbería que cobra en el local, las citas nunca pasan por `pending_payment`,
 * así que con el criterio del estado el botón de cobrar no salía jamás y el
 * efectivo del día no había forma de apuntarlo.
 *
 * Un «no vino» o una cancelada no se cobran.
 */
export const cobroPorApuntar = (estado: string | null, pagadoPor: string | null): boolean =>
  (estado === 'pending_payment' || estado === 'confirmed' || estado === 'completed') && !pagadoPor;
