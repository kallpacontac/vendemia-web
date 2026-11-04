import type { Metadata } from 'next';
import LuxuryReservaEjemplo from '@/modules/tu-pagina/publico/LuxuryReservaEjemplo';
import '@/modules/tu-pagina/estilos/publica.css';

export const metadata: Metadata = { title: 'Reserva de ejemplo · Atelier Norte | Vendemia' };

export default function ReservaEjemplo({ searchParams }: { searchParams?: { servicio?: string; barbero?: string } }) {
  const indice = Number(searchParams?.servicio);
  const barbero = searchParams?.barbero === undefined ? -1 : Number(searchParams.barbero);
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return <LuxuryReservaEjemplo hoy={hoy} inicial={Number.isInteger(indice) && indice >= 0 && indice < 3 ? indice : 0} barberoInicial={Number.isInteger(barbero) && barbero >= 0 && barbero < 3 ? barbero : -1} />;
}
