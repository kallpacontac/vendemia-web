import type { Metadata } from 'next';
import MiPaginaPlanes from '../MiPaginaPlanes';
import '../mi-pagina.css';

export const metadata: Metadata = {
  title: 'Planes de carta digital interactiva | Vendemia',
  description: 'Compara los planes Básico, Interactivo y Pro de Mi página en Vendemia.',
};

export default function PlanesPage() {
  return <><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lobster&family=Poppins:wght@400;500;600;700;800;900&display=swap" /><MiPaginaPlanes /></>;
}
