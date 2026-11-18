/**
 * Los periodos de las comisiones, los MISMOS para el dueño (Comisiones) y para el barbero
 * (Mi comisión): si uno mira «esta quincena» y el otro «este mes», las cifras no cuadran y
 * empieza la discusión.
 *
 * Quincenas del 1 al 15 y del 16 a fin de mes, que es como se paga en Perú. Fechas locales
 * ('YYYY-MM-DD'): el bot guarda `slot_start` en hora de Lima.
 */
import { isoLocal } from './format';

export type Periodo = 'hoy' | 'quincena' | 'quincena-anterior' | 'mes' | 'mes-anterior';

export const PERIODOS: [Periodo, string][] = [
  ['hoy', 'Hoy'],
  ['quincena', 'Esta quincena'],
  ['quincena-anterior', 'Quincena anterior'],
  ['mes', 'Este mes'],
  ['mes-anterior', 'Mes anterior'],
];

export function rango(p: Periodo, hoy = new Date()): { desde: string; hasta: string } {
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  const finDe = (yy: number, mm: number) => new Date(yy, mm + 1, 0);
  if (p === 'hoy') return { desde: isoLocal(hoy), hasta: isoLocal(hoy) };
  if (p === 'mes') return { desde: isoLocal(new Date(y, m, 1)), hasta: isoLocal(finDe(y, m)) };
  if (p === 'mes-anterior') return { desde: isoLocal(new Date(y, m - 1, 1)), hasta: isoLocal(finDe(y, m - 1)) };
  const primera = hoy.getDate() <= 15;
  if (p === 'quincena') {
    return primera
      ? { desde: isoLocal(new Date(y, m, 1)), hasta: isoLocal(new Date(y, m, 15)) }
      : { desde: isoLocal(new Date(y, m, 16)), hasta: isoLocal(finDe(y, m)) };
  }
  // quincena anterior
  return primera
    ? { desde: isoLocal(new Date(y, m - 1, 16)), hasta: isoLocal(finDe(y, m - 1)) }
    : { desde: isoLocal(new Date(y, m, 1)), hasta: isoLocal(new Date(y, m, 15)) };
}
