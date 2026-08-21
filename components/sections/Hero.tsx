'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { Sparkles } from 'lucide-react';
import RevealHeading from '@/components/RevealHeading';
import CascadeText from '@/components/CascadeText';
import CountUp from '@/components/CountUp';
import AssetSlot from '@/components/AssetSlot';
import { HERO } from '@/lib/content';
import { ASSETS } from '@/lib/assets';
import {
  registerGsap,
  prefersReducedMotion,
  DIRECTIONAL_CUBIC,
  wordStaggerFor,
} from '@/lib/motion';

/** Retraso del H1 dentro del timeline del hero. Lo usan el titular y la cuenta. */
const H1_DELAY = 0.25;

/**
 * CUÁNDO ARRANCA LA CUENTA — derivado, no escrito a mano.
 *
 * El número tiene que empezar a subir cuando su propia palabra ya se ve. Si
 * arranca antes, la cuenta corre debajo de un `opacity: 0` y el usuario se
 * pierde justo el tramo que más se mueve.
 *
 * Esa palabra aparece en `H1_DELAY + stagger · índice`, así que el retraso se
 * calcula de la propia frase en vez de fijarlo en un número: si mañana el copy
 * mueve el `{n}` de sitio o cambia de largo, esto sigue cuadrando solo. El
 * +0.30 mete la cuenta ya dentro del fundido de la palabra, no justo al
 * empezarlo, para que las cifras se lean desde el primer frame que se mueven.
 */
const H1_WORDS = HERO.h1.split(' ');
const COUNT_DELAY =
  H1_DELAY + wordStaggerFor(H1_WORDS.length) * H1_WORDS.indexOf('{n}') + 0.3;

/**
 * 1 · HERO — dark (#060200), min-h-screen, apilada (M4)
 *
 * Timeline de carga. NO arranca al terminar la intro, sino al 70 % del telón
 * (evento `nexor:intro-done`): la página todavía se está posando cuando el
 * badge empieza a aparecer. Ese solape es lo que evita el instante de página
 * quieta y vacía que hacía que la entrega se sintiera como un corte.
 *
 *   0.10s badge   0.25s H1 (M1, ~1.6s en desplegarse)   1.15s párrafo
 *   1.45s botones
 *
 * El párrafo y los botones esperan a que el titular esté casi completo. Si
 * entran antes, compiten con él y la entrada se vuelve ruidosa.
 *
 * El estado inicial de todo esto vive en CSS ([data-hero]). Si lo quitas, los
 * elementos se pintan visibles bajo el telón y parpadean al llegar GSAP.
 *
 * ── El hero ya no lleva diagrama de circuito ─────────────────────────────
 * Hubo aquí un chip "MIA" con seis nodos, trazos tipo PCB y pulsos de luz.
 * Se retiró a propósito: el hero es ahora titular, párrafo y botones sobre el
 * rayo de luz, y nada más. Si vuelve a hacer falta, el componente y su
 * documentación están en el historial de esta conversación, no en el árbol.
 */
export default function Hero() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    registerGsap();
    const el = root.current;
    if (!el) return;

    let ctx: gsap.Context | undefined;

    const play = () => {
      if (ctx) return;
      ctx = gsap.context(() => {
        if (prefersReducedMotion()) {
          gsap.set('[data-hero]', { opacity: 1, x: 0, y: 0, scale: 1 });
          return;
        }

        const tl = gsap.timeline();

        // Duraciones largas y desplazamientos cortos. Es la receta para que algo
        // se lea como "suave": mucho tiempo recorriendo poca distancia. Al revés
        // —poco tiempo y mucha distancia— se lee como un golpe, aunque el ease
        // sea el mismo.
        tl.fromTo(
          '[data-hero="badge"]',
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: 0.9, ease: DIRECTIONAL_CUBIC },
          0.1
        )
          // El H1 lo anima <RevealHeading awaitIntro /> (M1, por palabra) y el
          // párrafo <CascadeText awaitIntro delay={1.15} /> (M1b, cascada de
          // opacidad). Los dos arrancan solos con el mismo evento, en paralelo
          // a este timeline; aquí no aparecen.
          .fromTo(
            '[data-hero="btn"]',
            { opacity: 0, y: 14 },
            { opacity: 1, y: 0, duration: 0.8, stagger: 0.09, ease: DIRECTIONAL_CUBIC },
            1.45
          )
          // La prueba social entra la ÚLTIMA y más suave. Es respaldo, no
          // protagonista: si compite con el botón, le roba la mirada justo en
          // el momento de decidir. `[data-hero]` la tiene a opacity 0 en CSS,
          // así que sin este tween no aparecería nunca.
          .fromTo(
            '[data-hero="proof"]',
            { opacity: 0, y: 12 },
            { opacity: 1, y: 0, duration: 0.9, ease: DIRECTIONAL_CUBIC },
            1.85
          );
      }, el);
    };

    // Si la intro corre, esperamos su señal. Si no, arrancamos ya.
    if (document.documentElement.dataset.intro === 'run') {
      window.addEventListener('nexor:intro-done', play, { once: true });
    } else {
      play();
    }

    return () => {
      window.removeEventListener('nexor:intro-done', play);
      ctx?.revert();
    };
  }, []);

  return (
    <section
      ref={root}
      id="hero"
      className="stacked relative flex flex-col justify-center overflow-hidden"
      style={{ background: 'var(--bg-850)' }}
    >
      {/* Fondo: cuadrícula tenue + calor en la esquina superior derecha */}
      <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            'radial-gradient(60% 50% at 88% 0%, rgba(255,122,24,.18), transparent 70%)',
        }}
      />

      {/* Rayo de luz diagonal desde la esquina superior derecha */}
      <div
        className="pointer-events-none absolute -right-[10%] -top-[20%] h-[900px] w-[700px] animate-ray-pulse"
        aria-hidden
        style={{ mixBlendMode: 'screen', filter: 'blur(40px)', transform: 'rotate(35deg)' }}
      >
        {ASSETS['hero.lightRay'].url ? (
          <AssetSlot id="hero.lightRay" ratio="16/9" label="Rayo de luz diagonal" tone="dark" radius="none" priority />
        ) : (
          // Fallback CSS mientras no llegue el PNG. Se acerca bastante.
          <div
            className="h-full w-full"
            style={{
              background:
                'linear-gradient(105deg, transparent 40%, rgba(255,122,24,.55) 50%, rgba(255,176,103,.25) 56%, transparent 66%)',
            }}
          />
        )}
      </div>

      {/*
        Bloque central, y único.

        Al quitar el circuito el hero pasa de dos bloques (contenido arriba +
        diagrama anclado abajo con mt-auto) a uno solo, así que ya no se
        posiciona con un padding superior calculado: se CENTRA en el viewport
        (`justify-center` en la sección). Es más robusto — deja de depender de
        cuánto miden el titular y el párrafo.

        El padding superior no es aire decorativo: compensa la altura del cromo
        fijo (barra de anuncio + navbar), que flota por encima y no ocupa flujo.
        Al centrar un bloque más alto por esa cantidad, el contenido queda
        ópticamente centrado en el hueco que queda BAJO el navbar, no en el
        viewport entero. Por eso son los tokens y no un número a ojo.

        ⚠️ LOS +40px NO SON DECORACIÓN, SON LA HOLGURA MÍNIMA.
        Con solo los dos tokens, el centrado funciona mientras el bloque quepa.
        En cuanto NO cabe —medido a 1440x720 y en móvil 390x844— el centrado se
        rinde, el contenido empieza justo en el borde del padding y el badge
        quedaba pegado al navbar con 0px de aire, tocándolo. Los 40px son el
        suelo que garantiza que eso no pase por muy bajo que sea el viewport.
      */}
      <div className="relative z-10 mx-auto w-full max-w-container px-6 pb-10 pt-[calc(var(--announce-h)+var(--navbar-h)+40px)] text-center">
        <div className="mx-auto max-w-hero">
          {/* PROPORCIÓN · 34px de alto, no 28.
              Debajo hay un titular de 72px; a 28px con 12px de padding el
              badge se leía como una etiqueta suelta flotando, no como la
              entrada del bloque. Subir el alto y el padding lateral —y el
              icono de 12 a 14— le da cuerpo suficiente para sostener lo que
              viene después sin llegar a competir con ello: sigue siendo el
              elemento más pequeño del hero. */}
          <span
            data-hero="badge"
            className="inline-flex h-[34px] items-center gap-[7px] rounded-full border px-4 text-badge"
            style={{ borderColor: 'var(--border-dark)', background: 'var(--surface-800)', color: 'var(--text-mid)' }}
          >
            <Sparkles size={14} style={{ color: 'var(--orange-500)' }} />
            {HERO.badge}
          </span>

          {/* El `{n}` del copy es un hueco: lo rellena el contador, que sortea
              una cifra nueva en cada carga. Va DENTRO del titular, así que M1
              lo revela como a una palabra más. */}
          <RevealHeading
            as="h1"
            text={HERO.h1}
            awaitIntro
            delay={H1_DELAY}
            slots={{
              '{n}': (
                <CountUp
                  min={HERO.lostSalesRange.min}
                  max={HERO.lostSalesRange.max}
                  awaitIntro
                  delay={COUNT_DELAY}
                />
              ),
            }}
            className="mt-6 text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] md:text-[48px] lg:text-h1"
          />

          {/* M1b · el párrafo se forma con la MISMA cascada de opacidad con la
              que se escribe "VENDEMIA" en la intro. Ya no es un fade-in con
              desplazamiento: eso lo hace el titular (M1), y tener los dos
              gestos seguidos en el mismo bloque los volvía redundantes. */}
          <CascadeText
            text={HERO.paragraph}
            awaitIntro
            delay={1.15}
            spread={0.7}
            className="mx-auto mt-6 max-w-prose text-body"
            style={{ color: 'var(--text-mid)' }}
          />

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              data-hero="btn"
              href="#pricing"
              className="flex h-10 items-center rounded-full px-6 text-[14px] font-semibold transition-colors duration-[250ms]"
              style={{ background: 'var(--orange-cta)', color: 'var(--on-orange)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--orange-cta-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--orange-cta)')}
            >
              {HERO.primaryCta}
            </a>
            <a
              data-hero="btn"
              href="#final-cta"
              className="flex h-10 items-center rounded-full border px-6 text-[14px] font-medium transition-colors duration-[250ms] hover:bg-white/5"
              style={{ borderColor: 'var(--border-dark)' }}
            >
              {HERO.secondaryCta}
            </a>
          </div>

          {/* ⚠️ ESTABA ESCRITO EN content.ts Y NO SE PINTABA.
              Es la anulación del riesgo —garantía, sin instalación, 10
              minutos— y su sitio es DEBAJO DEL BOTÓN, no en otra sección: es
              lo que responde al "¿y si me sale mal?" en el momento exacto en
              que el lector está decidiendo si pulsa. En una landing de
              suscripción es de las líneas que más trabajan, y aquí llevaba
              todo el tiempo escrita sin llegar a la pantalla. */}
          {/* --text-mid y no --text-low: medido sobre el fondo del hero,
              --text-low da 3.88 y no llega al 4.5 de AA. Y de todas las líneas
              de la página, la garantía es la última que interesa dejar tenue:
              es la que quita el miedo justo antes del clic. */}
          <p
            data-hero="btn"
            className="mt-5 text-[13px]"
            style={{ color: 'var(--text-mid)' }}
          >
            {HERO.footnote}
          </p>
        </div>

        {/* ── PRUEBA SOCIAL ────────────────────────────────────────────
            Responde a la PRIMERA objeción de quien llega: "¿esto es real?".
            Hasta ahora la página no la contestaba en ningún sitio.

            Va DESPUÉS del botón y no antes a propósito: si va antes,
            interrumpe la secuencia dolor → categoría → petición, que es lo
            que tiene que leerse de un tirón. Aquí funciona como el respaldo
            de lo que se acaba de pedir, y además es lo que engancha a quien
            no pulsó y siguió bajando.

            Fuera del `max-w-hero` para que la fila respire a todo el ancho.

            ⚠️ Estos nombres son NEGOCIOS REALES. Si alguno deja de ser
            cliente o retira el permiso, se quita de HERO.socialProof — no se
            deja "porque queda bien". */}
        <div data-hero="proof" className="mt-14">
          {/* Mismo caso que el pie de arriba: --text-low se quedaba en 3.88.
              La jerarquía frente a los nombres no la da el color sino el
              tamaño, la caja alta y el interletrado. */}
          <p className="text-[12px] uppercase tracking-[0.14em]" style={{ color: 'var(--text-mid)' }}>
            {HERO.socialProofLabel}
          </p>
          <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {HERO.socialProof.map((negocio) => (
              <li
                key={negocio}
                className="text-[15px] font-medium"
                style={{ color: 'var(--text-mid)' }}
              >
                {negocio}
              </li>
            ))}
          </ul>
        </div>
      </div>

    </section>
  );
}
