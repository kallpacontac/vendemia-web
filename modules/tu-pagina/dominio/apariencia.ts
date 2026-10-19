/** Ajustes opcionales dentro de tu_pagina.secciones, sin migración SQL. */
export interface AparienciaPagina {
  colorTienda?: string;
  fondoAgenda?: string;
  fondoTienda?: string;
  colorBanner?: string;
  tituloBanner?: string;
  mostrarBanner?: boolean;
  mostrarWhatsapp?: boolean;
}

export const esHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
export const esUrlPublica = (v: string) => !v || /^https:\/\/[^\s]+$/i.test(v);
export const colorO = (v: unknown, defecto: string) => esHex(v) ? v : defecto;
