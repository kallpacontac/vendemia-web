/**
 * Lo que el dueño prende o apaga de la tarjeta del cliente, y cómo se llama
 * cada visita en ella. Va en loyalty_settings.page_style (sin SQL nuevo) y se
 * edita en «Mi club». Sin nada guardado, todo sigue como antes: Wallet y la
 * caja de avisos a la vista, y el nombre de la visita sugerido por el rubro.
 *
 * 25-nov-2026, pedido de The 24/7: «Últimos movimientos» → «Últimos cortes /
 * cafés / visitas» según el negocio; Wallet y la caja de avisos, apagables.
 * Los avisos flotantes de instalar y activar (AvisoInstalar, AvisoActivar) NO
 * dependen de esto: tienen su propia lógica de cuándo salir y se conservan.
 */
import type { Rubro } from './sellos';

export const NOMBRES_VISITA = [
  { id: 'visitas', art: 'una', una: 'Visita', titulo: 'Tus últimas visitas' },
  { id: 'cortes', art: 'un', una: 'Corte', titulo: 'Tus últimos cortes' },
  { id: 'cafes', art: 'un', una: 'Café', titulo: 'Tus últimos cafés' },
  { id: 'compras', art: 'una', una: 'Compra', titulo: 'Tus últimas compras' },
  { id: 'pedidos', art: 'un', una: 'Pedido', titulo: 'Tus últimos pedidos' },
  { id: 'clases', art: 'una', una: 'Clase', titulo: 'Tus últimas clases' },
  { id: 'citas', art: 'una', una: 'Cita', titulo: 'Tus últimas citas' },
] as const;

export type NombreVisita = (typeof NOMBRES_VISITA)[number]['id'];
export const IDS_NOMBRE_VISITA = NOMBRES_VISITA.map((n) => n.id) as [NombreVisita, ...NombreVisita[]];
/** 26-nov-2026: «Otro…», la palabra la escribe el dueño (Lavado, Sesión, Uñas…). */
export type EleccionVisita = NombreVisita | 'otro';
export const IDS_ELECCION_VISITA = [...IDS_NOMBRE_VISITA, 'otro'] as [EleccionVisita, ...EleccionVisita[]];
export const MAX_VISITA = 20;

/** Lo que usan la tarjeta, la vista previa y el panel. */
export interface ComoSeLlama { id: EleccionVisita; art: 'un' | 'una'; una: string; titulo: string }

/** «Sesión» → una, «Lavado» → un. Lo de siempre en castellano; si falla, el dueño cambia la palabra. */
export const articuloDe = (palabra: string): 'un' | 'una' =>
  /(a|ión|dad|tad|tud|umbre|is)$/i.test(palabra.trim()) && !/(día|mapa|problema|tema|sistema|programa)$/i.test(palabra.trim()) ? 'una' : 'un';
/** «Sesión» → sesiones, «Lavado» → lavados, «Luz» → luces. Solo la propuesta: el plural se puede corregir. */
export function pluralDe(palabra: string): string {
  const p = palabra.trim();
  if (!p) return '';
  if (/[aeiouáéó]$/i.test(p)) return `${p}s`;
  if (/z$/i.test(p)) return `${p.slice(0, -1)}ces`;
  if (/ión$/i.test(p)) return `${p.slice(0, -3)}iones`;
  if (/[sx]$/i.test(p) && !/[áéíóú]/i.test(p.slice(-3))) return p;
  return `${p}es`;
}
const capital = (t: string) => t.replace(/^./, (c) => c.toUpperCase());

/** Lo que se guarda en page_style. Ausente = como siempre. */
export interface OpcionesTarjeta {
  /** Cómo se llama cada visita en la tarjeta. Sin él, se sugiere (sugerirNombreVisita). */
  visitas?: EleccionVisita;
  /** Con visitas 'otro': la palabra en singular y en plural («Lavado», «lavados»). */
  visita_una?: string;
  visita_varias?: string;
  /** false = la tarjeta no ofrece «Agregar a Google Wallet». */
  wallet?: boolean;
  /**
   * false = el pase de Google Wallet no lleva el enlace a la página del negocio
   * (ni en «Enlaces» del pase ni como página principal). 26-nov-2026, The 24/7.
   */
  wallet_enlace?: boolean;
  /** false = sin la caja «Quiero que … me avise» / «Dejar de recibir avisos». */
  avisos?: boolean;
  /** true = el equipo con rol de caja (barberos) solo suma escaneando el QR del cliente. */
  caja_solo_qr?: boolean;
}

/**
 * Sin elección guardada: barbería → cortes, café → cafés, academia → clases…
 * `modo` es el business_mode del panel (26-nov-2026): si el nombre no da pista, una academia o
 * un gimnasio arrancan en «clases» y una tienda en «compras». La tarjeta pública no lo tiene y
 * sigue con nombre + rubro; por eso Mi club guarda lo elegido al publicar.
 */
export function sugerirNombreVisita(negocio: string | null | undefined, rubro: Rubro | null | undefined, modo?: string | null): NombreVisita {
  const n = (negocio ?? '').toLowerCase();
  if (/barber|peluquer|corte/.test(n)) return 'cortes';
  if (/caf[eé]|coffee/.test(n)) return 'cafes';
  if (modo === 'recurring_appointment') return 'clases';
  if (modo === 'ecommerce') return 'compras';
  switch (rubro) {
    case 'cafe':
      return 'cafes';
    case 'comida':
      return 'pedidos';
    case 'bebidas':
    case 'tienda':
      return 'compras';
    case 'deporte':
      return 'clases';
    default:
      return 'visitas';
  }
}

export function nombreVisita(
  id: string | null | undefined,
  negocio?: string | null,
  rubro?: Rubro | null,
  propio?: { visita_una?: string | null; visita_varias?: string | null } | null,
  modo?: string | null,
): ComoSeLlama {
  const una = (propio?.visita_una ?? '').trim().slice(0, MAX_VISITA);
  if (id === 'otro' && una) {
    const art = articuloDe(una);
    const varias = ((propio?.visita_varias ?? '').trim() || pluralDe(una)).slice(0, MAX_VISITA + 4).toLowerCase();
    return { id: 'otro', art, una: capital(una), titulo: `Tus ${art === 'una' ? 'últimas' : 'últimos'} ${varias}` };
  }
  const elegido = NOMBRES_VISITA.find((x) => x.id === id);
  return elegido ?? NOMBRES_VISITA.find((x) => x.id === sugerirNombreVisita(negocio, rubro, modo))!;
}

/** Wallet y avisos salen salvo que el dueño los apague (false explícito). */
export const conWalletEnTarjeta = (o: OpcionesTarjeta | null | undefined) => o?.wallet !== false;
export const conEnlaceEnWallet = (o: OpcionesTarjeta | null | undefined) => o?.wallet_enlace !== false;
export const conAvisosEnTarjeta = (o: OpcionesTarjeta | null | undefined) => o?.avisos !== false;

/** El token que lleva el QR de la tarjeta (sql/0003: 'vq' + 24 caracteres). Ni el código impreso ni un nombre. */
export const esTokenQr = (q: string) => /^vq[A-Za-z0-9_-]{16,}$/.test(q.trim());
