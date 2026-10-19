/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA CITA PUNTUAL Y SU DINERO · apartada, por cobrar, pagó sin hora
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Desde el 19-oct-2026 el bot asocia el voucher a la cita puntual más cercana
 * del cliente y marca `pagado_por='voucher'` SOLO cuando la suma de sus pagos
 * cubre el total de sus líneas. Lo que queda por debajo es un pago A CUENTA.
 *
 * ── Decisión de Alvaro (19-oct-2026) ─────────────────────────────────────
 * «Cobrada es cuando ya se cobró todo. Por cobrar, otro estado. Lo que sí,
 * sumar para la caja del día.» La cita con pagos parciales está POR COBRAR;
 * su dinero suma a la caja del día que entra, nombrado «a cuenta»
 * (entradasDelDia en lib/panel/dinero.ts). Lo mismo con las inscripciones,
 * por la venta del lead (lib/panel/saldo.ts).
 *
 * ── La cita apartada («Requerir pago para confirmar») ───────────────────
 * Con el interruptor encendido y un servicio con precio, la cita nace
 * `pending_payment` y OCUPA su hora 24 h desde `created_at`. Pasado el plazo
 * deja de ocupar y la fila no se toca: sigue en `pending_payment` para siempre.
 * El plazo vive en el bot (PAGO_CADUCA_HORAS, de entorno, sin columna) y en
 * Postgres (`v2_ocupa_hora`, modules/datos/sql/0004): si cambia, aquí también.
 */
import type { AppointmentRow, AppointmentServiceRow, PendingPaymentRow } from '@/lib/supabase/types';
import { saldoDeVenta, type Saldo } from './saldo';

export const PAGO_CADUCA_HORAS = 24;

type CitaMin = Pick<AppointmentRow, 'status' | 'slot_start' | 'created_at'>;

export const esPuntual = (slot: string | null | undefined): boolean => !(slot ?? '').startsWith('sched:');

/** Cuándo deja de ocupar su hora una cita apartada (ms). null si no es una apartada. */
export function caducaEn(c: CitaMin): number | null {
  if (c.status !== 'pending_payment' || !esPuntual(c.slot_start) || !c.created_at) return null;
  return (c.created_at + PAGO_CADUCA_HORAS * 3600) * 1000;
}

/** Apartada, sin pagar a tiempo: ya no ocupa la hora. */
export const apartadaCaducada = (c: CitaMin, ahora = Date.now()): boolean => {
  const fin = caducaEn(c);
  return fin !== null && fin <= ahora;
};

/** ¿Ocupa su hora en la rejilla? La misma regla que v2_ocupa_hora en Postgres. */
export const ocupaHora = (c: CitaMin, ahora = Date.now()): boolean =>
  c.status === 'confirmed' ||
  c.status === 'completed' ||
  (c.status === 'pending_payment' && !apartadaCaducada(c, ahora));

/**
 * Lo pagado de cada cita puntual que tiene pagos asociados, contra el total de
 * sus líneas. Clave: id de la cita. Solo las que tienen algún pago: una cita
 * sin pagos no tiene adelanto, tiene el cobro sin apuntar.
 *
 * Los pagos son los de la cita (`appointment_id`), no los del lead: así los
 * cuenta el bot para decidir si la marca.
 */
export function pagosDeCitas(
  citas: Pick<AppointmentRow, 'id' | 'slot_start'>[],
  lineas: Pick<AppointmentServiceRow, 'appointment_id' | 'price'>[],
  pagos: Pick<PendingPaymentRow, 'appointment_id' | 'amount'>[],
): Map<string, Saldo> {
  const puntuales = new Set(citas.filter((c) => esPuntual(c.slot_start)).map((c) => c.id));
  const precios = new Map<string, number[]>();
  for (const l of lineas) {
    if (!puntuales.has(l.appointment_id)) continue;
    precios.set(l.appointment_id, [...(precios.get(l.appointment_id) ?? []), Number(l.price ?? 0)]);
  }
  const pagado = new Map<string, number[]>();
  for (const p of pagos) {
    if (!p.appointment_id || !puntuales.has(p.appointment_id)) continue;
    pagado.set(p.appointment_id, [...(pagado.get(p.appointment_id) ?? []), Number(p.amount ?? 0)]);
  }
  const out = new Map<string, Saldo>();
  for (const [id, montos] of pagado) out.set(id, saldoDeVenta(precios.get(id) ?? [], montos));
  return out;
}

export interface SelloCita {
  clave: 'esperando_pago' | 'caducada' | 'pago_sin_hora' | 'por_cobrar';
  label: string;
  color: string;
  ayuda: string;
}

/**
 * Lo que hay que decir de una cita puntual por su dinero, o null si no hay
 * nada especial (cobrada, o sin cobro apuntado a secas).
 *
 *   esperando_pago  apartada, dentro de las 24 h, sin pagos.
 *   caducada        apartada, pasaron las 24 h: la hora ya no es suya.
 *   pago_sin_hora   pagó tarde y su hora se la llevó otro: el bot la deja en
 *                   `pending_payment` y abre la escalación `paid_slot_full`.
 *   por_cobrar      tiene pagos a cuenta que no cubren el total. Sin `pagado_por`.
 */
export function selloCita(
  c: CitaMin & Pick<AppointmentRow, 'pagado_por'>,
  pagos: Saldo | undefined,
  soles: (n: number) => string,
  ahora = Date.now(),
): SelloCita | null {
  if (!esPuntual(c.slot_start)) return null;
  const apartada = c.status === 'pending_payment';
  // Una apartada con pagos y sin confirmar solo queda así si su hora ya no estaba libre: con
  // la hora libre, el bot la confirma con cualquier pago (la seña también).
  if (apartada && (c.pagado_por || pagos?.hayPago)) {
    return {
      clave: 'pago_sin_hora',
      label: pagos?.hayPago && !pagos.completo ? `Pagó ${soles(pagos.pagado)}, sin hora` : 'Pagó, sin hora',
      color: '#D63031',
      ayuda: 'Pagó, pero su hora se ocupó: dale otra o devuélvele el dinero.',
    };
  }
  if (!c.pagado_por && pagos?.hayPago && !pagos.completo) {
    return {
      clave: 'por_cobrar',
      label: `Por cobrar · ${soles(pagos.pagado)} de ${soles(pagos.total)}`,
      color: '#C2410C',
      ayuda: `Pagó ${soles(pagos.pagado)} a cuenta y faltan ${soles(pagos.saldo)}. Pasa a cobrada cuando se pague todo.`,
    };
  }
  if (apartada && apartadaCaducada(c, ahora)) {
    return {
      clave: 'caducada',
      label: 'Caducada — hora libre',
      color: '#8A8D86',
      ayuda: `Pasaron ${PAGO_CADUCA_HORAS} h sin pago: ya no ocupa la hora y otro cliente puede tomarla.`,
    };
  }
  if (apartada) {
    const fin = caducaEn(c);
    const hasta = fin
      ? new Date(fin).toLocaleString('es-PE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
      : '';
    return {
      clave: 'esperando_pago',
      label: 'Esperando pago',
      color: '#E08A00',
      ayuda: `Apartada a su nombre hasta que llegue el comprobante.${hasta ? ` Si no paga antes del ${hasta}, la hora se libera.` : ''}`,
    };
  }
  return null;
}
