'use client';

import { forwardRef } from 'react';

/**
 * M6 · PÁRRAFO POR LÍNEAS.
 *
 * Solo marca: parte el texto en `.word` igual que RevealHeading, pero quien lo
 * anima es `revealLines()`, que agrupa esas palabras por línea midiendo su
 * offsetTop y las revela línea a línea.
 *
 * No lleva su propio useEffect a propósito. Estos párrafos viven dentro de la
 * coreografía de su sección (la sección 2 tiene un timeline maestro que ordena
 * badge → título → tarjeta → párrafos → chips), y si cada párrafo se disparara
 * por su cuenta con su propio ScrollTrigger, el orden se rompería.
 *
 * El espacio va FUERA del span: `.word` es inline-block y un espacio final
 * dentro de la caja se colapsa. Mismo motivo que en RevealHeading.
 */

type Props = {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  as?: 'p' | 'div';
  /** Necesario para que el timeline de la sección pueda localizarlo. */
  id?: string;
};

const RevealParagraph = forwardRef<HTMLParagraphElement, Props>(
  function RevealParagraph({ text, className = '', style, as = 'p', id }, ref) {
    const words = text.split(' ').flatMap((word, i, arr) => [
      <span key={`w-${i}`} className="word">
        {word}
      </span>,
      i < arr.length - 1 ? ' ' : null,
    ]);

    const shared = {
      ref,
      id,
      className,
      style,
      'data-reveal-words': 'pending' as const,
    };

    return as === 'div' ? <div {...shared}>{words}</div> : <p {...shared}>{words}</p>;
  }
);

export default RevealParagraph;
