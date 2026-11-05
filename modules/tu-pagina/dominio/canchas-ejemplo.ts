/**
 * Los datos inventados de «Zona Gol»: la misma semana para la página del cliente
 * (/ejemplos/canchas) y para el tablero del dueño (/ejemplos/canchas/panel), de modo
 * que una hora ocupada en una lo esté también en la otra. Deterministas: recargar a
 * media demostración no cambia nada delante de quien mira.
 */
import type { Horario } from '@/lib/supabase/types';
import type { ReservaTablero } from '@/lib/panel/tablero-canchas';
import { sumarDias, sumarMin } from './agenda';
import { precioReserva, type ConfigCanchas } from './canchas';

export const CANCHAS_EJEMPLO = [
  { id: 'c5', nombre: 'Cancha Norte', familia: '5 vs 5', precio: 90 },
  { id: 'c6', nombre: 'Cancha Central', familia: '6 vs 6', precio: 110 },
  { id: 'c7', nombre: 'Cancha Principal', familia: '7 vs 7', precio: 140 },
  { id: 'c9', nombre: 'Cancha Grande', familia: '9 vs 9', precio: 180 },
];

export const ADELANTO_EJEMPLO = 40;
export const CONFIG_EJEMPLO: ConfigCanchas = { activo: true, desde: '18:00', noche: {}, plazo: 30, adelanto: ADELANTO_EJEMPLO, comprobante: 'ambos', validacion: 'automatica' };

const dia = { open: '08:00', close: '23:00', closed: false };
export const HORARIO_EJEMPLO: Horario = { monday: dia, tuesday: dia, wednesday: dia, thursday: dia, friday: dia, saturday: dia, sunday: dia };

export const PASO_EJEMPLO = 60;
const DIAS = 14;
const EQUIPOS = ['Los Cracks FC', 'Carlos Medina', 'Pichanga del jueves', 'Oficina Sur', 'Renzo Salas', 'Real Barrio', 'Lucía Paredes', 'Amigos de la U', 'Deportivo Lince', 'Marco Quispe', 'Los Veteranos', 'Ana Torres'];

/** Reparte sin azar: la misma cancha, día y hora dan siempre lo mismo. */
const mezcla = (a: number, b: number, c: number) => (a * 31 + b * 17 + c * 13 + a * b + b * c) % 100;

function reserva(id: string, cancha: string, cliente: string, inicio: string, turnos: number, ahora: string, semilla: number): ReservaTablero {
  const item = CANCHAS_EJEMPLO.find((c) => c.id === cancha)!;
  const total = precioReserva(CONFIG_EJEMPLO, { ...item, duracion: PASO_EJEMPLO }, inicio, turnos) ?? 0;
  const fin = sumarMin(inicio, PASO_EJEMPLO * turnos);
  // Lo jugado está cobrado. Lo que viene lleva su adelanto, salvo alguna apartada que aún no paga.
  const jugada = fin <= ahora;
  const estado = jugada || semilla % 5 === 0 ? 'cobrada' : semilla % 7 === 0 ? 'esperando_pago' : 'a_cuenta';
  const pagado = estado === 'cobrada' ? total : estado === 'a_cuenta' ? ADELANTO_EJEMPLO : 0;
  return { id, cancha, cliente, inicio, fin, total, pagado, estado };
}

/** Las reservas inventadas de los próximos 14 días, en hora de Lima. */
export function reservasEjemplo(hoy: string, ahora: string): ReservaTablero[] {
  const fuera: ReservaTablero[] = [];
  CANCHAS_EJEMPLO.forEach((c, nCancha) => {
    for (let d = 0; d < DIAS; d++) {
      const fecha = sumarDias(hoy, d);
      for (let h = 8; h < 23; h++) {
        const inicio = `${fecha} ${String(h).padStart(2, '0')}:00`;
        const m = mezcla(nCancha + 1, d + 3, h);
        // Las noches se llenan más que las mañanas, y las canchas grandes menos.
        const umbral = (h >= 18 ? 42 : h >= 12 ? 16 : 9) - nCancha * 3;
        if (m >= umbral) continue;
        const dos = m % 3 === 0 && h < 22;
        fuera.push(reserva(`e-${c.id}-${d}-${h}`, c.id, EQUIPOS[(m + d) % EQUIPOS.length], inicio, dos ? 2 : 1, ahora, m + h));
        if (dos) h += 1;
      }
    }
  });
  // Una hora fija: la guía de la demo cuenta con que mañana a las 18:00 está ocupada.
  const fija = `${sumarDias(hoy, 1)} 18:00`;
  if (!fuera.some((r) => r.cancha === 'c7' && r.inicio < sumarMin(fija, PASO_EJEMPLO) && r.fin > fija)) {
    fuera.push(reserva('e-fija-c7', 'c7', 'Los Cracks FC', fija, 1, ahora, 3));
  }
  return fuera;
}

export interface ReservaDeLaDemo {
  id: string;
  cancha: string;
  cliente: string;
  inicio: string;
  fin: string;
  total: number;
  /** El comprobante de la muestra ya se «validó». */
  validada?: boolean;
}

const CLAVE = 'vendemia-demo-canchas';

/** Lo reservado a mano en la demo: dura lo que la pestaña y solo vive en este navegador. */
export function leerReservasDemo(): ReservaDeLaDemo[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(CLAVE) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function validarReservaDemo(id: string): void {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(leerReservasDemo().map((r) => (r.id === id ? { ...r, validada: true } : r))));
  } catch {
    // Sin almacenamiento, el tablero la enseña todavía apartada.
  }
}

export function guardarReservaDemo(r: ReservaDeLaDemo): void {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify([...leerReservasDemo(), r]));
  } catch {
    // Sin almacenamiento la demo sigue; solo no se ve en el tablero.
  }
}
