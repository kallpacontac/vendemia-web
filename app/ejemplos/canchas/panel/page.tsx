import type { Metadata } from 'next';
import CanchasPanelEjemplo from '@/modules/tu-pagina/publico/CanchasPanelEjemplo';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Zona Gol · Panel del dueño | Vendemia',
  description: 'Ejemplo del tablero de reservas e ingresos de un negocio de canchas.',
  robots: { index: false, follow: false },
};

export default function PanelCanchasEjemplo({ searchParams }: { searchParams?: { fecha?: string; nueva?: string } }) {
  const ahora = new Date().toLocaleString('sv-SE', { timeZone: 'America/Lima', hour12: false }).slice(0, 16);
  const hoy = ahora.slice(0, 10);
  const pedida = searchParams?.fecha ?? '';
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : hoy;
  return <CanchasPanelEjemplo hoy={hoy} ahora={ahora} fechaInicial={fecha} nueva={searchParams?.nueva} />;
}
