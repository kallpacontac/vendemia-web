/**
 * Las dos promos de Mi página (25-nov-2026, The 24/7):
 *
 *   · descuentoWeb: «20 % si reservas por aquí», configurable, solo en citas de la página y
 *     una vez por cliente. El precio rebajado lo pone Postgres en la cita (tu-pagina 0038);
 *     aquí solo se normaliza la config y se hace la misma cuenta para enseñarla.
 *   · popup: un aviso que sale al abrir la página (una vez al día por teléfono), con título,
 *     texto, foto y botón opcionales.
 */

export interface DescuentoWeb {
  activo?: boolean;
  /** 1–90. */
  pct?: number;
}

export interface PopupPagina {
  activo?: boolean;
  titulo?: string;
  texto?: string;
  /** Foto https, opcional. */
  imagen?: string;
  /** Qué hace el botón: ir a reservar, escribir por WhatsApp, o solo cerrar. */
  boton?: 'reservar' | 'whatsapp' | 'ninguno';
}

/** El % vigente, o 0. La misma regla que v2_descuento_web_pct (0038). */
export function pctDescuentoWeb(cfg: unknown): number {
  const c = cfg as DescuentoWeb | null | undefined;
  const n = Number(c?.pct);
  return c?.activo === true && Number.isInteger(n) && n >= 1 && n <= 90 ? n : 0;
}

/** Igual que round(price * (100 - pct) / 100.0, 2) en Postgres. */
export function precioConDescuento(precio: number | null | undefined, pct: number): number {
  const p = Number(precio);
  if (!Number.isFinite(p) || p <= 0 || !(pct > 0)) return Number.isFinite(p) ? p : 0;
  return Math.round(p * (100 - pct)) / 100;
}

const textoDe = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** El popup listo para enseñar, o null si está apagado o vacío. */
export function popupDe(cfg: unknown): Required<Omit<PopupPagina, 'activo'>> | null {
  const c = cfg as PopupPagina | null | undefined;
  if (c?.activo !== true) return null;
  const titulo = textoDe(c.titulo, 60);
  const texto = textoDe(c.texto, 240);
  if (!titulo && !texto) return null;
  const imagen = typeof c.imagen === 'string' && /^https:\/\/\S+$/.test(c.imagen) ? c.imagen : '';
  const boton = c.boton === 'whatsapp' || c.boton === 'ninguno' ? c.boton : 'reservar';
  return { titulo, texto, imagen, boton };
}

/** Clave para recordar que ya se vio HOY este popup (si cambia el texto, sale otra vez). */
export function clavePopup(slug: string, p: { titulo: string; texto: string }): string {
  let h = 0;
  for (const ch of `${p.titulo}|${p.texto}`) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `tp-popup:${slug}:${(h >>> 0).toString(36)}`;
}
