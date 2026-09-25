'use client';

import { useSesion } from './Sesion';
import { vocabulario, type Vocabulario } from '@/lib/panel/vocabulario';

/**
 * Las palabras del negocio activo («cita» o «reserva», «servicio» o «clase»…),
 * para los componentes que no reciben el modo por props. Sale de la compañía
 * de la sesión, la misma que decide qué entradas enseña la barra lateral.
 * Ver lib/panel/vocabulario.
 */
export function useVocabulario(): Vocabulario {
  const { compania } = useSesion();
  return vocabulario(compania?.business_mode);
}
