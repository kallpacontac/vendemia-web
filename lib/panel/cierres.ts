/**
 * Cierres de comisión · lo que se le debe a cada barbero y apuntar que se le pagó
 * (datos 0014, 18-nov-2026).
 *
 * «Por pagar» = la comisión de las citas atendidas que NINGÚN cierre cubre, menos los
 * adelantos (gastos tipo 'adelanto', datos 0013) que ningún cierre descontó. Se cuenta por
 * ids, no por fechas: una cita marcada «Vino» dos días tarde sigue saliendo hasta que se paga.
 *
 * Desde cuándo se cuenta: desde el primer cierre del negocio. Sin ninguno, desde el inicio
 * de la quincena: lo de antes se supone pagado a mano (si no, el primer «por pagar» traería
 * meses). La comisión sale de calcularComisiones, la misma cuenta que la página Comisiones.
 */
import { calcularComisiones } from '@/lib/panel/comisiones';
import { isoLocal } from '@/lib/panel/format';
import { supabase } from '@/lib/supabase/client';
import {
  getCatalogo,
  getCitasDelPeriodo,
  getComisionesCongeladas,
  getServiciosDeCitas,
  getTrabajadores,
} from '@/lib/supabase/queries';

export type MetodoCierre = 'efectivo' | 'yape' | 'plin' | 'transferencia' | 'otro';

export interface Cierre {
  id: string;
  employee_id: string;
  desde: string;
  citas: string[];
  adelantos: string[];
  comision: number;
  adelantado: number;
  pagado: number;
  metodo: MetodoCierre;
  nota: string;
  pagado_at: string;
}

export interface PorPagar {
  employeeId: string;
  nombre: string;
  desde: string;
  citas: string[];
  adelantos: string[];
  comision: number;
  adelantado: number;
  /** comision − adelantado. Negativo: se le adelantó más de lo que lleva ganado. */
  aPagar: number;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Con céntimos: lo que se le paga a alguien no se redondea (soles() de format sí). */
export const solesExactos = (n: number) =>
  `S/ ${Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** 1 o 16 del mes: el inicio de la quincena de hoy. */
function inicioQuincena(hoy: Date): string {
  return isoLocal(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() >= 16 ? 16 : 1));
}

/** null = sin la 0014, o quien mira no es dueño ni administrador. */
export async function leerCierres(companyId: string): Promise<Cierre[] | null> {
  const { data, error } = await supabase().rpc('comision_cierres_leer', { p_company: companyId, p_dias: 400 });
  if (error) return null;
  return ((data ?? []) as Cierre[]).map((c) => ({
    ...c,
    comision: Number(c.comision),
    adelantado: Number(c.adelantado),
    pagado: Number(c.pagado),
  }));
}

async function adelantosSinCerrar(companyId: string, desde: string): Promise<{ id: string; employee_id: string; importe: number }[]> {
  const { data, error } = await supabase()
    .from('gastos')
    .select('id, employee_id, importe')
    .eq('company_id', companyId)
    .eq('tipo', 'adelanto')
    .gte('fecha', desde);
  // Sin la 0013 no hay columna tipo: sin adelantos.
  if (error) return [];
  return ((data ?? []) as { id: string; employee_id: string | null; importe: number }[])
    .filter((g) => g.employee_id)
    .map((g) => ({ id: String(g.id), employee_id: String(g.employee_id), importe: Number(g.importe ?? 0) }));
}

export async function calcularPorPagar(
  companyId: string,
  cierres: Cierre[],
  hoy: Date = new Date(),
): Promise<{ porPagar: PorPagar[]; desde: string; nombres: Map<string, string> }> {
  const primero = cierres.reduce<string | null>((m, c) => (m === null || c.desde < m ? c.desde : m), null);
  // Como mucho 120 días atrás: lo de más lejos, si no se pagó, ya no se va a pagar por aquí.
  const tope = isoLocal(new Date(hoy.getTime() - 120 * 86_400_000));
  const desde = primero ? (primero < tope ? tope : primero) : inicioQuincena(hoy);
  const hasta = isoLocal(hoy);

  const [citas, trabajadores, catalogo, adelantos] = await Promise.all([
    getCitasDelPeriodo(companyId, desde, hasta),
    getTrabajadores(companyId),
    getCatalogo(companyId),
    adelantosSinCerrar(companyId, desde),
  ]);
  const ids = citas.map((c) => c.id);
  const [lineas, congeladas] = await Promise.all([getServiciosDeCitas(ids), getComisionesCongeladas(ids)]);
  const resumen = calcularComisiones(citas, lineas, catalogo, trabajadores, hoy, congeladas);

  const citasPagadas = new Set(cierres.flatMap((c) => c.citas));
  const adelantosPagados = new Set(cierres.flatMap((c) => c.adelantos));
  const nombre = new Map(trabajadores.map((t) => [t.id, t.name]));

  const porEmpleado = new Map<string, PorPagar>();
  const fila = (id: string) => {
    let f = porEmpleado.get(id);
    if (!f) {
      f = { employeeId: id, nombre: nombre.get(id) ?? 'Sin nombre', desde, citas: [], adelantos: [], comision: 0, adelantado: 0, aPagar: 0 };
      porEmpleado.set(id, f);
    }
    return f;
  };

  for (const p of resumen.profesionales) {
    if (!p.employeeId) continue; // Citas sin barbero: no hay a quién pagarle.
    for (const l of p.lineas) {
      if (citasPagadas.has(l.cita.id)) continue;
      const f = fila(p.employeeId);
      if (!f.citas.includes(l.cita.id)) f.citas.push(l.cita.id);
      f.comision += l.comision;
    }
  }
  for (const g of adelantos) {
    if (adelantosPagados.has(g.id) || !nombre.has(g.employee_id)) continue;
    const f = fila(g.employee_id);
    f.adelantos.push(g.id);
    f.adelantado += g.importe;
  }

  const porPagar = [...porEmpleado.values()]
    .map((f) => ({ ...f, comision: redondear(f.comision), adelantado: redondear(f.adelantado), aPagar: redondear(f.comision - f.adelantado) }))
    // Solo lo que mueve dinero: una cita sin tarifa (comisión 0) no es un cierre.
    .filter((f) => f.comision > 0 || f.adelantado > 0)
    .sort((a, b) => b.aPagar - a.aPagar);
  return { porPagar, desde, nombres: nombre };
}

export async function pagarCierre(companyId: string, p: PorPagar, metodo: MetodoCierre, nota = ''): Promise<Cierre> {
  const { data, error } = await supabase().rpc('comision_cierre_guardar', {
    p_company: companyId,
    p_datos: {
      employee_id: p.employeeId,
      desde: p.desde,
      citas: p.citas,
      adelantos: p.adelantos,
      comision: p.comision,
      adelantado: p.adelantado,
      pagado: Math.max(0, p.aPagar),
      metodo,
      nota,
    },
  });
  if (error) throw new Error(error.message);
  return data as Cierre;
}

export async function deshacerCierre(companyId: string, id: string): Promise<void> {
  const { error } = await supabase().rpc('comision_cierre_borrar', { p_company: companyId, p_id: id });
  if (error) throw new Error(error.message);
}
