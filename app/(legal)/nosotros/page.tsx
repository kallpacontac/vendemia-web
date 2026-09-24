import type { Metadata } from 'next';
import Marco from '@/components/legal/Marco';
import Bloques from '@/components/legal/Bloques';
import { EMPRESA, NOSOTROS } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Sobre nosotros · Vendemia',
  description: `Vendemia es un software de atención y ventas por WhatsApp para pymes peruanas, marca de ${EMPRESA.razonSocial}.`,
  alternates: { canonical: '/nosotros' },
};

export default function Pagina() {
  return (
    <Marco titulo={NOSOTROS.titulo} bajada={NOSOTROS.bajada}>
      <Bloques bloques={NOSOTROS.bloques} />
    </Marco>
  );
}
