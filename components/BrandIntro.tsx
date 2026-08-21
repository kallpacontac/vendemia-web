'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import Mark from './Mark';
import { BRAND } from '@/lib/content';
import {
  registerGsap,
  TIMING,
  EASE,
  CURTAIN_HANDOFF,
  CURTAIN_REBIRTH,
} from '@/lib/motion';

/**
 * SECCIÓN 0 · INTRO DE MARCA (corte comercial)
 *
 * ── Sobre la duración ────────────────────────────────────────────────────
 * La tabla medida dice: el lockup se sostiene hasta 2.30s y ahí arranca el
 * telón, que dura 0.75s. Eso suma 3.05s de overlay presente. La cifra de
 * "2.70s" del brief es el punto en el que el hero ya ocupa la mayor parte de
 * la pantalla y la intro deja de leerse como intro — no el final del tween.
 * Respeto la tabla, que es lo medido. Si quieres los 2.70s literales de
 * overlay, baja CURTAIN_START a 1.95.
 *
 * ── Lo que NO se hace ────────────────────────────────────────────────────
 * La salida no es un fade ni un zoom. El lockup se queda QUIETO y a plena
 * opacidad mientras la página sube desde abajo y lo entierra. Tiene que verse
 * un corte horizontal recto avanzando hacia arriba.
 */

const CURTAIN_START = 2.3;

/**
 * LOS TRAZOS DEL LOGOTIPO · sonrisa + globo de diálogo
 *
 * El logo de Vendemia lleva dos elementos además de la palabra: una sonrisa
 * bajo "vende" y un globo de diálogo abrazando "mia". Aquí se dibujan MIDIENDO
 * las letras que hay en pantalla, no con coordenadas fijas.
 *
 * ── Por qué medido y no un SVG con números escritos a mano ───────────────
 * El wordmark se compone con texto vivo: cambia de ancho si cambia la fuente
 * (ya pasó al entrar Plus Jakarta Sans, que es más ancha que Inter), si cambia
 * el tracking, o si cambia el copy. Unas coordenadas fijas quedarían
 * desalineadas en cuanto se tocara cualquiera de esas tres cosas, y el síntoma
 * —una sonrisa medio centímetro corrida— no salta a la vista en una revisión de
 * código. Midiendo, se recolocan solas.
 *
 * ── Se usa offsetLeft, NO getBoundingClientRect ──────────────────────────
 * El lockup vive dentro de `scale-[0.7]` en móvil. getBoundingClientRect
 * devuelve píxeles de PANTALLA, ya escalados; offsetLeft/offsetWidth devuelven
 * los de MAQUETA, sin escalar. Como el SVG es hijo del mismo contenedor
 * escalado, sus coordenadas tienen que estar en el espacio sin escalar o el
 * dibujo saldría al 70 % del 70 %.
 *
 * ── Qué NO se dibuja ─────────────────────────────────────────────────────
 * El logo original lleva además el punto de la "i" como cuadradito redondeado y
 * dos acentos sobre la "a". Son detalles de las LETRAS de la versión en
 * minúsculas del logotipo; aquí el wordmark va en mayúsculas y no tienen dónde
 * apoyarse. Los dos trazos largos sí, que son los que dan la silueta.
 */
const STROKES = {
  /** Hueco entre la base del texto y la cima de la sonrisa, en múltiplos del alto. */
  smileGap: 0.16,
  /** Profundidad del arco. Más = sonrisa más marcada. */
  smileDepth: 0.3,
  /** Cuánto se mete la sonrisa por dentro de "VENDE" por cada lado. */
  smileInset: 0.1,
  /** Aire entre las letras y el globo. */
  bubblePad: 0.18,
  /** Radio de las esquinas del globo. */
  bubbleRadius: 0.28,
  /** Desde qué punto del borde superior arranca el trazo (el globo va abierto). */
  bubbleOpenAt: 0.42,
  /** Geometría de la cola, en múltiplos del alto. */
  tailOffset: 0.35,
  tailWidth: 0.34,
  tailDrop: 0.32,
} as const;

/**
 * Calcula los dos `d` a partir de las letras montadas.
 * Devuelve null si todavía no hay nada medible (fuente sin cargar, por ejemplo).
 */
function brandStrokes(word: HTMLElement, accentFrom: number) {
  const letters = Array.from(word.querySelectorAll<HTMLElement>('.letter'));
  if (letters.length <= accentFrom) return null;

  const w = word.offsetWidth;
  const h = word.offsetHeight;
  if (!w || !h) return null;

  const S = STROKES;
  const left = (el: HTMLElement) => el.offsetLeft;
  const right = (el: HTMLElement) => el.offsetLeft + el.offsetWidth;

  /* ── SONRISA · bajo el tramo de tinta ("VENDE") ─────────────────────── */
  const inkFirst = letters[0];
  const inkLast = letters[accentFrom - 1];
  const inset = h * S.smileInset;
  const sx0 = left(inkFirst) + inset;
  // El tracking añade espacio DESPUÉS de cada letra, también de la última: se
  // descuenta o la sonrisa sobresale por la derecha sobre un hueco vacío.
  const sx1 = right(inkLast) - inset - h * 0.15;
  const sy = h * (1 + S.smileGap);
  // Curva cuadrática: un solo punto de control en el centro basta para un arco
  // simétrico, y a diferencia de una cúbica no hay dos tiradores que mantener
  // en sincronía.
  const smile = `M ${sx0.toFixed(1)} ${sy.toFixed(1)} Q ${((sx0 + sx1) / 2).toFixed(1)} ${(
    sy + h * S.smileDepth * 2
  ).toFixed(1)} ${sx1.toFixed(1)} ${sy.toFixed(1)}`;

  /* ── GLOBO · abrazando el tramo de acento ("MIA") ───────────────────── */
  const pad = h * S.bubblePad;
  const bx0 = left(letters[accentFrom]) - pad;
  const bx1 = right(letters[letters.length - 1]) - h * 0.15 + pad;
  const by0 = -pad;
  const by1 = h + pad;
  const r = h * S.bubbleRadius;
  const startX = bx0 + (bx1 - bx0) * S.bubbleOpenAt;
  const tx = bx0 + h * S.tailOffset;
  const tw = h * S.tailWidth;

  // Recorrido en sentido horario desde el borde superior. El globo queda
  // ABIERTO por la izquierda, como en el logo: no es un rectángulo cerrado,
  // es un trazo que envuelve.
  const bubble = [
    `M ${startX.toFixed(1)} ${by0.toFixed(1)}`,
    `L ${(bx1 - r).toFixed(1)} ${by0.toFixed(1)}`,
    `Q ${bx1.toFixed(1)} ${by0.toFixed(1)} ${bx1.toFixed(1)} ${(by0 + r).toFixed(1)}`,
    `L ${bx1.toFixed(1)} ${(by1 - r).toFixed(1)}`,
    `Q ${bx1.toFixed(1)} ${by1.toFixed(1)} ${(bx1 - r).toFixed(1)} ${by1.toFixed(1)}`,
    `L ${(tx + tw).toFixed(1)} ${by1.toFixed(1)}`,
    // La cola: baja en pico hacia la izquierda y vuelve.
    `L ${tx.toFixed(1)} ${(by1 + h * S.tailDrop).toFixed(1)}`,
    `L ${(tx + tw * 0.42).toFixed(1)} ${by1.toFixed(1)}`,
  ].join(' ');

  return {
    smile,
    bubble,
    // El viewBox se estira para que quepan sonrisa y cola, que salen por abajo,
    // y el `pad` del globo, que sale por arriba.
    box: {
      x: -pad * 1.2,
      y: by0 - 2,
      w: w + pad * 2.4,
      h: h * (1 + S.smileGap + S.smileDepth) + pad + 8,
    },
  };
}

export default function BrandIntro() {
  const overlayRef = useRef<HTMLDivElement>(null);
  const lockupRef = useRef<HTMLDivElement>(null);
  const markWrapRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const strokesRef = useRef<SVGSVGElement>(null);
  // El overlay SIEMPRE se renderiza en el primer paint: si lo montáramos desde
  // un useState, el ref sería null cuando el efecto necesita medir el lockup.
  // Quién lo ve lo decide el CSS a partir de html[data-intro]. `done` solo lo
  // desmonta cuando ya no sirve.
  const [done, setDone] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [announce, setAnnounce] = useState('');

  useEffect(() => {
    registerGsap();

    const root = document.documentElement;
    // El script bloqueante de <head> ya decidió si la intro corre.
    if (root.dataset.intro !== 'run') {
      setDone(true);
      return;
    }

    document.body.setAttribute('data-intro-locked', 'true');
    // Cinturón y tirantes: aunque el <head> ya puso scrollRestoration a
    // 'manual', algún navegador restaura tarde. La intro SIEMPRE empieza
    // arriba del todo.
    window.scrollTo(0, 0);

    let rebornFired = false;
    let handoffFired = false;

    // El relevo al hero. Se dispara al 70 % del telón, no al final: así el
    // contenido empieza a aparecer mientras el panel todavía se posa y no hay
    // un instante de página quieta y vacía.
    const handoff = () => {
      if (handoffFired) return;
      handoffFired = true;
      window.dispatchEvent(new CustomEvent('nexor:intro-done'));
    };

    const finish = () => {
      root.dataset.intro = 'done';
      document.body.removeAttribute('data-intro-locked');
      try {
        sessionStorage.setItem('intro_seen', '1');
      } catch {
        /* modo privado: da igual, se verá una vez más */
      }
      const curtainEl = document.querySelector<HTMLElement>('.page-curtain');
      if (curtainEl) gsap.set(curtainEl, { clearProps: 'transform,zIndex,willChange' });
      // Y otra vez al soltar el scroll: la intro SIEMPRE deja al usuario en el
      // hero, nunca donde estuviera antes de recargar.
      window.scrollTo(0, 0);
      setDone(true);
      setAnnounce('Contenido cargado');
      // Red de seguridad: si se saltó la intro, el relevo no llegó a dispararse.
      handoff();
      // Y ahora sí, con la página en su sitio y sin transform, se puede medir
      // el layout. Todo lo que dependa de posiciones (ScrollTrigger) escucha
      // este evento, no el anterior.
      window.dispatchEvent(new CustomEvent('nexor:intro-settled'));
    };

    const rebirth = () => {
      if (rebornFired) return;
      rebornFired = true;
      // DETALLE DE CONTINUIDAD: la marca grande queda enterrada y renace
      // pequeña en el navbar repitiendo su propia animación de formación.
      window.dispatchEvent(new CustomEvent('nexor:mark-rebirth'));
    };

    const ctx = gsap.context(() => {
      // El lockup se renderiza ya en su geometría final. Para el acto 1-3 el
      // isotipo tiene que estar centrado en pantalla, así que medimos cuánto
      // hay que desplazarlo y lo deshacemos en el acto 4.
      const lockup = lockupRef.current!;
      const markWrap = markWrapRef.current!;
      // OJO: .page-curtain vive FUERA del scope del context (es hermano del
      // overlay), así que hay que resolverlo a mano — el selector de texto de
      // gsap.context solo busca dentro de overlayRef.
      const curtain = document.querySelector<HTMLElement>('.page-curtain')!;
      const lockupBox = lockup.getBoundingClientRect();
      const markBox = markWrap.getBoundingClientRect();
      // getBoundingClientRect devuelve píxeles de PANTALLA, pero gsap aplica x
      // en unidades locales. En móvil el lockup lleva scale-[0.7], así que hay
      // que deshacer esa escala o el desplazamiento se queda corto un 30 %.
      const containerScale = lockupBox.width / lockup.offsetWidth || 1;
      const shift =
        (lockupBox.left + lockupBox.width / 2 - (markBox.left + markBox.width / 2)) /
        containerScale;

      gsap.set(markWrap, { x: shift, scale: 1 / 0.55, transformOrigin: 'center center' });
      // Los estados iniciales de .dot y .letter ya vienen de CSS (ver
      // globals.css). Aquí solo confirmamos, por si el CSS no cargó a tiempo.
      gsap.set('.letter', { opacity: 0 });
      gsap.set('.dot', { opacity: 0 });

      /* ── TRAZOS DEL LOGO · sonrisa y globo ───────────────────────────────
         Se miden aquí, con el wordmark ya montado. `document.fonts.ready` NO
         se espera: si la fuente llegara tarde el ancho cambiaría y los trazos
         quedarían cortos, así que en vez de esperar se vuelve a medir cuando
         las fuentes terminan de cargar (más abajo). Medir ya nos da algo
         dibujado desde el primer frame; remedir lo deja exacto. */
      const svg = strokesRef.current!;
      const word = wordRef.current!;
      const smilePath = svg.querySelector<SVGPathElement>('.brand-smile')!;
      const bubblePath = svg.querySelector<SVGPathElement>('.brand-bubble')!;

      const layout = () => {
        const s = brandStrokes(word, BRAND.accentFrom);
        if (!s) return;
        smilePath.setAttribute('d', s.smile);
        bubblePath.setAttribute('d', s.bubble);
        svg.setAttribute('viewBox', `${s.box.x} ${s.box.y} ${s.box.w} ${s.box.h}`);
        svg.setAttribute('width', String(s.box.w));
        svg.setAttribute('height', String(s.box.h));
        // El SVG se ancla al mismo origen que su viewBox para que las
        // coordenadas medidas caigan justo encima de las letras.
        svg.style.left = `${s.box.x}px`;
        svg.style.top = `${s.box.y}px`;
      };

      layout();
      // Con la fuente ya cargada las letras miden distinto: se recolocan.
      // Recolocar solo cambia la `d`; como el recorrido está normalizado con
      // pathLength, el punto del trazado en que esté la animación se conserva.
      document.fonts?.ready.then(layout).catch(() => {});

      /* ── CÓMO SE DIBUJAN LOS TRAZOS ──────────────────────────────────────
         GSAP no anima `strokeDashoffset` en estos paths: MEDIDO, el tween
         escribe el valor final en su primer frame y el trazo aparece entero
         (2 cambios de valor en 156 frames, en vez de ~27). Pasa igual con
         `.to()` y con `.fromTo()`, y da igual que el estado inicial venga de
         CSS o de gsap.set. No es cosa del SVG: una animación nativa sobre el
         MISMO path sí produce 31 valores intermedios, así que el pathLength,
         el dasharray y el pintado están bien. Es el parser de CSS de GSAP con
         esta propiedad.

         Así que el valor no se anima: se INTERPOLA UN OBJETO y se escribe a
         mano en cada frame. Es el mismo mecanismo con el que Pricing.tsx mueve
         el contador de precios y CountUp la cifra del hero — el que se usa en
         este proyecto siempre que GSAP no puede tocar el valor directamente.

         Se escribe SIN UNIDAD: los paths llevan `pathLength="1"`, o sea que su
         recorrido está normalizado y el offset vive en ese espacio, no en px. */
      const drawSmile = { v: 1 };
      const drawBubble = { v: 1 };
      const paintSmile = () => {
        smilePath.style.strokeDashoffset = String(drawSmile.v);
      };
      const paintBubble = () => {
        bubblePath.style.strokeDashoffset = String(drawBubble.v);
      };

      const tl = gsap.timeline({ onComplete: finish });

      // ── ACTO 1 · LLEGADA ─────────────────────────────────────
      // El isotipo ES un avión de papel, así que entra volando desde fuera de
      // cuadro por la izquierda, no apareciendo en el sitio. Es el mismo gesto
      // direccional que usan las entradas de sección (M2), y aquí sale gratis
      // porque el propio dibujo ya dice hacia dónde va.
      //
      // El desplazamiento va en porcentaje del propio elemento (xPercent), no
      // en píxeles: markWrap está escalado 1/0.55 durante los actos 1-3, y un
      // valor en px se multiplicaría por esa escala y sacaría a Mia mucho más
      // lejos de lo previsto en móvil.
      tl.fromTo(
        '.dot',
        { xPercent: -190, yPercent: -26, rotate: -16, opacity: 0 },
        {
          xPercent: 0,
          yPercent: 0,
          rotate: 0,
          opacity: 1,
          duration: 0.62,
          ease: 'power3.out',
        },
        0
      )

        // ── ACTO 2 · ATERRIZAJE ────────────────────────────────
        // RETIRADO. Aquí había un rebote de rotación al posarse
        // (rotate 3.5° y vuelta a 0 con elastic.out) que se leía como una
        // sacudida. No lo reintroduzcas sin pedirlo: la frenada del acto 1 ya
        // hace ese trabajo. `power3.out` llega al 90 % del recorrido en el
        // primer tercio del tiempo y dedica el resto a decelerar, así que el
        // avión NO se para en seco aunque no haya rebote — que era el motivo
        // por el que el rebote estaba puesto.

        // ── ACTO 3 · REPOSO · 0.62 → 1.20 ──────────────────────
        // 0.58s de silencio visual. Es lo que hace que el isotipo se lea como
        // marca y no como transición: si lo quitas del todo, el avión pasa de
        // largo y no llega a leerse como logo.
        //
        // ⚠️ EL TELÓN NO SE MUEVE AL TOCAR ESTO. Los 0.30s que se recortaron
        // aquí (la pausa era de 0.88s) NO acortan la intro: se trasladan al
        // final, y ahí hacían falta. El acto 5 promete "sostén 0.30s" con el
        // lockup ya formado antes de que suba el telón, y ese sostén había
        // desaparecido: con 8 letras la cascada terminaba exactamente en 2.30,
        // que es cuando arranca el telón, así que el lockup completo solo se
        // veía mientras la página ya lo estaba tapando.
        //
        // Con el acto 4 en 1.20 la cascada cierra en 2.00 y el sostén vuelve a
        // existir. O sea: el tiempo muerto no se ha eliminado, se ha movido al
        // sitio donde el diseño lo pedía.

        // ── ACTO 4 · LOCKUP ────────────────────────────────────
        .to(
          markWrap,
          { scale: 1, x: 0, duration: 0.5, ease: 'expo.out' },
          1.2
        )
        // El wordmark revela por CASCADA DE OPACIDAD y nada más. Sin
        // desplazamiento, sin blur, sin escala. A mitad de camino se ve
        // literalmente: N(85%) E(65%) X(45%) O(15%) R(0%).
        // La cadencia medida del original es 0.085s, pero con 8 letras
        // ("VENDEMIA") eso son 0.6s de cascada y el telón entraría encima. El
        // hueco del acto 4 dura 0.45s, así que la cadencia se reparte dentro:
        // con 5 letras da los 0.085 originales, con 8 da 0.064. El gesto se
        // conserva; lo que se ajusta es el paso.
        .to(
          '.letter',
          {
            opacity: 1,
            duration: 0.3,
            stagger: Math.min(0.085, 0.45 / Math.max(BRAND.letters.length - 1, 1)),
          },
          1.25
        )

        /* ── ACTO 4b · LOS TRAZOS DEL LOGO ─────────────────────
           Cada trazo se dibuja siguiendo a SU tramo de texto: la sonrisa
           detrás de "VENDE" y el globo detrás de "MIA". No es adorno de
           orden: leerlo así hace que los trazos parezcan pertenecer a esas
           letras en vez de aparecer sueltos al final.

           Los dos CIERRAN EN 2.00, exactamente cuando la última letra queda a
           plena opacidad. Es deliberado: el sostén de 0.30s antes del telón se
           recuperó hace poco recortando el reposo, y meter aquí un tramo que
           se pase de 2.00 se lo comería otra vez. Si algún día hacen falta más
           lentos, hay que mover CURTAIN_START, no invadir el sostén. */
        .to(drawSmile, { v: 0, duration: 0.45, ease: 'power2.out', onUpdate: paintSmile }, 1.45)
        .to(drawBubble, { v: 0, duration: 0.5, ease: 'power2.out', onUpdate: paintBubble }, 1.5)

        // ── ACTO 5 · ENTREGA · sostén 2.00 → 2.30, telón 2.30 ──
        // Sostén 0.30s y entra el telón. Es el MISMO mecanismo (M3) que las
        // transiciones entre secciones: la intro es la primera diapositiva de
        // la misma baraja, no un componente con su propio lenguaje.
        // ⚠️ `y` en píxeles del viewport, NO `yPercent`. yPercent es porcentaje
        // de la altura del propio elemento, y este wrapper mide la página
        // entera. Ver la nota en globals.css.
        .fromTo(
          curtain,
          { y: () => window.innerHeight },
          {
            y: 0,
            duration: TIMING.curtain,
            ease: EASE.curtain,
            onUpdate() {
              const p = this.progress();
              if (p >= CURTAIN_REBIRTH) rebirth();
              if (p >= CURTAIN_HANDOFF) handoff();
            },
          },
          CURTAIN_START
        );

      // Skip visible a partir de los 0.5s
      const skipTimer = window.setTimeout(() => setShowSkip(true), 500);

      // suppressEvents = false → el salto sí dispara onComplete y la limpieza.
      const abort = () => {
        tl.progress(1, false);
      };
      window.addEventListener('pointerdown', abort, { once: true });
      window.addEventListener('keydown', abort, { once: true });

      return () => {
        window.clearTimeout(skipTimer);
        window.removeEventListener('pointerdown', abort);
        window.removeEventListener('keydown', abort);
      };
    }, overlayRef);

    return () => {
      ctx.revert();
      document.body.removeAttribute('data-intro-locked');
    };
  }, []);

  return (
    <>
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>

      {!done && (
        <div
          ref={overlayRef}
          aria-hidden="true"
          className="brand-intro fixed inset-0 z-[999] flex items-center justify-center"
          // #171717 — gris oscuro, NO negro puro. El hero es #060200. Ese salto
          // de valor es lo único que hace visible el corte del telón.
          style={{ background: 'var(--bg-intro)' }}
        >
          <div
            ref={lockupRef}
            className="flex items-center gap-4 scale-[0.7] md:scale-100"
          >
            {/* El avión va INLINE (no es un <img>), así que no hay petición de
                red que esperar: en el primer paint ya está dibujado. Antes,
                con el SVG de Mia como imagen, el acto 1 podía arrancar con el
                hueco vacío si la imagen no había llegado, y el avión aparecía a
                mitad de vuelo.

                64 px de alto y no 132: el recorte completo era casi cuadrado
                (523×620) y el avión es ancho y bajo (640×360). A igual altura
                se vería como el doble de grande. 64 le da los ~114 px de ancho
                que ocupaba el otro, que es lo que equilibra el wordmark. */}
            <div ref={markWrapRef} className="shrink-0">
              <Mark size={64} variant="plane" animatable />
            </div>

            <div
              ref={wordRef}
              className="relative flex text-white"
              style={{
                fontSize: 36,
                fontWeight: 600,
                letterSpacing: '0.15em',
                lineHeight: 1,
              }}
            >
              {/* ── LOS TRAZOS DEL LOGO · solo en la intro ──────────────
                  El logotipo de Vendemia no es solo la palabra: lleva una
                  SONRISA bajo "vende" y un GLOBO DE DIÁLOGO alrededor de "mia".
                  Son la mitad de la personalidad de la marca, y sin ellos el
                  lockup se lee como texto, no como logo.

                  El `d` de los dos paths lo calcula el efecto midiendo las
                  letras reales — ver drawBrandStrokes(). No van con
                  coordenadas fijas a propósito: el wordmark cambia de ancho con
                  la fuente, el tracking y el `scale-[0.7]` de móvil, y unas
                  coordenadas escritas a mano se desalinearían en cuanto se
                  tocara cualquiera de las tres cosas. */}
              <svg
                ref={strokesRef}
                className="pointer-events-none absolute"
                fill="none"
                aria-hidden="true"
                style={{ overflow: 'visible' }}
              >
                {/* La sonrisa lleva el color de acento y el globo el de la
                    tinta, igual que en el logo original (azul + navy). Sobre el
                    fondo oscuro de la intro la tinta es blanca. */}
                <path
                  className="brand-smile"
                  stroke="var(--orange-500)"
                  strokeWidth={4}
                  strokeLinecap="round"
                  pathLength={1}
                />
                <path
                  className="brand-bubble"
                  stroke="var(--text-hi)"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                />
              </svg>

              {/* El logo parte el wordmark en dos colores ("vende" tinta +
                  "mia" azul). La cascada de opacidad aterriza justo en el
                  cambio de color, que es un golpe de efecto gratis: la última
                  parte que aparece es además la que lleva el acento. */}
              {BRAND.letters.map((letter, i) => (
                <span
                  key={i}
                  className="letter"
                  style={{
                    ...(i >= BRAND.accentFrom ? { color: 'var(--orange-500)' } : null),
                    /* KERNING ÓPTICO DE LA "V"
                     *
                     * El hueco entre el isotipo y el wordmark NO es el `gap`: la
                     * V tiene el asta izquierda en diagonal, así que por encima
                     * de la línea base deja un triángulo de aire que ninguna
                     * otra letra deja. Contando ese aire, el hueco real es casi
                     * el doble del nominal, y el lockup se lee partido en dos.
                     *
                     * La solución NO es cerrar el `gap`: eso mete la V dentro
                     * del avión y descuadra el bloque entero. Se corrige SOLO la
                     * letra que causa el problema, que es lo que hace un
                     * tipógrafo. -0.09em es el ajuste que iguala ópticamente ese
                     * hueco con el que hay entre V y E.
                     */
                    ...(i === 0 ? { marginLeft: '-0.09em' } : null),
                  }}
                >
                  {letter}
                </span>
              ))}
            </div>
          </div>

          {showSkip && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new KeyboardEvent('keydown'))}
              className="absolute bottom-8 right-8 rounded-full border border-white/15 px-4 py-2 text-[12px] font-medium text-white/50 transition-colors duration-200 hover:text-white"
            >
              Saltar
            </button>
          )}
        </div>
      )}
    </>
  );
}
