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
 * ── La tarifa es la del día en que se completó la cita ───────────────────
 * Desde la 0011 (modules/datos/sql/0011_venta_congelada.sql), al completarse
 * una cita la base copia la regla de cada línea en `comisiones_congeladas`, y
 * aquí manda esa copia: subir el % de alguien no cambia lo que ya ganó. La
 * tarifa de hoy solo se usa para una línea sin copia (la 0011 sin aplicar, o
 * una cita reasignada a otro y aún sin volver a congelar).
 *
 * ── Dos límites aceptados, que la pantalla escribe ───────────────────────
 *   · Una cita, un profesional: `appointment_services` no tiene employee_id,
 *     así que todo se le apunta a quien figure en la cita.
 *   · La venta de producto no genera comisión: no se sabe quién vendió.
 *
 * ── Solo servicios (19-nov-2026, The 24/7: «la comisión solo corresponde a los servicios, no a
 * los productos») ──────────────────────────────────────────────────────────
 * Desde Caja, el ticket lleva en la MISMA cita el corte y la cerveza o el gel, y el % del
 * barbero se aplicaba a todo. Ahora una línea de producto (catalog.tipo = 'producto') no cuenta:
 * ni comisión, ni facturado, ni sale en su lista. Una venta SOLO de productos tampoco es una
 * atención. Va antes que la copia congelada: lo ya congelado con el 50 % de una cerveza no vale.
 *
 * ── «Sin tarifa» congelado no es una tarifa ──────────────────────────────
 * Si al completarse la cita el barbero aún no tenía su %, se congelaba «sin» y se quedaba en
 * S/ 0 para siempre aunque luego se le pusiera (The 24/7, Alexander: 8 atenciones, S/ 0). Ahora
 * «sin» usa la tarifa de hoy. Un 0 puesto a propósito en el servicio se congela como «servicio»
 * con valor 0, no como «sin», así que eso se respeta.
 *
 * ── Ingresos sin ticket (datos 0031, 24-nov-2026, The 24/7) ──────────────
 * Un corte cobrado sin ticket y apuntado a nombre de un barbero (Caja › Cierre › Ingreso) suma a
 * su comisión si el dueño lo dejó así (`suma_comision`). Entra como una «atención» más, con id
 * `ingreso:<id>` (los cierres lo pagan con ese id), al % del barbero CONGELADO el día que se
 * apuntó; si ese día no tenía %, al de hoy.
 */
import type { AppointmentServiceRow, CatalogRow, ComisionCongeladaRow, EmployeeRow } from '@/lib/supabase/types';
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
  /** Un ingreso sin ticket de Caja (datos 0031), no una cita. */
  sinTicket?: boolean;
}

/** Un ingreso sin ticket que suma a la comisión de su barbero (ingresos_con_comision, datos 0031). */
export interface IngresoComision {
  id: string;
  dia: string;
  concepto: string;
  importe: number;
  employee_id: string;
  /** El % del barbero el día que se apuntó. null = no tenía: se usa el de hoy. */
  comision_pct: number | null;
  creado_at?: string;
}

/** El id con que el ingreso entra en la cuenta y en un cierre. */
export const idDeIngreso = (id: string) => `ingreso:${id}`;

/** El ingreso como una cita atendida: así sale en las mismas listas, con su día y su hora. */
function ingresoComoCita(i: IngresoComision): Cita {
  const creado = i.creado_at ? new Date(i.creado_at) : null;
  const mismoDia =
    creado && !Number.isNaN(creado.getTime()) &&
    `${creado.getFullYear()}-${String(creado.getMonth() + 1).padStart(2, '0')}-${String(creado.getDate()).padStart(2, '0')}` === i.dia;
  const inicio = mismoDia && creado ? creado : new Date(`${i.dia}T12:00:00`);
  const hh = `${String(inicio.getHours()).padStart(2, '0')}:${String(inicio.getMinutes()).padStart(2, '0')}`;
  return {
    id: idDeIngreso(i.id),
    company_id: '',
    lead_id: '',
    slot_start: `${i.dia} ${hh}`,
    slot_end: null,
    status: 'completed',
    slot_minutes: null,
    employee_id: i.employee_id,
    service: i.concepto,
    created_at: null,
    created_ts: null,
    pagado_por: 'panel',
    cumplido_por: 'panel',
    inicio,
    recurrente: false,
  } as unknown as Cita;
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

type Tarifa = Pick<CatalogRow, 'comision_pct' | 'comision_monto'> & { tipo?: CatalogRow['tipo'] };

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

/** La misma cuenta, con la regla que se congeló al completarse la cita. */
export function comisionCongelada(
  precio: number,
  c: Pick<ComisionCongeladaRow, 'regla' | 'valor'>,
): { comision: number; regla: Regla; pct: number | null } {
  const v = Number(c.valor ?? 0);
  if (c.regla === 'fija') return { comision: redondear(v), regla: 'fija', pct: null };
  if (c.regla === 'sin') return { comision: 0, regla: 'sin', pct: null };
  return { comision: redondear((precio * v) / 100), regla: c.regla, pct: v };
}

/**
 * @param citas  las del periodo (getCitasDelPeriodo)
 * @param lineas sus líneas de servicio (getServiciosDeCitas)
 * @param ahora  para decidir qué citas «confirmadas» ya pasaron
 * @param congeladas la tarifa de cada línea al completarse (getComisionesCongeladas)
 * @param ingresos los ingresos sin ticket que suman (getIngresosConComision, datos 0031)
 */
export function calcularComisiones(
  citas: Cita[],
  lineas: AppointmentServiceRow[],
  catalogo: (Tarifa & { id: string })[],
  equipo: Pick<EmployeeRow, 'id' | 'comision_pct'>[],
  ahora: Date = new Date(),
  congeladas: ComisionCongeladaRow[] = [],
  ingresos: IngresoComision[] = [],
): ResumenComisiones {
  const congeladaDe = new Map(congeladas.map((c) => [c.linea_id, c]));
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
    const todas = lineasDe.get(cita.id) ?? [];
    // Solo los servicios (ver arriba): las líneas de producto no cuentan.
    const suyas = todas.filter((l) => servicio.get(l.catalog_item_id ?? '')?.tipo !== 'producto');
    if (todas.length > 0 && suyas.length === 0) continue;
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
      // La copia vale si se congeló para quien figura hoy en la cita.
      const c = congeladaDe.get(l.id);
      const r =
        c && c.regla !== 'sin' && (c.employee_id ?? '') === empleado
          ? comisionCongelada(precio, c)
          : comisionDeLinea(precio, servicio.get(l.catalog_item_id ?? ''), pctDe.get(empleado) ?? 0);
      fila.facturado += precio;
      fila.comision += r.comision;
      if (r.regla === 'sin' && precio > 0) fila.sinTarifa += 1;
      fila.lineas.push({ cita, nombre: l.name, precio, ...r });
    }
    porProfesional.set(empleado, fila);
  }

  for (const i of ingresos) {
    const empleado = i.employee_id ?? '';
    if (!empleado) continue;
    const precio = Number(i.importe ?? 0);
    const pct = i.comision_pct != null && Number(i.comision_pct) > 0 ? Number(i.comision_pct) : pctDe.get(empleado) ?? 0;
    const r = comisionDeLinea(precio, undefined, pct);
    const fila =
      porProfesional.get(empleado) ??
      ({ employeeId: empleado, citas: 0, facturado: 0, comision: 0, lineas: [], sinTarifa: 0 } as ComisionProfesional);
    fila.citas += 1;
    fila.facturado += precio;
    fila.comision += r.comision;
    if (r.regla === 'sin' && precio > 0) fila.sinTarifa += 1;
    fila.lineas.push({ cita: ingresoComoCita(i), nombre: /sin ticket/i.test(i.concepto) ? i.concepto : `${i.concepto} · sin ticket`, precio, ...r, sinTicket: true });
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
