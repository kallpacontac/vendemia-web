/**
 * Los ingresos sin ticket que suman a la comisión de su barbero (datos 0031, 24-nov-2026).
 * El dueño y el administrador reciben todos; un empleado, solo los suyos (lo decide la base).
 * Sin la 0031 (o sin permiso): [], y la comisión queda como antes.
 */
import { supabase } from '@/lib/supabase/client';
import type { IngresoComision } from '@/lib/panel/comisiones';

export async function getIngresosConComision(companyId: string, desde: string, hasta: string): Promise<IngresoComision[]> {
  const { data, error } = await supabase().rpc('ingresos_con_comision', { p_company: companyId, p_desde: desde, p_hasta: hasta });
  if (error || !Array.isArray(data)) return [];
  return (data as IngresoComision[]).map((i) => ({
    ...i,
    importe: Number(i.importe ?? 0),
    comision_pct: i.comision_pct == null ? null : Number(i.comision_pct),
  }));
}
