'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight } from 'lucide-react';

type ServicioDestacado = { nombre: string; descripcion?: string; precio?: string; foto?: string };

type Props = {
  titulo: string;
  frase?: string;
  etiqueta?: string;
  logo?: string;
  portada?: string;
  servicio?: ServicioDestacado;
  inicioHref: string;
  reservarHref: string;
  catalogoDisponible: boolean;
  catalogoProductosDisponible?: boolean;
};

/** El desplazamiento vertical mueve la portada lateralmente y después continúa al catálogo. */
export default function LuxuryPortada({ titulo, frase, etiqueta, logo, portada, servicio, inicioHref, reservarHref, catalogoDisponible, catalogoProductosDisponible = false }: Props) {
  const marco = useRef<HTMLDivElement>(null);
  const pista = useRef<HTMLDivElement>(null);
  const progreso = useRef<HTMLSpanElement>(null);
  const [escena, setEscena] = useState(0);

  useEffect(() => {
    const zona = marco.current;
    const carril = pista.current;
    const linea = progreso.current;
    if (!zona || !carril || !linea) return;
    const reducida = window.matchMedia('(prefers-reduced-motion: reduce)');
    let pendiente = false;
    const actualizar = () => {
      pendiente = false;
      if (reducida.matches) {
        carril.style.transform = '';
        linea.style.transform = '';
        return;
      }
      const recorrido = Math.max(1, zona.offsetHeight - window.innerHeight);
      const avance = Math.max(0, Math.min(1, -zona.getBoundingClientRect().top / recorrido));
      carril.style.transform = `translate3d(${-avance * window.innerWidth}px, 0, 0)`;
      linea.style.transform = `scaleX(${avance})`;
      setEscena((actual) => {
        const siguiente = avance > .52 ? 1 : 0;
        return actual === siguiente ? actual : siguiente;
      });
    };
    const solicitar = () => {
      if (!pendiente) {
        pendiente = true;
        requestAnimationFrame(actualizar);
      }
    };
    actualizar();
    window.addEventListener('scroll', solicitar, { passive: true });
    window.addEventListener('resize', solicitar);
    reducida.addEventListener('change', solicitar);
    return () => {
      window.removeEventListener('scroll', solicitar);
      window.removeEventListener('resize', solicitar);
      reducida.removeEventListener('change', solicitar);
    };
  }, []);

  const irAEscena = (numero: 0 | 1) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (numero === 1) document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const zona = marco.current;
    if (!zona) return;
    window.scrollTo({ top: zona.getBoundingClientRect().top + window.scrollY + (numero ? zona.offsetHeight - window.innerHeight : 0), behavior: 'smooth' });
  };

  return <div className="tp-luxury-motion" ref={marco} data-escena={escena}>
    <div className="tp-luxury-motion__fijo">
      <div className="tp-luxury-motion__pista" ref={pista}>
        <section className="tp-luxury-hero" aria-label={`Bienvenidos a ${titulo}`} style={portada ? { backgroundImage: `url("${portada}")` } : undefined}>
          <nav className="tp-luxury-nav" aria-label="Navegación de la página">
            <a className="tp-luxury-brand" href={inicioHref} aria-label={`${titulo}, inicio`}>
              {logo && <span className="tp-luxury-brand__logo" style={{ backgroundImage: `url("${logo}")` }} aria-hidden="true" />}
              <span>{titulo}</span>
            </a>
            <span className="tp-luxury-nav__paso">01 / 02</span>
            {catalogoDisponible && <a href="#catalogo">Servicios</a>}
            {catalogoProductosDisponible && <a href="#catalogo-productos">Catálogo</a>}
          </nav>
          <div className="tp-luxury-hero__contenido">
            {etiqueta && <span className="tp-luxury-hero__etiqueta">{etiqueta}</span>}
            <h1>{titulo}</h1>
            {frase && <p>{frase}</p>}
            <div className="tp-luxury-hero__acciones">
              <a className="tp-luxury-hero__cta" href={reservarHref}>Agendar una cita <ArrowRight size={19} aria-hidden="true" /></a>
              {catalogoProductosDisponible && <a className="tp-luxury-hero__cta tp-luxury-hero__cta--secundario" href="#catalogo-productos">Ver catálogo <ArrowDown size={19} aria-hidden="true" /></a>}
            </div>
          </div>
          <button type="button" className="tp-luxury-motion__siguiente" onClick={() => irAEscena(1)}>Explorar <ArrowRight size={18} aria-hidden="true" /></button>
        </section>
        <section className="tp-luxury-hero tp-luxury-hero--servicio" aria-label={servicio?.nombre || `Servicios de ${titulo}`} style={servicio?.foto ? { backgroundImage: `url("${servicio.foto}")` } : undefined}>
          <div className="tp-luxury-hero__panel">
            <span className="tp-luxury-hero__etiqueta">02 / 02 · SERVICIO DESTACADO</span>
            <h2>{servicio?.nombre || titulo}</h2>
            {servicio?.descripcion && <p>{servicio.descripcion}</p>}
            <div className="tp-luxury-hero__panel-pie">
              {servicio?.precio && <strong>{servicio.precio}</strong>}
              <a href={reservarHref}>Elegir horario <ArrowRight size={18} aria-hidden="true" /></a>
            </div>
          </div>
          {catalogoDisponible && <a className="tp-luxury-motion__siguiente" href="#catalogo">Ver servicios <ArrowDown size={18} aria-hidden="true" /></a>}
        </section>
      </div>
      <span className="tp-luxury-motion__progreso" ref={progreso} aria-hidden="true" />
    </div>
  </div>;
}
