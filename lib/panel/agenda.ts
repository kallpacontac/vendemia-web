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
import { ocupaHora } from './adelantos';
import { quienDeCita } from './ficha';
import { abiertoEn, diaQueCubre, tramoDe } from './medianoche';

const CLAVES: ClaveDia[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

/*
 * Las citas que ocupan cupo: ocupaHora (lib/panel/adelantos.ts). Una cancelada
 * libera el hueco; una no_show ya pasó; una apartada esperando el pago lo ocupa
 * solo 24 h desde que se creó, como en el bot y en v2_hueco.
 */

export interface Reserva {
  id: string;
  /** Quien recibe la cita: el beneficiario, o el propio lead. */
  cliente: string;
  /** «reserva de Pedro» si la pidió otro; '' si es para quien escribe. */
  deQuien: string;
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
  /** El motivo largo: para el tooltip. */
  bloqueo: string | null;
  /** Texto corto de por qué no se puede reservar ahí. `null` = abierta. */
  cierre: string | null;
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
    slot_start?: string;
    created_at?: number | null;
    beneficiario?: string | null;
    beneficiario_edad?: string | null;
  }[];
  /** El nombre de quien escribe. La celda pinta a quien recibe: ver quienDeCita(). */
  nombrePorLead: Map<string, string>;
  nombrePorTrabajador: Map<string, string>;
  bloqueos: { start: string; end: string; reason: string | null; employee_id: string }[];
  horario: Horario;
  slotMinutos: number;
  /**
   * El equipo, con su horario propio ya parseado ({} = hereda el del negocio).
   * Con equipo, ES el aforo: ver capAt más abajo.
   */
  empleados?: { id: string; activo: boolean; horario: Horario }[];
  /** Si se pide un profesional concreto, la rejilla pasa a ser SU agenda. */
  empleadoId?: string;
}

/** ¿El bloqueo pisa esta franja? Las fechas son texto local: "2026-09-14 09:00". */
const solapa = (b: { start: string; end: string }, inicio: Date, fin: Date): boolean => {
  const bi = new Date(b.start.replace(' ', 'T'));
  const bf = new Date(b.end.replace(' ', 'T'));
  return !Number.isNaN(bi.getTime()) && bi < fin && bf > inicio;
};

/**
 * ¿Este trabajador está en turno a esa hora? Copia de `workingCountAt` +
 * `effectiveEmployeeSchedule` del bot: su horario efectivo es el SUYO ∩ el del
 * negocio, y sin horario propio hereda el del negocio entero.
 */
function enTurnoA(
  emp: { horario: Horario },
  negocio: Horario,
  clave: ClaveDia,
  hora: string,
): boolean {
  // Cada horario puede cerrar pasada la medianoche: lib/panel/medianoche.ts.
  const min = aMinutos(hora);
  if (!abiertoEn(negocio, clave, min)) return false;
  // Sin horario propio: el del negocio, tal cual.
  return Object.keys(emp.horario).length === 0 || abiertoEn(emp.horario, clave, min);
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

  /** Quién puede atender. Un trabajador de baja no cuenta: el bot tampoco lo trae. */
  const activos = (e.empleados ?? []).filter((x) => x.activo);
  const soloUno = e.empleadoId || null;
  const citas = soloUno ? e.citas.filter((c) => c.employee_id === soloUno) : e.citas;

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
  /** Hasta dónde llega la madrugada de los días que cierran pasada la medianoche (0 = ninguno). */
  let madrugada = 0;
  for (const f of dias) {
    const t = tramoDe(e.horario[CLAVES[f.getDay()]]);
    if (!t) continue;
    abre = Math.min(abre, t.abre);
    cierra = Math.max(cierra, Math.min(t.cierra, 1440));
    if (t.cierra > 1440) madrugada = Math.max(madrugada, t.cierra - 1440);
  }
  // Sin horario configurado, una franja razonable para que la rejilla no salga vacía.
  if (!Number.isFinite(abre) || !Number.isFinite(cierra)) {
    abre = 9 * 60;
    cierra = 19 * 60;
  }

  const horas: string[] = [];
  // La madrugada va arriba (00:00…), como en el día al que pertenece por fecha.
  for (let m = 0; m < Math.min(madrugada, abre); m += paso) horas.push(aHora(m));
  for (let m = abre; m < cierra; m += paso) horas.push(aHora(m));

  const totales = { reservado: 0, libre: 0, capacidad: 0 };

  const agenda: DiaAgenda[] = dias.map((fecha) => {
    const clave = CLAVES[fecha.getDay()];
    const iso = isoLocal(fecha);

    const huecos = horas.map((hora) => {
      const min = aMinutos(hora);
      // El día que cubre esta hora: el propio, o el anterior si cerró pasada la medianoche.
      const conf = diaQueCubre(e.horario, clave, min);
      const cerrado = !conf;
      const sillas = conf?.capacity ?? 1;
      const inicio = new Date(fecha);
      inicio.setHours(Math.floor(min / 60), min % 60, 0, 0);
      const fin = new Date(inicio.getTime() + paso * 60000);

      const reservas: Reserva[] = citas
        .filter(
          (c) =>
            c.inicio &&
            c.inicio >= inicio &&
            c.inicio < fin &&
            ocupaHora({ status: c.status ?? 'confirmed', slot_start: c.slot_start ?? '', created_at: c.created_at ?? null }, ahora),
        )
        .map((c) => {
          const quien = quienDeCita({ ...c, slot_start: c.slot_start ?? '' }, e.nombrePorLead.get(c.lead_id));
          return {
            id: c.id,
            cliente: quien.nombre,
            deQuien: quien.deQuien,
            servicio: c.service || 'Cita',
            trabajador: c.employee_id ? (e.nombrePorTrabajador.get(c.employee_id) ?? '') : '',
            estado: c.status,
          };
        });

      /**
       * ⚠️ UN BLOQUEO ES DE UNA PERSONA, NO DEL LOCAL.
       *
       * Antes se cogía el primero que solapara, viniera de quien viniera: las
       * vacaciones de Marco pintaban «Bloqueado» toda la semana aunque Lucía
       * estuviera atendiendo, y el dueño veía su local cerrado sin estarlo.
       */
      const bloqueados = new Set(
        e.bloqueos.filter((b) => solapa(b, inicio, fin)).map((b) => b.employee_id),
      );
      const motivoDe = (id: string): string =>
        e.bloqueos.find((b) => b.employee_id === id && solapa(b, inicio, fin))?.reason ||
        'No disponible';

      /**
       * ⚠️ CUÁNTAS CABEN A LA VEZ LO DECIDE EL BOT. Esto es su regla, copiada.
       *
       * `capAt` en su availability.calendar.ts:
       *
       *   · CON equipo registrado → los trabajadores EN TURNO a esa hora y sin
       *     bloqueo. **Las sillas no se miran.**
       *   · SIN equipo → `capacity` del día del horario, que son las sillas.
       *
       * Y la consecuencia, que no es evidente: en un negocio con equipo, el
       * número de sillas no pinta nada en lo que Mia ofrece. Si hubiera más
       * barberos que sillas, el bot vendería de más — y eso se arregla en el
       * bot, no con una cuenta distinta aquí. Un panel que dijera «copado»
       * mientras Mia sigue vendiendo ese hueco es peor que el fallo original.
       */
      const enTurno = activos.filter(
        (t) => !bloqueados.has(t.id) && enTurnoA(t, e.horario, clave, hora),
      );

      let capacidad: number;
      /** El motivo largo, para el tooltip. */
      let bloqueo: string | null = null;
      /** El texto corto de la celda. `null` = la franja está abierta. */
      let cierre: string | null = null;

      if (soloUno) {
        // La rejilla es la agenda de esa persona: atiende de una en una.
        capacidad = 1;
        if (bloqueados.has(soloUno)) {
          bloqueo = motivoDe(soloUno);
          cierre = 'Bloqueado';
          capacidad = 0;
        } else if (!enTurno.some((t) => t.id === soloUno)) {
          bloqueo = 'Fuera de su horario';
          cierre = 'No trabaja';
          capacidad = 0;
        }
      } else if (activos.length > 0) {
        capacidad = enTurno.length;
        // La franja solo se cierra si NO queda nadie: que falte uno no cierra el local.
        if (capacidad === 0) {
          const hayBloqueo = bloqueados.size > 0;
          bloqueo = hayBloqueo ? motivoDe([...bloqueados][0]) : 'Nadie en turno a esta hora';
          cierre = hayBloqueo ? 'Bloqueado' : 'Sin nadie';
        }
      } else {
        // Sin equipo, manda la silla.
        capacidad = sillas;
        if (bloqueados.size > 0) {
          bloqueo = motivoDe([...bloqueados][0]);
          cierre = 'Bloqueado';
        }
      }

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
        cierre,
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
