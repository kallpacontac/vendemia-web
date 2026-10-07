'use client';

import { Briefcase, CalendarCheck, CheckCircle, ChevronLeft, ChevronRight, Clock, User } from 'lucide-react';

type Tab = 'semana' | 'proximas' | 'pasadas';
type Vista = 'negocio' | 'cliente';
type Props = {
  recurrente: boolean; movil: boolean; tab: Tab; alTab: (tab: Tab) => void;
  proximas: number; pendientes: number; profesionales: { id: string; name: string; activo: boolean }[];
  profesional: string; alProfesional: (id: string) => void;
  fecha: string; vista: Vista; alVista: (vista: Vista) => void;
  anterior: () => void; siguiente: () => void; hoy: () => void;
};

/** Controles presentacionales compartidos por la agenda real y su prueba responsive. */
export default function AgendaControles(p: Props) {
  const calendario = !p.recurrente && p.tab === 'semana';
  return (
    <section className="agenda-controls" aria-label="Filtros de la agenda">
      <div className="view-toggle tabs-agenda" role="group" aria-label="Contenido de la agenda">
        <button type="button" className={p.tab === 'semana' ? 'active' : ''} aria-pressed={p.tab === 'semana'} onClick={() => p.alTab('semana')}>
          <CalendarCheck size={15} /> {p.recurrente ? 'Grupos' : p.movil ? 'Día' : 'Semana'}
        </button>
        {(!p.recurrente || p.proximas > 0) && <button type="button" className={p.tab === 'proximas' ? 'active' : ''} aria-pressed={p.tab === 'proximas'} onClick={() => p.alTab('proximas')}>
          <Clock size={15} /> Próximas{p.proximas > 0 ? ` (${p.proximas})` : ''}
        </button>}
        {(!p.recurrente || p.pendientes > 0) && <button type="button" className={p.tab === 'pasadas' ? 'active' : ''} aria-pressed={p.tab === 'pasadas'} onClick={() => p.alTab('pasadas')} title="Atenciones pasadas sin confirmar o sin cobrar">
          <CheckCircle size={15} /> Por revisar{p.pendientes > 0 ? ` (${p.pendientes})` : ''}
        </button>}
      </div>
      {p.profesionales.length > 0 && (!p.recurrente || p.tab !== 'semana') && <label className="agenda-controls__team">
        Profesional
        <select className="select" value={p.profesional} onChange={(e) => p.alProfesional(e.target.value)}>
          <option value="">Todo el equipo</option>
          {p.profesionales.map((t) => <option key={t.id} value={t.id}>{t.name}{t.activo ? '' : ' · dado de baja'}</option>)}
        </select>
      </label>}
      {calendario && <div className="agenda-controls__calendar">
        <div className="week-nav">
          <button type="button" className="nb" aria-label={p.movil ? 'Día anterior' : 'Semana anterior'} onClick={p.anterior}><ChevronLeft size={16} /></button>
          <b aria-live="polite">{p.fecha}</b>
          <button type="button" className="nb" aria-label={p.movil ? 'Día siguiente' : 'Semana siguiente'} onClick={p.siguiente}><ChevronRight size={16} /></button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={p.hoy}>Hoy</button>
        </div>
        <div className="view-toggle" role="group" aria-label="Presentación de la agenda">
          <button type="button" className={p.vista === 'negocio' ? 'active' : ''} aria-pressed={p.vista === 'negocio'} onClick={() => p.alVista('negocio')}><Briefcase size={15} /> Reservas</button>
          <button type="button" className={p.vista === 'cliente' ? 'active' : ''} aria-pressed={p.vista === 'cliente'} onClick={() => p.alVista('cliente')}><User size={15} /> Disponibilidad</button>
        </div>
      </div>}
      {calendario && p.profesional && <p className="agenda-controls__note">Solo este profesional: su horario y ausencias determinan los cupos disponibles.</p>}
    </section>
  );
}
