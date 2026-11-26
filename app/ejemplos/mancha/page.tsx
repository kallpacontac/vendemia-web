import type { Metadata } from 'next';
import PaginaPersonalizada from '@/components/ejemplos/PaginaPersonalizada';

export const metadata: Metadata = {
  title: 'Mancha Burger Studio | Páginas personalizadas Vendemia',
  description: 'Explora la página personalizada de Mancha Burger Studio en Vendemia.',
  alternates: { canonical: '/ejemplos/mancha' },
};

export default function Page() {
  return <PaginaPersonalizada nombre="Mancha Burger Studio" slug="mancha" />;
}
