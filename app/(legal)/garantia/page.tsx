import type { Metadata } from 'next';
import Marco from '@/components/legal/Marco';
import Bloques from '@/components/legal/Bloques';
import { GARANTIA } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Garantía de reembolso · Vendemia',
  description: 'Cómo funciona la garantía de 30 días de Vendemia: qué cubre, cómo se pide y en cuánto se devuelve.',
  alternates: { canonical: '/garantia' },
};

export default function Pagina() {
  return (
    <Marco titulo={GARANTIA.titulo} bajada={GARANTIA.bajada}>
      <Bloques bloques={GARANTIA.bloques} />
    </Marco>
  );
}
