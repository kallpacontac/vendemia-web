'use client';

import RevealHeading from '@/components/RevealHeading';
import Reveal from '@/components/Reveal';
import { FINAL_CTA, whatsappLink } from '@/lib/content';

/**
 * 10 · CTA FINAL — gradiente dramático
 *
 * El arco de luz sale de un radial-gradient con el CENTRO POR DEBAJO del
 * viewport (at 50% 130%). Eso es lo que produce la cúpula invertida; si lo
 * centras dentro, sale un círculo y se pierde el efecto.
 *
 * El contenido va en el TERCIO SUPERIOR, no centrado verticalmente. Si lo
 * centras, el texto se come el degradado.
 */
export default function FinalCta() {
  return (
    <section
      id="final-cta"
      className="relative flex min-h-[70vh] flex-col items-center overflow-hidden"
      style={{ background: 'var(--bg-900)' }}
    >
      {/* Capa del degradado — respira con scale 1 → 1.06 en loop de 8s */}
      <div
        className="pointer-events-none absolute inset-0 animate-breathe"
        aria-hidden
        style={{
          background:
            'radial-gradient(120% 80% at 50% 130%, #FFFFFF 0%, #FFD9B0 18%, #FF7A18 38%, #7A2300 58%, transparent 78%)',
        }}
      />
      {/* Capa hija con blur para suavizar las bandas del degradado */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{ backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)' }}
      />

      <div className="relative z-10 mx-auto w-full max-w-container px-6 pt-[80px] text-center md:pt-[120px]">
        {/* El badge repite el titular del hero. Para cuando el lector llega
            aquí ha bajado una página entera y ya no tiene presente por qué
            empezó a leer; el cierre tiene que devolvérselo antes de pedir. */}
        <Reveal from="up">
          <span
            className="inline-flex h-[28px] items-center rounded-full border px-3 text-badge"
            style={{
              borderColor: 'rgba(255,255,255,.22)',
              background: 'rgba(0,0,0,.28)',
              backdropFilter: 'blur(12px)',
              color: 'rgba(255,255,255,.92)',
            }}
          >
            {FINAL_CTA.badge}
          </span>
        </Reveal>

        <RevealHeading
          as="h2"
          text={FINAL_CTA.h2}
          className="mx-auto mt-6 max-w-[760px] text-[32px] font-semibold leading-[1.08] tracking-[-0.02em] md:text-[40px] lg:text-h2"
        />

        <Reveal from="up" delay={0.1}>
          <p className="mx-auto mt-6 max-w-[520px] text-body" style={{ color: 'rgba(255,255,255,.7)' }}>
            {FINAL_CTA.paragraph.join(' ')}
          </p>

          {/* ⚠️ ESTE BOTÓN APUNTABA A `mailto:ventas@nexor.example`.
              Dominio de ejemplo heredado de la plantilla: `.example` está
              RESERVADO por la RFC 2606 precisamente para que nunca resuelva, o
              sea que el correo no rebotaba — no llegaba a ninguna parte. Y era
              el botón del cierre, el último clic de la página.
              Ahora abre WhatsApp con el mismo constructor que los tres
              "Prueba gratis" del navbar, así que el número vive en un único
              sitio y llegar por aquí ya es una demostración del producto. */}
          <a
            {...whatsappLink(FINAL_CTA.cta)}
            className="mt-8 inline-flex h-12 items-center rounded-full border px-7 text-[15px] font-semibold text-white transition-colors duration-[250ms] hover:bg-white/20"
            style={{
              background: 'rgba(255,255,255,.10)',
              backdropFilter: 'blur(12px)',
              borderColor: 'rgba(255,255,255,.18)',
            }}
          >
            {FINAL_CTA.cta}
          </a>

          {/* La garantía, repetida al lado del botón. No es redundante: este es
              el último punto de la página donde se abandona. */}
          <p className="mt-5 text-[13px]" style={{ color: 'rgba(255,255,255,.6)' }}>
            {FINAL_CTA.footnote}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
