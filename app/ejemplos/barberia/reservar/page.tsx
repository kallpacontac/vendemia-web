import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import '@/modules/tu-pagina/estilos/publica.css';

export const metadata: Metadata = { title: 'Reserva de ejemplo · Atelier Norte | Vendemia' };

const servicios = ['Corte de autor', 'Perfilado de barba', 'Peinado de ocasión'];

export default function ReservaEjemplo({ searchParams }: { searchParams?: { servicio?: string } }) {
  const indice = Number(searchParams?.servicio);
  const seleccionado = Number.isInteger(indice) && indice >= 0 && indice < servicios.length ? servicios[indice] : null;
  return <main className="tp" data-diseno="agenda" data-plantilla="luxury" style={{ '--tp-color': '#D0AB75', '--tp-tinta': '#171717' } as React.CSSProperties}>
    <div className="tp-hoja" style={{ paddingTop: 36, maxWidth: 700 }}>
      <Link href="/ejemplos/barberia" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><ArrowLeft size={18} /> Volver a Atelier Norte</Link>
      <div style={{ marginTop: 70, marginBottom: 22 }}><CalendarDays size={30} color="#987343" /><h1 style={{ margin: '12px 0', fontSize: 'clamp(38px, 7vw, 60px)', fontFamily: 'Georgia, serif' }}>Agenda tu visita</h1><p>Así comienza la reserva de una página Luxury. En una página publicada, aquí eliges servicio, día y hora.</p></div>
      <div className="tp-grid" style={{ gridTemplateColumns: '1fr', gap: 10 }}>
        {servicios.map((nombre, i) => <Link key={nombre} href={`/ejemplos/barberia/reservar?servicio=${i}`} className="tp-accion" style={{ borderColor: seleccionado === nombre ? '#987343' : undefined, fontWeight: 700 }}>{nombre}{seleccionado === nombre ? ' · Seleccionado' : ''}</Link>)}
      </div>
      <p className="tp-nota" style={{ textAlign: 'left', marginTop: 22 }}>Esta es una muestra visual: no registra citas. Las páginas de los negocios usan el flujo de reservas real.</p>
    </div>
  </main>;
}
