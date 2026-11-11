/**
 * ══════════════════════════════════════════════════════════════════════════
 * CÓMO COBRA LOS PEDIDOS CADA NEGOCIO · contra entrega, por adelantado o un adelanto
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Alvaro, 11-nov-2026: «cualquier tienda podría decir quiero pago contraentrega o
 * pago anticipado o una seña o adelanto de tanto». Vive en tu_pagina.secciones.cobroPedidos
 * y lo guarda pedido_cobro_guardar (tu-pagina/sql/0020), que valida lo mismo que aquí.
 *
 * Cada pedido guarda al nacer cuánto había que pagar antes (orders.pagar_antes), con la
 * misma cuenta en Postgres (v2_pedido_a_pagar): cambiar la regla no mueve los pedidos
 * que ya entraron. Esta copia sirve para avisar en la página ANTES de pedir y para la
 * pantalla de configuración; lo que manda es lo guardado en el pedido.
 */

export type ModoCobro = 'contra_entrega' | 'anticipado' | 'adelanto';

export interface CobroPedidos {
  modo: ModoCobro;
  /** Solo con adelanto: un monto fijo o un porcentaje del total. */
  tipo?: 'monto' | 'porcentaje';
  valor?: number;
}

export const CONTRA_ENTREGA: CobroPedidos = { modo: 'contra_entrega' };

/** Tope del monto fijo: lo mismo que acepta Postgres. */
export const MONTO_MAXIMO = 100_000;

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Lo guardado, sea lo que sea, como una regla válida. Lo raro cuenta como contra entrega. */
export function normalizarCobro(c: unknown): CobroPedidos {
  if (!c || typeof c !== 'object') return CONTRA_ENTREGA;
  const o = c as Record<string, unknown>;
  if (o.modo === 'anticipado') return { modo: 'anticipado' };
  if (o.modo !== 'adelanto') return CONTRA_ENTREGA;
  const tipo = o.tipo === 'porcentaje' ? 'porcentaje' : 'monto';
  const valor = redondear(Number(o.valor) || 0);
  if (!errorCobro({ modo: 'adelanto', tipo, valor })) return { modo: 'adelanto', tipo, valor };
  return CONTRA_ENTREGA;
}

/** Por qué no se puede guardar, o null. */
export function errorCobro(c: CobroPedidos): string | null {
  if (c.modo !== 'adelanto') return null;
  const v = Number(c.valor);
  if (!Number.isFinite(v) || v <= 0) return 'Pon cuánto es el adelanto.';
  if (c.tipo === 'porcentaje') return v >= 100 ? 'Un adelanto del 100 % es «Todo por adelantado».' : v < 1 ? 'El porcentaje va de 1 a 99.' : null;
  return v > MONTO_MAXIMO ? 'Ese monto es demasiado alto.' : null;
}

/** Cuánto se paga antes de preparar un pedido de ese total. 0: nada (contra entrega). */
export function aPagarAntes(c: CobroPedidos, total: number): number {
  const t = Math.max(0, Number(total) || 0);
  if (c.modo === 'anticipado') return redondear(t);
  if (c.modo !== 'adelanto') return 0;
  const v = Number(c.valor) || 0;
  return redondear(Math.min(t, c.tipo === 'porcentaje' ? (t * v) / 100 : v));
}

const soles = (n: number) => `S/ ${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** «Contra entrega» · «Todo por adelantado» · «Adelanto de S/ 20» · «Adelanto del 50 %». */
export function textoCobro(c: CobroPedidos): string {
  if (c.modo === 'anticipado') return 'Todo por adelantado';
  if (c.modo === 'adelanto') return c.tipo === 'porcentaje' ? `Adelanto del ${c.valor} %` : `Adelanto de ${soles(c.valor ?? 0)}`;
  return 'Contra entrega';
}

/**
 * Lo que la página le dice al cliente antes de pedir. null: nada que decir.
 * `total` es lo del carrito; el monto exacto lo confirma el pedido guardado.
 */
export function avisoAlPedir(c: CobroPedidos, total: number): string | null {
  const antes = aPagarAntes(c, total);
  if (antes <= 0) return null;
  if (antes >= total) return `Este negocio prepara tu pedido cuando recibe el pago: ${soles(antes)} por Yape o Plin.`;
  return `Para confirmar tu pedido se paga un adelanto de ${soles(antes)} por Yape o Plin. El resto, ${soles(redondear(total - antes))}, al recibirlo.`;
}

/** Con todo por adelantado, «Efectivo» y «Tarjeta» no tienen sentido en «¿Cómo pagarás?». */
export function metodosAlPedir<T extends string>(c: CobroPedidos, metodos: readonly T[]): T[] {
  return c.modo === 'anticipado' ? metodos.filter((m) => m === 'Yape' || m === 'Plin' || m === 'Transferencia') : [...metodos];
}
