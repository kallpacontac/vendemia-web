import type { AppointmentRow, CatalogRow, FranjaRecurrente, ProductoIngreso, RetargetingRow } from '../supabase/types';
import { json } from '../supabase/parse';
import { familias } from './alumnos';
import { claveGrupo, ocupa } from './inscripciones';

/** La participación usa TODO el catálogo vendido, nunca solo los cinco visibles. */
export function rendimientoProductos(actual: ProductoIngreso[], anterior: ProductoIngreso[] | null) {
  const agrupar = (filas: ProductoIngreso[]) => {
    const mapa = new Map<string, ProductoIngreso>();
    for (const p of filas) {
      const previo = mapa.get(p.name);
      mapa.set(p.name, { name: p.name, revenue: (previo?.revenue ?? 0) + Number(p.revenue), units: (previo?.units ?? 0) + Number(p.units) });
    }
    return mapa;
  };
  const actuales = agrupar(actual);
  const previos = anterior === null ? null : agrupar(anterior);
  const ingreso = [...actuales.values()].reduce((s, p) => s + p.revenue, 0);
  const unidades = [...actuales.values()].reduce((s, p) => s + p.units, 0);
  const nombres = new Set([...actuales.keys(), ...(previos?.keys() ?? [])]);
  const filas = [...nombres].map((name) => {
    const p = actuales.get(name) ?? { name, revenue: 0, units: 0 };
    const previo = previos ? previos.get(name)?.revenue ?? 0 : null;
    return { ...p, previo, participacion: ingreso > 0 ? p.revenue / ingreso * 100 : 0,
      diferencia: previo === null ? null : p.revenue - previo,
      cambio: previo !== null && previo > 0 ? (p.revenue - previo) / previo * 100 : null };
  }).sort((a, b) => b.revenue - a.revenue || b.units - a.units || a.name.localeCompare(b.name));
  // No llamamos «crecimiento» a un artículo sin línea base.
  const crecimiento = filas.filter((p) => (p.previo ?? 0) > 0 && (p.diferencia ?? 0) > 0)
    .sort((a, b) => (b.diferencia ?? 0) - (a.diferencia ?? 0))[0] ?? null;
  return { filas, ingreso, unidades, lider: filas.find((p) => p.revenue > 0) ?? null, crecimiento };
}

export function resumenAcademia(citas: AppointmentRow[], catalogo: CatalogRow[], hoy: string) {
  const alumnos = familias(citas, [], catalogo, new Map(), hoy).flatMap((f) => f.alumnos);
  const renovaciones = alumnos.filter((a) => a.porRenovar);
  const porId = new Map(citas.map((c) => [c.id, c]));
  const programas = catalogo.filter((c) => c.is_active !== 0 && c.is_active !== false as unknown).map((c) => {
    const grupos = json<FranjaRecurrente[]>(c.schedule_slots, []).filter((g) => !!g.id).map((g) => {
      const clave = claveGrupo(c.id, g.id);
      const inscritos = citas.filter((a) => ocupa(a, clave, hoy)).length;
      // -1 es ilimitado; nunca representarlo como cero plazas.
      const capacidad = Number.isFinite(g.capacity) && g.capacity >= 0 ? g.capacity : null;
      return { clave, nombre: g.label || g.id, inscritos, capacidad,
        libres: capacidad === null ? null : Math.max(0, capacidad - inscritos),
        renovaciones: renovaciones.filter((a) => porId.get(a.id)?.slot_start === clave).length };
    });
    return { id: c.id, nombre: c.name, grupos };
  }).filter((p) => p.grupos.length > 0);
  const grupos = programas.flatMap((p) => p.grupos);
  return { programas, renovaciones: renovaciones.length,
    ocupadas: grupos.reduce((s, g) => s + g.inscritos, 0),
    libres: grupos.reduce((s, g) => s + (g.libres ?? 0), 0),
    ilimitados: grupos.filter((g) => g.capacidad === null).length };
}
export type ResumenAcademia = ReturnType<typeof resumenAcademia>;

/** Solo el motivo principal: coincide con los filtros de Seguimiento y evita duplicados. */
export function contarMotivo(filas: RetargetingRow[], companyId: string, motivo: string) {
  return new Set(filas.filter((f) => f.company_id === companyId && f.motivo === motivo).map((f) => f.lead_id)).size;
}
