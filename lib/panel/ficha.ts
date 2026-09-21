/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA FICHA DE UN CLIENTE · qué se le hizo, qué tiene pendiente, y a quién
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── ⚠️ UN CLIENTE NO ES UNA PERSONA ───────────────────────────────────────
 *
 * Desde el 21-sep (migración 0032) quien escribe no es necesariamente quien
 * recibe el servicio: `appointments.beneficiario`. Una madre reserva el corte
 * de sus dos hijos, y bajo un mismo lead hay tres personas.
 *
 * Por eso aquí no hay «última visita» ni «estilista habitual» del cliente a
 * secas. Sumadas, mezclarían a la madre con los niños: «se atiende con Marco»
 * sería falso para ella si Marco solo les corta el pelo a ellos. Todo lo que
 * describe a una PERSONA se calcula por persona — ver `personasDe()`.
 *
 * ── Vocabulario ───────────────────────────────────────────────────────────
 *
 * Los sellos de «vino / no vino / presunta» NO se redefinen aquí: salen de
 * lib/panel/confirmacion.ts, que es donde vive la diferencia entre lo que
 * confirmó una persona y lo que supuso el reloj. La ficha habla igual que la
 * Agenda y Pedidos, o el mismo hecho se leería distinto según la pantalla.
 */
import type { Cita } from '@/lib/supabase/queries';

/** Estados ya resueltos: van al historial aunque su hora siga en el futuro. */
const RESUELTA = new Set(['cancelled', 'no_show', 'completed']);

/**
 * Lo que cuenta como «cita» al describir a una persona: pasó la hora y no se
 * canceló ni se marcó que no vino.
 *
 * ⚠️ Incluye las `confirmed` con la hora pasada, que nadie ha confirmado que
 * ocurrieran. Por eso la ficha dice «última cita» y no «última visita»: es lo
 * que se puede afirmar. Y `pending_payment` queda fuera — una reserva que nunca
 * se pagó no llegó a ser cita.
 */
const ocurrio = (c: Cita, ahora: Date): boolean =>
  !!c.inicio && c.inicio < ahora && (c.status === 'confirmed' || c.status === 'completed');

export interface Historial {
  /** Lo que tiene por delante, lo más cercano primero. Incluye inscripciones vigentes. */
  proximas: Cita[];
  /** Lo que ya pasó o ya se resolvió, lo más reciente primero. */
  pasadas: Cita[];
}

/**
 * Parte las citas en próximas y pasadas.
 *
 * Una cita va al historial si su estado ya dice qué pasó (cancelada, no vino,
 * completada) aunque su hora sea futura —una cancelación de la semana que viene
 * no es algo «próximo»—, o si su hora ya pasó.
 *
 * Las inscripciones recurrentes no tienen hora (`slot_start` es "sched:…"):
 * mientras no estén resueltas cuentan como próximas, porque son un grupo al que
 * el alumno sigue yendo.
 */
export function separar(citas: Cita[], ahora = new Date()): Historial {
  const proximas: Cita[] = [];
  const pasadas: Cita[] = [];
  for (const c of citas) {
    const resuelta = !!c.status && RESUELTA.has(c.status);
    const yaPaso = !!c.inicio && c.inicio < ahora;
    (resuelta || yaPaso ? pasadas : proximas).push(c);
  }
  const t = (c: Cita) => c.inicio?.getTime() ?? 0;
  // Sin fecha (recurrentes) al final en los dos lados: no se pueden ordenar
  // contra una hora, y ponerlas arriba enterraría la cita de mañana.
  proximas.sort((a, b) => (t(a) || Infinity) - (t(b) || Infinity));
  pasadas.sort((a, b) => t(b) - t(a));
  return { proximas, pasadas };
}

/** «para Jorge (8)», o `''` si la cita es para quien escribe. */
export function paraQuien(c: Cita): string {
  const nombre = c.beneficiario?.trim();
  if (!nombre) return '';
  const edad = c.beneficiario_edad?.trim();
  return edad ? `para ${nombre} (${edad})` : `para ${nombre}`;
}

export interface Persona {
  /** '' = quien escribe. */
  nombre: string;
  edad: string;
  /** Cuántas citas suyas ocurrieron (ver `ocurrio`). 0 si solo tiene reservas futuras, plantones o cancelaciones. */
  citas: number;
  ultima: Date | null;
  /** El profesional que más le ha atendido, si se repite. `null` si no hay patrón. */
  habitual: { employeeId: string; veces: number } | null;
}

/**
 * Las personas que hay detrás de un cliente, cada una con lo suyo.
 *
 * Salen TODAS las que tienen alguna reserva, aunque ninguna haya ocurrido
 * todavía. La hija que solo acumula un plantón y una cancelación también es
 * alguien para quien este cliente reserva, y dejarla fuera haría mentir al
 * título de la sección. Lo que sí se calcula solo con las citas ocurridas es
 * el resumen: `citas`, `ultima` y `habitual`.
 *
 * `habitual` exige al menos dos citas con el mismo profesional. Con una sola,
 * «se atiende con Marco» es una casualidad dicha como si fuera una costumbre.
 */
export function personasDe(citas: Cita[], ahora = new Date()): Persona[] {
  const grupos = new Map<string, Cita[]>();
  for (const c of citas) {
    // Por nombre sin mayúsculas: «Jorge» y «jorge» son el mismo niño escrito
    // en dos conversaciones. `''` es el propio cliente.
    const clave = c.beneficiario?.trim().toLowerCase() ?? '';
    const g = grupos.get(clave);
    if (g) g.push(c);
    else grupos.set(clave, [c]);
  }

  const personas: Persona[] = [];
  for (const [clave, todas] of grupos) {
    const lista = todas.filter((c) => ocurrio(c, ahora));
    const ultima = lista.reduce<Date | null>(
      (u, c) => (c.inicio && (!u || c.inicio > u) ? c.inicio : u),
      null,
    );

    const porEmpleado = new Map<string, number>();
    for (const c of lista) {
      if (c.employee_id) porEmpleado.set(c.employee_id, (porEmpleado.get(c.employee_id) ?? 0) + 1);
    }
    let habitual: Persona['habitual'] = null;
    for (const [employeeId, veces] of porEmpleado) {
      if (veces >= 2 && (!habitual || veces > habitual.veces)) habitual = { employeeId, veces };
    }

    const recientes = [...todas].sort((a, b) => (b.inicio?.getTime() ?? 0) - (a.inicio?.getTime() ?? 0));
    personas.push({
      nombre: clave ? nombreBonito(recientes) : '',
      // La edad, de la reserva más reciente que la diga: si cambió entre una y
      // otra, la última es la que vale.
      edad: clave ? (recientes.find((c) => c.beneficiario_edad?.trim())?.beneficiario_edad?.trim() ?? '') : '',
      citas: lista.length,
      ultima,
      habitual,
    });
  }

  // Quien escribe primero; los demás, del más reciente al más antiguo.
  return personas.sort((a, b) => {
    if (!a.nombre !== !b.nombre) return a.nombre ? 1 : -1;
    return (b.ultima?.getTime() ?? 0) - (a.ultima?.getTime() ?? 0);
  });
}

/**
 * El nombre de una persona tal como se enseña, entre las formas en que se
 * escribió en sus distintas reservas.
 *
 * El nombre lo dicta el cliente por WhatsApp y llega como lo tecleó: «jorge»
 * en una conversación y «Jorge» en otra. La más reciente no sirve si es la
 * que vino en minúsculas. Se prefiere la más reciente que tenga alguna
 * mayúscula —es la que alguien escribió con cuidado— y, si ninguna la tiene,
 * se pone en mayúscula la primera letra. Solo la primera: capitalizar cada
 * palabra convertiría «de la Cruz» en «De La Cruz».
 */
function nombreBonito(recientes: Cita[]): string {
  const formas = recientes.map((c) => c.beneficiario?.trim() ?? '').filter(Boolean);
  const cuidada = formas.find((f) => /[A-ZÁÉÍÓÚÑÜ]/.test(f));
  if (cuidada) return cuidada;
  const f = formas[0] ?? '';
  return f.charAt(0).toLocaleUpperCase('es') + f.slice(1);
}

/**
 * «hoy», «ayer», «hace 5 días», «hace 3 semanas», «hace 4 meses».
 *
 * Grueso a propósito, y por eso no es `cuando()` de format.ts —que a los dos días
 * ya devuelve la fecha—: en un salón «hace 6 semanas» es lo que dice que toca
 * volver a escribirle, y «12 ago» obliga a hacer la cuenta. Tampoco se llama
 * `hace`: ese nombre ya es de format.ts y devuelve una fecha, no un texto.
 */
export function haceCuanto(fecha: Date, ahora = new Date()): string {
  const dias = Math.floor((ahora.getTime() - fecha.getTime()) / 86_400_000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 14) return `hace ${dias} días`;
  if (dias < 60) return `hace ${Math.round(dias / 7)} semanas`;
  return `hace ${Math.round(dias / 30)} meses`;
}
