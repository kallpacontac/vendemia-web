'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { Wallet, Clock, ShieldCheck, ChevronRight } from 'lucide-react';
import RevealHeading from '@/components/RevealHeading';
import { RELATED } from '@/lib/content';
import { registerGsap, prefersReducedMotion, directionalReveal } from '@/lib/motion';

/**
 * 11 · PRODUCTOS RELACIONADOS — dark (#000)
 *
 * El blanco del CTA anterior queda como un borde superior redondeado de 32px
 * que se "despega" de esta sección: margin-top negativo + radius arriba.
 *
 * La entrada aplica M2 literalmente: izquierda desde x:-60, centro desde y:+40,
 * derecha desde x:+60. Cada una desde el borde más cercano.
 */

const ICONS = { wallet: Wallet, clock: Clock, shield: ShieldCheck } as const;

export default function Related() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerGsap();
    const el = root.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) return;
      const cards = gsap.utils.toArray<HTMLElement>('[data-card]');
      const dirs = ['left', 'up', 'right'] as const;
      cards.forEach((card, i) => {
        directionalReveal([card], dirs[i] ?? 'up', {
          delay: i * 0.1,
          trigger: el,
        });
      });
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <section
      id="related"
      className="cv-auto relative -mt-8 rounded-t-stack"
      style={{ background: 'var(--bg-900)' }}
    >
      <div className="mx-auto w-full max-w-container px-6 py-[64px] md:py-[120px]">
        <RevealHeading
          as="h2"
          text={RELATED.h2}
          className="text-center text-[32px] font-semibold leading-[1.08] tracking-[-0.02em] md:text-[40px] lg:text-h2"
        />

        <div ref={root} className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {RELATED.cards.map((card, i) => {
            const Icon = ICONS[card.icon as keyof typeof ICONS];
            return (
              /* `article`, no `a`.
                 Estas tres tarjetas eran enlaces con `href="#"` y un pie que
                 prometía "Ver comparativa completa". No había adónde ir: ESTA
                 sección ES la comparativa (es a donde apunta "Comparativa" en
                 el navbar), así que el enlace era circular además de vacío.
                 Si algún día hay una página de comparativa detallada, se les
                 devuelve el `href` y el pie. */
              <article
                key={card.title}
                data-card
                data-reveal={i === 0 ? 'left' : i === 1 ? 'up' : 'right'}
                className="group flex min-h-[300px] flex-col rounded-card border p-7 transition-colors duration-[250ms]"
                style={{ background: 'var(--surface-800)', borderColor: 'var(--border-dark)' }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#333')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-dark)')}
              >
                <span className="relative flex h-11 w-11 items-center justify-center rounded-full">
                  <span
                    className="absolute inset-0 rounded-full opacity-25 transition-opacity duration-[250ms] group-hover:opacity-40"
                    aria-hidden
                    style={{
                      background: 'radial-gradient(circle, var(--orange-500), transparent 70%)',
                      filter: 'blur(20px)',
                    }}
                  />
                  <span
                    className="relative flex h-11 w-11 items-center justify-center rounded-full border"
                    style={{ borderColor: 'var(--border-dark)', background: 'var(--surface-700)' }}
                  >
                    <Icon size={20} style={{ color: 'var(--orange-500)' }} />
                  </span>
                </span>

                <h3 className="mt-6 text-[18px] font-semibold">{card.title}</h3>
                <p className="mt-3 text-body" style={{ color: 'var(--text-mid)' }}>
                  {card.body}
                </p>

              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
