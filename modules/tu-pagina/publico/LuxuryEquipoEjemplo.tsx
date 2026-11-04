import { ArrowRight } from 'lucide-react';
import { BARBEROS_EJEMPLO } from '@/modules/tu-pagina/dominio/barberia-ejemplo';

/** Muestra cómo un negocio puede presentar su equipo; las personas no son personal real. */
export default function LuxuryEquipoEjemplo() {
  return <section className="lx-equipo" id="equipo" aria-labelledby="lx-equipo-titulo">
    <div className="lx-equipo__cabeza"><div><span>UN CORTE A TU MANERA</span><h2 id="lx-equipo-titulo">Elige a tu barbero</h2><p>Reserva con quien prefieras o escoge el primer turno libre. Cada barbero tiene sus propios horarios.</p></div><a href="/ejemplos/barberia/reservar?servicio=0">Ver todos los horarios <ArrowRight size={18} aria-hidden="true" /></a></div>
    <div className="lx-equipo__grid">{BARBEROS_EJEMPLO.map((barbero, indice) => <a key={barbero.nombre} className="lx-equipo__tarjeta" href={`/ejemplos/barberia/reservar?servicio=0&barbero=${indice}`}>
      <img src={barbero.foto} alt="" loading="lazy" />
      <span><b>{barbero.nombre}</b><small>{barbero.especialidad}</small><strong>Elegir barbero <ArrowRight size={16} aria-hidden="true" /></strong></span>
    </a>)}</div>
    <p className="lx-equipo__nota">Nombres y fotografías de referencia para esta demostración. Cada negocio muestra a su propio equipo.</p>
  </section>;
}
