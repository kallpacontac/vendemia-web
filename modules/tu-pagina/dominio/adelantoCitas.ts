/**
 * Adelanto para separar una CITA desde la página (secciones.citas), con el comprobante subido ahí.
 *
 * Pedido por Alvaro el 14-nov-2026 para The 24/7 Barber Shop: «50 % de adelanto obligatorio» y
 * «hay que asegurarnos que adjunten las evidencias». La cita nace apartada (pending_payment, con
 * «Requerir pago para confirmar» encendido en el negocio), el cliente yapea el adelanto y sube la
 * captura en la misma página; el dueño la mira en Agenda → «Comprobantes por revisar» y la aprueba.
 * Sin IA: la validación es siempre a mano salvo que alguien ponga `validacion: 'automatica'`.
 *
 * Es lo mismo que el adelanto de las canchas (dominio/canchas.ts), pero en porcentaje del precio
 * del servicio y no en soles fijos. Postgres aplica la misma cuenta (v2_adelanto_minimo, sql/0021).
 */

export interface ConfigCitas {
  /** Porcentaje del precio que confirma la cita (1–100). 0 o vacío = sin adelanto. */
  adelanto?: number;
  /** Dónde llega la captura. Hoy solo la página. */
  comprobante?: 'pagina';
  /** 'manual' (por defecto): la revisa el dueño. 'automatica': la lee la IA como en canchas. */
  validacion?: 'manual' | 'automatica';
  /** «Antes de tu cita»: lo que se le dice al terminar de reservar (tolerancia, sede…). */
  indicaciones?: string[];
  /** Minutos para pagar una cita apartada (10–1440, por defecto 60); menos si la cita es pronto (sql/0024). */
  plazo?: number;
  /** Locales del negocio. Con 2 o más, el cliente elige en cuál al reservar (sql/0023). */
  sedes?: Sede[];
}

export interface Sede {
  /** Lo que se guarda en la cita y ve el dueño: «24/7 Premium». Único. */
  nombre: string;
  direccion: string;
  /** Foto (https) de la fachada, opcional. */
  foto?: string;
  /** Cuántas citas a la vez atiende ESTA sede (su aforo, independiente de las otras). Sin él, el del negocio. */
  capacidad?: number;
}

/** Las sedes válidas: con nombre y dirección, sin repetir nombre, como mucho 6. */
export function sedesDe(cfg: unknown): Sede[] {
  const l = (cfg as ConfigCitas | null | undefined)?.sedes;
  if (!Array.isArray(l)) return [];
  const vistas = new Set<string>();
  const out: Sede[] = [];
  for (const s of l) {
    const nombre = typeof s?.nombre === 'string' ? s.nombre.trim().slice(0, 60) : '';
    const direccion = typeof s?.direccion === 'string' ? s.direccion.trim().slice(0, 120) : '';
    if (!nombre || !direccion || vistas.has(nombre)) continue;
    vistas.add(nombre);
    const cap = Number(s.capacidad);
    out.push({
      nombre, direccion,
      ...(typeof s.foto === 'string' && /^https:\/\/\S+$/.test(s.foto) ? { foto: s.foto } : {}),
      ...(Number.isInteger(cap) && cap >= 1 && cap <= 50 ? { capacidad: cap } : {}),
    });
    if (out.length === 6) break;
  }
  return out;
}

/** «Cómo llegar» en Google Maps, buscando la dirección. */
export const urlMapa = (s: Pick<Sede, 'direccion'>) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.direccion)}`;

/** Las indicaciones que se enseñan: texto, sin vacías, como mucho 6 de 200 caracteres. */
export function indicacionesDe(cfg: unknown): string[] {
  const l = (cfg as ConfigCitas | null | undefined)?.indicaciones;
  if (!Array.isArray(l)) return [];
  return l.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).slice(0, 6).map((t) => t.trim().slice(0, 200));
}

/** El porcentaje vigente, o 0 si no hay adelanto. */
export function porcentajeAdelanto(cfg: unknown): number {
  const n = Number((cfg as ConfigCitas | null | undefined)?.adelanto);
  return Number.isFinite(n) && n >= 1 && n <= 100 ? Math.round(n) : 0;
}

/** Soles que confirman una cita de `precio` con ese porcentaje. Igual que round(…, 2) en Postgres. */
export function montoAdelanto(precio: number | null | undefined, porcentaje: number): number {
  const p = Number(precio);
  if (!(porcentaje > 0) || !Number.isFinite(p) || p <= 0) return 0;
  return Math.round(p * porcentaje) / 100;
}
