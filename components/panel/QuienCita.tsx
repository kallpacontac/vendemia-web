import { quienDeCita } from '@/lib/panel/ficha';
import type { Cita } from '@/lib/supabase/queries';

/**
 * El nombre de quien recibe la cita y, debajo y en pequeño, quien la pidió
 * cuando no es la misma persona. La regla vive en quienDeCita().
 */
export default function QuienCita({
  c,
  contacto,
  sinNombre,
}: {
  c: Pick<Cita, 'beneficiario' | 'beneficiario_edad' | 'slot_start'>;
  /** El nombre del lead (o su teléfono). */
  contacto: string | null | undefined;
  sinNombre?: string;
}) {
  const q = quienDeCita(c, contacto, sinNombre);
  return (
    <>
      <b>{q.nombre}</b>
      {q.deQuien && <small className="muted">{q.deQuien}</small>}
    </>
  );
}
