'use client';

import { useEffect, useRef } from 'react';

/** Entradas discretas para las secciones públicas. El HTML se mantiene visible sin JS. */
export default function AnimacionesPlantilla() {
  const marca = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const raiz = marca.current?.parentElement;
    if (!raiz) return;
    const movimientoReducido = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (movimientoReducido.matches) return;

    let cancelado = false;
    let limpiar = () => {};

    void Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([{ gsap }, { ScrollTrigger }]) => {
      if (cancelado || movimientoReducido.matches) return;
      gsap.registerPlugin(ScrollTrigger);
      const movil = window.matchMedia('(max-width: 640px)').matches;
      const elementos: HTMLElement[] = [];
      const disparadores: ReturnType<typeof ScrollTrigger.create>[] = [];
      const animaciones: Array<ReturnType<typeof gsap.to>> = [];
      const vistos = new Set<HTMLElement>();

      const grupos = [
        '.tp-portada__titulo', '.tp-cabeza', '.tp-hero__contenido', '.tp-agenda-nav',
        '.tp-agenda-hero__texto', '.tp-agenda-hero__foto', '.tp-agenda-confianza',
        '.tp-agenda-seccion-titulo', '.tp-agenda-widget', '.tp-agenda-contacto',
        '.tp-catalogo__cabeza', '.tp-catalogo__busqueda', '.tp-familias',
        '.tp-acciones > .tp-accion', '.tp-grid:not(.tp-grid--luxury-horizontal) > .tp-tarjeta',
        '.tp-grid--luxury-horizontal', '.tp-modulo--luxury-productos .tp-grid',
        '.tp-luxury-productos__cabecera', '.tp-reserva-resumen',
        '.tp-agenda-reserva-pagina > .tp-volver', '.tp-hoja > .tp-h1', '.tp-hoja > .tp-lead',
        '.ne-dental-hero-texto', '.ne-dental-hero-foto', '.ne-dental-confianza',
        '.ne-dental-seccion-titulo', '.ne-dental-servicios-grid > .ne-dental-servicio',
        '.ne-dental-widget', '.ne-cafe-hero > div', '.ne-cafe-titulo',
        '.ne-cafe-ofertas-grid > button', '.ne-cafe-grid > .ne-cafe-card',
        '.ce-hero__contenido', '.ce-hero__arte', '.ce-colecciones > .ce-coleccion',
        '.ce-busqueda', '.ce-catalogo__cabeza', '.ce-grid > *',
        '.lx-reserva__intro',
      ];

      for (const selector of grupos) {
        const encontrados = Array.from(raiz.querySelectorAll<HTMLElement>(selector));
        // Un catálogo grande no necesita un disparador por cada producto.
        for (const [indice, elemento] of encontrados.slice(0, selector.includes('tarjeta') || selector.includes('card') ? 36 : 20).entries()) {
          if (vistos.has(elemento) || elemento.closest('.tp-luxury-motion, [role="dialog"]')) continue;
          vistos.add(elemento);
          elementos.push(elemento);
          const posicion = elemento.getBoundingClientRect();
          if (posicion.bottom < 0) continue;
          const tarjeta = elemento.matches('.tp-tarjeta, .ne-cafe-card, .ne-dental-servicio');
          const desplazamiento = movil ? 16 : tarjeta ? 23 : 28;
          const demora = Math.min(indice % (movil ? 2 : 4), 3) * (movil ? 0.045 : 0.07);
          const mostrar = () => {
            animaciones.push(gsap.to(elemento, {
              opacity: 1, y: 0, scale: 1,
              duration: movil ? 0.58 : 0.76,
              delay: demora,
              ease: 'power2.out',
              overwrite: 'auto',
              onComplete: () => gsap.set(elemento, { clearProps: 'opacity,transform' }),
            }));
          };
          gsap.set(elemento, { opacity: 0, y: desplazamiento, scale: tarjeta ? 0.985 : 1 });
          if (posicion.top < window.innerHeight * 0.9) mostrar();
          else disparadores.push(ScrollTrigger.create({ trigger: elemento, start: 'top 91%', once: true, onEnter: mostrar }));
        }
      }

      // Luxury ya sincroniza dos escenas con el scroll. GSAP anima solo su contenido inicial.
      const luxury = raiz.querySelector<HTMLElement>('.tp-luxury-motion');
      if (luxury) {
        const intro = Array.from(luxury.querySelectorAll<HTMLElement>('.tp-luxury-hero:not(.tp-luxury-hero--servicio) h1, .tp-luxury-hero:not(.tp-luxury-hero--servicio) p, .tp-luxury-hero:not(.tp-luxury-hero--servicio) .tp-luxury-hero__cta'));
        elementos.push(...intro);
        if (intro.length) animaciones.push(gsap.fromTo(intro,
          { y: movil ? 14 : 22, opacity: 0 },
          { y: 0, opacity: 1, duration: movil ? 0.65 : 0.9, stagger: 0.11, ease: 'power2.out', clearProps: 'opacity,transform' },
        ));
      }

      const refrescar = () => ScrollTrigger.refresh();
      window.addEventListener('load', refrescar, { once: true });
      limpiar = () => {
        window.removeEventListener('load', refrescar);
        disparadores.forEach((disparador) => disparador.kill());
        animaciones.forEach((animacion) => animacion.kill());
        gsap.set(elementos, { clearProps: 'opacity,transform' });
      };
      if (cancelado || movimientoReducido.matches) limpiar();
    }).catch(() => {
      // Una carga fallida de GSAP nunca debe ocultar el contenido.
    });

    const alCambiarMovimiento = () => { if (movimientoReducido.matches) limpiar(); };
    movimientoReducido.addEventListener('change', alCambiarMovimiento);
    return () => {
      cancelado = true;
      movimientoReducido.removeEventListener('change', alCambiarMovimiento);
      limpiar();
    };
  }, []);

  return <span hidden ref={marca} aria-hidden="true" />;
}
