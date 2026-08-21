'use client';

import Reveal from '@/components/Reveal';
import AssetSlot from '@/components/AssetSlot';
import { DarkCard, RichParagraph } from '@/components/ui';
import { BENTO_B } from '@/lib/content';
import type { AssetId } from '@/lib/assets';

/**
 * 4 · CAPACIDADES · bento B — dark (#000), scroll normal
 *
 * grid-template-areas irregular:
 *   "a b c"
 *   "d d e"    ← d ocupa dos columnas
 *
 * A partir de aquí se acaban las secciones apiladas (M4) y todo es scroll
 * normal con M1/M2. Mantener el apilado más allá de la tercera sección cansa.
 */
export default function BentoB() {
  return (
    <section id="bento-b" className="cv-auto relative" style={{ background: 'var(--bg-900)' }}>
      <div className="mx-auto w-full max-w-container px-6 pb-[64px] md:pb-[120px]">
        <Reveal
          from="up"
          stagger={0.1}
          childSelector="[data-card]"
          className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          {BENTO_B.cards.map((card, i) => {
            const isWide = card.area === 'd';
            return (
              <DarkCard
                key={card.area}
                data-card
                data-reveal="up"
                glowCorner={i % 2 === 0 ? 'top-right' : 'bottom-left'}
                className={`flex flex-col ${
                  isWide ? 'lg:col-span-2 lg:h-[300px]' : 'lg:h-[340px]'
                } h-[340px]`}
              >
                <h3 className="text-h3">{card.title}</h3>
                <RichParagraph parts={card.body} className="mt-3 max-w-[400px]" />

                {/* La visual ocupa la mitad inferior, desborda y se recorta */}
                <div className="relative -mx-7 -mb-7 mt-auto h-[150px] overflow-hidden">
                  <AssetSlot
                    id={card.assetId as AssetId}
                    ratio={isWide ? '3/1' : '3/2'}
                    tone="dark"
                    radius="none"
                    label={card.title}
                    className="absolute inset-x-0 top-0 h-[200px]"
                  />
                </div>
              </DarkCard>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}
