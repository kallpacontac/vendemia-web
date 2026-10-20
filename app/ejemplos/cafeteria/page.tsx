import type { Metadata } from 'next';
import CafeteriaEjemplo from '@/modules/tu-pagina/publico/CafeteriaEjemplo';

export const metadata: Metadata = {
  title: 'Grano de Barrio · Cafetería de ejemplo | Vendemia',
  description: 'Ejemplo de catálogo para una cafetería: bebidas, panadería, ofertas y pedidos de muestra.',
};

export default function PaginaCafeteria() {
  return <CafeteriaEjemplo />;
}
