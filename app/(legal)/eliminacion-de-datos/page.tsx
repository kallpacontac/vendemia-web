import type { Metadata } from 'next';
import Marco from '@/components/legal/Marco';
import Bloques from '@/components/legal/Bloques';
import { ELIMINACION } from '@/lib/legal';

/**
 * ⚠️ ESTA URL SE REGISTRA EN LA APP DE META («instrucciones para eliminar
 * datos»). Si cambia la ruta, hay que cambiarla allí también, o la app queda
 * apuntando a un 404 y la revisión la rechaza.
 */
export const metadata: Metadata = {
  title: 'Eliminación de datos · Vendemia',
  description: 'Cómo pedir que Vendemia elimine tus datos: a quién escribir, qué se borra y en qué plazo.',
  alternates: { canonical: '/eliminacion-de-datos' },
};

export default function Pagina() {
  return (
    <Marco titulo={ELIMINACION.titulo} bajada={ELIMINACION.bajada}>
      <Bloques bloques={ELIMINACION.bloques} />
    </Marco>
  );
}
