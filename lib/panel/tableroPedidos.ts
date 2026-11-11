/**
 * ══════════════════════════════════════════════════════════════════════════
 * TABLERO DE PEDIDOS · Nuevo · Preparando · Listo · Entregado hoy
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Junta en un tablero lo que llega por WhatsApp (orders) y por la página sin agenda
 * en la nube (pedidos_web). Las columnas siguen la ENTREGA; el cobro va como sello en
 * la tarjeta, porque orders.status lo mezcla todo y 'delivered' cuenta como cobrado
 * (tu-pagina/sql/0019). Nada de aquí escribe: solo decide en qué columna va cada cosa.
 *
 * «Por cobrar» va antes de Nuevos y no es una etapa guardada: es un pedido nuevo al que
 * le falta lo que el negocio pide pagar antes (orders.pagar_antes, sql/0020). Al pagarlo,
 * o si el dueño decide prepararlo igual, sigue su camino.
 */

import type { Pedido } from '@/lib/supabase/queries';

export type Etapa = 'nuevo' | 'preparando' | 'listo' | 'entregado';
export const ETAPAS: Etapa[] = ['nuevo', 'preparando', 'listo', 'entregado'];

/** Lo que se ve: las etapas y, delante, lo que espera el pago del cliente. */
export type Columna = 'por_cobrar' | Etapa;
export const COLUMNAS: Columna[] = ['por_cobrar', ...ETAPAS];

/** Comida se prepara; una tienda empaca. Lo demás se dice igual. */
export type Rubro = 'comida' | 'tienda';

export interface Linea {
  cantidad: number;
  nombre: string;
  opcion?: string;
}

export interface Tarjeta {
  id: string;
  /** 'pedido': tabla orders (Mia y la página con agenda en la nube). 'pagina': pedidos_web. */
  fuente: 'pedido' | 'pagina';
  codigo: string;
  cliente: string;
  lineas: Linea[];
  total: number;
  entrega: 'delivery' | 'recojo' | null;
  direccion: string;
  nota: string;
  ubicacion: string;
  pagaraCon: string;
  etapa: Etapa;
  creado: Date | null;
  /** Cuándo pasó a su columna. Sin dato, la hora del pedido. */
  movido: Date | null;
  /** null: no se sabe (pedidos_web no lleva el cobro). */
  cobro: 'falta' | 'cobrado' | null;
  /** status 'delivered': ya cuenta en la Caja y no vuelve atrás. */
  entregaFirme: boolean;
  /** Lo que el negocio pedía pagar antes de preparar, guardado al nacer el pedido. 0: contra entrega. */
  pagarAntes: number;
  /** Lo ya pagado con importe (adelantos). */
  pagado: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Cuánto falta de lo que había que pagar antes. 0 si ya está o si no se pedía. */
export const faltaAntes = (t: Pick<Tarjeta, 'cobro' | 'pagarAntes' | 'pagado'>): number =>
  t.cobro === 'falta' ? Math.max(0, r2(t.pagarAntes - t.pagado)) : 0;

/** Cuánto falta para cobrarlo entero. */
export const faltaTotal = (t: Pick<Tarjeta, 'cobro' | 'total' | 'pagado'>): number =>
  t.cobro === 'falta' ? Math.max(0, r2(t.total - t.pagado)) : 0;

export const columnaDe = (t: Tarjeta): Columna => (t.etapa === 'nuevo' && faltaAntes(t) > 0 ? 'por_cobrar' : t.etapa);

/** Lo que no se entregó en una semana ya no es del día: va al historial. */
export const DIAS_EN_TABLERO = 7;

/** Más de esto en Nuevo sin que nadie lo confirme: se marca. */
export const MINUTOS_TARDE = 10;

export function etapaDePedido(status: string | null | undefined, etapa: string | null | undefined): Etapa | null {
  if (status === 'cancelled') return null;
  if (status === 'delivered') return 'entregado';
  return etapa === 'preparando' || etapa === 'listo' || etapa === 'entregado' ? etapa : 'nuevo';
}

const DE_WEB: Record<string, Etapa> = { nuevo: 'nuevo', confirmado: 'preparando', listo: 'listo', entregado: 'entregado' };
const A_WEB: Record<Etapa, string> = { nuevo: 'nuevo', preparando: 'confirmado', listo: 'listo', entregado: 'entregado' };

export const etapaDeWeb = (estado: string | null | undefined): Etapa | null => DE_WEB[estado ?? ''] ?? null;
export const estadoWeb = (etapa: Etapa): string => A_WEB[etapa];

/** El valor de orders.etapa: Nuevo se guarda vacío. */
export const etapaGuardada = (etapa: Etapa): string => (etapa === 'nuevo' ? '' : etapa);

export function siguiente(etapa: Etapa): Etapa | null {
  const i = ETAPAS.indexOf(etapa);
  return i >= 0 && i < ETAPAS.length - 1 ? ETAPAS[i + 1] : null;
}

export function anterior(t: Tarjeta): Etapa | null {
  if (t.entregaFirme) return null;
  const i = ETAPAS.indexOf(t.etapa);
  return i > 0 ? ETAPAS[i - 1] : null;
}

export function titulos(rubro: Rubro): Record<Columna, string> {
  return { por_cobrar: 'Por cobrar', nuevo: 'Nuevos', preparando: rubro === 'comida' ? 'Preparando' : 'Por empacar', listo: 'Listos', entregado: 'Entregados hoy' };
}

/** Lo que dice el botón que lleva la tarjeta a la siguiente columna. */
export function textoAvanzar(t: Pick<Tarjeta, 'etapa' | 'entrega'>): string | null {
  if (t.etapa === 'nuevo') return 'Confirmar';
  if (t.etapa === 'preparando') return t.entrega === 'delivery' ? 'En camino' : 'Listo';
  if (t.etapa === 'listo') return 'Entregado';
  return null;
}

/** Cómo se dice «Listo» en esa tarjeta. */
export const estadoListo = (entrega: Tarjeta['entrega']): string =>
  entrega === 'delivery' ? 'En camino' : entrega === 'recojo' ? 'Para recoger' : 'Listo';

const mismoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** ¿Va en el tablero? Entregados, solo los de hoy; lo demás, la última semana. */
export function enTablero(t: Tarjeta, ahora: Date): boolean {
  if (t.etapa === 'entregado') {
    const cuando = t.movido ?? t.creado;
    return Boolean(cuando && mismoDia(cuando, ahora));
  }
  if (!t.creado) return true;
  return ahora.getTime() - t.creado.getTime() <= DIAS_EN_TABLERO * 86_400_000;
}

/**
 * Lo que lleva más tiempo esperando, primero. Entregados: lo último, arriba.
 * En Nuevos manda la hora del pedido: uno devuelto a Nuevos sigue siendo el que más espera.
 */
export function ordenar(tarjetas: Tarjeta[]): Record<Columna, Tarjeta[]> {
  const cols: Record<Columna, Tarjeta[]> = { por_cobrar: [], nuevo: [], preparando: [], listo: [], entregado: [] };
  for (const t of tarjetas) cols[columnaDe(t)].push(t);
  const t0 = (t: Tarjeta) => ((t.etapa === 'nuevo' ? t.creado : t.movido) ?? t.creado)?.getTime() ?? 0;
  for (const e of COLUMNAS) cols[e].sort((a, b) => (e === 'entregado' ? t0(b) - t0(a) : t0(a) - t0(b)));
  return cols;
}

export const minutosDesde = (d: Date | null, ahora: Date): number | null =>
  d ? Math.max(0, Math.floor((ahora.getTime() - d.getTime()) / 60_000)) : null;

export function espera(min: number | null): string {
  if (min === null) return '';
  if (min < 1) return 'ahora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h ${min % 60 ? `${min % 60} min` : ''}`.trim() : `${Math.floor(h / 24)} d`;
}

const fecha = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const entregaDe = (v: string | null | undefined): Tarjeta['entrega'] =>
  v === 'delivery' ? 'delivery' : v === 'pickup' || v === 'recojo' ? 'recojo' : null;

/** `pagado`: lo pagado con importe. `conCobroPrevio`: falso sin la agenda en la nube (los pagos son del bot). */
export function tarjetaDePedido(p: Pedido, cliente: string, faltaCobrar: boolean, pagado = 0, conCobroPrevio = true): Tarjeta | null {
  const etapa = etapaDePedido(p.status, p.etapa);
  if (!etapa) return null;
  return {
    id: p.id,
    fuente: 'pedido',
    codigo: `#${p.id.replace(/-/g, '').slice(-4).toUpperCase()}`,
    cliente,
    lineas: p.articulos.map((a) => ({ cantidad: Number(a.quantity) || 1, nombre: a.name })),
    total: Number(p.total) || 0,
    entrega: entregaDe(p.delivery_option),
    direccion: p.delivery_address ?? '',
    nota: p.nota ?? '',
    ubicacion: p.ubicacion ?? '',
    pagaraCon: p.pagara_con ?? '',
    etapa,
    creado: p.creado,
    movido: fecha(p.etapa_at) ?? p.creado,
    cobro: faltaCobrar ? 'falta' : 'cobrado',
    entregaFirme: p.status === 'delivered',
    pagarAntes: conCobroPrevio ? Number(p.pagar_antes) || 0 : 0,
    pagado: Number(pagado) || 0,
  };
}

export interface PedidoWebFila {
  id: string;
  codigo: string;
  nombre: string;
  lineas: { nombre?: string; opcion?: string; cantidad?: number }[] | null;
  total: number | string | null;
  entrega: string | null;
  direccion: string | null;
  referencia: string | null;
  nota: string | null;
  ubicacion?: string | null;
  pagara_con?: string | null;
  estado: string;
  creado_at: string | null;
  cambiado_at: string | null;
}

export function tarjetaDeWeb(w: PedidoWebFila): Tarjeta | null {
  const etapa = etapaDeWeb(w.estado);
  if (!etapa) return null;
  const creado = fecha(w.creado_at);
  return {
    id: w.id,
    fuente: 'pagina',
    codigo: w.codigo,
    cliente: w.nombre,
    lineas: (w.lineas ?? []).map((l) => ({ cantidad: Number(l.cantidad) || 1, nombre: l.nombre ?? '', opcion: l.opcion || undefined })),
    total: Number(w.total) || 0,
    entrega: entregaDe(w.entrega),
    direccion: [w.direccion, w.referencia ? `(${w.referencia})` : ''].filter(Boolean).join(' '),
    nota: w.nota ?? '',
    ubicacion: w.ubicacion ?? '',
    pagaraCon: w.pagara_con ?? '',
    etapa,
    creado,
    movido: etapa === 'nuevo' ? creado : fecha(w.cambiado_at) ?? creado,
    cobro: null,
    entregaFirme: false,
    pagarAntes: 0,
    pagado: 0,
  };
}
