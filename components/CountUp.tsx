'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { registerGsap, prefersReducedMotion } from '@/lib/motion';

/**
 * CONTADOR ASCENDENTE CON OBJETIVO SORTEADO
 *
 * Mismo mecanismo que el contador de precios de Pricing.tsx (el del botón de
 * moneda): se interpola un objeto plano y en cada frame se escribe el
 * `textContent`. No se anima el nodo de texto en sí — GSAP no interpola texto,
 * y hacerlo con estado de React sería un re-render por frame.
 *
 * La diferencia con el de precios es que aquí el destino NO es un dato: se
 * sortea en cada carga. La frase dice que cada minuto pierdes ventas, y que la
 * cifra no sea siempre la misma es justo lo que hace que se lea como una
 * pérdida en curso y no como un dato de folleto.
 *
 * ── Tres cosas que hay que hacer bien o no funciona ──────────────────────
 *
 * 1 · EL SORTEO VA EN EL EFECTO, NUNCA EN EL RENDER.
 *     Math.random() en el cuerpo del componente da un número en el servidor y
 *     otro distinto en el cliente: React lo detecta como hydration mismatch,
 *     avisa por consola y repinta. El servidor pinta SIEMPRE `from`, que es
 *     determinista, y el objetivo se sortea ya en el navegador.
 *
 * 2 · EL HUECO SE RESERVA CON UN GEMELO INVISIBLE, NO CON `ch`.
 *     Contando de 4 a 88 el texto pasa de una cifra a dos, y dentro de un H1
 *     centrado eso desplaza la línea entera en mitad de la cuenta.
 *
 *     El primer intento fue `min-width: 2ch` + cifras tabulares. NO BASTA, y
 *     se midió: la palabra siguiente seguía moviéndose 4 px. El motivo es que
 *     `ch` es el avance del carácter "0" en las cifras POR DEFECTO de la
 *     fuente, que en Inter son proporcionales, mientras que el número se pinta
 *     con `tabular-nums`. Son dos anchos distintos, así que dos dígitos
 *     tabulares no caben exactamente en `2ch` y el `min-width` se queda corto.
 *
 *     La solución no adivina: mete el número MÁS ANCHO POSIBLE en un gemelo
 *     invisible que ocupa sitio, y pinta la cifra viva encima en absoluto. El
 *     hueco pasa a medirlo el propio navegador con la fuente real y los
 *     ajustes reales, y deja de depender de ninguna equivalencia.
 *
 *     Se reserva con el MÁXIMO posible, no con el objetivo de esta tirada: así
 *     el titular parte las líneas igual en todas las sesiones, salga 7 o 98.
 *
 * 3 · SIN aria-live.
 *     Un número que cambia sesenta veces por segundo dentro de una región viva
 *     es un lector de pantalla recitando cifras sin parar. El H1 se lee cuando
 *     el usuario navega hasta él, y para entonces ya está quieto.
 */

type Props = {
  /** Objetivo mínimo, inclusive. */
  min: number;
  /** Objetivo máximo, inclusive. También decide el ancho reservado. */
  max: number;
  /** Desde dónde cuenta. Es lo que pinta el servidor. Por defecto, `min`. */
  from?: number;
  duration?: number;
  delay?: number;
  /** Espera al relevo de la intro (`nexor:intro-done`), como el resto del hero. */
  awaitIntro?: boolean;
  className?: string;
};

export default function CountUp({
  min,
  max,
  from = min,
  duration = 1.6,
  delay = 0,
  awaitIntro = false,
  className = '',
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    registerGsap();
    const el = ref.current;
    if (!el) return;

    // El objetivo se sortea por encima del arranque, no en todo el rango.
    // Si saliera justo `from` (1 de cada 96 cargas con 4–99), el número se
    // quedaría clavado en su valor inicial y la frase parecería rota, no
    // animada. Descartar ese único valor no distorsiona nada apreciable.
    const lo = Math.min(from + 1, max);
    const target = lo + Math.floor(Math.random() * (max - lo + 1));

    if (prefersReducedMotion()) {
      el.textContent = String(target);
      return;
    }

    let ctx: gsap.Context | undefined;

    const play = () => {
      if (ctx) return;
      ctx = gsap.context(() => {
        const obj = { v: from };
        gsap.to(obj, {
          v: target,
          duration,
          delay,
          // No `power2.out`: esa curva llega casi al final enseguida y luego se
          // arrastra, y en un contador eso se lee como que se ha atascado. Una
          // cuenta tiene que perder velocidad al final, pero repartiendo: por
          // eso `expo.out` no, y `power1.out` sí.
          ease: 'power1.out',
          onUpdate: () => {
            el.textContent = String(Math.round(obj.v));
          },
        });
      }, el);
    };

    const introRunning = awaitIntro && document.documentElement.dataset.intro === 'run';
    if (introRunning) {
      window.addEventListener('nexor:intro-done', play, { once: true });
    } else {
      play();
    }

    return () => {
      window.removeEventListener('nexor:intro-done', play);
      ctx?.revert();
    };
  }, [min, max, from, duration, delay, awaitIntro]);

  return (
    <span
      className={className}
      style={{
        position: 'relative',
        display: 'inline-block',
        // Cifras de ancho fijo. Sin esto, un 1 mide bastante menos que un 8 y
        // el número se encoge y se estira mientras cuenta aunque el hueco
        // total esté reservado. Va en el padre para que gemelo y cifra viva se
        // midan exactamente igual.
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {/* GEMELO · no se ve, pero es quien ocupa el sitio.
          · `aria-hidden`: para un lector de pantalla sería el número dos veces.
          · `user-select: none`: `visibility: hidden` sigue contando como
            renderizado, así que sin esto el gemelo ENTRA en la selección y
            copiar el titular daba "pierdes 9934 ventas". */}
      <span
        aria-hidden="true"
        style={{ visibility: 'hidden', userSelect: 'none' }}
      >
        {max}
      </span>
      {/* CIFRA VIVA · absoluta sobre el gemelo, así que cambiar de una a dos
          cifras no altera el ancho de nada. */}
      <span
        ref={ref}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          textAlign: 'center',
        }}
      >
        {from}
      </span>
    </span>
  );
}
