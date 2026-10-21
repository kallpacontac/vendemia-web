import type { Metadata } from 'next';
import LuxuryPortada from '@/modules/tu-pagina/publico/LuxuryPortada';
import { SERVICIOS_BARBERIA } from '@/modules/tu-pagina/dominio/barberia-ejemplo';
import '@/modules/tu-pagina/estilos/publica.css';

export const metadata: Metadata = {
  title: 'Atelier Norte · Luxury | Vendemia',
  description: 'Ejemplo de catálogo y agenda Luxury para una barbería.',
};

export default function BarberiaLuxuryEjemplo() {
  return <div className="tp" data-diseno="agenda" data-plantilla="luxury" style={{ '--tp-color': '#D0AB75', '--tp-tinta': '#171717' } as React.CSSProperties}>
    <LuxuryPortada
      titulo="Atelier Norte"
      frase="El buen estilo empieza con tiempo para ti."
      etiqueta="BARBERÍA · LIMA"
      portada="/assets/luxury-ejemplo/portada.webp"
      servicio={{ ...SERVICIOS_BARBERIA[0], precio: `S/ ${SERVICIOS_BARBERIA[0].precio}` }}
      inicioHref="/ejemplos/barberia"
      reservarHref="/ejemplos/barberia/reservar?servicio=0"
      catalogoDisponible
    />
    <main className="tp-hoja">
      <section className="tp-catalogo" id="catalogo" aria-label="Servicios de Atelier Norte">
        <div className="tp-catalogo__cabeza"><h2 className="tp-seccion">Nuestros servicios</h2><small>{SERVICIOS_BARBERIA.length} servicios</small></div>
        <div className="tp-grid">
          {SERVICIOS_BARBERIA.map((servicio, indice) => <a key={servicio.nombre} className="tp-tarjeta" href={`/ejemplos/barberia/reservar?servicio=${indice}`} style={{ textDecoration: 'none' }}>
            <span className="tp-tarjeta__foto" style={{ backgroundImage: `url("${servicio.foto}")` }} role="img" aria-label={servicio.nombre} />
            <span className="tp-tarjeta__texto">
              <b>{servicio.nombre}</b>
              <span className="tp-tarjeta__desc">{servicio.descripcion}</span>
              <span className="tp-tarjeta__pie"><b>S/ {servicio.precio}</b><small>{servicio.duracion} min</small></span>
            </span>
          </a>)}
        </div>
      </section>
    </main>
    <p className="tp-pie">Ejemplo de plantilla · Hecho con <a href="https://vendemias.com/?utm_source=tu-pagina">Vendemia</a></p>
  </div>;
}
