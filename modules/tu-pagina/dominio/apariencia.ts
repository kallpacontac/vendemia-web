/** Ajustes opcionales dentro de tu_pagina.secciones, sin migración SQL. */
export interface AparienciaPagina {
  /** Las páginas anteriores conservan su aspecto hasta que el dueño elija un diseño. */
  plantillaActiva?: boolean;
  colorTienda?: string;
  fondoAgenda?: string;
  fondoTienda?: string;
  colorBanner?: string;
  tituloBanner?: string;
  mostrarBanner?: boolean;
  mostrarWhatsapp?: boolean;
  /** Luxury: presenta los productos en un carrusel y muestra el acceso desde la portada. */
  catalogoLuxuryDestacado?: boolean;
  /** El dueño decide cómo se presentan los servicios Luxury a sus clientes. */
  vistaServiciosLuxury?: 'vertical' | 'horizontal';
  /** Restaurantes y cafeterías: solicitud de atención con número de mesa por WhatsApp. */
  mostrarMesero?: boolean;
  /** Foto de ejemplo que hace de portada sin foto propia (dominio/fotos.ts). */
  fotoPlantilla?: string;
  /** Foto opcional del segundo banner de Luxury; sin ella se usa la de la plantilla. */
  portadaLuxurySecundaria?: string;
}

export const esHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
export const esUrlPublica = (v: string) => !v || /^https:\/\/[^\s]+$/i.test(v);
export const colorO = (v: unknown, defecto: string) => esHex(v) ? v : defecto;
