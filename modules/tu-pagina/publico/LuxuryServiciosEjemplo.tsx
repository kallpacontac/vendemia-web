'use client';

import { useState } from 'react';
import { SERVICIOS_BARBERIA } from '@/modules/tu-pagina/dominio/barberia-ejemplo';

/** El ejemplo usa los mismos controles de vista que una página Luxury publicada. */
export default function LuxuryServiciosEjemplo() {
  const [vista, setVista] = useState<'vertical' | 'horizontal'>('vertical');

  return <section className="tp-catalogo" id="catalogo" aria-label="Servicios de Atelier Norte">
    <div className="tp-catalogo__cabeza">
      <h2 className="tp-seccion">Servicios</h2>
      <div className="tp-catalogo__cabeza-acciones">
        <small>{SERVICIOS_BARBERIA.length} servicios</small>
        <div className="tp-luxury-servicios__controles" role="group" aria-label="Vista de servicios">
          <button type="button" aria-pressed={vista === 'vertical'} onClick={() => setVista('vertical')}>Vertical</button>
          <button type="button" aria-pressed={vista === 'horizontal'} onClick={() => setVista('horizontal')}>Horizontal</button>
        </div>
      </div>
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
