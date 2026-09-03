import type { Metadata } from 'next';
import Marco from '@/components/legal/Marco';
import FormularioReclamo from '@/components/legal/FormularioReclamo';
import { RECLAMACIONES } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Libro de Reclamaciones · Vendemia',
  description:
    'Libro de Reclamaciones virtual de Vendemia, conforme al Código de Protección y Defensa del Consumidor (Ley 29571).',
  alternates: { canonical: '/reclamaciones' },
};

export default function Pagina() {
  return (
    <Marco titulo={RECLAMACIONES.titulo} bajada={RECLAMACIONES.bajada}>
      <FormularioReclamo />
    </Marco>
  );
}
