/**
 * La tarjeta de puntos de Fideliza dentro de Mi página.
 *
 * Mi página no lee tablas de Fideliza: solo guarda en `secciones.fideliza` si se
 * enseña y cuál es el slug del negocio en Fideliza (lo rellena el panel con el
 * suyo). La página pública pide lo que se ve con la misma RPC pública que usa
 * el alta (loyalty_srv_business), así que no hace falta ninguna migración.
 * Si el programa no está activo, la sección simplemente no sale.
 */
export interface ConfigTarjeta {
  activo?: boolean;
  /** loyalty_settings.slug del negocio: el de fideliza.vendemias.com/n/<slug>. */
  slug?: string;
}

/** Lo que la página necesita para pintar la sección. Sin datos de ningún cliente. */
export interface TarjetaPublica {
  /** Nombre del programa: «Club Mara». */
  nombre: string;
  /** «Con 6 sellos: un esmaltado en gel gratis.» */
  regla: string;
  premio: string;
  /** Sellos para el premio; 0 si el programa es de puntos (sin casillas). */
  meta: number;
  /** Trazo SVG del icono del sello elegido en Fideliza. */
  trazo: string;
  /** A dónde lleva «Crear mi tarjeta». */
  url: string;
}

export const tarjetaActiva = (c: ConfigTarjeta | undefined): c is Required<ConfigTarjeta> =>
  Boolean(c?.activo && c.slug && /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(c.slug));
