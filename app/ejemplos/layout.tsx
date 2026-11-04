'use client';

import { usePathname } from 'next/navigation';
import BotonWhatsApp from '@/modules/tu-pagina/publico/BotonWhatsApp';

export default function LayoutEjemplos({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();
  return <>{children}{ruta === '/ejemplos/mesa' && <BotonWhatsApp negocio="Casa Brasa" demo />}</>;
}
