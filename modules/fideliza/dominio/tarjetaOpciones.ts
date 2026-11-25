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

/** Lo que se guarda en page_style. Ausente = como siempre. */
export interface OpcionesTarjeta {
  /** Cómo se llama cada visita en la tarjeta. Sin él, se sugiere (sugerirNombreVisita). */
  visitas?: NombreVisita;
  /** false = la tarjeta no ofrece «Agregar a Google Wallet». */
  wallet?: boolean;
  /** false = sin la caja «Quiero que … me avise» / «Dejar de recibir avisos». */
  avisos?: boolean;
  /** true = el equipo con rol de caja (barberos) solo suma escaneando el QR del cliente. */
  caja_solo_qr?: boolean;
}

/** Sin elección guardada: barbería → cortes, café → cafés, academia → clases… */
export function sugerirNombreVisita(negocio: string | null | undefined, rubro: Rubro | null | undefined): NombreVisita {
  const n = (negocio ?? '').toLowerCase();
  if (/barber|peluquer|corte/.test(n)) return 'cortes';
  if (/caf[eé]|coffee/.test(n)) return 'cafes';
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

export function nombreVisita(id: string | null | undefined, negocio?: string | null, rubro?: Rubro | null) {
  const elegido = NOMBRES_VISITA.find((x) => x.id === id);
  return elegido ?? NOMBRES_VISITA.find((x) => x.id === sugerirNombreVisita(negocio, rubro))!;
}

/** Wallet y avisos salen salvo que el dueño los apague (false explícito). */
export const conWalletEnTarjeta = (o: OpcionesTarjeta | null | undefined) => o?.wallet !== false;
export const conAvisosEnTarjeta = (o: OpcionesTarjeta | null | undefined) => o?.avisos !== false;

/** El token que lleva el QR de la tarjeta (sql/0003: 'vq' + 24 caracteres). Ni el código impreso ni un nombre. */
export const esTokenQr = (q: string) => /^vq[A-Za-z0-9_-]{16,}$/.test(q.trim());
