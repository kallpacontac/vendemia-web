import type { Metadata } from 'next';
import CatalogoEjemplo from '@/modules/tu-pagina/publico/CatalogoEjemplo';
import { esPlantillaEjemplo } from '@/modules/tu-pagina/dominio/ejemplo';

export const metadata: Metadata = {
  title: 'Ejemplos de catálogos · Vendemia',
  description: 'Explora cómo se vería tu catálogo digital con las plantillas de Vendemia.',
};

export default function PaginaEjemplo({ searchParams }: { searchParams?: { plantilla?: string } }) {
  const plantilla = esPlantillaEjemplo(searchParams?.plantilla) ? searchParams.plantilla : 'vitrina';
  return <CatalogoEjemplo plantilla={plantilla} />;
}
