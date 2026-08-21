'use client';

import RevealHeading from '@/components/RevealHeading';
import Reveal from '@/components/Reveal';
import AssetSlot from '@/components/AssetSlot';
import { Badge } from '@/components/ui';
import { USE_CASES } from '@/lib/content';
import type { AssetId } from '@/lib/assets';

/**
 * 7 · CASOS DE USO — cream (#F9F9F6)
 *
 * Grid 3×2, gap-x 48px, gap-y 64px. La entrada sigue el ORDEN DE LECTURA
 * (izq→der, arriba→abajo) con stagger de 0.08s. Es lo que hace que la retícula
 * se lea como una retícula y no como seis cosas sueltas apareciendo.
 */
export default function UseCases() {
  return (
    <section
      id="use-cases"
      className="cv-auto relative"
      style={{ background: 'var(--bg-cream)', color: 'var(--text-dark)' }}
    >
      <div className="mx-auto w-full max-w-container px-6 pb-[64px] md:pb-[120px]">
        <div className="flex flex-col items-center text-center">
          <Badge tone="light">{USE_CASES.badge}</Badge>
          <RevealHeading
            as="h2"
            text={USE_CASES.h2}
            className="mt-6 max-w-[820px] text-[32px] font-semibold leading-[1.08] tracking-[-0.02em] md:text-[40px] lg:text-h2"
          />
        </div>

        <Reveal
          from="up"
          stagger={0.08}
          childSelector="[data-case]"
          className="mt-14 grid grid-cols-1 gap-x-12 gap-y-16 md:grid-cols-2 lg:grid-cols-3"
        >
          {USE_CASES.items.map((item) => (
            <article key={item.title} data-case data-reveal="up">
              {/* ⚠️ EL ALTO LO PONE ESTE DIV, NO EL AssetSlot.
                  Antes iba `className="h-[240px]"` directamente en el slot, y
                  no servía de nada: AssetSlot ya le pone `h-full w-full` a su
                  <img>, así que había dos alturas peleándose. Ganaba `h-full`,
                  la tarjeta se estiraba a la altura de la fila del grid —medido,
                  424px en vez de 240— y el `object-cover` recortaba los lados de
                  la ilustración: se comía el disco del icono por la izquierda y
                  el pico de la burbuja por la derecha.
                  Con el alto en un contenedor, `h-full` resuelve contra algo
                  concreto y la imagen entra entera. */}
              <div className="h-[240px] w-full overflow-hidden rounded-card">
                <AssetSlot
                  id={item.assetId as AssetId}
                  tone="light"
                  label={`Ilustración · ${item.title}`}
                  className="h-full w-full"
                />
              </div>
              <h3 className="mt-5 text-h3">{item.title}</h3>
              <ul className="mt-3 space-y-2">
                {item.bullets.map((b) => (
                  <li
                    key={b}
                    className="flex gap-3 text-[14px] leading-[1.6]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <span
                      className="mt-[9px] h-1 w-1 shrink-0 rounded-full"
                      style={{ background: 'var(--orange-500)' }}
                      aria-hidden
                    />
                    {b}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
