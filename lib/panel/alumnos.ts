/**
 * ══════════════════════════════════════════════════════════════════════════
 * ALUMNOS · quién está inscrito, con qué, hasta cuándo, y si está al día
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Para negocios recurrentes (academias). Se agrupa por FAMILIA —el lead que
 * escribe y paga— porque la deuda es de la venta, no del alumno: una madre con
 * tres hijos es un saldo, no tres (lib/panel/saldo.ts). Dentro van sus alumnos,
 * cada uno con su nivel, su grupo y el mes que cubre.
 *
 * Un alumno no es un lead (ver la memoria «un cliente no es una persona»): es
 * `beneficiario` si lo hay, y si no, el propio lead. Las filas del mismo alumno
 * en el mismo grupo (este mes y el siguiente, ya renovado) se juntan en una,
 * quedándose con la que cubre hasta más tarde.
 */
import { claveGrupo, periodoLegible } from '@/lib/panel/inscripciones';
import { esInscripcionViva, type VentaLead } from '@/lib/panel/saldo';
import { json } from '@/lib/supabase/parse';
import type { AppointmentRow, FranjaRecurrente } from '@/lib/supabase/types';

/** Cuántos días antes de que acabe su periodo se avisa de renovar. */
export const DIAS_AVISO_RENOVAR = 7;

type Inscripcion = Pick<
  AppointmentRow,
  | 'id'
  | 'lead_id'
  | 'status'
  | 'slot_start'
  | 'created_at'
  | 'service'
  | 'beneficiario'
  | 'beneficiario_edad'
  | 'periodo_desde'
  | 'periodo_hasta'
>;

export interface Alumno {
  /** id de la inscripción que se enseña (la que cubre hasta más tarde). */
  id: string;
  nombre: string;
  edad: string;
  /** El producto: «Nivel Básico / Pollito». */
  nivel: string;
  /** La franja: «Sábados mañana (10–11am)». */
  grupo: string;
  /** «cubre octubre», «sin periodo», «sin pagar». */
  cubre: string;
  periodoHasta: string | null;
  sinCupo: boolean;
  /** Su periodo acaba en ≤ DIAS_AVISO_RENOVAR días y no hay otro después. */
  porRenovar: boolean;
}

export type EstadoFamilia = 'al_dia' | 'debe' | 'por_pagar';

export interface Familia {
  leadId: string;
  responsable: string;
  telefono: string;
  alumnos: Alumno[];
  venta: VentaLead | undefined;
  estado: EstadoFamilia;
  debe: number;
}

const sumarDias = (dia: string, n: number): string => {
  const d = new Date(`${dia}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export function familias(
  citas: Inscripcion[],
  leads: { id: string; name: string | null; phone: string }[],
  catalogo: { id: string; schedule_slots: string | null }[],
  ventas: Map<string, VentaLead>,
  hoy: string,
): Familia[] {
  // «sched:<producto>:<grupo>» → «Sábados mañana (10–11am)»
  const etiquetaGrupo = new Map<string, string>();
  for (const c of catalogo) {
    for (const f of json<FranjaRecurrente[]>(c.schedule_slots, [])) {
      etiquetaGrupo.set(claveGrupo(c.id, f.id), f.label ?? f.id);
    }
  }
  const lead = new Map(leads.map((l) => [l.id, l]));
  const limite = sumarDias(hoy, DIAS_AVISO_RENOVAR);

  // Lead → (alumno+grupo) → sus inscripciones vivas
  const porLead = new Map<string, Map<string, Inscripcion[]>>();
  for (const c of citas) {
    if (!esInscripcionViva(c)) continue;
    const quien = (c.beneficiario ?? '').trim().toLowerCase();
    const clave = `${quien}|${c.slot_start}`;
    const grupos = porLead.get(c.lead_id) ?? new Map<string, Inscripcion[]>();
    grupos.set(clave, [...(grupos.get(clave) ?? []), c]);
    porLead.set(c.lead_id, grupos);
  }

  const salida: Familia[] = [];
  for (const [leadId, grupos] of porLead) {
    const l = lead.get(leadId);
    const responsable = l?.name || l?.phone || 'Sin nombre';
    const alumnos: Alumno[] = [];
    for (const filas of grupos.values()) {
      // La que cubre hasta más tarde; sin periodo cuenta como «siempre».
      const ultima = [...filas].sort((a, b) =>
        (b.periodo_hasta ?? '9999').localeCompare(a.periodo_hasta ?? '9999'),
      )[0];
      const confirmada = filas.find((f) => f.status === 'confirmed');
      const hasta = confirmada ? (ultima.status === 'confirmed' ? ultima.periodo_hasta : confirmada.periodo_hasta) : null;
      alumnos.push({
        id: ultima.id,
        nombre: (ultima.beneficiario ?? '').trim() || responsable,
        edad: (ultima.beneficiario_edad ?? '').trim(),
        nivel: ultima.service ?? '',
        grupo: etiquetaGrupo.get(ultima.slot_start ?? '') ?? '',
        cubre: !confirmada
          ? 'sin pagar · sin cupo'
          : hasta
            ? `cubre ${periodoLegible(confirmada.periodo_desde, hasta)}`
            : 'sin periodo',
        periodoHasta: hasta ?? null,
        sinCupo: !confirmada,
        porRenovar: !!hasta && hasta >= hoy && hasta <= limite && !filas.some((f) => f.status === 'pending_payment'),
      });
    }
    alumnos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    const venta = ventas.get(leadId);
    const tieneCupo = alumnos.some((a) => !a.sinCupo);
    const debe = venta?.saldo.saldo ?? 0;
    salida.push({
      leadId,
      responsable,
      telefono: l?.phone ?? '',
      alumnos,
      venta,
      estado: !tieneCupo ? 'por_pagar' : debe > 0 ? 'debe' : 'al_dia',
      debe,
    });
  }

  // Primero lo que hay que cobrar (más deuda primero), luego por pagar, luego al día.
  const orden: Record<EstadoFamilia, number> = { debe: 0, por_pagar: 1, al_dia: 2 };
  return salida.sort(
    (a, b) => orden[a.estado] - orden[b.estado] || b.debe - a.debe || a.responsable.localeCompare(b.responsable, 'es'),
  );
}
