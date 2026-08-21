'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { registerGsap, prefersReducedMotion } from '@/lib/motion';

/**
 * Scroll suavizado. Es responsable de buena parte de la sensación "mantecosa"
 * del original — sin esto, las secciones apiladas se sienten bruscas.
 *
 * Dos cosas que no son obvias:
 *
 * 1. Lenis tiene que CONDUCIR el ticker de GSAP, no correr en paralelo. Si cada
 *    uno usa su propio rAF, el apilado tiembla.
 *
 * 2. Durante la intro va PARADO. Lenis mantiene su propia posición interna, así
 *    que si sigue vivo mientras la intro fuerza scrollTo(0,0) acaba devolviendo
 *    al usuario a donde estaba antes de recargar — que es justo lo que se
 *    quería evitar.
 */
export default function SmoothScroll() {
  useEffect(() => {
    /**
     * ⚠️ EL EFECTO NO SE CORTA EN reduced-motion.
     *
     * Antes salía aquí mismo, y con él se iba también el manejador de anclas —
     * que no tiene nada que ver con el scroll suave. Resultado medido: con
     * `prefers-reduced-motion` activo, pulsar "Precios" dejaba la sección 622px
     * por debajo del sitio. O sea que quien pide menos movimiento se llevaba,
     * de propina, los enlaces del menú rotos.
     *
     * Lo que se salta en reduced-motion es Lenis. Las anclas se atienden igual,
     * solo que el desplazamiento es instantáneo.
     */
    const reducido = prefersReducedMotion();
    let lenis: Lenis | null = null;
    let raf: ((time: number) => void) | null = null;

    if (!reducido) {
      registerGsap();

      lenis = new Lenis({
        duration: 1.1,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      });

      lenis.on('scroll', ScrollTrigger.update);

      raf = (time: number) => lenis!.raf(time * 1000);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);
    }

    const introRunning = document.documentElement.dataset.intro === 'run';

    const release = () => {
      // Sincroniza la posición interna de Lenis con el scroll real (0) antes
      // de devolverle el control.
      lenis?.scrollTo(0, { immediate: true, force: true });
      lenis?.resize();
      lenis?.start();
    };

    if (introRunning && lenis) {
      lenis.stop();
      window.addEventListener('nexor:intro-settled', release, { once: true });
    }

    /* ── 3 · LAS ANCLAS TIENEN QUE PASAR POR LENIS ──────────────────────────
       Lenis intercepta la rueda y el táctil, pero NO la navegación por hash:
       un `href="#pricing"` lo resuelve el navegador saltando de golpe. Medido
       antes de esto: el scroll pasaba de 0 a 6558 en un solo frame — una
       posición distinta en toda la animación. En una página cuyo scroll es
       deliberadamente suave, que los enlaces del menú teletransporten es una
       incoherencia que se nota.

       Y hay un segundo motivo, menos visible: el salto nativo mueve el scroll
       real sin avisar a Lenis, que mantiene su propia posición interna. Es
       exactamente el desajuste que este mismo fichero ya documenta para la
       intro, y el síntoma es que la primera rueda después de pulsar un enlace
       da un tirón hacia donde Lenis creía que estaba.

       Se delega en `document` en vez de poner un onClick en cada enlace: los
       hay repartidos por navbar, hero, footer y varias secciones, y uno nuevo
       en el futuro entra sin que nadie tenga que acordarse de nada. */
    /**
     * DÓNDE ESTÁ UN DESTINO DENTRO DEL DOCUMENTO.
     *
     * ⚠️ NO se puede usar getBoundingClientRect() para esto, y es la causa de
     * un fallo real: el avión de la píldora apunta a #hero y el scroll se
     * quedaba en 1305 en vez de llegar a 0.
     *
     * El motivo es que las tres primeras secciones son `position: sticky`.
     * Una sección sticky CLAVADA arriba devuelve siempre rect.top ≈ 0 haga el
     * scroll que haga: su rectángulo dice dónde se está PINTANDO, no dónde
     * vive en el documento. Al sumarle el scroll actual sale la posición del
     * usuario, no la del destino — o sea que el enlace te lleva a donde ya
     * estabas. Y la comprobación posterior tampoco lo caza, porque mide con la
     * misma regla equivocada y da el desvío por bueno.
     *
     * `offsetTop` TAMPOCO sirve, aunque lo parezca: Chromium lo calcula sobre
     * la posición USADA, así que en un sticky clavado ya viene con el
     * desplazamiento del clavado dentro. Medido en #hero con el scroll en
     * 1500: offsetTop devolvía exactamente 1500. Las dos medidas "obvias"
     * mienten igual, solo que la segunda lo disimula mejor.
     *
     * Lo que sí funciona: quitarle el sticky un instante y medir entonces. Con
     * `position: static` el rectángulo vuelve a ser el de maquetación. El
     * cambio y su restauración ocurren dentro del MISMO bloque síncrono, y el
     * navegador no pinta a mitad de una tarea de JS, así que no hay parpadeo
     * posible: nadie llega a ver la página sin el sticky. Cuesta un reflujo
     * forzado por llamada, que en un manejador de clic es perfectamente
     * asumible.
     */
    const posicionEnDocumento = (el: HTMLElement) => {
      const pegado = getComputedStyle(el).position === 'sticky';
      const previo = el.style.position;
      if (pegado) el.style.position = 'static';
      const y = el.getBoundingClientRect().top + window.scrollY;
      if (pegado) el.style.position = previo;
      return y;
    };

    /**
     * LLEVAR AL DESTINO. Único camino de entrada a una sección: pulsar un
     * enlace. Las llegadas por URL con hash ya no existen — ver el punto 4 más
     * abajo y el INTRO_GATE de layout.tsx.
     */
    const irA = (target: HTMLElement) => {
      /* El desfase sale del MISMO sitio que scroll-margin-top, para que tocar
         el navbar no descuadre uno de los dos caminos.
         ⚠️ Se lee del `scroll-margin-top` YA RESUELTO del destino, no de la
         variable `--anchor-offset`: getPropertyValue de una custom property
         devuelve el texto sin evaluar —"calc(16px + var(--nav-pill-h) + 24px)"—
         y parseFloat de eso da NaN. El valor calculado solo lo da el navegador
         a través de una propiedad real. */
      const offset = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;

      /* ── POR QUÉ NO BASTA UN SOLO scrollTo ────────────────────────────
         Las secciones llevan `content-visibility: auto` con un alto ESTIMADO
         de 800px (`contain-intrinsic-size`). Mientras no se han acercado a la
         pantalla, el navegador usa esa estimación en vez de su alto real, así
         que la posición del destino que Lenis calcula al pulsar es provisional:
         durante el viaje las secciones intermedias se renderizan, cambian de
         alto y el destino SE MUEVE.

         Medido en pestaña limpia, antes de esto: pulsar "Precios" dejaba la
         sección 646px por debajo del sitio: el usuario acababa mirando "Casos
         de uso". En la segunda pulsación sí acertaba, porque para entonces ya
         estaba todo renderizado — que es justo lo que hace que este fallo pase
         desapercibido al probarlo a mano.

         Así que al terminar se comprueba dónde quedó el destino de verdad y,
         si no cuadra, se corrige. Dos pasadas bastan siempre; el tope existe
         para que un layout que nunca se estabilice no deje esto girando. */
      const ajustar = (intentos: number) => {
        /* El destino se recalcula EN CADA PASADA, no una sola vez al principio:
           mientras se viaja, las secciones `content-visibility` que entran en
           pantalla se renderizan y cambian de alto, así que el documento crece
           bajo los pies y la posición buena de hace 300 ms ya no lo es. */
        const destino = Math.max(0, posicionEnDocumento(target) - offset);

        const revisar = () => {
          if (intentos <= 0) return;
          // Se compara SCROLL contra SCROLL, las dos medidas en coordenadas de
          // documento. Antes se comparaba el rect del destino, que en una
          // sección sticky es siempre el mismo número y daba por bueno
          // cualquier resultado.
          // 2px de tolerancia: por debajo es redondeo de subpíxel, no un fallo.
          if (Math.abs(window.scrollY - Math.max(0, posicionEnDocumento(target) - offset)) > 2) {
            ajustar(intentos - 1);
          }
        };

        if (lenis) {
          /* ⚠️ Se le pasa un NÚMERO, no el elemento. Con el elemento, Lenis
             calcula la posición él mismo con getBoundingClientRect y vuelve a
             caer en el problema del sticky; además aplica `scroll-margin-top`
             por su cuenta, que es de donde salía el viejo fallo de aterrizar en
             176px en vez de 88 cuando además se lo pasábamos nosotros. Con un
             número no hay ambigüedad: el offset se resta UNA vez, aquí. */
          lenis.scrollTo(destino, { onComplete: revisar });
        } else {
          // Sin Lenis (reduced-motion): salto instantáneo, misma corrección.
          // `behavior: 'auto'` y no 'smooth' — el usuario ha pedido no ver
          // movimiento, y aquí se le respeta.
          window.scrollTo({ top: destino, behavior: 'auto' });
          /* ⚠️ setTimeout, NO requestAnimationFrame.
             Con dos rAF la comprobación llegaba DEMASIADO PRONTO: el navegador
             aún no había renderizado las secciones `content-visibility` que
             acababan de entrar en pantalla, así que medía la posición correcta,
             daba el visto bueno y paraba — y el desplazamiento ocurría justo
             después. Medido: la sección se quedaba a 622px del sitio con la
             comprobación diciendo que todo estaba bien.
             Con Lenis no pasa porque su viaje dura ~1.1s y para cuando llama a
             onComplete ya está todo renderizado. El salto instantáneo no tiene
             esa espera, así que hay que dársela. */
          window.setTimeout(revisar, 120);
        }
      };
      // Cuatro pasadas: el salto instantáneo puede necesitar dos o tres rondas
      // de "salta → se renderiza lo nuevo → el destino se mueve" antes de que
      // el documento deje de crecer.
      ajustar(4);
    };

    const onAnchorClick = (e: MouseEvent) => {
      // Respeta abrir en pestaña nueva, descargar, etc.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const a = (e.target as HTMLElement | null)?.closest?.('a[href^="#"]');
      if (!a) return;

      const hash = a.getAttribute('href') ?? '';
      if (hash.length < 2) return; // '#' pelado: no debería quedar ninguno
      const target = document.getElementById(hash.slice(1));
      if (!target) return; // destino inexistente: que falle a la vista, no en silencio

      e.preventDefault();
      irA(target);

      /* ⚠️ LA URL NO SE TOCA. Aquí había un `history.pushState(null, '', hash)`
         y se ha quitado a propósito.
         Escribir "#pricing" en la barra de direcciones convertía cada clic del
         menú en una entrada del historial, y a partir de ahí:
           · la URL dejaba de ser la de la página y pasaba a ser la del sitio
             donde te habías quedado, que es ruido para quien copia el enlace;
           · y sobre todo, RECARGAR ya no devolvía al principio: el navegador
             veía el hash y te dejaba a media página, sin intro y sin hero.
         Esta es una landing de una sola página, no una app con rutas: el hero
         es la puerta y cada visita tiene que entrar por ahí.
         Ver también el `INTRO_GATE` de layout.tsx, que limpia el hash antes del
         primer pintado por si llega uno de fuera. */

      /* Accesibilidad: sin esto el foco del teclado se queda en el enlace y el
         siguiente Tab sigue en el navbar, así que quien navega sin ratón se
         desplaza pero no "llega". `tabindex="-1"` lo hace enfocable sin
         meterlo en el orden de tabulación, y `preventScroll` evita que el
         navegador haga su propio salto encima del de Lenis. */
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    };

    document.addEventListener('click', onAnchorClick);

    /* ── 4 · TODA VISITA EMPIEZA EN EL HERO ─────────────────────────────────
       El hash lo quita el script bloqueante de layout.tsx antes del primer
       pintado, que es donde hay que quitarlo: si se hiciera aquí, en un efecto,
       el navegador ya habría saltado a la sección y se vería el salto y el
       regreso.

       Esto es el cinturón, por si algo dejó la página desplazada igualmente —
       una recarga en la que el navegador restaura scroll pese a
       `scrollRestoration = 'manual'`, o una extensión. Ir a 0 una vez es
       barato; llegar a media página sin haberlo pedido, no.

       Con la intro corriendo no hace falta: `release` ya coloca en 0 al subir
       el telón. */
    let alCargar: number | undefined;
    if (!introRunning) {
      alCargar = window.requestAnimationFrame(() => {
        if (window.scrollY === 0) return;
        if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
        else window.scrollTo({ top: 0, behavior: 'auto' });
      });
    }

    return () => {
      if (alCargar !== undefined) cancelAnimationFrame(alCargar);
      document.removeEventListener('click', onAnchorClick);
      window.removeEventListener('nexor:intro-settled', release);
      if (raf) gsap.ticker.remove(raf);
      lenis?.destroy();
    };
  }, []);

  return null;
}
