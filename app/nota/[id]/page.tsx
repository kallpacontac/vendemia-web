// El enlace que recibe el cliente por WhatsApp: su nota de venta. Ver modules/facturacion/ui/VerNota.
import type { Metadata } from 'next';
import VerNota from '@/modules/facturacion/ui/VerNota';

export const metadata: Metadata = {
  title: 'Tu nota de venta',
  robots: { index: false, follow: false },
};

export default function Pagina({ params }: { params: { id: string } }) {
  return <VerNota id={params.id} />;
}
