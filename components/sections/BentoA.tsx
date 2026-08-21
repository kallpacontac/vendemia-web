'use client';

import { Sparkles } from 'lucide-react';
import RevealHeading from '@/components/RevealHeading';
import Reveal from '@/components/Reveal';
import AssetSlot from '@/components/AssetSlot';
import { Badge, DarkCard, RichParagraph } from '@/components/ui';
import { BENTO_A } from '@/lib/content';

/**
 * 3 · CAPACIDADES · bento A — dark (#000), apilada (M4)
 *
 * Grid asimétrico 1.6fr / 1fr. Las visuales DESBORDAN por abajo y se recortan
 * contra el borde de la tarjeta — no se ajustan dentro. Ese recorte es parte
 * del lenguaje: sugiere que hay más de lo que cabe.
 */
export default function BentoA() {
  return (
    <section id="bento-a" className="stacked relative" style={{ background: 'var(--bg-900)' }}>
      <div className="mx-auto w-full max-w-container px-6 py-[64px] md:py-[120px]">
        <div className="flex flex-col items-center text-center">
          <Badge icon={<Sparkles size={12} style={{ color: 'var(--orange-500)' }} />}>
            {BENTO_A.badge}
          </Badge>
          <RevealHeading
            as="h2"
            text={BENTO_A.h2}
            className="mt-6 max-w-[820px] text-[32px] font-semibold leading-[1.08] tracking-[-0.02em] md:text-[40px] lg:text-h2"
          />
        </div>

        <Reveal
          from="up"
          stagger={0.12}
          childSelector="[data-card]"
          className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]"
        >
          {/* Tarjeta grande · título arriba */}
          <DarkCard data-card data-reveal="up" glowCorner="top-right" className="flex h-[480px] flex-col">
            <h3 className="text-h3">{BENTO_A.cards.network.title}</h3>
            <RichParagraph parts={BENTO_A.cards.network.body} className="mt-3 max-w-[440px]" />
            {/* Desborda por abajo a propósito */}
            <div className="relative -mx-7 -mb-7 mt-auto h-[280px] overflow-hidden">
              {/* Sin `kind="video"`: el slot ya no es un vídeo sino un SVG, y
                  forzarlo aquí hacía que AssetSlot pintara un <video> con un
                  .svg dentro — o sea, nada. El tipo lo decide el registro. */}
              <AssetSlot
                id="bentoA.globe"
                ratio="16/9"
                tone="dark"
                radius="none"
                label="La objeción entra y sale cerrada"
                className="absolute inset-x-0 top-0 h-[360px]"
              />
            </div>
          </DarkCard>

          {/* Tarjeta chica · título ABAJO, no arriba */}
          <DarkCard data-card data-reveal="up" glowCorner="bottom-left" className="flex h-[480px] flex-col">
            <div className="relative -mx-7 -mt-7 h-[300px] overflow-hidden">
              <AssetSlot
                id="bentoA.endpoint"
                ratio="1/1"
                tone="dark"
                radius="none"
                label="Diagrama de nodos conectados"
                className="absolute inset-0 h-full w-full"
              />
            </div>
            <div className="mt-auto pt-6">
              <h3 className="text-h3">{BENTO_A.cards.endpoint.title}</h3>
              <RichParagraph parts={BENTO_A.cards.endpoint.body} className="mt-3" />
            </div>
          </DarkCard>
        </Reveal>
      </div>
    </section>
  );
}
