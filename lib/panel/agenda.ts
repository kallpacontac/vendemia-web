/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA REJILLA DE LA AGENDA SE CALCULA AQUÍ, EN EL NAVEGADOR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * No hay endpoint de disponibilidad al que preguntar: `check_availability` es
 * una tool del bot, y el bot no es alcanzable desde internet. Lo que sí hay en
 * Supabase son las tres piezas con las que el propio bot la calcula —el horario
 * de la empresa, las citas y los bloqueos de cada trabajador—, así que el panel
 * las cruza igual.
 *
 * ⚠️ Esto es una FOTO para mirar, no una fuente de verdad para reservar. El
 * cupo lo revalida `book_appointment` en el momento de escribir la fila; si el
 * panel dijera "libre" y el bot dijera "ocupado", manda el bot.
 */
import type { AppointmentStatus, ClaveDia, Horario } from '@/lib/supabase/types';
import { isoLocal } from './format';

const CLAVES: ClaveDia[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

/** Las citas que ocupan cupo. Una cancelada libera el hueco; una no_show ya pasó. */
const OCUPAN: AppointmentStatus[] = ['confirmed', 'pending_payment', 'completed'];

export interface Reserva {
  id: string;
  cliente: string;
  servicio: string;
  trabajador: string;
  estado: AppointmentStatus | null;
}

export interface Hueco {
  hora: string;
  /** Mismo formato que appointments.slot_start: "2026-08-20 16:00". */
  slotStart: string;
  cerrado: boolean;
  pasado: boolean;
  capacidad: number;
  reservas: Reserva[];
  libres: number;
  bloqueo: string | null;
}

export interface DiaAgenda {
  fecha: Date;
  iso: string;
  weekday: string;
  esHoy: boolean;
  huecos: Hueco[];
}

export interface Semana {
  dias: DiaAgenda[];
  horas: string[];
  totales: { reservado: number; libre: number; capacidad: number };
}

interface Entrada {
  citas: {
    id: string;
    inicio: Date | null;
    status: AppointmentStatus | null;
    service: string | null;
    employee_id: string | null;
    lead_id: string;
  }[];
  nombrePorLead: Map<string, string>;
  nombrePorTrabajador: Map<string, string>;
  bloqueos: { start: string; end: string; reason: string | null; employee_id: string }[];
  horario: Horario;
  slotMinutos: number;
}

const aMinutos = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

const aHora = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** El lunes de la semana con el desplazamiento pedido (0 = esta semana). */
export function lunesDe(offset: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // getDay(): 0 es domingo. El lunes de "esta semana" está a -(día-1), y el
  // domingo cuenta como el final de la semana anterior, no como su principio.
  const desplazamiento = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - desplazamiento + offset * 7);
  return d;
}

export function construirSemana(offset: number, e: Entrada): Semana {
  const lunes = lunesDe(offset);
  const paso = e.slotMinutos > 0 ? e.slotMinutos : 30;
  const ahora = Date.now();

  const dias = Array.from({ length: 7 }, (_, i) => {
    const f = new Date(lunes);
    f.setDate(lunes.getDate() + i);
    return f;
  });

  // El rango de horas de la rejilla es la unión de todos los días abiertos: si
  // el sábado abre a las 8 y entre semana a las 9, la fila de las 8 existe y el
  // resto de días la enseñan cerrada. Con el rango de un solo día, los sábados
  // por la mañana desaparecían de la vista.
  let abre = Infinity;
  let cierra = -Infinity;
  for (const f of dias) {
    const d = e.horario[CLAVES[f.getDay()]];
    if (!d || d.closed || !d.open || !d.close) continue;
    abre = Math.min(abre, aMinutos(d.open));
    cierra = Math.max(cierra, aMinutos(d.close));
  }
  // Sin horario configurado, una franja razonable para que la rejilla no salga vacía.
  if (!Number.isFinite(abre) || !Number.isFinite(cierra)) {
    abre = 9 * 60;
    cierra = 19 * 60;
  }

  const horas: string[] = [];
  for (let m = abre; m < cierra; m += paso) horas.push(aHora(m));

  const totales = { reservado: 0, libre: 0, capacidad: 0 };

  const agenda: DiaAgenda[] = dias.map((fecha) => {
    const conf = e.horario[CLAVES[fecha.getDay()]];
    const abierto = Boolean(conf && !conf.closed && conf.open && conf.close);
    const desde = abierto ? aMinutos(conf!.open!) : 0;
    const hasta = abierto ? aMinutos(conf!.close!) : 0;
    const capacidad = conf?.capacity ?? 1;
    const iso = isoLocal(fecha);

    const huecos = horas.map((hora) => {
      const min = aMinutos(hora);
      const cerrado = !abierto || min < desde || min >= hasta;
      const inicio = new Date(fecha);
      inicio.setHours(Math.floor(min / 60), min % 60, 0, 0);
      const fin = new Date(inicio.getTime() + paso * 60000);

      const reservas: Reserva[] = e.citas
        .filter(
          (c) =>
            c.inicio &&
            c.inicio >= inicio &&
            c.inicio < fin &&
            OCUPAN.includes(c.status ?? 'confirmed'),
        )
        .map((c) => ({
          id: c.id,
          cliente: e.nombrePorLead.get(c.lead_id) ?? 'Cliente',
          servicio: c.service || 'Cita',
          trabajador: c.employee_id ? (e.nombrePorTrabajador.get(c.employee_id) ?? '') : '',
          estado: c.status,
        }));

      const bloqueo =
        e.bloqueos.find((b) => {
          const bi = new Date(b.start.replace(' ', 'T'));
          const bf = new Date(b.end.replace(' ', 'T'));
          return !Number.isNaN(bi.getTime()) && bi < fin && bf > inicio;
        })?.reason ?? null;

      const libres = Math.max(0, capacidad - reservas.length);
      if (!cerrado) {
        totales.reservado += reservas.length;
        totales.libre += libres;
        totales.capacidad += capacidad;
      }

      return {
        hora,
        slotStart: `${iso} ${hora}`,
        cerrado,
        pasado: inicio.getTime() < ahora,
        capacidad,
        reservas,
        libres,
        bloqueo,
      };
    });

    return {
      fecha,
      iso,
      weekday: fecha.toLocaleDateString('es-PE', { weekday: 'short' }),
      esHoy: isoLocal(new Date()) === iso,
      huecos,
    };
  });

  return { dias: agenda, horas, totales };
}
