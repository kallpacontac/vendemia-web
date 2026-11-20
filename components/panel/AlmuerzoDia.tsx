'use client';

/**
 * El almuerzo (o cualquier descanso) de un día del horario: «de 13:00 a 14:30». Va debajo de la fila
 * del día, en el horario del negocio (Ajustes) y en el de cada barbero (Equipo).
 *
 * The 24/7, 20-nov-2026: «en los horarios no hay para poner hora de almuerzo 1 a 2:30 pm». En ese rato
 * no hay turno: la página no lo ofrece y la reserva no lo acepta (datos 0027, lib/panel/medianoche.ts).
 */
import { Coffee } from 'lucide-react';
import type { DiaHorario } from '@/lib/supabase/types';
import './almuerzo.css';

const ALMUERZO = { break_start: '13:00', break_end: '14:30' };

/** Lo que falla en el descanso de un día abierto, o null. */
export function errorDeDescanso(nombre: string, d: DiaHorario | undefined): string | null {
  if (!d || d.closed || (!d.break_start && !d.break_end)) return null;
  if (!d.break_start || !d.break_end) return `${nombre}: falta la hora de empezar o de terminar el almuerzo`;
  if (d.break_start >= d.break_end) return `${nombre}: el almuerzo termina (${d.break_end}) antes de empezar (${d.break_start})`;
  if (d.open && d.close && d.open < d.close && (d.break_start < d.open || d.break_end > d.close)) {
    return `${nombre}: el almuerzo (${d.break_start}–${d.break_end}) tiene que estar dentro del horario (${d.open}–${d.close})`;
  }
  return null;
}

/** Sin descanso: quita las dos claves (no deja `break_start: undefined` en el JSON). */
export function sinDescanso(d: DiaHorario | undefined): DiaHorario {
  const { break_start: _a, break_end: _b, ...resto } = d ?? {};
  return resto;
}

export default function AlmuerzoDia({ dia, abierto, alCambiar, alTodos }: {
  dia: DiaHorario | undefined;
  /** El día está abierto: si no, no hay almuerzo que poner. */
  abierto: boolean;
  alCambiar: (d: DiaHorario) => void;
  /** «Igual todos los días»: el mismo almuerzo en todos los días abiertos. */
  alTodos?: (desde: string, hasta: string) => void;
}) {
  if (!abierto) return null;
  const tiene = Boolean(dia?.break_start || dia?.break_end);
  if (!tiene) {
    return (
      <div className="almuerzo">
        <button type="button" className="almuerzo__poner" onClick={() => alCambiar({ ...dia, ...ALMUERZO })}>
          <Coffee size={14} aria-hidden="true" /> Añadir almuerzo
        </button>
      </div>
    );
  }
  return (
    <div className="almuerzo almuerzo--on">
      <span className="almuerzo__rotulo"><Coffee size={14} aria-hidden="true" /> Almuerzo</span>
      <input type="time" aria-label="Empieza el almuerzo" value={dia?.break_start ?? ''}
        onChange={(e) => alCambiar({ ...dia, break_start: e.target.value })} />
      <span className="muted">a</span>
      <input type="time" aria-label="Termina el almuerzo" value={dia?.break_end ?? ''}
        onChange={(e) => alCambiar({ ...dia, break_end: e.target.value })} />
      {alTodos && dia?.break_start && dia.break_end && (
        <button type="button" className="almuerzo__link" onClick={() => alTodos(dia.break_start!, dia.break_end!)}>
          Igual todos los días
        </button>
      )}
      <button type="button" className="almuerzo__link" onClick={() => alCambiar(sinDescanso(dia))}>Quitar</button>
    </div>
  );
}
