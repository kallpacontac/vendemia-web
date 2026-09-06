'use client';

import { useEffect, useRef } from 'react';
import Navbar from '@/components/Navbar';
import Hero from '@/components/sections/Hero';
import Benefit from '@/components/sections/Benefit';
import BentoA from '@/components/sections/BentoA';
import ChatDemo from '@/components/sections/ChatDemo';
import UseCases from '@/components/sections/UseCases';
import Pricing from '@/components/sections/Pricing';
import Faq from '@/components/sections/Faq';
import FinalCta from '@/components/sections/FinalCta';
import Footer from '@/components/sections/Footer';
import { registerGsap, initStackedSections } from '@/lib/motion';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * RITMO DE FONDOS — este orden es la mitad del diseño. La página ALTERNA:
 *
 *   intro(gris) → Hero dark → Benefit CREAM → BentoA dark →
 *   ChatDemo CREAM → BentoB dark → Always-on dark → UseCases CREAM →
 *   Pricing dark → Faq dark → Related dark → FinalCta gradiente → Footer dark
 *
 * Si conviertes esto en "una landing toda oscura", pierdes el 70 % del impacto
 * visual. El contraste es el que hace que cada bloque se lea como un capítulo.
 *
 * El gradiente de FinalCta cierra la página justo antes del footer, que es
 * donde tiene que estar el clímax: es la única sección con ese tratamiento y
 * ahora coincide con la petición final.
 */
export default function Page() {
  const stackRef = useRef<HTMLDivElement>(null);

  // M4 · SECCIONES APILADAS — solo las tres primeras.
  //
  // ⚠️ NO se pueden crear mientras la intro corre. Durante la intro la página
  // está desplazada un viewport hacia abajo, así que ScrollTrigger mediría y
  // cachearía todas las posiciones con ese offset. Al quitar el transform, cada
  // trigger cree que ya está más avanzado de lo que está y aplica el
  // brightness(0.5) del apilado sobre el hero — que aparecía NEGRO, vacío,
  // como si no hubiera renderizado nada. Ese era el bug de "el hero no carga".
  useEffect(() => {
    registerGsap();
    const el = stackRef.current;
    if (!el) return;

    let triggers: ReturnType<typeof initStackedSections> = [];

    const init = () => {
      const sections = Array.from(el.querySelectorAll<HTMLElement>(':scope > .stacked'));
      // Un refresh antes de crearlos, por si algún layout cambió al liberar
      // el scroll del body.
      ScrollTrigger.refresh();
      triggers = initStackedSections(sections);
    };

    const introRunning = document.documentElement.dataset.intro === 'run';
    if (introRunning) {
      window.addEventListener('nexor:intro-settled', init, { once: true });
    } else {
      init();
    }

    return () => {
      window.removeEventListener('nexor:intro-settled', init);
      triggers.forEach((t) => t.kill());
    };
  }, []);

  return (
    <>
      <Navbar />

      <main>
        {/* Las tres apiladas viven en su propio contenedor: cada una es sticky
            y la siguiente la cubre subiendo desde abajo. */}
        <div ref={stackRef}>
          <Hero />
          <Benefit />
          <BentoA />
        </div>

        {/*
          De aquí en adelante, scroll normal con M1/M2.

          ── EL ORDEN NO ES ARBITRARIO ────────────────────────────────────
          Sigue la secuencia de preguntas que se hace quien llega, no el orden
          en que se construyeron las secciones:

            1 Hero        ¿qué es y qué gano?      → dolor con cifra + categoría
            2 Benefit     ¿me pasa a mí?           → calculadora con SUS números
            3 BentoA      ¿cómo funciona?          → el mecanismo
            4 ChatDemo    ¿funciona de verdad?     → que lo vea funcionar
            5 BentoB      ¿qué más hace?
            6 Always-on   ¿y cuando no estoy?
            7 UseCases    ¿sirve para MI negocio?
            8 Pricing     ¿cuánto cuesta?
            9 Faq         mis dudas
           10 Related     ¿por qué tú y no otro?
           11 FinalCta    la petición

          Dos cambios respecto al orden anterior:

          · LA DEMO SUBE de la posición 6 a la 4. Es el activo más
            convincente —se prueba escribiéndole— y estaba después de dos
            secciones de características. Demostrar que encaja va antes de
            pedir nada: el visitante reconoce su caso probándolo, no leyendo.

          · RELATED BAJA, pero se queda ANTES del CTA final. Estaba DESPUÉS,
            o sea que la comparativa "por qué nosotros y no el otro" llegaba
            cuando ya se había hecho la petición. Rebatir la objeción después
            de pedir la venta no sirve de nada.

          El ritmo de fondos aguanta el cambio: la demo es CREMA y entra
          entre dos oscuras, que es exactamente lo que hace el contraste.
        */}
        {/*
          ⚠️ AQUÍ HABÍA DOCE SECCIONES. AHORA HAY SIETE.

          Lo que se fue no se perdió: se fue porque ya estaba dicho.

          · <GlobalNetwork/> — "Tu negocio cierra a las 8. Mia no cierra nunca."
            Un viewport entero para una frase que el hero, la tarjeta de los 30
            segundos y el cierre ya decían. Absorbida por BENTO_B.cards[0].
          · <BentoB/> — cinco tarjetas de capacidades justo después de las dos
            de BentoA, que hacen el mismo trabajo. Sus cinco titulares viven
            ahora como una fila compacta dentro de BentoA.
          · <Related/> — la comparativa (S/0 instalación · 10 minutos · 30 días).
            Rebatía objeciones de precio en una sección propia, DESPUÉS de
            Precios. Ahora está debajo de los planes, que es donde esa objeción
            aparece de verdad.
          · <UseCases/> sigue, pero ya no es una sección: perdió su badge y su
            H2 y es la cola de la demo. El visitante acaba de elegir su rubro y
            ver a Mia trabajando en él; repetirlo en texto sobraba.

          Cada corte quita repetición, ninguno quita argumento.
        */}
        <ChatDemo />
        <UseCases />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>

      <Footer />
    </>
  );
}
