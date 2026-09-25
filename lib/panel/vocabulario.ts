/**
 * ══════════════════════════════════════════════════════════════════════════
 * CÓMO SE LLAMA CADA COSA EN CADA NEGOCIO
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Una academia no tiene «citas»: tiene alumnos que reservan plaza en clases.
 * Una barbería sí tiene citas. Una tienda tiene pedidos. El panel decía «cita»
 * en todas partes, y a una academia le hablaba como a una peluquería.
 *
 * Todo texto del panel que nombre lo que se agenda, lo que se vende o a quién
 * se atiende sale de aquí, según `business_mode`. Si escribes uno nuevo, no
 * pongas «cita» a mano: usa `vocabulario(modo)`.
 *
 *   appointment            barbería, salón, clínica   → cita · servicio · cliente
 *   recurring_appointment  academia, gimnasio         → reserva · clase · alumno
 *   ecommerce              tienda                     → pedido · producto · cliente
 *
 * Sin modo (una compañía recién creada) se habla como a una de citas, que es lo
 * que eran todas antes de que existieran los otros dos.
 */
import type { BusinessMode } from '@/lib/supabase/types';

export interface Vocabulario {
  /** Lo que se reserva o compra, una fila de la agenda: «cita», «reserva», «pedido». */
  reserva: string;
  reservas: string;
  /** Lo que ocurre en el calendario: «cita», «clase». En una tienda, lo mismo que `reserva`. */
  sesion: string;
  sesiones: string;
  /** Lo que hay en el catálogo: «servicio», «clase», «producto». */
  item: string;
  items: string;
  /** Para quién es el servicio: «cliente», «alumno». */
  persona: string;
  personas: string;
  /** Nombre de la sección de agenda en el menú y en su cabecera. */
  agenda: string;
  /**
   * Concordancia de género de `reserva`, para no escribir «cita cancelado» o
   * «pedido cancelada»: `la`/`el`, `esta`/`este`, `una`/`un`, y la terminación
   * de los participios (`a`/`o`: «movid${a}»).
   */
  la: 'la' | 'el';
  esta: 'esta' | 'este';
  una: 'una' | 'un';
  a: 'a' | 'o';
  /** Lo mismo para `item`: «el servicio», «la clase», «el producto». */
  laItem: 'la' | 'el';
  aItem: 'a' | 'o';
}

const CITAS: Vocabulario = {
  reserva: 'cita',
  reservas: 'citas',
  sesion: 'cita',
  sesiones: 'citas',
  item: 'servicio',
  items: 'servicios',
  persona: 'cliente',
  personas: 'clientes',
  agenda: 'Agenda',
  la: 'la',
  esta: 'esta',
  una: 'una',
  a: 'a',
  laItem: 'el',
  aItem: 'o',
};

const ACADEMIA: Vocabulario = {
  reserva: 'reserva',
  reservas: 'reservas',
  sesion: 'clase',
  sesiones: 'clases',
  item: 'clase',
  items: 'clases',
  persona: 'alumno',
  personas: 'alumnos',
  agenda: 'Clases',
  la: 'la',
  esta: 'esta',
  una: 'una',
  a: 'a',
  laItem: 'la',
  aItem: 'a',
};

const TIENDA: Vocabulario = {
  reserva: 'pedido',
  reservas: 'pedidos',
  sesion: 'pedido',
  sesiones: 'pedidos',
  item: 'producto',
  items: 'productos',
  persona: 'cliente',
  personas: 'clientes',
  agenda: 'Agenda',
  la: 'el',
  esta: 'este',
  una: 'un',
  a: 'o',
  laItem: 'el',
  aItem: 'o',
};

export function vocabulario(modo: BusinessMode | null | undefined): Vocabulario {
  if (modo === 'recurring_appointment') return ACADEMIA;
  if (modo === 'ecommerce') return TIENDA;
  return CITAS;
}

/** «cita» → «Cita». Para títulos y principio de frase. */
export const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);
