/**
 * El día de un negocio de canchas, visto por el dueño: una columna por cancha, una
 * fila por turno, y cuánto dinero suman las reservas de ese día.
 *
 * La rejilla semanal de la agenda cuenta el aforo general del negocio, y aquí cada
 * cancha se ocupa por separado: con ella no se sabe QUÉ cancha está libre a una hora.
 *
 * ⚠️ El dinero de aquí es «el de las reservas de este día», por fecha de la reserva.
 * «Entró» de la Caja es otra pregunta, por fecha de pago: una seña pagada el lunes
 * para jugar el sábado sale en la Caja del lunes y en este tablero del sábado.
 */
import type { Horario } from '@/lib/supabase/types';
import { sumarMin } from '@/modules/tu-pagina/dominio/agenda';
import { filasDelDia, plazoDe, precioTurno, type ConfigCanchas } from '@/modules/tu-pagina/dominio/canchas';

export interface CanchaTablero {
  id: string;
  nombre: string;
  familia: string;
  precio: number | null;
}

export type EstadoCobro = 'cobrada' | 'a_cuenta' | 'por_cobrar' | 'esperando_pago' | 'no_vino';

export interface ReservaTablero {
  id: string;
  cancha: string;
  cliente: string;
  telefono?: string;
  inicio: string;
  fin: string;
  /** Con los consumos cargados a la reserva. */
  total: number;
  pagado: number;
  estado: EstadoCobro;
  /** Una apartada sin pagar: cuándo se creó, en segundos. Pasado el plazo ya no ocupa. */
  apartadaDesde?: number;
}

export type Celda =
  | { tipo: 'libre'; inicio: string; precio: number | null }
  | { tipo: 'pasada'; inicio: string }
  | { tipo: 'reserva'; inicio: string; reserva: ReservaTablero; filas: number }
  /** La sigue tapando la reserva de una fila anterior. */
  | { tipo: 'cubierta'; inicio: string };

export interface ColumnaTablero {
  cancha: CanchaTablero;
  celdas: Celda[];
  libres: number;
}

export interface Tablero {
  filas: string[];
  columnas: ColumnaTablero[];
  reservas: ReservaTablero[];
  resumen: { reservas: number; libres: number; total: number; cobrado: number; porCobrar: number; ocupacion: number };
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** ¿Sigue ocupando su cancha? Una apartada sin pagar, solo dentro de su plazo. */
const vigente = (r: ReservaTablero, plazoMin: number, ahoraSeg: number) =>
  r.estado !== 'esperando_pago' || r.apartadaDesde === undefined || r.apartadaDesde > ahoraSeg - plazoMin * 60;

export function armarTablero(e: {
  canchas: CanchaTablero[];
  reservas: ReservaTablero[];
  horario: Horario;
  paso: number;
  fecha: string;
  /** 'YYYY-MM-DD HH:MM' en Lima. */
  ahora: string;
  cfg: ConfigCanchas;
  ahoraSeg?: number;
}): Tablero {
  const agenda = { horario: e.horario, paso: e.paso, equipo: [], bloqueos: [], ocupados: [] };
  const filas = filasDelDia(agenda, e.fecha);
  const plazo = plazoDe(e.cfg);
  const ahoraSeg = e.ahoraSeg ?? Date.now() / 1000;
  const vivas = e.reservas.filter((r) => vigente(r, plazo, ahoraSeg));
  const dentro = new Set<string>();

  const columnas = e.canchas.map((cancha): ColumnaTablero => {
    const suyas = vivas.filter((r) => r.cancha === cancha.id);
    let libres = 0;
    const celdas = filas.map((inicio, i): Celda => {
      const r = suyas.find((x) => x.inicio < sumarMin(inicio, e.paso) && x.fin > inicio);
      if (r) {
        const previa = filas[i - 1];
        if (previa && r.inicio < sumarMin(previa, e.paso) && r.fin > previa) return { tipo: 'cubierta', inicio };
        dentro.add(r.id);
        const nFilas = filas.slice(i).filter((f) => f < r.fin).length;
        return { tipo: 'reserva', inicio, reserva: r, filas: Math.max(nFilas, 1) };
      }
      if (inicio <= e.ahora) return { tipo: 'pasada', inicio };
      libres += 1;
      return { tipo: 'libre', inicio, precio: precioTurno(e.cfg, cancha, inicio) };
    });
    return { cancha, celdas, libres };
  });

  const reservas = vivas.filter((r) => dentro.has(r.id)).sort((a, b) => a.inicio.localeCompare(b.inicio));
  // «No vino» se queda en la tabla, pero no es dinero que vaya a llegar.
  const conDinero = reservas.filter((r) => r.estado !== 'no_vino');
  const total = conDinero.reduce((s, r) => s + r.total, 0);
  const cobrado = conDinero.reduce((s, r) => s + Math.min(r.pagado, r.total), 0);
  const casillas = columnas.reduce((s, c) => s + c.celdas.filter((x) => x.tipo !== 'pasada').length, 0);
  const libres = columnas.reduce((s, c) => s + c.libres, 0);
  return {
    filas,
    columnas,
    reservas,
    resumen: {
      reservas: conDinero.length,
      libres,
      total: redondear(total),
      cobrado: redondear(cobrado),
      porCobrar: redondear(total - cobrado),
      ocupacion: casillas ? Math.round(((casillas - libres) / casillas) * 100) : 0,
    },
  };
}
