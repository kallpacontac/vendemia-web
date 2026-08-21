'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { MessageSquare, ShieldCheck, CalendarCheck, BarChart3, Info } from 'lucide-react';
import RevealHeading from '@/components/RevealHeading';
import { PRICING } from '@/lib/content';
import { registerGsap, prefersReducedMotion, DIRECTIONAL_CUBIC } from '@/lib/motion';

/**
 * 8 · PRICING — dark (#000)
 *
 * Dos detalles que se pierden si no los miras de cerca:
 *  · Los botones del hero son píldoras (radius full, 40px). Estos son de 48px
 *    y radius 12. La distinción es deliberada: aquí no estás explorando,
 *    estás decidiendo.
 *  · La entrada NO sigue el orden de lectura. Va del CENTRO HACIA AFUERA: la
 *    tarjeta destacada primero, las laterales después y en paralelo.
 */

const ICONS = {
  chat: MessageSquare,
  shield: ShieldCheck,
  calendar: CalendarCheck,
  chart: BarChart3,
} as const;

export default function Pricing() {
  const [currency, setCurrency] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const priceRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // ── Entrada del centro hacia afuera ──────────────────────
  useEffect(() => {
    registerGsap();
    const el = root.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) {
        gsap.set('[data-plan]', { opacity: 1, y: 0 });
        return;
      }
      const cards = gsap.utils.toArray<HTMLElement>('[data-plan]');
      // orden: 1 (destacada) → 0 y 2 a la vez
      const order = [cards[1], cards[0], cards[2]].filter(Boolean);

      gsap.fromTo(
        order,
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: DIRECTIONAL_CUBIC,
          stagger: 0.12,
          onStart: () => cards.forEach((c) => c.removeAttribute('data-reveal')),
          scrollTrigger: { trigger: el, start: 'top 80%', once: true },
        }
      );
    }, el);

    return () => ctx.revert();
  }, []);

  // ── Contador interpolado al cambiar de moneda ────────────
  const changeCurrency = (index: number) => {
    const from = PRICING.currencies[currency];
    const to = PRICING.currencies[index];
    setCurrency(index);

    if (prefersReducedMotion()) return;

    PRICING.plans.forEach((plan, i) => {
      const node = priceRefs.current[i];
      if (!node) return;
      const obj = { v: plan.price * from.rate };
      gsap.to(obj, {
        v: plan.price * to.rate,
        duration: 0.4,
        ease: 'power2.out',
        onUpdate: () => {
          node.textContent = `${to.symbol}${obj.v.toFixed(0)}`;
        },
      });
    });
  };

  const cur = PRICING.currencies[currency];

  return (
    <section id="pricing" className="cv-auto relative" style={{ background: 'var(--bg-900)' }}>
      <div className="mx-auto w-full max-w-container px-6 py-[64px] md:py-[120px]">
        {/* Toggle de moneda */}
        <div className="flex justify-center">
          <div
            className="flex h-[36px] items-center gap-1 rounded-full border p-1"
            style={{ borderColor: 'var(--border-dark)' }}
            role="group"
            aria-label="Moneda"
          >
            {PRICING.currencies.map((c, i) => (
              <button
                key={c.code}
                type="button"
                onClick={() => changeCurrency(i)}
                aria-pressed={currency === i}
                aria-label={`Mostrar precios en ${c.code}`}
                className="flex h-7 w-9 items-center justify-center rounded-full text-[14px] font-medium transition-colors duration-[250ms]"
                style={
                  currency === i
                    ? { background: 'var(--surface-700)', color: 'var(--text-hi)' }
                    : { color: 'var(--text-low)' }
                }
              >
                {c.symbol}
              </button>
            ))}
          </div>
        </div>

        <RevealHeading
          as="h2"
          text={PRICING.h2}
          className="mx-auto mt-8 max-w-[820px] text-center text-[32px] font-semibold leading-[1.08] tracking-[-0.02em] md:text-[40px] lg:text-h2"
        />

        {/* ⚠️ ESTE PÁRRAFO ESTABA ESCRITO EN content.ts Y NO SE PINTABA.
            Es donde se anula el riesgo —garantía, sin permanencia, sin costo de
            instalación— y en una sección de precios eso no es letra pequeña: es
            justo la objeción que frena el clic. Estaba redactado y el
            componente nunca lo leía, así que el lector veía tres cifras a
            secas. Lo mismo le pasaba a PRICING.footnote, aquí abajo. */}
        <p
          className="mx-auto mt-5 max-w-[620px] text-center text-body"
          style={{ color: 'var(--text-mid)' }}
        >
          {PRICING.subtitle}
        </p>

        <div ref={root} className="mt-14 grid grid-cols-1 items-center gap-6 md:grid-cols-2 lg:grid-cols-3">
          {PRICING.plans.map((plan, i) => (
            <div
              key={plan.header}
              data-plan
              data-reveal="up"
              className={`relative flex flex-col rounded-card border p-7 ${
                plan.featured ? 'gradient-border lg:min-h-[486px]' : 'lg:min-h-[470px]'
              }`}
              style={{
                background: 'var(--surface-800)',
                borderColor: plan.featured ? 'transparent' : 'var(--border-dark)',
                boxShadow: plan.featured ? '0 0 80px -20px #FF4900' : undefined,
              }}
            >
              <p className="text-center text-[13px]" style={{ color: 'var(--text-mid)' }}>
                {plan.header}
              </p>

              <p className="mt-4 text-center">
                <span
                  ref={(n) => {
                    priceRefs.current[i] = n;
                  }}
                  className="text-[40px] font-semibold"
                >
                  {cur.symbol}
                  {(plan.price * cur.rate).toFixed(0)}
                </span>
                <span className="ml-1 text-[14px]" style={{ color: 'var(--text-mid)' }}>
                  {PRICING.period}
                </span>
              </p>

              <hr className="my-6 border-0 border-t" style={{ borderColor: 'var(--border-dark)' }} />

              <ul className="space-y-4">
                {plan.specs.map((spec) => {
                  const Icon = ICONS[spec.icon as keyof typeof ICONS];
                  return (
                    <li key={spec.label} className="flex items-center gap-3 text-[14px]">
                      <Icon size={16} style={{ color: 'var(--text-low)' }} />
                      <span style={{ color: 'var(--text-mid)' }}>{spec.label}</span>
                      {'tooltip' in spec && spec.tooltip && (
                        <span className="group relative inline-flex" tabIndex={0}>
                          <Info size={13} style={{ color: 'var(--text-low)' }} />
                          <span
                            role="tooltip"
                            className="pointer-events-none absolute bottom-full left-1/2 mb-2 w-[180px] -translate-x-1/2 rounded-icon border p-2 text-[12px] opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus:opacity-100"
                            style={{
                              background: 'var(--surface-700)',
                              borderColor: 'var(--border-dark)',
                              color: 'var(--text-mid)',
                            }}
                          >
                            {spec.tooltip}
                          </span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>

              <a
                href="#final-cta"
                className="mt-auto flex h-12 items-center justify-center rounded-btn text-[15px] font-medium transition-colors duration-[250ms]"
                style={
                  plan.featured
                    ? { background: 'var(--orange-cta)', color: 'var(--on-orange)' }
                    : { border: '1px solid var(--border-dark)', color: 'var(--text-hi)' }
                }
              >
                {/* Cada plan nombra SU plan en el botón — ver la nota en
                    content.ts. PRICING.cta queda de respaldo por si algún día
                    entra un plan sin el suyo. */}
                {plan.cta ?? PRICING.cta}
              </a>
            </div>
          ))}
        </div>

        {/* --text-mid: sobre el negro de esta sección, --text-low da 3.94 y
            suspende AA. Ver la misma nota en Hero.tsx. */}
        <p className="mt-10 text-center text-[13px]" style={{ color: 'var(--text-mid)' }}>
          {PRICING.footnote}
        </p>
      </div>
    </section>
  );
}
