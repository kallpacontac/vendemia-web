/**
 * EL AVIÓN DE PAPEL · geometría, dibujada a mano.
 *
 * Es el isotipo de la marca en todas partes: navbar, intro y favicon.
 *
 * ── Por qué vive aquí y no en public/brand/ ──────────────────────────────
 * `scripts/logo.mjs` hace `rm -rf public/brand` antes de escribir. Cualquier
 * asset hecho a mano que viviera ahí desaparecería en la siguiente
 * regeneración sin dejar rastro y sin dar un error. Aquí no lo puede tocar.
 *
 * ── Por qué un módulo y no un SVG suelto ─────────────────────────────────
 * Lo consumen tres sitios con formatos distintos: Mark.tsx lo pinta inline en
 * React, app/icon.svg lo lleva en un documento cuadrado, y scripts/logo.mjs
 * rasteriza ese documento a PNG. Con un módulo, mover un vértice se propaga a
 * los tres; con tres copias, se desincronizan y solo te enteras mirando el
 * favicon a 16 px, que es donde nadie mira.
 *
 * Son tres polígonos planos, que es exactamente lo que es un avión de papel:
 * el ala grande que mira al espectador, la que se ve casi de canto, y la aleta
 * que cuelga en sombra. Sin degradados — a 16 px un degradado es una mancha y
 * el volumen lo dan los tres tonos.
 */
export const PLANE = {
  w: 640,
  h: 360,
  /** Ala superior — la cara grande que mira al espectador. */
  wing: 'M2 128 L633 5 L342 262 L165 200 L151 178 Z',
  /** Ala lejana, vista casi de canto entre el morro y la cola. */
  far: 'M633 5 L392 322 L342 262 Z',
  /** Aleta inferior, en sombra: es la que da la sensación de pliegue. */
  fin: 'M165 200 L342 262 L263 360 Z',
} as const;

/**
 * Los tres tonos, en HEX literal y no en var(--…).
 *
 * En Mark.tsx podrían ser tokens CSS, pero app/icon.svg es un fichero suelto
 * que el navegador pinta FUERA del documento: ahí una var() no resuelve y el
 * favicon saldría negro. Un solo juego de colores para los tres consumidores.
 */
export const PLANE_INK = {
  wing: '#FF4900', // --orange-500
  far: '#FF6A1F',  // --orange-400
  fin: '#D03E02',  // sombra del avión, la misma tinta que usa logo.mjs
} as const;
