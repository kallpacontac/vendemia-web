'use client';

import type { CSSProperties } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * BLOQUE C · SISTEMA DE MOVIMIENTO — 5 primitivas reutilizables.
 *
 * Regla dura: no se inventan animaciones fuera de este set. Si una sección
 * necesita algo, se compone con M1–M5. Es lo que mantiene la página coherente.
 */

let registered = false;
export function registerGsap() {
  if (registered || typeof window === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);
  registered = true;
}

/** Tiempos medidos del original. No los cambies. */
export const TIMING = {
  intro: 2.7,
  /**
   * TELÓN · 0.7s
   *
   * Medido fotograma a fotograma sobre la referencia (30 fps), el telón dura
   * **0.26 s**. Es rápido y crispado, no lento. Lo que hace que la entrada se
   * sienta elegante NO es un telón lento: es el REVELADO POSTERIOR, que en la
   * referencia se toma más de un segundo y medio solo para el titular.
   *
   * 0.26 s es sobre el viewport pequeño del mockup; a pantalla completa el
   * equivalente perceptivo son ~0.7 s. Si lo alargas más, el telón empieza a
   * pedir protagonismo y se come el momento del hero.
   */
  curtain: 0.7,
  /**
   * REVELADO POR PALABRA · 0.8s con stagger 0.16s
   *
   * El stagger medido en la referencia es de ~0.18 s entre palabra y palabra,
   * tres veces el 0.06 s que decía el brief. Con 0.06 las cinco palabras
   * aparecen prácticamente a la vez y el efecto se pierde; con 0.16 se lee la
   * frase construyéndose. Aquí es donde vive la sensación de calma.
   */
  wordReveal: 0.8,
  /**
   * ⚠️ Esto ya no es un stagger fijo: es un PRESUPUESTO.
   *
   * Medido en la referencia, el H1 del hero ("Inference at the Edge", 4
   * palabras) se despliega en 0.53 s → 0.18 s por palabra. Pero el H2 de la
   * sección 2 ("Use AI faster and more efficiently right on your device!", 10
   * palabras) tarda 0.75 s → 0.083 s por palabra.
   *
   * O sea: el stagger NO es constante. Lo que se mantiene es el tiempo total
   * que el titular tarda en armarse. Con un stagger fijo, un titular de diez
   * palabras se eterniza y uno de tres se queda en nada. Ver wordStaggerFor().
   */
  wordBudget: 0.78,
  wordStaggerMin: 0.05,
  wordStaggerMax: 0.18,
  /** M6 · revelado por líneas (párrafos) */
  lineReveal: 0.7,
  lineStagger: 0.1,
  /** M7 · barrido vertical (tarjetas de medios) */
  wipe: 0.9,
  directional: 0.8,
  gridStagger: 0.1,
  navCollapse: 0.4,
  marquee: 30,
  hover: 0.25,
} as const;

/**
 * Solver de cubic-bezier propio.
 *
 * ¿Por qué no pasarle la cadena 'cubic-bezier(...)' a GSAP directamente?
 * Porque GSAP core NO la parsea: eso lo hace el plugin CustomEase. Sin él,
 * `gsap.parseEase('cubic-bezier(...)')` devuelve undefined y GSAP cae en
 * silencio a `power1.out`. La animación funciona, se ve aceptable, y nunca te
 * enteras de que no estás usando la curva que escribiste.
 *
 * Son 20 líneas y elimina la dependencia del plugin. Newton-Raphson con
 * bisección de respaldo, que es exactamente lo que hace el navegador.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const A = (a: number, b: number) => 1 - 3 * b + 3 * a;
  const B = (a: number, b: number) => 3 * b - 6 * a;
  const C = (a: number) => 3 * a;

  const calc = (t: number, a: number, b: number) =>
    ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
  const slope = (t: number, a: number, b: number) =>
    3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);

  return (time: number): number => {
    if (x1 === y1 && x2 === y2) return time; // lineal
    if (time <= 0) return 0;
    if (time >= 1) return 1;

    // Buscamos la t paramétrica cuyo componente X vale `time`.
    let t = time;
    for (let i = 0; i < 8; i++) {
      const s = slope(t, x1, x2);
      if (s === 0) break;
      const x = calc(t, x1, x2) - time;
      t -= x / s;
    }
    // Respaldo por bisección si Newton se salió del rango.
    if (t < 0 || t > 1) {
      let lo = 0;
      let hi = 1;
      t = time;
      for (let i = 0; i < 20; i++) {
        const x = calc(t, x1, x2);
        if (Math.abs(x - time) < 1e-5) break;
        if (x > time) hi = t;
        else lo = t;
        t = (lo + hi) / 2;
      }
    }
    return calc(t, y1, y2);
  };
}

export const EASE = {
  /**
   * TELÓN · (0.40, 0, 0.20, 1)
   *
   * La curva estándar de Material para "elementos que entran en pantalla".
   * No es capricho: lo que hace que algo se lea como deslizamiento y no como
   * salto es el PICO DE VELOCIDAD y el largo de la cola de frenado.
   *
   *   curva                    pico    cola final (último 10 % del recorrido)
   *   expo.inOut (la original) 5.0x    ~15 % del tiempo   ← latigazo, se lee corte
   *   (0.42, 0, 0.12, 1)       3.25x   ~40 %              ← aún algo seco
   *   (0.40, 0, 0.20, 1)       2.73x   ~37 %              ← ésta
   *   (0.45, 0, 0.55, 1)       1.82x   ~23 %              ← muy plana, se arrastra
   *
   * Si la quieres todavía más suave, baja el primer número (0.35). Si la
   * quieres con más carácter, sube el pico acercando el cuarto punto (0.12).
   */
  curtain: cubicBezier(0.4, 0, 0.2, 1),
  word: 'expo.out',
  directional: 'power3.out',
  nav: 'power2.out',
} as const;

/**
 * A qué punto del telón se le pasa el testigo al hero.
 *
 * En el original la página no termina de deslizarse y ENTONCES empieza a
 * poblarse — eso deja un hueco muerto. El relevo ocurre mientras el panel
 * todavía se está posando: al 70 % del recorrido el hero ya está respirando.
 * Es lo que hace que se lea como un solo gesto continuo.
 */
export const CURTAIN_HANDOFF = 0.7;
/** Al 50 % del telón, el isotipo del navbar renace. */
export const CURTAIN_REBIRTH = 0.5;

/** cubic-bezier(.16,1,.3,1) — el ease de la entrada direccional (M2) */
export const DIRECTIONAL_CUBIC = cubicBezier(0.16, 1, 0.3, 1);

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Quita will-change cuando la animación termina — evita capas huérfanas en GPU. */
function clearWill(targets: gsap.TweenTarget) {
  gsap.set(targets, { willChange: 'auto' });
}

/* ──────────────────────────────────────────────────────────
   M1 · REVEAL DE TÍTULO POR PALABRA
   from: opacity 0, translateY(0.4em), scale(0.96), blur(8px)
   to:   opacity 1, translateY(0),     scale(1),    blur(0)
   0.70s · expo.out · stagger 0.06s · ScrollTrigger 'top 80%' once
   ────────────────────────────────────────────────────────── */
export function revealWords(
  container: HTMLElement,
  opts: { delay?: number; immediate?: boolean } = {}
): gsap.core.Tween | null {
  const words = container.querySelectorAll<HTMLElement>('.word');
  if (!words.length) return null;

  if (prefersReducedMotion()) {
    container.setAttribute('data-reveal-words', 'done');
    gsap.set(words, { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' });
    return null;
  }

  const tween = gsap.fromTo(
    words,
    { opacity: 0, y: '0.4em', scale: 0.96, filter: 'blur(8px)' },
    {
      opacity: 1,
      y: '0em',
      scale: 1,
      filter: 'blur(0px)',
      duration: TIMING.wordReveal,
      ease: EASE.word,
      // Presupuesto repartido, no paso fijo. Ver wordStaggerFor().
      stagger: wordStaggerFor(words.length),
      delay: opts.delay ?? 0,
      onStart: () => container.setAttribute('data-reveal-words', 'running'),
      onComplete: () => {
        container.setAttribute('data-reveal-words', 'done');
        clearWill(words);
      },
      ...(opts.immediate
        ? {}
        : {
            scrollTrigger: {
              trigger: container,
              start: 'top 80%',
              once: true,
            },
          }),
    }
  );

  return tween;
}

/* ──────────────────────────────────────────────────────────
   M1b · CASCADA DE OPACIDAD  (el gesto del wordmark de la intro)
   from: opacity 0 → to: opacity 1. NADA MÁS.
   Sin desplazamiento, sin blur, sin escala.

   No es una variante decorativa de M1: es el MISMO gesto con el que se forma
   "VENDEMIA" en la intro, reutilizado en el cuerpo de texto. Por eso el texto
   de la página se siente parte de la marca y no de una plantilla.

   ¿Cuándo cada uno?
     · M1  (revealWords) → titulares. El blur + el desplazamiento le dan peso.
     · M1b (cascadeText) → párrafos, badges, pies. Solo respiran.

   El paso se reparte DENTRO de una ventana fija (`spread`), como en la intro:
   así una frase de 8 palabras y otra de 30 tardan lo mismo en formarse y el
   ritmo de la página no depende del largo del copy.
   ────────────────────────────────────────────────────────── */
export const CASCADE = {
  /** Cuánto tarda cada pieza en pasar de 0 a 1 */
  duration: 0.3,
  /** Ventana total del reparto. Es el 0.45s del acto 4 de la intro. */
  spread: 0.45,
  /** Techo del paso — la cadencia medida del wordmark original */
  maxStep: 0.085,
} as const;

export function cascadeText(
  container: HTMLElement,
  opts: { delay?: number; immediate?: boolean; spread?: number } = {}
): gsap.core.Tween | null {
  const parts = container.querySelectorAll<HTMLElement>('.cascade-part');
  if (!parts.length) return null;

  const done = () => container.setAttribute('data-cascade', 'done');

  if (prefersReducedMotion()) {
    done();
    gsap.set(parts, { opacity: 1 });
    return null;
  }

  const spread = opts.spread ?? CASCADE.spread;
  const step = Math.min(CASCADE.maxStep, spread / Math.max(parts.length - 1, 1));

  return gsap.fromTo(
    parts,
    { opacity: 0 },
    {
      opacity: 1,
      duration: CASCADE.duration,
      ease: 'none', // una cascada de opacidad con ease se lee como un fundido
      stagger: step,
      delay: opts.delay ?? 0,
      onStart: () => container.setAttribute('data-cascade', 'running'),
      onComplete: () => {
        done();
        clearWill(parts);
      },
      ...(opts.immediate
        ? {}
        : {
            scrollTrigger: { trigger: container, start: 'top 85%', once: true },
          }),
    }
  );
}

/* ──────────────────────────────────────────────────────────
   M2 · ENTRADA DIRECCIONAL
   Cada elemento entra desde el borde MÁS CERCANO a su posición final.
   Es la regla que le da coherencia a toda la página.
   0.80s · cubic-bezier(.16,1,.3,1)
   ────────────────────────────────────────────────────────── */
/**
 * Reparte el presupuesto entre las palabras que haya.
 * Titular corto → paso largo y solemne. Titular largo → paso corto y fluido.
 * En los dos casos el titular termina de armarse en un tiempo parecido.
 */
export function wordStaggerFor(count: number): number {
  if (count < 2) return 0;
  const raw = TIMING.wordBudget / (count - 1);
  return Math.min(TIMING.wordStaggerMax, Math.max(TIMING.wordStaggerMin, raw));
}

/* ──────────────────────────────────────────────────────────
   M6 · REVELADO POR LÍNEAS — para párrafos, no para titulares.

   En la referencia el párrafo de apoyo NO aparece palabra a palabra ni de
   golpe: entra LÍNEA A LÍNEA, una cada ~0.1s. Con veinte palabras, un reveal
   por palabra se lee como ruido; por líneas se lee como alguien escribiendo.

   Las líneas no se declaran a mano: se DEDUCEN midiendo el offsetTop de cada
   palabra después del layout. Así el agrupado sigue siendo correcto cuando el
   texto reflowa en móvil, que es donde una lista de líneas hardcodeada se
   rompe siempre.
   ────────────────────────────────────────────────────────── */
export function revealLines(
  container: HTMLElement,
  opts: { delay?: number; immediate?: boolean; stagger?: number } = {}
): gsap.core.Timeline | null {
  const words = Array.from(container.querySelectorAll<HTMLElement>('.word'));
  if (!words.length) return null;

  if (prefersReducedMotion()) {
    container.setAttribute('data-reveal-words', 'done');
    gsap.set(words, { opacity: 1, y: 0, filter: 'blur(0px)' });
    return null;
  }

  // Agrupar por línea. Se redondea porque los superíndices y los <strong>
  // pueden desviar el offsetTop un par de píxeles dentro de la misma línea.
  const byTop = new Map<number, HTMLElement[]>();
  for (const w of words) {
    const key = Math.round(w.offsetTop / 4) * 4;
    if (!byTop.has(key)) byTop.set(key, []);
    byTop.get(key)!.push(w);
  }
  const lines = [...byTop.entries()].sort((a, b) => a[0] - b[0]).map(([, ws]) => ws);

  const stagger = opts.stagger ?? TIMING.lineStagger;
  const tl = gsap.timeline({
    delay: opts.delay ?? 0,
    onStart: () => container.setAttribute('data-reveal-words', 'running'),
    onComplete: () => {
      container.setAttribute('data-reveal-words', 'done');
      clearWill(words);
    },
    ...(opts.immediate
      ? {}
      : { scrollTrigger: { trigger: container, start: 'top 85%', once: true } }),
  });

  lines.forEach((line, i) => {
    tl.fromTo(
      line,
      { opacity: 0, y: 10, filter: 'blur(6px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: TIMING.lineReveal, ease: EASE.word },
      i * stagger
    );
  });

  return tl;
}

/* ──────────────────────────────────────────────────────────
   M7 · BARRIDO VERTICAL — para tarjetas de medios.

   La tarjeta de la sección 2 no se desplaza desde la izquierda, como yo había
   asumido. Frame a frame se ve que CRECE DESDE ABAJO: el borde inferior está
   clavado y el superior sube hasta la altura final, con el ancho constante.
   Es un clip-path, no un translate.

   La diferencia importa: un translate mueve la imagen y se lee como "esto
   viene de fuera"; un barrido la descubre en su sitio y se lee como "esto ya
   estaba aquí". Lo segundo pesa más.
   ────────────────────────────────────────────────────────── */
export function wipeUp(
  el: HTMLElement,
  opts: { delay?: number; immediate?: boolean; trigger?: HTMLElement } = {}
): gsap.core.Tween | null {
  if (prefersReducedMotion()) {
    gsap.set(el, { clipPath: 'inset(0% 0 0 0)' });
    el.removeAttribute('data-wipe');
    return null;
  }

  return gsap.fromTo(
    el,
    { clipPath: 'inset(100% 0 0 0)' },
    {
      clipPath: 'inset(0% 0 0 0)',
      duration: TIMING.wipe,
      ease: DIRECTIONAL_CUBIC,
      delay: opts.delay ?? 0,
      onStart: () => el.removeAttribute('data-wipe'),
      onComplete: () => clearWill(el),
      ...(opts.immediate
        ? {}
        : {
            scrollTrigger: { trigger: opts.trigger ?? el, start: 'top 85%', once: true },
          }),
    }
  );
}

export type Direction = 'left' | 'right' | 'up' | 'scale';

const FROM_STATE: Record<Direction, gsap.TweenVars> = {
  left: { opacity: 0, x: -60 },
  right: { opacity: 0, x: 60 },
  up: { opacity: 0, y: 40 },
  scale: { opacity: 0, y: 60, scale: 0.96 },
};

export function directionalReveal(
  targets: HTMLElement | HTMLElement[] | NodeListOf<HTMLElement>,
  direction: Direction = 'up',
  opts: {
    stagger?: number | gsap.StaggerVars;
    delay?: number;
    trigger?: HTMLElement;
    start?: string;
    immediate?: boolean;
  } = {}
): gsap.core.Tween | null {
  const list = Array.from(targets as NodeListOf<HTMLElement>);
  if (!list.length) return null;

  const clearAttr = () => list.forEach((el) => el.removeAttribute('data-reveal'));

  if (prefersReducedMotion()) {
    gsap.set(list, { opacity: 1, x: 0, y: 0, scale: 1 });
    clearAttr();
    return null;
  }

  return gsap.fromTo(list, FROM_STATE[direction], {
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    duration: TIMING.directional,
    ease: DIRECTIONAL_CUBIC,
    stagger: opts.stagger ?? 0,
    delay: opts.delay ?? 0,
    onStart: clearAttr,
    onComplete: () => clearWill(list),
    ...(opts.immediate
      ? {}
      : {
          scrollTrigger: {
            trigger: opts.trigger ?? list[0],
            start: opts.start ?? 'top 85%',
            once: true,
          },
        }),
  });
}

/* ──────────────────────────────────────────────────────────
   M3 · TELÓN (curtain)
   Un panel sube desde translateY(100%) hasta 0 y CUBRE lo que hay debajo,
   que permanece INMÓVIL y a plena opacidad hasta quedar tapado.
   Debe verse un corte horizontal recto avanzando hacia arriba.
   Nunca lo resuelvas con fade ni con zoom.
   0.75s · expo.inOut
   ────────────────────────────────────────────────────────── */
export function curtainUp(
  panel: HTMLElement,
  opts: { onComplete?: () => void; onHalf?: () => void; duration?: number } = {}
): gsap.core.Tween {
  let halfFired = false;
  return gsap.fromTo(
    panel,
    { yPercent: 100 },
    {
      yPercent: 0,
      duration: opts.duration ?? TIMING.curtain,
      ease: EASE.curtain,
      onUpdate() {
        if (!halfFired && this.progress() >= 0.5) {
          halfFired = true;
          opts.onHalf?.();
        }
      },
      onComplete: () => {
        gsap.set(panel, { clearProps: 'transform,willChange' });
        opts.onComplete?.();
      },
    }
  );
}

/* ──────────────────────────────────────────────────────────
   M4 · SECCIONES APILADAS — solo secciones 1, 2 y 3
   La saliente se anima a scale(0.95) + brightness(0.5) conforme la
   siguiente la cubre subiendo. De la 4 en adelante: scroll normal.
   ────────────────────────────────────────────────────────── */
export function initStackedSections(sections: HTMLElement[]): ScrollTrigger[] {
  if (prefersReducedMotion()) return [];
  // Mismo umbral que el CSS. Si el efecto está desactivado por media query,
  // los ScrollTrigger que lo animan sobran y además dejarían un brightness()
  // aplicado sobre una sección que ya no se apila.
  if (typeof window !== 'undefined' && (window.innerWidth < 768 || window.innerHeight < 720)) {
    return [];
  }

  const triggers: ScrollTrigger[] = [];

  sections.forEach((section, i) => {
    // La última del stack no se encoge: no hay nada que la cubra dentro del grupo.
    if (i === sections.length - 1) return;

    const st = ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: 'bottom top',
      scrub: true,
      onUpdate: (self) => {
        const p = self.progress;
        gsap.set(section, {
          scale: 1 - p * 0.05,          // 1 → 0.95
          filter: `brightness(${1 - p * 0.5})`, // 1 → 0.5
          transformOrigin: 'center top',
        });
      },
    });
    triggers.push(st);
  });

  return triggers;
}

/* ──────────────────────────────────────────────────────────
   M5 · MARQUEE — loop horizontal infinito
   Se resuelve en CSS (animate-marquee-left / -right en tailwind.config)
   sobre un track con el array DUPLICADO. Aquí solo el helper de duplicado
   y la utilidad de clases, para que ninguna sección lo reimplemente.
   ────────────────────────────────────────────────────────── */
export function duplicateForLoop<T>(items: T[]): T[] {
  return [...items, ...items];
}

export function marqueeClass(direction: 'left' | 'right', seconds = TIMING.marquee) {
  return {
    className: `marquee-track ${direction === 'left' ? 'animate-marquee-left' : 'animate-marquee-right'}`,
    style: { animationDuration: `${seconds}s` } as CSSProperties,
  };
}

/* ──────────────────────────────────────────────────────────
   Utilidad de limpieza — llámala SIEMPRE en el return del useEffect.
   Matar los ScrollTrigger es la fuga más común en páginas como esta.
   ────────────────────────────────────────────────────────── */
export function killAll(ctx?: gsap.Context) {
  ctx?.revert();
}
