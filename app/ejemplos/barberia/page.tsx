import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import { FOTOS_SERVICIOS_LUXURY } from '@/modules/tu-pagina/dominio/fotos';
import '@/modules/tu-pagina/estilos/publica.css';

export const metadata: Metadata = {
  title: 'Atelier Norte · Luxury | Vendemia',
  description: 'Ejemplo de catálogo y agenda Luxury para una barbería.',
};

const servicios = [
  { nombre: 'Corte de autor', descripcion: 'Un corte pensado para tu estilo, con acabado a detalle.', precio: 'S/ 65', tiempo: '45 min', foto: FOTOS_SERVICIOS_LUXURY.corte },
  { nombre: 'Perfilado de barba', descripcion: 'Diseño preciso, toalla tibia y cuidado de la piel.', precio: 'S/ 45', tiempo: '30 min', foto: FOTOS_SERVICIOS_LUXURY.barba },
  { nombre: 'Peinado de ocasión', descripcion: 'Textura, movimiento y un acabado hecho para durar.', precio: 'S/ 75', tiempo: '50 min', foto: FOTOS_SERVICIOS_LUXURY.peinado },
];

export default function BarberiaLuxuryEjemplo() {
  return <div className="tp" data-diseno="agenda" data-plantilla="luxury" style={{ '--tp-color': '#D0AB75', '--tp-tinta': '#171717' } as React.CSSProperties}>
    <section className="tp-luxury-hero" aria-label="Bienvenidos a Atelier Norte" style={{ backgroundImage: 'url("/assets/luxury-ejemplo/portada.webp")' }}>
      <nav className="tp-luxury-nav" aria-label="Navegación de la página">
        <a className="tp-luxury-brand" href="/ejemplos/barberia" aria-label="Atelier Norte, inicio"><span>ATELIER NORTE</span></a>
        <a href="#catalogo">Servicios</a>
      </nav>
      <div className="tp-luxury-hero__contenido">
        <span className="tp-luxury-hero__etiqueta">BARBERÍA · LIMA</span>
        <h1>Atelier Norte</h1>
        <p>El buen estilo empieza con tiempo para ti.</p>
        <a className="tp-luxury-hero__cta" href="/ejemplos/barberia/reservar">Agendar una cita <ArrowRight size={19} aria-hidden="true" /></a>
      </div>
    </section>
    <main className="tp-hoja">
      <section className="tp-catalogo" id="catalogo" aria-label="Servicios de Atelier Norte">
        <div className="tp-catalogo__cabeza"><h2 className="tp-seccion">Nuestros servicios</h2><small>3 servicios</small></div>
        <div className="tp-grid">
          {servicios.map((servicio, indice) => <a key={servicio.nombre} className="tp-tarjeta" href={`/ejemplos/barberia/reservar?servicio=${indice}`} style={{ textDecoration: 'none' }}>
            <span className="tp-tarjeta__foto" style={{ backgroundImage: `url("${servicio.foto}")` }} role="img" aria-label={servicio.nombre} />
            <span className="tp-tarjeta__texto">
              <b>{servicio.nombre}</b>
              <span className="tp-tarjeta__desc">{servicio.descripcion}</span>
              <span className="tp-tarjeta__pie"><b>{servicio.precio}</b><small>{servicio.tiempo}</small></span>
            </span>
          </a>)}
        </div>
      </section>
    </main>
    <p className="tp-pie">Ejemplo de plantilla · Hecho con <a href="https://vendemias.com/?utm_source=tu-pagina">Vendemia</a></p>
  </div>;
}
