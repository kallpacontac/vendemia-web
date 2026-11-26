import type { Metadata } from 'next';
import PaginaPersonalizada from '@/components/ejemplos/PaginaPersonalizada';

export const metadata: Metadata = {
  title: 'Kallpa | Páginas personalizadas Vendemia',
  description: 'Explora el catálogo editorial de Kallpa en Vendemia.',
  alternates: { canonical: '/ejemplos/kallpa' },
};

export default function Page() {
  return <PaginaPersonalizada nombre="Kallpa" slug="kallpa" />;
}
