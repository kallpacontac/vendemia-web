'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Sparkles } from 'lucide-react';
import RevealHeading from '@/components/RevealHeading';
import RevealParagraph from '@/components/RevealParagraph';
import AssetSlot from '@/components/AssetSlot';
import { BENEFIT } from '@/lib/content';
import {
  registerGsap,
  prefersReducedMotion,
  revealWords,
  revealLines,
  wipeUp,
  duplicateForLoop,
  DIRECTIONAL_CUBIC,
  TIMING,
} from '@/lib/motion';

/**
 * 2 · BENEFICIO PRINCIPAL — cream, apilada (M4)
 *
 * ── Coreografía (medida frame a frame sobre la referencia a 30 fps) ────────
 *
 *   t=0.00  la píldora activa del sub-nav aparece EN EL CENTRO, como un punto
 *           que se expande. Ocurre mientras el telón todavía está subiendo:
 *           en la referencia se ve el punto negro flotando sobre el crema
 *           cuando la sección solo lleva un cuarto de pantalla descubierta.
 *   t=0.20  el resto de píldoras se abren hacia los lados desde ese punto.
 *   t=0.25  el H2, palabra a palabra, centrado.
 *   t=0.80  la tarjeta de medios, BARRIDO desde abajo (M7).
 *   t=1.20  el párrafo destacado, LÍNEA A LÍNEA (M6).
 *   t=1.50  el párrafo secundario, línea a línea.
 *   t=1.75  los chips, en escalera; al terminar arranca el marquee.
 *
 * ── Tres cosas que yo tenía mal y el vídeo corrige ─────────────────────────
 *
 * 1. La tarjeta NO entra desde la izquierda. Crece desde abajo con el borde
 *    inferior clavado y el ancho constante. Un translate dice "esto viene de
 *    fuera"; un barrido dice "esto ya estaba aquí". Lo segundo pesa más.
 * 2. Los párrafos NO entran de golpe ni palabra a palabra: línea a línea.
 * 3. El bloque derecho NO es una tarjeta con borde. Es blanco sobre crema,
 *    sin borde y sin sombra — solo un cambio de tono. El borde lo hacía
 *    parecer un widget suelto.
 *
 * Proporciones verificadas sobre el fotograma final: columnas 32.5 % / 65.2 %
 * (= 1fr / 2fr con gap 24) y tarjeta 397×503 px (= 4:5). Eran correctas.
 */
export default function Benefit() {
  const [active, setActive] = useState(0);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    registerGsap();
    const el = root.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s);
      const qa = (s: string) => gsap.utils.toArray<HTMLElement>(el.querySelectorAll(s));

      if (prefersReducedMotion()) {
        qa('[data-pill]').forEach((n) => n.removeAttribute('data-pill'));
        gsap.set(qa('[data-b]'), { opacity: 1, x: 0, y: 0, scale: 1 });
        gsap.set(qa('[data-wipe]'), { clipPath: 'inset(0% 0 0 0)' });
        qa('[data-wipe]').forEach((n) => n.removeAttribute('data-wipe'));
        return;
      }

      // Si alguno de estos ids desaparece, el elemento se queda invisible para
      // siempre (su estado inicial está en CSS). Mejor enterarse en consola
      // que descubrirlo en un vídeo.
      const required = ['#benefit-title', '#benefit-lead', '#benefit-body', '[data-b="media"]'];
      for (const sel of required) {
        if (!q(sel) && process.env.NODE_ENV !== 'production') {
          console.warn(`[Benefit] no encuentro ${sel}: ese elemento no se animará.`);
        }
      }

      const master = gsap.timeline({
        scrollTrigger: {
          trigger: el,
          // Arranca MUY pronto, con la sección apenas asomando. En la
          // referencia el primer elemento ya se ve cuando el telón lleva un
          // cuarto de recorrido; con el 'top 85%' de siempre llegaba tarde y
          // la sección aparecía ya montada.
          start: 'top 95%',
          once: true,
        },
      });

      // ── El punto que se convierte en píldora ────────────────
      // ── EL PUNTO ────────────────────────────────────────────
      // Lo primero que aparece en la referencia, y aparece SOLO: un punto
      // negro en el centro del crema cuando la sección todavía no ha acabado
      // de descubrirse. Después se estira hasta convertirse en la píldora.
      //
      // La clave es animar el ANCHO, no la escala. Con scale, el texto de
      // dentro se deforma y se lee el truco; animando el ancho con
      // overflow:hidden, la píldora se abre y el texto aparece dentro, que es
      // lo que se ve en el vídeo.
      //
      // ⚠️ El `y: 0` del destino no es decorativo. El estado inicial viene de
      // [data-reveal='up'], que es translateY(40px). GSAP lee ese transform y
      // lo conserva: si solo animas `scale`, la píldora se queda 40px por
      // debajo de su sitio para siempre. Hay que devolver `y` explícitamente.
      const pillActive = q('[data-b="pill-active"]');
      const pillLabel = q('[data-b="pill-active-label"]');
      // Medición: se expande un instante para leer el ancho natural y se
      // vuelve a colapsar, todo sin ceder el hilo, así que no llega a pintarse
      // ningún fotograma intermedio. Hace falta porque el destino de la
      // animación es un número, no `auto`.
      let finalWidth = 0;
      let labelWidth = 0;
      if (pillActive) {
        pillActive.removeAttribute('data-pill');
        finalWidth = pillActive.getBoundingClientRect().width;
        labelWidth = pillLabel ? pillLabel.getBoundingClientRect().width : 0;
        pillActive.setAttribute('data-pill', 'collapsed');
      }

      // ⚠️ Aquí NO hay animación de entrada, y es deliberado.
      //
      // El punto ya está en pantalla, negro y redondo, desde que asoma el
      // crema. Lo único que hace en ese tramo es SUBIR CON EL PANEL — que es
      // movimiento de la sección, no suyo. Yo le había puesto encima un
      // scale-in con rebote, así que se sumaban dos movimientos a la vez y el
      // resultado se leía exactamente como "un punto arrastrado hacia arriba".
      //
      // Quitando su entrada, el único gesto propio que le queda es estirarse.
      if (pillActive && finalWidth > 40) {
        master.to(
          pillActive,
          {
            width: finalWidth,
            paddingLeft: 16,
            paddingRight: 16,
            gap: 6,
            duration: 0.5,
            ease: DIRECTIONAL_CUBIC,
            // Se suelta el ancho fijo al terminar: si se queda en px, la
            // píldora no reacciona a un cambio de idioma ni al resize.
            onComplete: () => {
              pillActive.removeAttribute('data-pill');
              gsap.set(pillActive, { clearProps: 'width,paddingLeft,paddingRight,gap' });
            },
          },
          // El punto AGUANTA mientras el titular se escribe y solo se estira
          // cuando la frase ya está casi entera. Medido en la referencia.
          0.75
        );

        if (pillLabel) {
          master
            .to(
              pillLabel,
              {
                width: labelWidth,
                duration: 0.5,
                ease: DIRECTIONAL_CUBIC,
                onComplete: () => gsap.set(pillLabel, { clearProps: 'width,display,overflow' }),
              },
              0.75
            )
            .to(pillLabel, { opacity: 1, duration: 0.3 }, 0.93);
        }
      } else if (pillActive) {
        // Ancho no medible (fuentes sin cargar, contenedor oculto): se
        // renuncia al gesto y se deja la píldora entera. Mejor sin animación
        // que encogida para siempre.
        pillActive.removeAttribute('data-pill');
      }
      // El resto se abre hacia los lados DESDE el centro.
      master.fromTo(
        qa('[data-b="pill"]'),
        { opacity: 0, scale: 0.8, y: 0 },
        {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.5,
          ease: DIRECTIONAL_CUBIC,
          stagger: { each: 0.05, from: 'center' },
        },
        // El enlace de al lado, ya con la píldora formada.
        1.05
      );

      // ── H2 por palabra, centrado ────────────────────────────
      const title = q('#benefit-title');
      if (title) {
        const t = revealWords(title, { immediate: true });
        if (t) master.add(t, 0.25);
      }

      // ── Tarjeta de medios · barrido desde abajo ─────────────
      const media = q('[data-b="media"]');
      if (media) {
        const t = wipeUp(media, { immediate: true });
        if (t) master.add(t, 0.8);
      }
      // El titular sobreimpreso llega DESPUÉS del barrido: si entra a la vez,
      // el ojo no sabe si mirar la imagen o el texto.
      master.fromTo(
        qa('[data-b="media-caption"]'),
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.6, ease: DIRECTIONAL_CUBIC },
        1.35
      );

      // ── Párrafos, línea a línea ─────────────────────────────
      const lead = q('#benefit-lead');
      if (lead) {
        const t = revealLines(lead, { immediate: true });
        if (t) master.add(t, 1.2);
      }
      const body = q('#benefit-body');
      if (body) {
        const t = revealLines(body, { immediate: true, stagger: 0.07 });
        if (t) master.add(t, 1.5);
      }

      // ── Chips en escalera, y luego el marquee ───────────────
      const chips = qa('[data-b="chip"]');
      master.fromTo(
        chips,
        { opacity: 0, y: 12, scale: 0.94 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.5,
          ease: DIRECTIONAL_CUBIC,
          // `amount` y no `each`: el reparto total queda acotado a 0.7s pase
          // lo que pase. Con `each` y el array duplicado, doce chips por fila
          // se convertían en 24 y la escalera duraba casi un segundo.
          // `from: 'end'` hace que los últimos índices entren primero, o sea
          // que los visibles (que son los primeros) se pueblan de derecha a
          // izquierda, como en la referencia.
          stagger: { amount: 0.7, from: 'end' },
        },
        1.75
      );

      // El marquee no puede estar corriendo mientras los chips aparecen: se
      // verían entrando y desplazándose a la vez, que es ilegible. Arranca al
      // final, añadiendo la clase de animación.
      master.call(
        () => {
          qa('[data-b="track"]').forEach((track, i) => {
            track.classList.add(i % 2 === 0 ? 'animate-marquee-left' : 'animate-marquee-right');
          });
        },
        undefined,
        // 1.75 (inicio) + 0.7 (escalera) + 0.5 (duración) = 2.95. Se arranca
        // justo después; si se solapa, los chips se ven entrando y
        // desplazándose a la vez y no se lee ninguna de las dos cosas.
        3.0
      );
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={root}
      id="benefit"
      className="stacked relative flex flex-col"
      style={{ background: 'var(--bg-cream)', color: 'var(--text-dark)' }}
    >
      {/* Sub-nav de anclas · DOS elementos, como en la referencia.
          Sin contenedor blanco: las píldoras flotan sobre el crema y solo la
          activa tiene fondo. El contenedor con borde y blur que yo tenía
          tapaba justamente el gesto que se quería ver — el punto negro solo,
          en el centro, antes de que exista nada más. */}
      <div className="sticky top-[76px] z-30 flex justify-center pt-6">
        <nav className="flex items-center gap-3" aria-label="Secciones">
          {BENEFIT.anchors.map((a, i) => {
            const isActive = active === i;
            return (
              <a
                key={a.label}
                href={a.href}
                onClick={() => setActive(i)}
                data-b={isActive ? 'pill-active' : 'pill'}
                // El punto NO lleva data-reveal: no tiene entrada propia.
                // Está ahí desde el primer momento y solo sube con el panel,
                // igual que en la referencia.
                data-reveal={isActive ? undefined : 'up'}
                data-pill={isActive ? 'collapsed' : undefined}
                aria-current={isActive ? 'true' : undefined}
                className="flex h-[36px] items-center justify-center gap-[6px] overflow-hidden whitespace-nowrap rounded-full px-4 text-[13px] font-medium transition-colors duration-[250ms]"
                style={
                  isActive
                    ? { background: 'var(--text-dark)', color: '#fff' }
                    : { color: 'var(--text-muted)' }
                }
              >
                {/* El icono va FUERA del span de la etiqueta a propósito: es lo
                    único que se ve mientras la píldora es todavía un punto. */}
                {'icon' in a && a.icon ? <Sparkles size={13} className="shrink-0" /> : null}
                <span
                  data-b={isActive ? 'pill-active-label' : undefined}
                  className={isActive ? 'pill-label' : undefined}
                >
                  {a.label}
                </span>
              </a>
            );
          })}
        </nav>
      </div>

      {/* ⚠️ Una sección apilada TIENE que caber en 100vh.
          Es `position: sticky` con `overflow: hidden`, así que todo lo que
          sobresalga por abajo queda recortado Y es inalcanzable: por mucho que
          bajes, la sección siguiente sube y lo tapa antes de que llegues.
          Eso es lo que cortaba la tarjeta.

          Antes esto sumaba ~915px de contenido fijo (64 de padding + 112 de
          titular + 56 + 503 de tarjeta + 120) contra un viewport útil de ~845.
          Ahora los tres valores que mandan —padding, alto de tarjeta y hueco—
          son fluidos contra la altura de pantalla, así que la sección se
          ajusta en vez de desbordar. */}
      <div className="mx-auto flex w-full max-w-container flex-1 flex-col justify-center px-6 py-[clamp(32px,5vh,80px)]">
        {/* RevealHeading y RevealParagraph no aceptan data-*, así que la
            localización va por id. Sin esto el querySelector devuelve null y
            el titular sencillamente no se anima nunca — silenciosamente. */}
        <RevealHeading
          as="h2"
          manual
          id="benefit-title"
          text={BENEFIT.h2}
          className="mx-auto max-w-[900px] text-center text-[32px] font-semibold leading-[1.08] tracking-[-0.02em] md:text-[40px] lg:text-h2"
        />

        {/* Grid 1fr / 2fr — verificado sobre el fotograma final: 32.5 % / 65.2 % */}
        <div className="mt-[clamp(24px,4vh,56px)] grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[1fr_2fr]">
          {/* IZQUIERDA · barrido desde abajo (M7)
              El alto manda sobre la proporción. A 1440×900+ da los 503px que
              con los ~402px de columna son el 4:5 medido en la referencia; en
              pantallas más bajas se recorta antes que salirse. Preferible una
              tarjeta algo menos alargada que una tarjeta cortada. */}
          <div
            data-b="media"
            data-wipe="up"
            className="relative h-[clamp(260px,44vh,503px)] overflow-hidden rounded-card"
          >
            <AssetSlot
              id="benefit.mediaCard"
              tone="dark"
              label="Imagen abstracta de marca"
              className="absolute inset-0 h-full w-full"
            />
            <div
              data-b="media-caption"
              data-reveal="up"
              className="pointer-events-none absolute inset-x-0 bottom-0 p-6"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,.85), transparent)' }}
            >
              <p className="text-[18px] font-semibold leading-snug text-white">
                {BENEFIT.mediaHeadline}
              </p>
            </div>
          </div>

          {/* DERECHA · blanco sobre crema, SIN borde ni sombra */}
          <div className="flex flex-col overflow-hidden rounded-card bg-white p-7 lg:h-[clamp(260px,44vh,503px)]">
            <RevealParagraph
              id="benefit-lead"
              text={BENEFIT.lead}
              className="text-[18px] font-semibold leading-[1.45]"
              style={{ color: 'var(--text-dark)' }}
            />
            <RevealParagraph
              id="benefit-body"
              text={BENEFIT.body}
              className="mt-5 text-body"
              style={{ color: 'var(--text-muted)' }}
            />

            {/* M5 · MARQUEE — 3 filas, direcciones alternas.
                Va en su propia caja con un tono ligeramente distinto y se
                desborda por la derecha, igual que en la referencia: los chips
                cortados en el borde son los que sugieren que hay más. */}
            <div
              className="marquee-mask -mb-7 -mr-7 mt-auto flex flex-col gap-3 overflow-hidden rounded-tl-card pb-7 pl-6 pt-6"
              style={{ background: 'linear-gradient(135deg, rgba(0,0,0,.02), transparent 60%)' }}
            >
              {BENEFIT.chipRows.map((row, rowIndex) => (
                <div key={rowIndex} data-b="track" className="marquee-track gap-3">
                  {/* Se anima el array DUPLICADO entero, no solo la primera
                      mitad: si solo animas los originales, las copias del
                      loop se quedan visibles desde el principio y se ve la
                      costura del marquee antes de que empiece nada. */}
                  {duplicateForLoop([...row]).map((chip, i) => (
                    <span
                      key={`${chip}-${i}`}
                      data-b="chip"
                      data-reveal="up"
                      className="flex h-[40px] shrink-0 items-center gap-2 rounded-full bg-white px-[14px] text-[14px] font-medium"
                      style={{
                        color: 'var(--text-dark)',
                        boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 6px 16px -8px rgba(0,0,0,.12)',
                      }}
                    >
                      <AssetSlot
                        id="benefit.chipLogos"
                        kind="logo"
                        tone="light"
                        radius="icon"
                        compact
                        label="Icono"
                        className="h-5 w-5 shrink-0"
                      />
                      {chip}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
