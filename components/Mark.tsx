'use client';

import { forwardRef } from 'react';

/**
 * EL ISOTIPO — Mia, la mascota de Vendemia.
 *
 * SVG. Los ficheros los genera `node scripts/logo.mjs` a partir del logo
 * original (azul sobre blanco): recorta, quita el fondo con flood fill,
 * reentinta al naranja del sitio y vectoriza por capas de color. No los edites
 * a mano, se regeneran.
 *
 * ── Por qué <img> y no next/image ────────────────────────────────────────
 * next/image existe para servir el tamaño justo de un ráster. Un SVG no tiene
 * tamaño, así que no hay nada que optimizar: pasarlo por el optimizador exige
 * activar `dangerouslyAllowSVG` (que abre la puerta a SVG con scripts) para no
 * ganar un solo byte. Un <img> normal es aquí la opción correcta y además la
 * más simple.
 *
 * ── Dos recortes, no uno ─────────────────────────────────────────────────
 *
 *   variant="full"    Mia sobre el avión de papel. El dibujo completo.
 *                     Por debajo de ~48 px el avión es una mancha naranja y
 *                     la cara desaparece: úsalo grande (intro, hero, OG).
 *
 *   variant="avatar"  Chispas + cabeza + mano saludando. Legible a 24 px, que
 *                     es lo que mide el logo en la píldora del navbar.
 *                     Es también el favicon.
 *
 *   variant="plane"   Solo el avión de papel, sin Mia. Es el recorte del
 *                     navbar: a 28 px la silueta se lee entera y además es
 *                     LITERALMENTE lo que hace la animación de renacimiento
 *                     (algo entra volando desde la izquierda). Ver abajo.
 *
 * Regla corta: **avión en el cromo de la página, full cuando hay sitio.**
 *
 * ── Sobre la animación ───────────────────────────────────────────────────
 * `.dot` es el envoltorio animable, y es el ÚNICO gancho: la intro y el
 * renacimiento del navbar animan ese span, nunca la <img>. El nombre viene de
 * la versión anterior (un SVG en tres primitivas) y se conserva porque
 * globals.css depende de él para fijar el estado inicial antes del primer
 * paint — ver la nota allí.
 *
 * ── `size` es la ALTURA, no el lado ─────────────────────────────────────
 * Ninguno de los dos recortes es cuadrado, y cuadrarlos con relleno
 * transparente hacía que el logo se viera pequeño y descolgado junto al
 * wordmark: el aire vacío contaba como tamaño. Se dimensiona por altura, que
 * es lo que hay que alinear con la tipografía, y el ancho sale de la
 * proporción real del fichero.
 *
 * Esa proporción viene de lib/brand-assets.ts, que genera el mismo script que
 * las imágenes. El ancho tiene que quedar fijado ANTES de que la imagen
 * cargue: BrandIntro mide esta caja con getBoundingClientRect() para calcular
 * cuánto desplazar el isotipo al centro de la pantalla, y si midiera cero el
 * lockup arrancaría descentrado.
 */

import { BRAND_ASSETS } from '@/lib/brand-assets';
import { PLANE, PLANE_INK } from '@/lib/plane';

type Props = {
  /** Altura en px. El ancho lo calcula la proporción del recorte. */
  size?: number;
  className?: string;
  variant?: 'full' | 'avatar' | 'plane';
  /** Estado inicial listo para animar (intro y renacimiento del navbar) */
  animatable?: boolean;
  /** Marca la imagen como crítica. Solo para la que se ve en el primer paint. */
  priority?: boolean;
};

const Mark = forwardRef<HTMLSpanElement, Props>(function Mark(
  { size = 72, className = '', variant = 'avatar', animatable = false, priority = false },
  ref
) {
  // Dos constantes y no una: `PLANE` no tiene `src`, y con un solo `asset` en
  // unión TypeScript no sabe estrecharlo dentro de la rama del <img>.
  const imgAsset = variant === 'full' ? BRAND_ASSETS.mark : BRAND_ASSETS.avatar;
  const asset = variant === 'plane' ? PLANE : imgAsset;
  const width = Math.round((size * asset.w) / asset.h);

  return (
    <span
      ref={ref}
      className={`mark ${className}`}
      style={{
        display: 'inline-block',
        width,
        height: size,
        flexShrink: 0,
        lineHeight: 0,
      }}
    >
      <span
        className="dot"
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          transformOrigin: 'center center',
          willChange: 'transform, opacity',
          opacity: animatable ? 0 : undefined,
        }}
      >
        {variant === 'plane' ? (
          <svg
            viewBox={`0 0 ${PLANE.w} ${PLANE.h}`}
            width={width}
            height={size}
            aria-hidden="true"
            style={{ width: '100%', height: '100%', display: 'block' }}
          >
            <path d={PLANE.wing} fill={PLANE_INK.wing} />
            <path d={PLANE.far} fill={PLANE_INK.far} />
            <path d={PLANE.fin} fill={PLANE_INK.fin} />
          </svg>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element -- ver cabecera */
          <img
            src={imgAsset.src}
            alt=""
            width={width}
            height={size}
            draggable={false}
            // El SVG del isotipo se ve en el primer paint de la intro; el resto
            // están bajo el pliegue o dentro de un navbar que ya se ha pintado.
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding={priority ? 'sync' : 'async'}
            style={{ width: '100%', height: '100%' }}
          />
        )}
      </span>
    </span>
  );
});

export default Mark;
