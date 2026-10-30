/**
 * ══════════════════════════════════════════════════════════════════════════
 * MI PÁGINA · canchas: una tabla de canchas por horas, con precio de noche
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Un negocio de canchas (fútbol 7, fútbol 6, vóley…) no reserva «un servicio
 * con alguien»: el cliente mira el día en una tabla (columnas = canchas, filas
 * = horas, en cada casilla el precio) y toca una casilla libre. Alvaro, 29-oct-2026,
 * con la página de DeporPlaza de referencia.
 *
 * Cómo se monta sin tablas nuevas para las canchas:
 *   · Cada CANCHA es una cosa del catálogo que se reserva (tipo 'cita'):
 *     «Cancha 1 · Fútbol 7», precio de día, duración del turno (60 min).
 *     Se crea y se edita en Catálogo, como cualquier servicio.
 *   · Lo que es propio de las canchas va en la página (`secciones.canchas`):
 *     encendido, desde qué hora rige el precio de noche, si el fin de semana
 *     va entero a precio de noche, y el precio de noche de cada cancha.
 *   · Cada cancha se ocupa POR SEPARADO: una reserva de la Cancha 1 no quita
 *     sitio a la Cancha 2. No se mira el aforo general del negocio.
 *
 * La reserva entra en la agenda de siempre (appointments + appointment_services
 * con el precio de esa hora): panel, caja y adelanto funcionan igual. Postgres
 * rehace la cuenta de «libre» con un candado: agenda_srv_reservar, tipo 'cancha'
 * (modules/tu-pagina/sql/0011).
 *
 * Sin canchas combinadas (F9 = 1 + 2): este negocio no las tiene. Si llegan,
 * la cancha combinada tendría que ocupar las suyas y al revés.
 */
import { diaQueCubre, tramoDe } from '@/lib/panel/medianoche';
import type { ClaveDia } from '@/lib/supabase/types';
import { aMinutos, diaSemana, pasoDelDia, sumarMin, type DatosAgenda } from '@/modules/tu-pagina/dominio/agenda';
import { soles, type Escaparate, type Item } from '@/modules/tu-pagina/dominio/tienda';
import { fechaCorta } from '@/modules/tu-pagina/dominio/envio';

const CLAVES: ClaveDia[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export interface ConfigCanchas {
  activo?: boolean;
  /** Desde qué hora rige el precio de noche ('18:00'). Hasta el cierre, también pasada la medianoche. */
  desde?: string;
  /** Sábado y domingo, todo el día a precio de noche. */
  finde?: boolean;
  /** catalog.id → precio de noche. Sin precio, la cancha cuesta lo mismo todo el día. */
  noche?: Record<string, number>;
  /**
   * Minutos que una reserva apartada sin pagar («Requerir pago para confirmar») sigue
   * ocupando su cancha: 15 min a 24 h. Pasado el plazo se ofrece otra vez y, si otro
   * la reserva, la apartada se cancela. Sin elegir, 24 h (como el bot). sql/0011, v2_cancha_plazo.
   */
  plazo?: number;
}

export const PLAZOS = [30, 60, 120, 1440] as const;

/** El plazo válido (15–1440 min); 24 h si no se eligió. */
export const plazoDe = (cfg: ConfigCanchas): number => Math.min(Math.max(Math.round(Number(cfg.plazo) || 1440), 15), 1440);

/** Cuántos turnos seguidos se pueden reservar de una vez. */
export const MAX_TURNOS = 4;

const HORA = /^\d{2}:\d{2}$/;

/** ¿Hay tabla de canchas? Necesita reservar encendido. */
export const conCanchas = (s: { reservar?: boolean; canchas?: ConfigCanchas } | null | undefined): boolean =>
  Boolean(s?.reservar && s.canchas?.activo);

/** Las canchas de la página: lo que se reserva con día y hora (no los grupos ni los productos). */
export const canchasDe = (esc: Pick<Escaparate, 'items'>): Item[] => esc.items.filter((i) => i.tipo === 'cita');

/** ¿Este inicio va a precio de noche? La madrugada (antes de las 06:00) también es noche. */
export function esNoche(cfg: ConfigCanchas, inicio: string): boolean {
  const hora = inicio.slice(11, 16);
  if (cfg.finde) {
    const d = diaSemana(inicio.slice(0, 10));
    if (d === 0 || d === 6) return true;
  }
  if (hora < '06:00') return true;
  return HORA.test(cfg.desde ?? '') && hora >= (cfg.desde as string);
}

/** El precio de UN turno que empieza en `inicio`. null = a consultar. */
export function precioTurno(cfg: ConfigCanchas, item: Pick<Item, 'id' | 'precio'>, inicio: string): number | null {
  const noche = cfg.noche?.[item.id];
  if (typeof noche === 'number' && noche >= 0 && esNoche(cfg, inicio)) return noche;
  return item.precio;
}

/** El precio de `turnos` turnos seguidos. null si alguno es «a consultar». */
export function precioReserva(cfg: ConfigCanchas, item: Pick<Item, 'id' | 'precio' | 'duracion'>, inicio: string, turnos: number): number | null {
  let total = 0;
  for (let i = 0; i < turnos; i++) {
    const p = precioTurno(cfg, item, sumarMin(inicio, i * item.duracion));
    if (p === null) return null;
    total += p;
  }
  return total;
}

const pisa = (a: { inicio: string; fin: string }, t0: string, t1: string) => a.inicio < t1 && a.fin > t0;

/**
 * ¿Abierto el negocio en todo el rato? En cada paso de la rejilla y en el último
 * minuto (de 23:30 a 00:30 no cabe si cierra a las 00:00), sin mirar el aforo.
 */
function abiertoTodo(agenda: DatosAgenda, inicio: string, minutos: number): boolean {
  const paso = pasoDelDia(agenda, inicio.slice(0, 10));
  const ultimo = sumarMin(inicio, minutos - 1);
  const abierto = (t: string) => diaQueCubre(agenda.horario, CLAVES[diaSemana(t.slice(0, 10))], aMinutos(t.slice(11))) !== null;
  for (let t = inicio; t < ultimo; t = sumarMin(t, paso)) if (!abierto(t)) return false;
  return abierto(ultimo);
}

/**
 * ¿Está libre esta cancha en todo el rato? Abierto y sin otra reserva de ESTA
 * cancha que lo pise; una apartada sin pagar cuenta solo dentro de su plazo.
 * La misma cuenta que v2_cancha_motivo (sql/0011).
 */
export function canchaLibre(agenda: DatosAgenda, item: string, inicio: string, minutos: number, plazo = 1440, ahoraSeg = Date.now() / 1000): boolean {
  const fin = sumarMin(inicio, minutos);
  const viva = (o: DatosAgenda['ocupados'][number]) => o.apartadaDesde === undefined || o.apartadaDesde > ahoraSeg - plazo * 60;
  return abiertoTodo(agenda, inicio, minutos) && !agenda.ocupados.some((o) => o.item === item && viva(o) && pisa(o, inicio, fin));
}

/**
 * Las filas de la tabla de un día: cada turno desde que abre hasta que cierra,
 * también pasada la medianoche. El paso es el del día (60 min en una cancha).
 */
export function filasDelDia(agenda: DatosAgenda, fecha: string): string[] {
  const t = tramoDe(agenda.horario[CLAVES[diaSemana(fecha)]]);
  if (!t) return [];
  const paso = pasoDelDia(agenda, fecha);
  const filas: string[] = [];
  for (let m = t.abre; m < t.cierra; m += paso) filas.push(sumarMin(`${fecha} 00:00`, m));
  return filas;
}

export type EstadoCasilla = 'libre' | 'ocupada' | 'pasada' | 'cerrada';

/** Lo que pinta cada casilla. Con 30 min de margen: nadie llega a una cancha que empieza en cinco. */
export function estadoCasilla(agenda: DatosAgenda, item: Item, inicio: string, ahora: string, plazo = 1440): EstadoCasilla {
  if (inicio <= sumarMin(ahora, 30)) return 'pasada';
  if (!abiertoTodo(agenda, inicio, item.duracion)) return 'cerrada';
  return canchaLibre(agenda, item.id, inicio, item.duracion, plazo) ? 'libre' : 'ocupada';
}

/** Limpia lo que llega del panel: precios sin negativos ni texto, hora válida. */
export function normalizarCanchas(c: ConfigCanchas): ConfigCanchas {
  const noche: Record<string, number> = {};
  for (const [id, v] of Object.entries(c.noche ?? {})) {
    const n = Number(v);
    if (id && Number.isFinite(n) && n >= 0) noche[id] = Math.round(n * 100) / 100;
  }
  return { activo: Boolean(c.activo), desde: HORA.test(c.desde ?? '') ? c.desde : '18:00', finde: Boolean(c.finde), noche, plazo: plazoDe(c) };
}

/** El WhatsApp que el cliente manda al terminar: sin bot, es lo único que lee el dueño. */
export function mensajeCancha(codigo: string, r: { cancha: string; inicio: string; minutos: number; precio: number | null; nombre: string }): string {
  return [
    `Hola, reservé una cancha en tu página (${codigo}):`,
    `• ${r.cancha}`,
    `• ${fechaCorta(r.inicio.slice(0, 10))}, de ${r.inicio.slice(11, 16)} a ${sumarMin(r.inicio, r.minutos).slice(11, 16)}`,
    ...(r.precio !== null ? [`• ${soles(r.precio)}`] : []),
    `A nombre de: ${r.nombre.trim()}`,
  ].join('\n');
}
