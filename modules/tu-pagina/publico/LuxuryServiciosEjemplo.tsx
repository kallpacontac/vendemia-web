import { SERVICIOS_BARBERIA } from '@/modules/tu-pagina/dominio/barberia-ejemplo';

/** El ejemplo refleja la vista elegida por el negocio en Mi página. */
export default function LuxuryServiciosEjemplo({ vista }: { vista: 'vertical' | 'horizontal' }) {
  return <section className="tp-catalogo" id="catalogo" aria-label="Servicios de Atelier Norte">
    <div className="tp-catalogo__cabeza">
      <h2 className="tp-seccion">Servicios</h2>
      <small>{SERVICIOS_BARBERIA.length} servicios</small>
    </div>
    <div className={`tp-grid${vista === 'horizontal' ? ' tp-grid--luxury-horizontal' : ''}`}>
      {SERVICIOS_BARBERIA.map((servicio, indice) => <a key={servicio.nombre} className="tp-tarjeta" href={`/ejemplos/barberia/reservar?servicio=${indice}`} style={{ textDecoration: 'none' }}>
        <span className="tp-tarjeta__foto" style={{ backgroundImage: `url("${servicio.foto}")` }} role="img" aria-label={servicio.nombre} />
        <span className="tp-tarjeta__texto">
          <b>{servicio.nombre}</b>
          <span className="tp-tarjeta__desc">{servicio.descripcion}</span>
          <span className="tp-tarjeta__pie"><b>S/ {servicio.precio}</b><small>{servicio.duracion} min</small></span>
          <span className="tp-tarjeta__reservar">Elegir horario <span aria-hidden="true">→</span></span>
        </span>
      </a>)}
    </div>
  </section>;
}
