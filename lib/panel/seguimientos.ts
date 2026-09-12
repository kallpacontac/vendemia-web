/**
 * ══════════════════════════════════════════════════════════════════════════
 * ¿SIRVE DE ALGO ESCRIBIRLES? · la tasa de recuperación
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Cada «Ya le escribí» de la pantalla de Retargeting deja una fila en
 * `seguimientos`, y el bot marca `venta_at` si ese cliente compró en los 7 días
 * siguientes (migración 0025).
 *
 * DOS REGLAS, o la cifra miente:
 *
 * 1 · SOLO CUENTAN LOS QUE YA TIENEN LA VENTANA CERRADA. Un mensaje enviado
 *     anteayer todavía puede convertir; contarlo como fallo hunde la tasa sin
 *     motivo. Eso es un error de medición, no un matiz.
 *
 * 2 · SE DICE COMO ACIERTOS SOBRE INTENTOS: «3 de 12 mensajes acabaron en
 *     venta». Un «3/12» suelto se lee como fallos la mitad de las veces.
 *
 * Y si todavía no hay ningún intento con la ventana cerrada, no se pinta una
 * tasa: se dice «aún sin medir». Un 0 % ahí es una afirmación falsa.
 */
import type { SeguimientoRow } from '@/lib/supabase/types';

/** La ventana que da por buena una venta. La decide el bot; aquí se copia. */
export const VENTANA_DIAS = 7;

export interface Recuperacion {
  /** Mensajes con la ventana ya cerrada. Es el denominador. */
  intentos: number;
  /** De esos, cuántos acabaron en venta. */
  ventas: number;
  /** Enviados hace menos de 7 días: aún pueden convertir, no son fallos. */
  enCurso: number;
  /** 0–100, o `null` si no hay nada que medir todavía. */
  pct: number | null;
}

export function recuperacion(filas: SeguimientoRow[], ahora = Date.now()): Recuperacion {
  const corte = ahora / 1000 - VENTANA_DIAS * 86400;
  let intentos = 0;
  let ventas = 0;
  let enCurso = 0;

  for (const f of filas) {
    if (f.enviado_at > corte) {
      enCurso++;
      continue;
    }
    intentos++;
    if (f.venta_at > 0) ventas++;
  }

  return {
    intentos,
    ventas,
    enCurso,
    pct: intentos ? Math.round((ventas / intentos) * 100) : null,
  };
}

/** «3 de 12 mensajes acabaron en venta». Nunca «3/12». */
export function textoRecuperacion(r: Recuperacion): string {
  if (!r.intentos) return 'Aún sin medir';
  return `${r.ventas} de ${r.intentos} mensaje${r.intentos > 1 ? 's' : ''} acabaron en venta`;
}

/** Lo mismo desglosado por motivo, para ver cuál merece la pena. */
export function porMotivo(filas: SeguimientoRow[], ahora = Date.now()): { motivo: string; r: Recuperacion }[] {
  const grupos = new Map<string, SeguimientoRow[]>();
  for (const f of filas) grupos.set(f.motivo, [...(grupos.get(f.motivo) ?? []), f]);
  return [...grupos]
    .map(([motivo, fs]) => ({ motivo, r: recuperacion(fs, ahora) }))
    .filter((g) => g.r.intentos > 0)
    .sort((a, b) => b.r.intentos - a.r.intentos);
}
