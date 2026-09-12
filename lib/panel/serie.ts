/**
 * ══════════════════════════════════════════════════════════════════════════
 * RANGOS, GRANO Y COMPARACIÓN CON EL PERIODO ANTERIOR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Los números los calcula `analytics_serie` (migración 0026). Aquí solo vive
 * lo que decide la PANTALLA: qué rango se pide, con qué grano, y cómo se dice
 * «un 12 % más que antes» sin mentir.
 *
 * ⚠️ Un número sin línea base no es un KPI, es una lectura. Por eso la
 * comparación con el periodo anterior no es un adorno: «S/ 4.200» no significa
 * nada hasta que se sabe si el mes pasado fueron 3.000 o 6.000.
 */
import { hace, isoLocal } from './format';
import type { GranoSerie, PuntoSerie } from '@/lib/supabase/types';

export interface Rango {
  /** 'YYYY-MM-DD' */
  desde: string;
  hasta: string;
}

export interface Preset {
  clave: string;
  label: string;
  dias: number;
  /** El grano con el que ese rango se lee mejor. Se puede cambiar a mano. */
  grano: GranoSerie;
}

export const PRESETS: Preset[] = [
  { clave: '7d', label: 'Últimos 7 días', dias: 7, grano: 'day' },
  { clave: '30d', label: 'Últimos 30 días', dias: 30, grano: 'day' },
  { clave: '90d', label: 'Últimos 90 días', dias: 90, grano: 'week' },
  { clave: '12m', label: 'Últimos 12 meses', dias: 365, grano: 'month' },
];

export const GRANOS: { valor: GranoSerie; label: string; cubo: string }[] = [
  { valor: 'day', label: 'Día', cubo: 'día' },
  { valor: 'week', label: 'Semana', cubo: 'semana' },
  { valor: 'month', label: 'Mes', cubo: 'mes' },
];

/** Los últimos `dias` contando HOY. 7 días son hoy y los seis anteriores. */
export function rangoDe(dias: number): Rango {
  return { desde: isoLocal(hace(dias - 1)), hasta: isoLocal(new Date()) };
}

/**
 * El mismo número de días, justo antes. Es la línea base de la comparación.
 *
 * ⚠️ El periodo actual incluye HOY, que aún no ha terminado, y el anterior son
 * días completos. Con rangos largos da igual; en «últimos 7 días» hace que la
 * comparación sea ligeramente pesimista. Se dice en la pantalla en vez de
 * disimularlo.
 */
export function anterior(dias: number): Rango {
  return { desde: isoLocal(hace(dias * 2 - 1)), hasta: isoLocal(hace(dias)) };
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «12 sep» · «sem. 8 sep» · «sep 2026». Lo que va debajo de cada barra. */
export function etiquetaCubo(p: PuntoSerie, grano: GranoSerie): string {
  const [a, m, d] = p.periodo.split('-').map(Number);
  const mes = MESES[m - 1] ?? '';
  if (grano === 'month') return `${mes} ${a}`;
  if (grano === 'week') return `sem. ${d} ${mes}`;
  return `${d} ${mes}`;
}

/** El texto largo del tooltip: «del 8 al 14 sep». */
export function rangoCubo(p: PuntoSerie): string {
  const f = (iso: string) => {
    const [, m, d] = iso.split('-').map(Number);
    return `${d} ${MESES[m - 1] ?? ''}`;
  };
  return p.periodo === p.fin ? f(p.periodo) : `del ${f(p.periodo)} al ${f(p.fin)}`;
}

export interface Delta {
  /** Variación en %, redondeada. `null` = no hay con qué comparar. */
  pct: number | null;
  texto: string;
  clase: 'sube' | 'baja' | 'igual';
}

/**
 * Cuánto ha cambiado respecto al periodo anterior.
 *
 * ⚠️ Con la base en 0 NO se enseña un porcentaje. Pasar de 0 a 3 no es «un
 * 300 % más» ni «un ∞ %»: es que antes no había nada, y eso se dice con
 * palabras.
 */
export function delta(actual: number, previo: number): Delta {
  if (previo === 0) {
    if (actual === 0) return { pct: null, texto: 'igual que antes: nada', clase: 'igual' };
    return { pct: null, texto: 'antes no hubo nada', clase: 'sube' };
  }
  const pct = Math.round(((actual - previo) / previo) * 100);
  if (pct === 0) return { pct: 0, texto: 'igual que antes', clase: 'igual' };
  return { pct, texto: `${pct > 0 ? '+' : ''}${pct}%`, clase: pct > 0 ? 'sube' : 'baja' };
}

/** Suma una columna de la serie. Los cubos parciales entran: son días reales. */
export const total = (serie: PuntoSerie[], campo: keyof PuntoSerie): number =>
  serie.reduce((s, p) => s + (typeof p[campo] === 'number' ? (p[campo] as number) : 0), 0);
