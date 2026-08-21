'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { registerGsap, directionalReveal, type Direction } from '@/lib/motion';

/**
 * M2 · ENTRADA DIRECCIONAL — envoltorio declarativo.
 *
 * Dos modos:
 *   <Reveal from="left">…</Reveal>
 *       → anima el propio nodo. El estado inicial lo pone data-reveal solo.
 *
 *   <Reveal from="up" stagger={0.1} childSelector="[data-item]">…</Reveal>
 *       → anima sus hijos escalonados. IMPORTANTE: en este modo cada hijo
 *         necesita su propio data-reveal="up" para el estado inicial en CSS,
 *         porque el wrapper no debe desaparecer.
 *
 * Recuerda la regla: cada elemento entra desde el borde MÁS CERCANO a su
 * posición final. Columna izquierda → left. Columna derecha → right.
 * Centrado o de fila completa → up. Nada más.
 */

type Props = {
  from?: Direction;
  delay?: number;
  stagger?: number;
  childSelector?: string;
  className?: string;
  children: React.ReactNode;
  id?: string;
  style?: React.CSSProperties;
};

export default function Reveal({
  from = 'up',
  delay = 0,
  stagger,
  childSelector,
  className = '',
  children,
  id,
  style,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerGsap();
    const el = ref.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      const targets = childSelector
        ? el.querySelectorAll<HTMLElement>(childSelector)
        : [el];

      directionalReveal(targets, from, { delay, stagger, trigger: el });
    }, el);

    return () => ctx.revert();
  }, [from, delay, stagger, childSelector]);

  return (
    <div
      ref={ref}
      id={id}
      className={className}
      style={style}
      {...(childSelector ? {} : { 'data-reveal': from })}
    >
      {children}
    </div>
  );
}
