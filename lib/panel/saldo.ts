/**
 * ══════════════════════════════════════════════════════════════════════════
 * SALDO DE UNA VENTA · la seña reserva el cupo (regla del 3-oct-2026)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ ES LA CUENTA DEL BOT, COPIADA. La referencia viva es
 * `src/utils/saldo-venta.ts` (saldoDeVenta) y el filtro de pagos de
 * `settlePendingEnrolment`. Si el panel contara de otra forma, el bot le diría
 * al cliente «faltan S/ 260» mientras el panel enseña otra cifra.
 *
 * Lo que cambió: `confirmed` ya NO significa «cobrada», significa «tiene el
 * cupo». Quien pone una seña queda dentro y el resto se persigue después. Así
 * que el saldo no está en ninguna columna: se calcula.
 *
 * Tres reglas que no son opcionales:
 *   · El total es de la VENTA (todas las inscripciones vivas del lead), no de
 *     la fila. El voucher se engancha a UNA sola inscripción; medir fila a fila
 *     daba por pagada solo esa (Katherine: S/ 360 por tres hijos, enganchado a
 *     una de S/ 120).
 *   · Los pagos sin enganchar (sin cita ni pedido) cuentan si son posteriores a
 *     la inscripción más antigua. Si no, ese dinero desaparece del cuadre.
 *   · El saldo nunca es negativo. Pagar de más es caso para una persona, no una
 *     deuda del negocio.
 *
 * Solo inscripciones recurrentes (`slot_start` 'sched:…'). Los pedidos llevan
 * su propio total y siguen con marcar_pagado.
 */
import type { AppointmentRow, AppointmentServiceRow, PendingPaymentRow } from '@/lib/supabase/types';

const redondea = (n: number): number => Math.round(n * 100) / 100;

export interface Saldo {
  total: number;
  pagado: number;
  /** Lo que falta. 0 = cubierto (o pagado de más). */
  saldo: number;
  completo: boolean;
  hayPago: boolean;
}

/** saldoDeVenta del bot, tal cual. */
export const saldoDeVenta = (precios: number[], pagos: number[]): Saldo => {
  const total = redondea(precios.reduce((s, p) => s + (Number.isFinite(p) ? p : 0), 0));
  const pagado = redondea(pagos.reduce((s, p) => s + (Number.isFinite(p) ? p : 0), 0));
  return {
    total,
    pagado,
    saldo: redondea(Math.max(0, total - pagado)),
    completo: pagado >= total && total > 0,
    hayPago: pagado > 0,
  };
};

type Inscripcion = Pick<
  AppointmentRow,
  'id' | 'lead_id' | 'status' | 'slot_start' | 'created_at' | 'service' | 'beneficiario'
>;

/** Viva = tiene o está pidiendo cupo, y es de un grupo recurrente. */
export const esInscripcionViva = (c: Pick<AppointmentRow, 'status' | 'slot_start'>): boolean =>
  (c.status === 'confirmed' || c.status === 'pending_payment') && (c.slot_start ?? '').startsWith('sched:');

export interface VentaLead {
  leadId: string;
  inscripciones: Inscripcion[];
  /** Precio de cada inscripción, de appointment_services (congelado). */
  precioDe: Map<string, number>;
  /** Los comprobantes que cuentan para esta venta, del más nuevo al más viejo. */
  pagos: PendingPaymentRow[];
  saldo: Saldo;
  /** created_at (epoch s) de la inscripción más antigua: desde cuándo se debe. */
  desde: number;
}

/**
 * La venta de cada lead con inscripciones vivas. Un Map por lead_id: lo
 * consultan la Agenda (fila a fila), la Caja (la lista) y la ficha.
 */
export function ventasPorLead(
  citas: Inscripcion[],
  lineas: Pick<AppointmentServiceRow, 'appointment_id' | 'price'>[],
  pagos: PendingPaymentRow[],
): Map<string, VentaLead> {
  const precioDe = new Map<string, number>();
  for (const l of lineas) {
    precioDe.set(l.appointment_id, (precioDe.get(l.appointment_id) ?? 0) + Number(l.price ?? 0));
  }

  const porLead = new Map<string, Inscripcion[]>();
  for (const c of citas) {
    if (!esInscripcionViva(c)) continue;
    const lista = porLead.get(c.lead_id) ?? [];
    lista.push(c);
    porLead.set(c.lead_id, lista);
  }

  const pagosPorLead = new Map<string, PendingPaymentRow[]>();
  for (const p of pagos) {
    const lista = pagosPorLead.get(p.lead_id) ?? [];
    lista.push(p);
    pagosPorLead.set(p.lead_id, lista);
  }

  const ventas = new Map<string, VentaLead>();
  for (const [leadId, ins] of porLead) {
    const ids = new Set(ins.map((c) => c.id));
    const desde = Math.min(...ins.map((c) => c.created_at ?? 0));
    const suyos = (pagosPorLead.get(leadId) ?? [])
      .filter(
        (p) =>
          ids.has(p.appointment_id ?? '') ||
          (!p.appointment_id && !p.order_id && (p.created_at ?? 0) >= desde),
      )
      .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
    ventas.set(leadId, {
      leadId,
      inscripciones: ins,
      precioDe,
      pagos: suyos,
      saldo: saldoDeVenta(
        ins.map((c) => precioDe.get(c.id) ?? 0),
        suyos.map((p) => Number(p.amount ?? 0)),
      ),
      desde,
    });
  }
  return ventas;
}

export type EstadoInscripcion = 'por_pagar' | 'con_saldo' | 'confirmada';

/**
 * Tres estados visibles, dos en la base. «Con saldo» es `confirmed` + saldo de
 * la venta > 0: tiene el cupo y debe plata. Es el único caso en que hay que
 * llamar a alguien, por eso se ve distinto.
 */
export function estadoInscripcion(
  c: Pick<AppointmentRow, 'status' | 'lead_id'>,
  ventas: Map<string, VentaLead>,
): EstadoInscripcion {
  if (c.status === 'pending_payment') return 'por_pagar';
  return (ventas.get(c.lead_id)?.saldo.saldo ?? 0) > 0 ? 'con_saldo' : 'confirmada';
}

/**
 * Las ventas que deben algo, de la deuda más vieja a la más nueva: el orden en
 * que se llama. Solo las que YA tienen cupo (alguna `confirmed`): quien está
 * «por pagar» sin haber puesto nada no tiene plaza ni deuda, y ese caso ya lo
 * persigue Retargeting como «cupo sin pagar».
 */
export const conSaldo = (ventas: Map<string, VentaLead>): VentaLead[] =>
  [...ventas.values()]
    .filter((v) => v.saldo.saldo > 0 && v.inscripciones.some((c) => c.status === 'confirmed'))
    .sort((a, b) => a.desde - b.desde);
