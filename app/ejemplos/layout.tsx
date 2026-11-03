'use client';

import { usePathname } from 'next/navigation';
import BotonWhatsApp from '@/modules/tu-pagina/publico/BotonWhatsApp';

const NEGOCIOS: Record<string, string> = {
  '/ejemplos/mesa': 'Casa Brasa',
  '/ejemplos/la-baguette': 'La Baguette',
  '/ejemplos/pizzeria': 'La Baguette',
  '/ejemplos/cafeteria': 'Grano de Barrio',
  '/ejemplos/barberia': 'Atelier Norte',
  '/ejemplos/canchas': 'Zona Gol',
  '/ejemplos/clinica-dental': 'Sonrisa Norte',
  '/ejemplos/catalogo': 'Ámbar Estudio',
};

export default function LayoutEjemplos({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();
  return <>{children}<BotonWhatsApp negocio={NEGOCIOS[ruta] ?? 'negocio de ejemplo'} demo /></>;
}
