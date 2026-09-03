import type { Metadata } from 'next';
import Marco from '@/components/legal/Marco';
import Bloques from '@/components/legal/Bloques';
import { PRIVACIDAD } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Política de privacidad · Vendemia',
  description: 'Qué datos trata Vendemia, para qué, con quién se comparten y cómo ejercer tus derechos ARCO.',
  alternates: { canonical: '/privacidad' },
};

export default function Pagina() {
  return (
    <Marco titulo={PRIVACIDAD.titulo} bajada={PRIVACIDAD.bajada}>
      <Bloques bloques={PRIVACIDAD.bloques} />
    </Marco>
  );
}
