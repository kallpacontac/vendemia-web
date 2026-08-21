'use client';

import { useState, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import RevealHeading from '@/components/RevealHeading';
import Reveal from '@/components/Reveal';
import { FAQ } from '@/lib/content';

/**
 * 9 · FAQ — dark (#000)
 *
 * La apertura se anima con grid-template-rows: 0fr → 1fr (ver .accordion-panel
 * en globals.css), NO con max-height. El truco de max-height obliga a inventar
 * un valor grande y la curva sale mal cuando el contenido es corto.
 *
 * El primero está abierto por defecto: da a entender que esto se puede tocar.
 */
export default function Faq() {
  const [open, setOpen] = useState(0);
  const baseId = useId();

  return (
    <section id="faq" className="cv-auto relative" style={{ background: 'var(--bg-900)' }}>
      <div className="mx-auto w-full max-w-container px-6 pb-[64px] md:pb-[120px]">
        <RevealHeading
          as="h2"
          text={FAQ.h2}
          className="text-center text-[32px] font-semibold leading-[1.08] tracking-[-0.02em] md:text-[40px] lg:text-h2"
        />

        <Reveal from="up" stagger={0.06} childSelector="[data-faq]" className="mx-auto mt-12 max-w-faq">
          {FAQ.items.map((item, i) => {
            const isOpen = open === i;
            const panelId = `${baseId}-panel-${i}`;
            const btnId = `${baseId}-btn-${i}`;

            return (
              <div
                key={item.q}
                data-faq
                data-reveal="up"
                className={isOpen ? 'rounded-input p-6' : 'border-b py-5'}
                style={
                  isOpen
                    ? { background: 'var(--surface-800)' }
                    : { borderColor: 'var(--border-darker)' }
                }
              >
                <button
                  id={btnId}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <ChevronDown
                    size={16}
                    className="shrink-0 transition-transform duration-[350ms]"
                    style={{
                      color: 'var(--text-mid)',
                      transform: isOpen ? 'rotate(180deg)' : 'none',
                    }}
                  />
                  <span className="text-[16px] font-medium">{item.q}</span>
                </button>

                <div id={panelId} role="region" aria-labelledby={btnId} className="accordion-panel" data-open={isOpen}>
                  <div>
                    <div className="space-y-3 pl-7 pt-4">
                      {item.a.map((p, j) => (
                        <p key={j} className="text-body" style={{ color: 'var(--text-mid)' }}>
                          {p}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}
