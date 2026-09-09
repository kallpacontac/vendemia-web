/**
 * ══════════════════════════════════════════════════════════════════════════
 * RETARGETING · rótulos, colores y los días que la tabla no guarda
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Las CLAVES de aquí son contrato con el bot: salen de `MOTIVOS` y del embudo
 * de `recuperar.service.ts` / `retargeting.service.ts`. Si alguien renombra un
 * motivo allí y no aquí, la fila cae en el rótulo por defecto y nadie se entera
 * — por eso `motivoDe()` y `estadoDe()` devuelven algo legible siempre, con la
 * clave cruda delante, en vez de un hueco en blanco.
 *
 * ⚠️ Ojo con `'solo-conversó'`: lleva tilde en el bot. Copiada tal cual.
 */

/* ── Los 8 motivos, EN ORDEN DE URGENCIA ────────────────────────────────── */

/**
 * Mismo orden que `MOTIVOS` en recuperar.service.ts, que es de donde sale
 * `prioridad` (índice en este array). No lo reordenes por gusto: cambiaría el
 * significado de los filtros sin cambiar el de la tabla.
 */
export const MOTIVOS = [
  'voucher-sin-verificar',
  'pedido-sin-pagar',
  'cupo-sin-pagar',
  'carrito',
  'cupo-elegido',
  'cita-a-medias',
  'cliente-dormido',
  'solo-conversó',
] as const;

export interface Rotulo {
  label: string;
  color: string;
}

/**
 * El primero NO es una venta a recuperar: es una venta HECHA esperando que
 * alguien la mire, y el cliente YA PAGÓ. Por eso va en verde y no en rojo —
 * la urgencia es la misma, pero lo que hay que hacer es revisar, no vender.
 */
export const MOTIVO: Record<string, Rotulo> = {
  'voucher-sin-verificar': { label: 'Pagó y nadie lo revisó', color: '#0FA968' },
  'pedido-sin-pagar': { label: 'Pedido apartado sin pagar', color: '#E5484D' },
  'cupo-sin-pagar': { label: 'Cupo apartado sin pagar', color: '#E5484D' },
  'carrito': { label: 'Carrito sin cerrar', color: '#CC3A00' },
  'cupo-elegido': { label: 'Eligió horario, no confirmó', color: '#B26B00' },
  'cita-a-medias': { label: 'Cita a medio negociar', color: '#B26B00' },
  'cliente-dormido': { label: 'Dejó de venir', color: '#5C5C5C' },
  'solo-conversó': { label: 'Preguntó y no volvió', color: '#93938C' },
};

export const motivoDe = (v: string): Rotulo =>
  MOTIVO[v] ?? { label: v || 'Sin motivo', color: '#93938C' };

/* ── El embudo ──────────────────────────────────────────────────────────── */

/**
 * En ESTE orden, no en alfabético: leído de arriba abajo cuenta la historia
 * del negocio — escribió, miró, comparó, dejó algo a medias, compró, se
 * durmió, se perdió.
 */
export const ESTADOS = [
  'new',
  'exploring',
  'evaluating',
  'ready',
  'customer',
  'dormant',
  'lost',
] as const;

export const ESTADO: Record<string, Rotulo> = {
  new: { label: 'Escribió', color: '#93938C' },
  exploring: { label: 'Mirando', color: '#3B82F6' },
  evaluating: { label: 'Comparando', color: '#B26B00' },
  ready: { label: 'Dejó algo a medias', color: '#CC3A00' },
  customer: { label: 'Cliente', color: '#0FA968' },
  dormant: { label: 'Dormido', color: '#B26B00' },
  lost: { label: 'Frío', color: '#93938C' },
};

export const estadoDe = (v: string): Rotulo =>
  ESTADO[v] ?? { label: v || '—', color: '#93938C' };

/* ── Los días se calculan al pintar ─────────────────────────────────────── */

/**
 * La tabla guarda timestamps y NO una columna `dias_inactivo`, a propósito:
 * entre dos refrescos (van cada 15 min) un número de días calculado contra el
 * reloj del bot miente. Aquí se deriva contra el reloj de quien mira.
 *
 * `0` en la tabla significa «nunca», no «hoy» — de ahí el null.
 */
export function dias(ts: number | null | undefined): number | null {
  if (!ts || ts <= 0) return null;
  const segundos = Date.now() / 1000 - ts;
  // Un ts en el futuro (relojes descuadrados) es 0 días, no un número negativo.
  return segundos <= 0 ? 0 : Math.floor(segundos / 86400);
}

/** "hoy" · "ayer" · "hace 12 d". Para `null` no inventa nada. */
export function haceDias(ts: number | null | undefined): string {
  const d = dias(ts);
  if (d === null) return '—';
  if (d === 0) return 'hoy';
  if (d === 1) return 'ayer';
  return `hace ${d} d`;
}

/**
 * Lo mismo pero con grano fino, para el sello de "actualizado".
 *
 * `haceDias` no sirve ahí: la tabla se refresca cada 15 minutos, así que
 * diría «hoy» durante veinticuatro horas seguidas — justo la duda que el sello
 * tenía que resolver. Con el bot apagado no se refresca en absoluto y la foto
 * se congela, y eso es lo que hay que poder ver de un vistazo.
 */
export function haceRato(ts: number | null | undefined): string {
  if (!ts || ts <= 0) return '—';
  const min = Math.floor((Date.now() / 1000 - ts) / 60);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return haceDias(ts);
}

/**
 * Su ritmo de compra, si lo sabemos.
 *
 * ⚠️ `cadencia_dias === 0` significa «no hay historial para saberlo», NUNCA
 * «vuelve todos los días». Inventar un ciclo que no conocemos es escribirle a
 * destiempo a un cliente real, así que aquí se devuelve cadena vacía y la fila
 * no enseña nada.
 */
export const cadencia = (d: number): string => (d > 0 ? `viene cada ~${d} d` : '');
