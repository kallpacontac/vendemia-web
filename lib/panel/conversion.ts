/**
 * ══════════════════════════════════════════════════════════════════════════
 * ¿CUÁNTOS DE LOS LEADS DE HOY ACABARON EN ALGO?
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Antes esto era `paid_orders ÷ leads`, y estaba mal por dos motivos distintos:
 *
 * 1 · UN NEGOCIO DE CITAS NO TIENE PEDIDOS, así que daba 0 % para siempre por
 *     muy llena que estuviera la agenda. Cerrar una cita ES convertir.
 *
 * 2 · Y peor: dividía dos cosas que NO son el mismo conjunto. Las citas de hoy
 *     pueden venir de leads de la semana pasada, así que el cociente podía
 *     pasar de 100 %. Comprobado contra la base real de barberia-01, que daba
 *     **2787,5 %** — 446 citas sobre 16 leads del día.
 *
 * Aquí se mide lo único que significa algo: de los leads creados HOY, cuántos
 * tienen ya una cita en pie o un pedido cobrado. Por construcción no puede
 * pasar del 100 %, porque el numerador es un subconjunto del denominador.
 *
 * ⚠️ Se cuentan LEADS, no citas. Un lead que reserva tres clases convirtió una
 * vez, no tres; por eso el numerador es un Set de `lead_id` y no una suma.
 */
import { isoLocal } from '@/lib/panel/format';
import type { Cita, Lead, Pedido } from '@/lib/supabase/queries';

/**
 * Los mismos estados que cuentan como dinero. Ver la migración 0019 del bot.
 *
 * Un `status` nulo NO cuenta: es una fila a medio espejar, y dar por cerrado
 * algo cuyo estado no conocemos infla el número justo en el sentido que más
 * apetece creerse.
 */
const CITA_CERRADA = new Set(['confirmed', 'completed']);
const PEDIDO_CERRADO = new Set(['paid', 'delivered', 'completed']);

export interface Conversion {
  /** 0–100, con un decimal. */
  pct: number;
  /** Leads de hoy que ya cerraron algo. */
  cerrados: number;
  /** Leads creados hoy. Es el denominador, y sale de las filas reales. */
  total: number;
}

export function conversionDeHoy(leads: Lead[], citas: Cita[], pedidos: Pedido[]): Conversion {
  const hoy = isoLocal(new Date());

  // El denominador sale de las FILAS de leads, no de v_daily_metrics.leads, para
  // que numerador y denominador se calculen sobre exactamente el mismo conjunto.
  // Si salieran de sitios distintos volvería a poder pasar del 100 %.
  const deHoy = new Set(
    leads.filter((l) => l.creado && isoLocal(l.creado) === hoy).map((l) => l.id),
  );
  if (deHoy.size === 0) return { pct: 0, cerrados: 0, total: 0 };

  const cerrados = new Set<string>();
  for (const c of citas) {
    if (c.status && CITA_CERRADA.has(c.status) && deHoy.has(c.lead_id)) cerrados.add(c.lead_id);
  }
  for (const p of pedidos) {
    if (p.status && PEDIDO_CERRADO.has(p.status) && p.lead_id && deHoy.has(p.lead_id)) cerrados.add(p.lead_id);
  }

  return {
    pct: Math.round((cerrados.size / deHoy.size) * 1000) / 10,
    cerrados: cerrados.size,
    total: deHoy.size,
  };
}
