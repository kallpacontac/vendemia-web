// El enlace que recibe el cliente por WhatsApp: su boleta con el QR. Ver modules/facturacion/ui/VerComprobante.
import type { Metadata } from 'next';
import VerComprobante from '@/modules/facturacion/ui/VerComprobante';

export const metadata: Metadata = {
  title: 'Tu comprobante',
  robots: { index: false, follow: false },
};

export default function Pagina({ params }: { params: { id: string } }) {
  return <VerComprobante id={params.id} />;
}
