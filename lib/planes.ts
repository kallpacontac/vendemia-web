/**
 * ══════════════════════════════════════════════════════════════════════════
 * PLANES · topes de conversaciones y recargas, en UN solo sitio
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Lo leen la landing (lib/content.ts, las etiquetas de cada tarjeta) y el
 * panel (lib/panel/consumo.ts). Antes el tope vivía escrito a mano en el texto
 * de la tarjeta, y el día que el panel lo necesitara habría una segunda copia
 * que nadie se acordaría de cambiar a la vez.
 *
 * ⚠️ EL BOT TIENE SU PROPIA COPIA, y es él quien hace cumplir el tope (ver
 * docs/prompt-bot-consumo-y-topes.md). Si tocas un número aquí, tócalo allí.
 *
 * DE DÓNDE SALEN LOS NÚMEROS. Una conversación (un cliente, un día) cuesta de
 * IA ~S/0,05 de media y S/0,10 en el caso malo (usage_log, sep-2026). Regla:
 * con el caso malo, el tope entero no se come más de la mitad del precio.
 */

export type PlanId = 'starter' | 'seller' | 'best_seller';

export const PLANES: Record<PlanId, { nombre: string; tope: number }> = {
  starter: { nombre: 'Starter', tope: 300 },
  seller: { nombre: 'Seller', tope: 700 },
  best_seller: { nombre: 'Best Seller', tope: 1000 },
};

/** Plan de un negocio sin plan asignado (la columna llega vacía o rara). */
export const PLAN_POR_DEFECTO: PlanId = 'starter';

export const esPlan = (v: unknown): v is PlanId =>
  typeof v === 'string' && v in PLANES;

/**
 * Colchón sin cobro, en fracción del tope del plan: con 300, 30 más. Se gasta
 * DESPUÉS de las recargas — quien pagó una recarga la usa primero, y la
 * gracia queda para no cortar a nadie un día de mucho movimiento.
 */
export const GRACIA = 0.1;

/** Avisos al dueño, en fracción del tope del plan. */
export const AVISOS = [0.8, 1] as const;

/**
 * Más caras por conversación que el plan siguiente, a propósito: quien recarga
 * seguido descubre que subir de plan le sale mejor.
 */
export const RECARGAS = [
  { conversaciones: 100, precio: 19 },
  { conversaciones: 300, precio: 49 },
  { conversaciones: 1000, precio: 129 },
] as const;

/** Una recarga no usada caduca a los 90 días de pagarla. */
export const VIGENCIA_RECARGA_DIAS = 90;

/** 1000 → "1.000", como se escribe en Perú. */
export const miles = (n: number): string =>
  Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
