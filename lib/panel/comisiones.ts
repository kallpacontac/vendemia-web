/**
 * ══════════════════════════════════════════════════════════════════════════
 * COMISIONES · cuánto le toca a cada profesional
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Se calcula AQUÍ, en el panel, y en ningún otro sitio: el bot solo guarda las
 * tarifas (docs/prompt-bot-comisiones-y-caja.md). Dos sitios que calculan lo
 * mismo acaban dando dos cifras, y con sueldos de por medio eso es una
 * discusión.
 *
 * ── Qué devenga comisión ─────────────────────────────────────────────────
 * Solo la cita COMPLETADA (decisión de Alvaro, 18-sep-2026). Una confirmada
 * todavía no ha ocurrido, y pagarla crea una deuda si luego no viene. Por eso
 * la comisión de un periodo es SIEMPRE menor que sus ingresos: los ingresos sí
 * cuentan las confirmadas (lib/panel/dinero.ts). La pantalla lo dice.
 *
 * ── La regla, por cada línea de servicio de la cita ──────────────────────
 *   1. el servicio tiene comisión fija        → esa cantidad
 *   2. el servicio tiene comisión en %        → precio × % / 100
 *   3. si no, la del profesional (en %)       → precio × % / 100
 *   4. nada de lo anterior                    → 0, y la pantalla lo dice
 *
 * Un 0 explícito en el servicio es «este servicio no paga comisión», y gana a
 * la del profesional. Vacío (null) es «usa la del profesional». No son lo mismo.
 *
 * ── Dos límites aceptados, que la pantalla escribe ───────────────────────
 *   · Una cita, un profesional: `appointment_services` no tiene employee_id,
 *     así que todo se le apunta a quien figure en la cita.
 *   · La venta de producto no genera comisión: no se sabe quién vendió.
 */
import type { AppointmentServiceRow, CatalogRow, EmployeeRow } from '@/lib/supabase/types';
import type { Cita } from '@/lib/supabase/queries';

export type Regla = 'fija' | 'servicio' | 'profesional' | 'sin';

export interface LineaComision {
  cita: Cita;
  nombre: string;
  precio: number;
  comision: number;
  regla: Regla;
  /** El % aplicado, para enseñarlo. null con comisión fija o sin comisión. */
  pct: number | null;
}

export interface ComisionProfesional {
  /** '' = citas sin profesional asignado. */
  employeeId: string;
  citas: number;
  facturado: number;
  comision: number;
  lineas: LineaComision[];
  /** Líneas que salieron a 0 porque no hay ninguna tarifa puesta. */
  sinTarifa: number;
}

export interface ResumenComisiones {
  profesionales: ComisionProfesional[];
  total: number;
  /** Citas con la hora ya pasada que siguen `confirmed`: nadie dijo si vino. */
  sinMarcar: { citas: number; importe: number };
}

const redondear = (n: number) => Math.round(n * 100) / 100;

type Tarifa = Pick<CatalogRow, 'comision_pct' | 'comision_monto'>;

export function comisionDeLinea(
  precio: number,
  servicio: Tarifa | undefined,
  pctProfesional: number,
): { comision: number; regla: Regla; pct: number | null } {
  if (servicio?.comision_monto != null) {
    return { comision: redondear(Number(servicio.comision_monto)), regla: 'fija', pct: null };
  }
  if (servicio?.comision_pct != null) {
    const pct = Number(servicio.comision_pct);
    return { comision: redondear((precio * pct) / 100), regla: 'servicio', pct };
  }
  if (pctProfesional > 0) {
    return { comision: redondear((precio * pctProfesional) / 100), regla: 'profesional', pct: pctProfesional };
  }
  return { comision: 0, regla: 'sin', pct: null };
}

/**
 * @param citas  las del periodo (getCitasDelPeriodo)
 * @param lineas sus líneas de servicio (getServiciosDeCitas)
 * @param ahora  para decidir qué citas «confirmadas» ya pasaron
 */
export function calcularComisiones(
  citas: Cita[],
  lineas: AppointmentServiceRow[],
  catalogo: (Tarifa & { id: string })[],
  equipo: Pick<EmployeeRow, 'id' | 'comision_pct'>[],
  ahora: Date = new Date(),
): ResumenComisiones {
  const servicio = new Map(catalogo.map((c) => [c.id, c]));
  const pctDe = new Map(equipo.map((p) => [p.id, Number(p.comision_pct ?? 0)]));
  const lineasDe = new Map<string, AppointmentServiceRow[]>();
  for (const l of lineas) {
    const lista = lineasDe.get(l.appointment_id) ?? [];
    lista.push(l);
    lineasDe.set(l.appointment_id, lista);
  }

  const porProfesional = new Map<string, ComisionProfesional>();
  let sinMarcarCitas = 0;
  let sinMarcarImporte = 0;

  for (const cita of citas) {
    const suyas = lineasDe.get(cita.id) ?? [];
    const importe = suyas.reduce((t, l) => t + Number(l.price ?? 0), 0);

    if (cita.status === 'confirmed' && cita.inicio && cita.inicio.getTime() < ahora.getTime()) {
      sinMarcarCitas += 1;
      sinMarcarImporte += importe;
      continue;
    }
    if (cita.status !== 'completed') continue;

    const empleado = cita.employee_id ?? '';
    const fila =
      porProfesional.get(empleado) ??
      ({ employeeId: empleado, citas: 0, facturado: 0, comision: 0, lineas: [], sinTarifa: 0 } as ComisionProfesional);
    fila.citas += 1;

    for (const l of suyas) {
      const precio = Number(l.price ?? 0);
      const r = comisionDeLinea(precio, servicio.get(l.catalog_item_id ?? ''), pctDe.get(empleado) ?? 0);
      fila.facturado += precio;
      fila.comision += r.comision;
      if (r.regla === 'sin' && precio > 0) fila.sinTarifa += 1;
      fila.lineas.push({ cita, nombre: l.name, precio, ...r });
    }
    porProfesional.set(empleado, fila);
  }

  const profesionales = [...porProfesional.values()]
    .map((p) => ({ ...p, facturado: redondear(p.facturado), comision: redondear(p.comision) }))
    // Primero quien más cobra; «sin asignar» siempre al final.
    .sort((a, b) => (a.employeeId === '' ? 1 : b.employeeId === '' ? -1 : b.comision - a.comision));

  return {
    profesionales,
    total: redondear(profesionales.reduce((t, p) => t + p.comision, 0)),
    sinMarcar: { citas: sinMarcarCitas, importe: redondear(sinMarcarImporte) },
  };
}
