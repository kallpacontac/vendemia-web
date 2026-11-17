/**
 * ══════════════════════════════════════════════════════════════════════════
 * EL PORTAFOLIO DE LA PÁGINA DE ENLACES · trabajos con foto, en una tarjeta
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Una tarjeta más de la página («Mi portafolio») que, al tocarla, se abre en su
 * sitio y deja ver los trabajos: foto, nombre, una etiqueta y a dónde lleva.
 *
 * Se guarda dentro de loyalty_settings.page_style (jsonb) como `portafolio`:
 * no hace falta tabla nueva. El tope de page_style lo sube sql/0020 (de 2 000 a
 * 12 000 caracteres); sin ella, caben unos 3 trabajos con foto.
 *
 * Funciones puras: las usan el editor del panel, la página pública y las pruebas.
 */

export interface TrabajoPortafolio {
  titulo: string;
  /** La línea pequeña: «Barbería · Iquitos», «Web + reservas». */
  etiqueta?: string;
  /** A dónde lleva al tocarlo (https). Vacío = solo se ve. */
  url?: string;
  /** Foto (https; Cloudinary se recorta a la medida). */
  imagen?: string;
}

export interface Portafolio {
  /** El texto de la tarjeta. Por defecto, «Mi portafolio». */
  titulo?: string;
  /** Dónde va en la lista: antes o después de los botones. */
  posicion?: 'arriba' | 'abajo';
  trabajos: TrabajoPortafolio[];
}

export const MAX_TRABAJOS = 12;
export const TITULO_PORTAFOLIO = 'Mi portafolio';

const https = (u: unknown) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u.trim()) ? u.trim() : '');
const texto = (t: unknown, max: number) => (typeof t === 'string' ? t.trim().slice(0, max) : '');

/** Lo guardado (puede venir incompleto o de otra versión) → lo que se pinta. null = no hay portafolio. */
export function resolverPortafolio(p: unknown): (Required<Pick<Portafolio, 'titulo' | 'posicion'>> & { trabajos: TrabajoPortafolio[] }) | null {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const o = p as Partial<Portafolio>;
  const trabajos = (Array.isArray(o.trabajos) ? o.trabajos : [])
    .map((t) => ({
      titulo: texto(t?.titulo, 40),
      etiqueta: texto(t?.etiqueta, 40),
      url: https(t?.url),
      imagen: https(t?.imagen),
    }))
    .filter((t) => t.titulo)
    .slice(0, MAX_TRABAJOS);
  if (!trabajos.length) return null;
  return {
    titulo: texto(o.titulo, 40) || TITULO_PORTAFOLIO,
    posicion: o.posicion === 'abajo' ? 'abajo' : 'arriba',
    trabajos,
  };
}

/** «1 trabajo», «5 trabajos». */
export const cuantosTrabajos = (n: number) => `${n} ${n === 1 ? 'trabajo' : 'trabajos'}`;
