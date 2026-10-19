/**
 * ══════════════════════════════════════════════════════════════════════════
 * TU PÁGINA · qué horas quedan libres
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Funciones puras, sin reloj ni zona horaria: todo es texto local de Lima
 * ('YYYY-MM-DD HH:MM', como appointments.slot_start) y `ahora` llega como
 * parámetro. Las usan la página (para pintar las horas) y el servidor (para
 * calcular la `capacidad` que reserva_srv_crear compara con lo ocupado, con
 * un candado por negocio). La misma regla a los dos lados: si la página dice
 * «libre», el servidor no dice «lleno» salvo que alguien se haya colado antes.
 *
 * El aforo de una franja es la regla del bot que ya copia el panel
 * (lib/panel/agenda.ts → capAt): con equipo, los que están en turno y sin
 * bloqueo; sin equipo, las sillas del día (`capacity`, 1 por defecto).
 *
 * Un servicio que dura varias franjas cabe si, en TODO su rato, lo más lleno
 * de cualquier franja queda por debajo del aforo más pequeño. Es la misma
 * cuenta que hace Postgres (0002_tienda_y_reservas.sql).
 *
 * ⚠️ Hasta la etapa 4 (agenda en la nube, motor compartido) esto es una copia
 * más de la regla. Es deliberado y temporal: ver docs/PLAN-TU-PAGINA.md.
 */
import type { ClaveDia, Horario } from '@/lib/supabase/types';

const CLAVES: ClaveDia[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export interface Ocupado {
  inicio: string;
  fin: string;
  /** '' = sin profesional asignado. */
  empleado: string;
}

export interface DatosAgenda {
  horario: Horario;
  /** El paso de la rejilla del negocio (companies.slot_minutes). */
  paso: number;
  equipo: { id: string; nombre: string; horario: Horario }[];
  bloqueos: { empleado: string; inicio: string; fin: string }[];
  ocupados: Ocupado[];
}

export const aMinutos = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

export const aHora = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Día de la semana de 'YYYY-MM-DD' (0 = domingo), sin depender de la zona del equipo. */
export function diaSemana(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD HH:MM' + minutos (puede cruzar la medianoche). */
export function sumarMin(momento: string, min: number): string {
  const [f, h] = momento.split(' ');
  const total = aMinutos(h) + min;
  const dias = Math.floor(total / 1440);
  return `${sumarDias(f, dias)} ${aHora(((total % 1440) + 1440) % 1440)}`;
}

/** El horario de un día, o null si cierra. */
function franjaDelDia(h: Horario, clave: ClaveDia): { abre: number; cierra: number } | null {
  const d = h[clave];
  if (!d || d.closed || !d.open || !d.close) return null;
  const abre = aMinutos(d.open);
  const cierra = aMinutos(d.close);
  return cierra > abre ? { abre, cierra } : null;
}

/** ¿Este profesional trabaja a esa hora? Su horario ∩ el del negocio; sin horario propio, el del negocio. */
function enTurno(emp: { horario: Horario }, negocio: Horario, clave: ClaveDia, min: number): boolean {
  const n = franjaDelDia(negocio, clave);
  if (!n || min < n.abre || min >= n.cierra) return false;
  if (Object.keys(emp.horario).length === 0) return true;
  const p = franjaDelDia(emp.horario, clave);
  if (!p) return false;
  return min >= Math.max(n.abre, p.abre) && min < Math.min(n.cierra, p.cierra);
}

const pisa = (a: { inicio: string; fin: string }, t0: string, t1: string) => a.inicio < t1 && a.fin > t0;

/** El aforo de una franja de `paso` minutos que empieza en `momento`. */
function aforo(d: DatosAgenda, momento: string, paso: number, empleado: string | null): number {
  const [fecha, hora] = momento.split(' ');
  const clave = CLAVES[diaSemana(fecha)];
  const min = aMinutos(hora);
  const fin = sumarMin(momento, paso);
  const bloqueado = (id: string) => d.bloqueos.some((b) => b.empleado === id && pisa(b, momento, fin));
  if (empleado) {
    const e = d.equipo.find((x) => x.id === empleado);
    return e && !bloqueado(e.id) && enTurno(e, d.horario, clave, min) ? 1 : 0;
  }
  if (d.equipo.length > 0) {
    return d.equipo.filter((e) => !bloqueado(e.id) && enTurno(e, d.horario, clave, min)).length;
  }
  const n = franjaDelDia(d.horario, clave);
  if (!n || min < n.abre || min >= n.cierra) return 0;
  return d.horario[clave]?.capacity ?? 1;
}

export interface Decision {
  ok: boolean;
  /** El aforo más pequeño del rato: lo que se le pasa a reserva_srv_crear. */
  capacidad: number;
  libres: number;
}

/**
 * ¿Cabe un servicio de `duracion` minutos que empieza en `inicio`?
 * Con `empleado`, además, esa persona tiene que estar libre todo el rato.
 */
export function decidir(d: DatosAgenda, inicio: string, duracion: number, empleado: string | null): Decision {
  const paso = d.paso > 0 ? d.paso : 30;
  const fin = sumarMin(inicio, duracion);
  let capacidad = Infinity;
  let maxOcupado = 0;
  for (let t = inicio; t < fin; t = sumarMin(t, paso)) {
    const t1 = sumarMin(t, paso);
    capacidad = Math.min(capacidad, aforo(d, t, paso, null));
    maxOcupado = Math.max(maxOcupado, d.ocupados.filter((o) => pisa(o, t, t1)).length);
    if (empleado && aforo(d, t, paso, empleado) === 0) return { ok: false, capacidad: 0, libres: 0 };
  }
  if (!Number.isFinite(capacidad)) capacidad = 0;
  if (empleado && d.ocupados.some((o) => o.empleado === empleado && pisa(o, inicio, fin))) {
    return { ok: false, capacidad, libres: 0 };
  }
  const libres = Math.max(0, capacidad - maxOcupado);
  return { ok: libres > 0, capacidad, libres };
}

export interface HoraLibre {
  hora: string;
  libres: number;
}

/**
 * Las horas en las que cabe el servicio ese día, desde `ahora` (con 30 min de
 * margen: nadie llega a una cita que empieza en cinco minutos).
 */
export function horasLibres(d: DatosAgenda, fecha: string, duracion: number, empleado: string | null, ahora: string): HoraLibre[] {
  const n = franjaDelDia(d.horario, CLAVES[diaSemana(fecha)]);
  if (!n) return [];
  const paso = pasoDelDia(d, fecha);
  const limite = sumarMin(ahora, 30);
  const fuera: HoraLibre[] = [];
  for (let m = n.abre; m + duracion <= n.cierra; m += paso) {
    const inicio = `${fecha} ${aHora(m)}`;
    if (inicio <= limite) continue;
    const r = decidir({ ...d, paso }, inicio, duracion, empleado);
    if (r.ok) fuera.push({ hora: aHora(m), libres: r.libres });
  }
  return fuera;
}

/** El paso de la rejilla ese día: el del día si lo tiene, si no el del negocio. */
export const pasoDelDia = (d: Pick<DatosAgenda, 'horario' | 'paso'>, fecha: string): number =>
  (d.horario[CLAVES[diaSemana(fecha)]]?.slot_minutes ?? d.paso) || 30;

/** ¿Abre ese día? Para no ofrecer días cerrados. */
export const abreEl = (d: Pick<DatosAgenda, 'horario'>, fecha: string) =>
  franjaDelDia(d.horario, CLAVES[diaSemana(fecha)]) !== null;
