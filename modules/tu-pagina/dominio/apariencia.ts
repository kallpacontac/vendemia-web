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
  /** Oferta breve visible en la parte superior de todas las plantillas. */
  promocionTexto?: string;
  /** Imagen opcional de la promoción emergente en la plantilla de uñas. */
  promocionImagenUnas?: string;
  mostrarWhatsapp?: boolean;
  /** «Abierto ahora» / «Cerrado» según el horario del negocio. Sale salvo que el dueño lo apague. */
  mostrarHorario?: boolean;
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
  /** Luxury: la portada en el celular (vertical). Sin ella, la misma que en la compu. */
  portadaLuxuryMovil?: string;
  /** Luxury: otras portadas. En cada visita sale una al azar: la principal o una de estas. */
  portadasLuxuryAlternas?: { compu: string; movil?: string }[];
  /** Estudio de uñas: contenido e imagen de la sección inferior. */
  tituloSeccionUnas?: string;
  textoSeccionUnas?: string;
  fotoDetalleUnas?: string;
  /** Primera línea del pedido enviado por WhatsApp. El resto del resumen se genera con los datos reales. */
  mensajePedidoIntro?: string;
  pedirMetodoPago?: boolean;
  pedirNotaPedido?: boolean;
  pedirUbicacion?: boolean;
  /** Videos del negocio (verticales, mp4) en la sección «En video», después del catálogo. */
  videos?: VideoPagina[];
  /** Título de esa sección. Sin él: «Así se vive <negocio>». */
  tituloVideos?: string;
}

export interface VideoPagina {
  /** https, mp4 o webm. */
  url: string;
  /** Imagen (https) mientras carga o sin reproducir. */
  poster?: string;
  titulo?: string;
}

/** Los videos que se pueden enseñar: https, como mucho 4, con lo demás saneado. */
export function videosDe(a: AparienciaPagina | undefined): VideoPagina[] {
  if (!Array.isArray(a?.videos)) return [];
  return a.videos
    .filter((v): v is VideoPagina => Boolean(v) && typeof v.url === 'string' && /^https:\/\/\S+\.(mp4|webm)(\?\S*)?$/i.test(v.url))
    .slice(0, 4)
    .map((v) => ({
      url: v.url,
      ...(typeof v.poster === 'string' && /^https:\/\/\S+$/i.test(v.poster) ? { poster: v.poster } : {}),
      ...(typeof v.titulo === 'string' && v.titulo.trim() ? { titulo: v.titulo.trim().slice(0, 80) } : {}),
    }));
}

export const esHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
export const esUrlPublica = (v: string) => !v || /^https:\/\/[^\s]+$/i.test(v);
export const colorO = (v: unknown, defecto: string) => esHex(v) ? v : defecto;
