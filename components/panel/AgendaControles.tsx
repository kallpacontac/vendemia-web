'use client';

/**
 * Los controles de la Agenda. Menos y con propósito (17-nov-2026, Alvaro: «demasiados botones,
 * hasta yo me saturo; cada uno debe tener un propósito»):
 *
 *   · Tres pestañas, y debajo, en una frase, para qué sirve la elegida.
 *   · Las flechas de la semana (o del día en el celular); «Hoy» solo si te has ido a otra.
 *   · Fuera: «Reservas / Disponibilidad» (la segunda vista era la de la página pública: no la
 *     usaba nadie) y «N reservas · N cupos · N % ocupación» (2 004 cupos no le dice nada a nadie).
 *   · La sede ya no va aquí: se elige una vez arriba, en la cabecera (SedeGlobal).
 */
import { CalendarCheck, CheckCircle, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import ComboPanel from './ComboPanel';
import Campana from './Campana';

type Tab = 'semana' | 'proximas' | 'pasadas';
type Props = {
  recurrente: boolean; movil: boolean; tab: Tab; alTab: (tab: Tab) => void;
  proximas: number; pendientes: number; profesionales: { id: string; name: string; activo: boolean }[];
  profesional: string; alProfesional: (id: string) => void;
  fecha: string;
  anterior: () => void; siguiente: () => void; hoy: () => void;
  /** ¿Ya está en hoy (o esta semana)? Entonces «Hoy» sobra. */
  enHoy: boolean;
  /** Con canchas, la primera pestaña es el tablero del día, que trae sus propios controles. */
  canchas?: boolean;
};

const AYUDA: Record<Tab, string> = {
  semana: 'Quién viene y a qué hora. Para agendar, «Nueva cita».',
  proximas: 'Lo que viene, en lista: mover de hora, cambiar de barbero o cancelar.',
  pasadas: 'Ya pasaron: marca si vino. El cobro se hace en Caja.',
};

export default function AgendaControles(p: Props) {
  const calendario = !p.recurrente && p.tab === 'semana' && !p.canchas;
  return (
    <section className="agenda-controls agenda-controls--simple" aria-label="Controles de la agenda">
      <div className="agenda-controls__fila">
        <div className="view-toggle tabs-agenda" role="tablist" aria-label="Qué ver">
          <button type="button" role="tab" className={p.tab === 'semana' ? 'active' : ''} aria-selected={p.tab === 'semana'} onClick={() => p.alTab('semana')}>
            <CalendarCheck size={15} /> {p.recurrente ? 'Grupos' : p.canchas ? 'Canchas' : 'Calendario'}
          </button>
          {(!p.recurrente || p.proximas > 0) && (
            <button type="button" role="tab" className={p.tab === 'proximas' ? 'active' : ''} aria-selected={p.tab === 'proximas'} onClick={() => p.alTab('proximas')}>
              <Clock size={15} /> Próximas{p.proximas > 0 ? ` · ${p.proximas}` : ''}
            </button>
          )}
          {/* Con canchas no: lo que ya pasó sale en la misma pantalla del tablero (menos pestañas). */}
          {!p.canchas && (!p.recurrente || p.pendientes > 0) && (
            <button type="button" role="tab" className={`${p.tab === 'pasadas' ? 'active' : ''}${p.pendientes > 0 ? ' con-pendientes' : ''}`}
              aria-selected={p.tab === 'pasadas'} onClick={() => p.alTab('pasadas')}>
              {p.pendientes > 0 ? <Campana size={15} /> : <CheckCircle size={15} />} ¿Vino?{p.pendientes > 0 ? ` · ${p.pendientes}` : ''}
            </button>
          )}
        </div>
        {calendario && (
          <div className="week-nav">
            <button type="button" className="nb" aria-label={p.movil ? 'Día anterior' : 'Semana anterior'} onClick={p.anterior}><ChevronLeft size={18} /></button>
            <b aria-live="polite">{p.fecha}</b>
            <button type="button" className="nb" aria-label={p.movil ? 'Día siguiente' : 'Semana siguiente'} onClick={p.siguiente}><ChevronRight size={18} /></button>
            {!p.enHoy && <button type="button" className="btn btn-ghost btn-sm" onClick={p.hoy}>Volver a hoy</button>}
          </div>
        )}
      </div>
      <p className="agenda-controls__ayuda">{AYUDA[p.tab]}</p>
      {p.profesionales.length > 0 && (!p.recurrente || p.tab !== 'semana') && (
        <div className="agenda-controls__team">
          <span>Ver de</span>
          <ComboPanel tipo="persona" etiqueta="Filtrar por profesional" value={p.profesional} alCambiar={p.alProfesional}
            opciones={[{ value: '', label: 'Todo el equipo' }, ...p.profesionales.map((t) => ({ value: t.id, label: t.name, detalle: t.activo ? undefined : 'Dado de baja' }))]} />
        </div>
      )}
    </section>
  );
}
