'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { registerGsap, cascadeText } from '@/lib/motion';

/**
 * M1b · TEXTO CON LA CASCADA DEL WORDMARK
 *
 * Reparte el texto en piezas y las sube de opacidad una tras otra, igual que se
 * forma "VENDEMIA" en la intro. Sin desplazamiento, sin blur.
 *
 *   by="word"    párrafos y frases largas. Es lo normal.
 *   by="letter"  frases MUY cortas (badges, pies de 3-4 palabras) donde la
 *                cascada por palabra se acaba antes de que la veas.
 *
 * A partir de ~14 palabras, por letra son cientos de <span> y el efecto se
 * convierte en ruido: el componente ignora `by="letter"` en ese caso.
 *
 * El estado inicial vive en CSS ([data-cascade='pending']), como en M1: entre
 * el primer paint y el useEffect hay una ventana en la que el texto se vería
 * entero antes de empezar.
 */

type Props = {
  as?: 'p' | 'span' | 'h3';
  text: string;
  className?: string;
  style?: React.CSSProperties;
  by?: 'word' | 'letter';
  /** Dispara al montar en vez de por scroll */
  immediate?: boolean;
  /** Espera al relevo de la intro (`nexor:intro-done`). Solo lo necesita el hero. */
  awaitIntro?: boolean;
  delay?: number;
  /** Ventana total del reparto en segundos. Por defecto la de la intro (0.45s). */
  spread?: number;
};

const LETTER_MAX_WORDS = 14;

export default function CascadeText({
  as = 'p',
  text,
  className = '',
  style,
  by = 'word',
  immediate = false,
  awaitIntro = false,
  delay = 0,
  spread,
}: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    registerGsap();
    const el = ref.current;
    if (!el) return;

    let ctx: gsap.Context | undefined;

    const play = () => {
      if (ctx) return;
      ctx = gsap.context(() => {
        cascadeText(el, { delay, spread, immediate: immediate || awaitIntro });
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
  }, [delay, spread, immediate, awaitIntro]);

  const words = text.split(' ');
  const useLetters = by === 'letter' && words.length <= LETTER_MAX_WORDS;

  /**
   * ⚠️ Los espacios van FUERA del <span>, igual que en RevealHeading: `.cascade-part`
   * es inline-block y un espacio dentro de una caja inline-block se colapsa.
   */
  const parts = useLetters
    ? // Por letra: cada palabra es un bloque propio para que no se parta a mitad
      // al hacer wrap, y el espacio queda entre bloques.
      words.flatMap((word, w, arr) => [
        <span key={`w-${w}`} style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
          {Array.from(word).map((ch, i) => (
            <span key={`c-${w}-${i}`} className="cascade-part">
              {ch}
            </span>
          ))}
        </span>,
        w < arr.length - 1 ? ' ' : null,
      ])
    : words.flatMap((word, i, arr) => [
        <span key={`w-${i}`} className="cascade-part">
          {word}
        </span>,
        i < arr.length - 1 ? ' ' : null,
      ]);

  const shared = {
    ref: ref as React.Ref<never>,
    className,
    style,
    'data-cascade': 'pending' as const,
  };

  if (as === 'span') return <span {...shared}>{parts}</span>;
  if (as === 'h3') return <h3 {...shared}>{parts}</h3>;
  return <p {...shared}>{parts}</p>;
}
