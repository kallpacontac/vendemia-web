import type { Metadata } from 'next';
import LuxuryPortada from '@/modules/tu-pagina/publico/LuxuryPortada';
import LuxuryCatalogoEjemplo from '@/modules/tu-pagina/publico/LuxuryCatalogoEjemplo';
import LuxuryServiciosEjemplo from '@/modules/tu-pagina/publico/LuxuryServiciosEjemplo';
import { SERVICIOS_BARBERIA } from '@/modules/tu-pagina/dominio/barberia-ejemplo';
import '@/modules/tu-pagina/estilos/publica.css';

export const metadata: Metadata = {
  title: 'Atelier Norte · Luxury | Vendemia',
  description: 'Ejemplo de catálogo y agenda Luxury para una barbería.',
};

export default function BarberiaLuxuryEjemplo({ searchParams }: { searchParams?: { tipo?: string; servicios?: string } }) {
  const conProductos = searchParams?.tipo === 'ambos';
  const vistaServicios = searchParams?.servicios === 'horizontal' ? 'horizontal' : 'vertical';
  return <div className="tp" data-diseno={conProductos ? 'ambos' : 'agenda'} data-plantilla="luxury" style={{ '--tp-color': '#D0AB75', '--tp-tinta': '#171717' } as React.CSSProperties}>
    <LuxuryPortada
      titulo="Atelier Norte"
      frase="El buen estilo empieza con tiempo para ti."
      etiqueta="BARBERÍA · LIMA"
      portada="/assets/luxury-ejemplo/portada.webp"
      servicio={{ ...SERVICIOS_BARBERIA[0], precio: `S/ ${SERVICIOS_BARBERIA[0].precio}` }}
      inicioHref="/ejemplos/barberia"
      reservarHref="/ejemplos/barberia/reservar?servicio=0"
      catalogoDisponible
      catalogoProductosDisponible={conProductos}
    />
    <main className="tp-hoja">
      <LuxuryServiciosEjemplo vista={vistaServicios} />
      {conProductos && <LuxuryCatalogoEjemplo />}
    </main>
    <p className="tp-pie">Ejemplo de plantilla · Hecho con <a href="https://vendemias.com/?utm_source=tu-pagina">Vendemia</a></p>
  </div>;
}
