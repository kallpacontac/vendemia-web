/**
 * ══════════════════════════════════════════════════════════════════════════
 * HORARIOS QUE CIERRAN PASADA LA MEDIANOCHE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Una cancha abre de 18:00 a 01:00, o «hasta las 12» (close = '00:00'). Hasta
 * el 29-oct-2026 todo el sistema exigía cierre > apertura y ese día salía
 * CERRADO entero, sin aviso: el panel dejaba guardarlo y la página no ofrecía
 * ni una hora.
 *
 * La regla: si un día cierra a la misma hora o antes de abrir, cierra al día
 * siguiente. Las horas de después de las 00:00 son de ESE día (el jueves de
 * 18:00 a 01:00 cubre el viernes de 00:00 a 01:00), así que una hora está
 * abierta si la cubre su día o la cola del día anterior.
 *
 * La misma regla en Postgres: public.v2_dia_que_cubre (modules/tu-pagina/sql/0011).
 * El bot tiene su copia (capAt) y no la conoce todavía.
 */
import type { ClaveDia, DiaHorario, Horario } from '@/lib/supabase/types';

const CLAVES: ClaveDia[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const aMinutos = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** El tramo de un día en minutos desde SU medianoche; `cierra` pasa de 1440 si cierra al día siguiente. */
export function tramoDe(d: DiaHorario | undefined): { abre: number; cierra: number } | null {
  if (!d || d.closed || !d.open || !d.close) return null;
  const abre = aMinutos(d.open);
  const cierra = aMinutos(d.close);
  return { abre, cierra: cierra > abre ? cierra : cierra + 1440 };
}

/** La clave del día anterior: el lunes → el domingo. */
export const claveAnterior = (clave: ClaveDia): ClaveDia => CLAVES[(CLAVES.indexOf(clave) + 6) % 7];

/**
 * El día cuyo horario cubre el minuto `min` (0–1439) del día `clave`: el
 * propio, o el anterior si cerró pasada la medianoche. null = cerrado.
 */
export function diaQueCubre(h: Horario, clave: ClaveDia, min: number): DiaHorario | null {
  const hoy = tramoDe(h[clave]);
  if (hoy && min >= hoy.abre && min < hoy.cierra) return h[clave]!;
  const ayer = tramoDe(h[claveAnterior(clave)]);
  if (ayer && ayer.cierra > 1440 && min + 1440 < ayer.cierra) return h[claveAnterior(clave)]!;
  return null;
}

export const abiertoEn = (h: Horario, clave: ClaveDia, min: number): boolean => diaQueCubre(h, clave, min) !== null;
