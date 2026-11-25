/**
 * Las frases del estado de una cita, UNA por estado y las mismas en Mi agenda, Agenda, Caja y los
 * avisos push (25-nov-2026, Alvaro: «busquemos unificar los estados»):
 *
 *   Esperando adelanto → Adelanto por validar → Agendada → En curso → ¿Vino? Márcalo
 *   → Atendido · por cobrar en caja → (Pagó S/ 10 · falta S/ 20) → Cobrado
 *   y aparte: No vino · Cancelada · Caducada · hora libre.
 *
 * «Esperando adelanto», no «Esperando pago»: «pago» queda para lo que se cobra en caja.
 */
import { esperaCaja } from '@/lib/panel/comisiones';
import { ESTADO_CITA } from '@/lib/panel/format';
import type { Cita } from '@/lib/supabase/queries';

export const POR_COBRAR_EN_CAJA = 'Atendido · por cobrar en caja';

/** El estado de la cita, con el dinero cuando ya se atendió: por cobrar en caja o cobrado. */
export function estadoDeCita(c: Pick<Cita, 'status' | 'pagado_por' | 'slot_start'>): { label: string; color: string } {
  if (c.status === 'completed') {
    if (esperaCaja(c)) return { label: POR_COBRAR_EN_CAJA, color: '#C2410C' };
    if (c.pagado_por) return { label: 'Cobrado', color: '#0B7A4B' };
  }
  return ESTADO_CITA[c.status ?? 'confirmed'];
}

/** «Pagó S/ 10 · falta S/ 20»: el pago a medias, igual en todas partes. */
export const pagoAMedias = (pagado: string, falta: string) => `Pagó ${pagado} · falta ${falta}`;
