import type { Metadata } from 'next';
import MiPaginaLanding from './MiPaginaLanding';
import './mi-pagina.css';

export const metadata: Metadata = {
  title: 'Mi página: catálogo, reservas y pedidos para tu negocio | Vendemia',
  description: 'Crea una página para mostrar tus productos o servicios, recibir pedidos y organizar reservas. Explora ejemplos reales de las plantillas de Vendemia.',
  alternates: { canonical: '/mi-pagina' },
};

export default function Page() {
  return <>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lobster&family=Poppins:wght@400;500;600;700;800;900&display=swap" />
    <MiPaginaLanding />
  </>;
}
