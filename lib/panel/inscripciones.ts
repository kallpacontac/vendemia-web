/**
 * ══════════════════════════════════════════════════════════════════════════
 * INSCRIPCIONES RECURRENTES · quién ocupa plaza en un grupo
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ ESTA REGLA ES LA DEL BOT, COPIADA. No la «mejores» aquí.
 *
 * Es `getScheduleGroupCounts` (src/services/db.service.ts del bot): una fila
 * ocupa plaza si es de ESE grupo, está `confirmed` y su periodo cubre el día.
 * Si el panel contara de otra forma, enseñaría un grupo con sitio libre que el
 * bot da por lleno —o al revés— y el dueño dejaría de fiarse de las dos cosas.
 *
 * Tres detalles que costaron un 0 permanente en la agenda:
 *
 *   · LA CLAVE ES `sched:<producto>:<grupo>`, no `sched:<grupo>`. El id del
 *     grupo (`manana-lmv`) se repite en cada nivel; solo la pareja es única.
 *   · `pending_payment` NO ocupa plaza: el bot no la cuenta hasta que se paga.
 *     Se enseña aparte («2 reservando»), nunca sumada.
 *   · Una fila SIN periodo cuenta siempre: es anterior a la columna (0027).
 *     Ante la duda, lleno.
 *
 * Las que ya terminaron su periodo las cierra el cron como `completed`, así que
 * salen solas de la cuenta — que es exactamente lo que tiene que pasar.
 */
import type { AppointmentRow } from '@/lib/supabase/types';

type Fila = Pick<AppointmentRow, 'slot_start' | 'status' | 'periodo_desde' | 'periodo_hasta'>;

/** Hoy en hora de Lima, 'YYYY-MM-DD'. La misma que usa el bot (`hoyLima`). */
export const hoyLima = (): string =>
  new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });

/** `sched:<id del producto>:<id del grupo>` — makeSchedSlotStart en el bot. */
export const claveGrupo = (productoId: string, grupoId: string): string =>
  `sched:${productoId}:${grupoId}`;

/** ¿Su periodo cubre este día? Las fechas 'YYYY-MM-DD' se comparan como texto. */
const cubre = (c: Fila, dia: string): boolean =>
  !c.periodo_desde || (c.periodo_desde <= dia && (c.periodo_hasta ?? '') >= dia);

/** Ocupa plaza HOY. Es el número que se compara con el aforo. */
export const ocupa = (c: Fila, clave: string, hoy: string): boolean =>
  c.slot_start === clave && c.status === 'confirmed' && cubre(c, hoy);

/**
 * Apartó plaza y no ha pagado. Solo las que siguen vivas: una
 * `pending_payment` de un periodo que ya terminó no está reservando nada.
 */
export const reservando = (c: Fila, clave: string, hoy: string): boolean =>
  c.slot_start === clave &&
  c.status === 'pending_payment' &&
  (!c.periodo_hasta || c.periodo_hasta >= hoy);

/**
 * Pagado para un periodo que AÚN NO HA EMPEZADO: los que renovaron el mes que
 * viene, y los que se inscribieron a mitad de mes para arrancar el siguiente.
 * Sin periodo no cuenta aquí: esa fila ya está contada en `ocupa`.
 */
export const adelantada = (c: Fila, clave: string, hoy: string): boolean =>
  c.slot_start === clave &&
  c.status === 'confirmed' &&
  Boolean(c.periodo_desde) &&
  (c.periodo_desde ?? '') > hoy;

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** El mes de un 'YYYY-MM-DD', en palabra: «octubre». */
export const mesDe = (dia: string): string => MESES[Number(dia.slice(5, 7)) - 1] ?? dia;

/**
 * «octubre» · «octubre a diciembre» · «diciembre de 2026 a febrero de 2027».
 * Es `periodoLegible` del bot: lo mismo que Mia le dice al cliente.
 */
export function periodoLegible(desde: string | null, hasta: string | null): string {
  if (!desde || !hasta) return '';
  const [ay, am] = desde.split('-').map(Number);
  const [by, bm] = hasta.split('-').map(Number);
  const a = MESES[am - 1];
  const b = MESES[bm - 1];
  if (ay === by && am === bm) return a;
  return ay === by ? `${a} a ${b}` : `${a} de ${ay} a ${b} de ${by}`;
}

/** Texto de la ficha del producto para `vigencia_meses`. */
export function textoVigencia(meses: number): string {
  return meses === 1
    ? '1 mes · El alumno ocupa su plaza durante el mes calendario en que empiezan sus clases.'
    : `${meses} meses · El alumno ocupa su plaza durante ${meses} meses calendario, contando desde el mes en que empiezan sus clases.`;
}
