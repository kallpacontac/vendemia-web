/**
 * ══════════════════════════════════════════════════════════════════════════
 * CÓMO ATIENDE MIA · los tres modos (bot 24-nov-2026, 0049_modo_atencion)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La autoridad es el bot (src/services/modo-atencion.ts). Esto es su copia para
 * la pantalla, y tiene que decidir LO MISMO que él:
 *
 *  · El híbrido solo vale con `business_mode === 'appointment'` EXACTO. La
 *    academia (`recurring_appointment`) es «de citas» para el resto del panel,
 *    pero el bot la atiende como «cierra»: si aquí se ofreciera, el dueño
 *    elegiría un modo que no se aplica.
 *  · Y con un `servicio_cierre` que siga en el catálogo. Borrado o desactivado,
 *    el bot vuelve solo a «cierra» y lo escribe en su log; la tarjeta lo avisa.
 *
 * Los valores van SIN tilde y en minúscula: el bot rechaza 'híbrido' o 'Meet'
 * con un error que no se reintenta.
 */
import type { BusinessMode } from '@/lib/supabase/types';

export type ModoAtencion = 'cierra' | 'hibrido' | 'dueno';
export type CanalCierre = 'llamada' | 'meet';

export const MODOS_ATENCION: ModoAtencion[] = ['cierra', 'hibrido', 'dueno'];

export const TEXTO_MODO_ATENCION: Record<ModoAtencion, { titulo: string; detalle: (mia: string) => string }> = {
  cierra: {
    titulo: 'Cierra la venta',
    detalle: (mia) => `${mia} vende sola, de principio a fin, como siempre.`,
  },
  hibrido: {
    titulo: 'Híbrido: te deja la llamada agendada',
    detalle: (mia) =>
      `${mia} atiende a los curiosos y a los que solo preguntan el precio. A los interesados de verdad les agenda la llamada, y la venta la cierras tú en esa llamada.`,
  },
  dueno: {
    titulo: 'Lo contestas tú',
    detalle: (mia) =>
      `${mia} no contesta. Guarda cada mensaje y te lo deja en Mensajes como «Te escribió y espera tu respuesta».`,
  },
};

/** Lo que llega del espejo, a uno de los tres. Cualquier otra cosa el bot la lee como 'cierra'. */
export const leerModoAtencion = (v: string | null | undefined): ModoAtencion =>
  v === 'hibrido' || v === 'dueno' ? v : 'cierra';

/** El bot: `canal_cierre === 'meet' ? 'meet' : 'llamada'`. */
export const leerCanalCierre = (v: string | null | undefined): CanalCierre => (v === 'meet' ? 'meet' : 'llamada');

/** ¿Puede este negocio usar el híbrido? El mismo test que el bot. */
export const admiteHibrido = (m: BusinessMode | null | undefined): boolean => m === 'appointment';

export const MOTIVO_SIN_HIBRIDO = 'Necesita agenda: tu negocio no es de citas.';

/** Lo que se puede agendar como llamada: los servicios activos (no los productos). */
export function serviciosDeCierre<T extends { id: string; activo: boolean; tipo?: string | null }>(catalogo: T[]): T[] {
  return catalogo.filter((c) => c.activo && c.tipo !== 'producto');
}

/**
 * Por qué el híbrido elegido NO se está aplicando, o null si se aplica.
 * Es el aviso de la tarjeta, y el bloqueo de guardar cuando lo acaban de tocar.
 */
export function hibridoRoto(
  modo: ModoAtencion,
  businessMode: BusinessMode | null | undefined,
  servicio: string,
  servicios: { id: string }[],
): string | null {
  if (modo !== 'hibrido') return null;
  if (!admiteHibrido(businessMode)) return MOTIVO_SIN_HIBRIDO;
  if (!servicio) return 'Elige qué se agenda: sin un servicio no hay llamada que reservar.';
  if (!servicios.some((s) => s.id === servicio)) return 'El servicio que elegiste ya no está en tu catálogo.';
  return null;
}
