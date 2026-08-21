'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { registerGsap, revealWords } from '@/lib/motion';

/**
 * M1 · REVEAL DE TÍTULO POR PALABRA — obligatorio en TODOS los H1 y H2.
 *
 * Envuelve cada palabra en <span class="word"> y deja que lib/motion la anime.
 * No usamos SplitText: partir por espacios cubre el caso y evita una dependencia
 * de pago.
 *
 * El estado inicial vive en CSS ([data-reveal-words='pending'] .word) para que
 * no haya flash de texto visible antes de que GSAP monte.
 */

type Props = {
  as?: 'h1' | 'h2' | 'h3' | 'p';
  text: string;
  className?: string;
  /** Dispara al montar en vez de por scroll */
  immediate?: boolean;
  /**
   * Espera al relevo de la intro (`nexor:intro-done`) antes de arrancar.
   * El H1 del hero LO NECESITA: sin esto se anima al montar, mientras sigue
   * escondido debajo del telón, y cuando la página termina de subir el titular
   * ya está puesto — justo lo contrario de lo que se busca.
   */
  awaitIntro?: boolean;
  /**
   * No se anima solo: solo pinta el marcado con sus `.word`.
   * Para secciones con timeline maestro, donde el orden entre titular,
   * tarjeta y párrafos importa y cada pieza no puede dispararse por su cuenta.
   */
  manual?: boolean;
  delay?: number;
  id?: string;
  /**
   * Piezas vivas dentro del titular.
   *
   * `text` puede llevar tokens sueltos (una palabra entera, p. ej. `{n}`) y
   * aquí se da el nodo que va en su lugar. El nodo se monta DENTRO del mismo
   * `<span class="word">` que el resto, así que M1 lo revela como a cualquier
   * otra palabra y no hay que tocar la animación para nada.
   *
   * Nace para el contador del hero: el H1 dice "…pierdes N ventas" y esa N es
   * un componente que cuenta. La alternativa —partir el titular en tres trozos
   * de JSX— rompía el reparto del stagger, que se calcula sobre el número
   * total de palabras.
   */
  slots?: Record<string, ReactNode>;
};

export default function RevealHeading({
  as = 'h2',
  text,
  className = '',
  immediate = false,
  awaitIntro = false,
  manual = false,
  delay = 0,
  id,
  slots,
}: Props) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (manual) return; // lo anima el timeline de la sección
    registerGsap();
    const el = ref.current;
    if (!el) return;

    let ctx: gsap.Context | undefined;

    const play = () => {
      if (ctx) return;
      ctx = gsap.context(() => {
        revealWords(el, { delay, immediate: immediate || awaitIntro });
      }, el);
    };

    const introRunning =
      awaitIntro && document.documentElement.dataset.intro === 'run';

    if (introRunning) {
      window.addEventListener('nexor:intro-done', play, { once: true });
    } else {
      play();
    }

    return () => {
      window.removeEventListener('nexor:intro-done', play);
      ctx?.revert();
    };
  }, [delay, immediate, awaitIntro, manual]);

  /**
   * ⚠️ El espacio va FUERA del <span>.
   *
   * `.word` es `display: inline-block`, y un espacio final dentro de una caja
   * inline-block se colapsa y desaparece. Con el espacio dentro, el titular
   * se renderizaba literalmente como "Inferenciaqueocurredondeestátuusuario".
   * Entre dos inline-block, en cambio, el espacio sí cuenta como separación.
   */
  const words = text.split(' ').flatMap((word, i, arr) => [
    <span key={`w-${i}`} className="word">
      {slots?.[word] ?? word}
    </span>,
    i < arr.length - 1 ? ' ' : null,
  ]);

  const shared = { ref, id, className, 'data-reveal-words': 'pending' as const };

  // JSX explícito en vez de createElement: TS comprueba los atributos con guion
  // en elementos intrínsecos, pero no a través de createElement genérico.
  if (as === 'h1') return <h1 {...shared}>{words}</h1>;
  if (as === 'h3') return <h3 {...shared}>{words}</h3>;
  if (as === 'p') return <p {...shared}>{words}</p>;
  return <h2 {...shared}>{words}</h2>;
}
