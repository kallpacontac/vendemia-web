import type { Metadata } from 'next';
import Marco from '@/components/legal/Marco';
import Bloques from '@/components/legal/Bloques';
import { TERMINOS } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Términos del servicio · Vendemia',
  description: 'Condiciones de uso de Vendemia: qué incluye el servicio, precios, cancelación y responsabilidades.',
  alternates: { canonical: '/terminos' },
};

export default function Pagina() {
  return (
    <Marco titulo={TERMINOS.titulo} bajada={TERMINOS.bajada}>
      <Bloques bloques={TERMINOS.bloques} />
    </Marco>
  );
}
