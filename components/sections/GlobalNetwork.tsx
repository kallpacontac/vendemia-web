'use client';

import { Globe } from 'lucide-react';
import RevealHeading from '@/components/RevealHeading';
import Reveal from '@/components/Reveal';
import AssetSlot from '@/components/AssetSlot';
import { Badge, Starfield } from '@/components/ui';
import { GLOBAL_NETWORK } from '@/lib/content';

/**
 * 5 · RED GLOBAL — dark (#000), min-h-screen
 *
 * El globo ocupa la mitad inferior y se RECORTA contra el borde del viewport.
 * No cabe entero, y eso es intencional: da escala.
 *
 * El halo va en CSS, no como asset. Dos radial-gradients con blur(60px) hacen
 * el trabajo y pesan cero. El globo sí es el activo caro de la página —
 * WebM con alfa en loop, o Three.js si hay presupuesto.
 */
export default function GlobalNetwork() {
  return (
    <section
      /* `id="always-on"`, antes `id="global"`.
         "global" venía de la plantilla de origen, donde esta sección era un
         mapa de red mundial. Aquí el contenido es otro —"Tu negocio cierra a
         las 8. Mia no cierra nunca"— así que la URL /#global no describía nada
         y encima atraía enlaces equivocados: el "Comparativa" del navbar
         apuntaba aquí en vez de a la comparativa de verdad (#related). */
      id="always-on"
      className="cv-auto relative flex min-h-screen flex-col overflow-hidden"
      style={{ background: 'var(--bg-900)' }}
    >
      <Starfield count={50} />

      <div className="relative z-10 mx-auto w-full max-w-container px-6 pt-[64px] text-center md:pt-[120px]">
        <Reveal from="up">
          <Badge icon={<Globe size={12} style={{ color: 'var(--orange-500)' }} />}>
            {GLOBAL_NETWORK.badge}
          </Badge>
        </Reveal>

        <RevealHeading
          as="h2"
          text={GLOBAL_NETWORK.h2}
          className="mx-auto mt-6 max-w-[820px] text-[32px] font-semibold leading-[1.08] tracking-[-0.02em] md:text-[40px] lg:text-h2"
        />

        <Reveal from="up" delay={0.1}>
          <p className="mx-auto mt-6 max-w-[620px] text-body" style={{ color: 'var(--text-mid)' }}>
            {GLOBAL_NETWORK.paragraph}
          </p>
        </Reveal>
      </div>

      {/* Globo + halo · recortados por el borde inferior */}
      <div className="relative mt-auto flex h-[420px] items-start justify-center md:h-[520px]">
        {/* Halo — CSS puro */}
        <div
          className="pointer-events-none absolute left-1/2 top-[6%] h-[900px] w-[900px] -translate-x-1/2"
          aria-hidden
          style={{
            background:
              'radial-gradient(circle, var(--orange-glow) 0%, var(--amber-300) 45%, transparent 70%)',
            filter: 'blur(60px)',
            opacity: 0.55,
          }}
        />
        <div className="relative w-[560px] max-w-[92vw] translate-y-[12%] md:w-[820px]">
          {/* Ya no es un globo giratorio sino una esfera de 24 horas: el
              argumento de esta sección es el HORARIO, no la geografía —
              Vendemia vende en Perú, no en el mundo, así que un globo terráqueo
              ilustraba la sección equivocada. Sin `kind="video"` por lo mismo
              que en BentoA: el tipo lo decide el registro. */}
          <AssetSlot
            id="global.globe"
            ratio="1/1"
            tone="dark"
            radius="none"
            label="Las 24 horas del día, todas encendidas"
            className="w-full"
          />
        </div>
      </div>
    </section>
  );
}
