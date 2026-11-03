import type { Metadata } from 'next';
import MiPaginaLanding from './MiPaginaLanding';
import './mi-pagina.css';

export const metadata: Metadata = {
  title: 'Mi página: catálogo, reservas y pedidos para tu negocio | Vendemia',
  description: 'Crea una página para mostrar tus productos o servicios, recibir pedidos y organizar reservas. Explora ejemplos reales de las plantillas de Vendemia.',
  alternates: { canonical: '/mi-pagina' },
};

export default function Page() {
  return <MiPaginaLanding />;
}
