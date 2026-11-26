import type { Metadata } from 'next';
import PaginaPersonalizada from '@/components/ejemplos/PaginaPersonalizada';

export const metadata: Metadata = {
  title: 'Brew Bliss Café | Páginas personalizadas Vendemia',
  description: 'Explora la página personalizada de Brew Bliss Café en Vendemia.',
  alternates: { canonical: '/ejemplos/brew-bliss' },
};

export default function Page() {
  return <PaginaPersonalizada nombre="Brew Bliss Café" slug="brew-bliss" />;
}
