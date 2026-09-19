/**
 * A qué negocio le sirve cada cosa, en un sitio.
 *
 * El backend tiene sus dos predicados (`isAppointmentMode`, `isRecurringAppointment`,
 * ver docs/configuration-guide.md del bot); el panel no tenía los suyos y cada
 * pantalla repetía `=== 'appointment'` a mano. Estos son esos predicados, para
 * ocultar o mostrar secciones según `business_mode` sin reescribir la comparación
 * en cada sitio.
 */
import type { BusinessMode } from '@/lib/supabase/types';

export const esCita = (m: BusinessMode | null | undefined): boolean => m === 'appointment';

export const esRecurrente = (m: BusinessMode | null | undefined): boolean =>
  m === 'recurring_appointment';

/** Cita puntual o grupo recurrente: los dos negocios que agendan, frente al que vende productos. */
export const esAppointmentFamily = (m: BusinessMode | null | undefined): boolean =>
  esCita(m) || esRecurrente(m);

export const esEcommerce = (m: BusinessMode | null | undefined): boolean => m === 'ecommerce';
