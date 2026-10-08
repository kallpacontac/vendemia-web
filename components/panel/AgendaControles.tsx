'use client';

import { Briefcase, CalendarCheck, CheckCircle, ChevronLeft, ChevronRight, Clock, User } from 'lucide-react';
import ComboPanel from './ComboPanel';

type Tab = 'semana' | 'proximas' | 'pasadas';
type Vista = 'negocio' | 'cliente';
type Props = {
  recurrente: boolean; movil: boolean; tab: Tab; alTab: (tab: Tab) => void;
  proximas: number; pendientes: number; profesionales: { id: string; name: string; activo: boolean }[];
  profesional: string; alProfesional: (id: string) => void;
  fecha: string; vista: Vista; alVista: (vista: Vista) => void;
  anterior: () => void; siguiente: () => void; hoy: () => void;
  resumen?: { reservas: number; libres: number; ocupacion: number };
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
      {p.profesionales.length > 0 && (!p.recurrente || p.tab !== 'semana') && <div className="agenda-controls__team">
        <span>Profesional</span>
        <ComboPanel tipo="persona" etiqueta="Filtrar por profesional" value={p.profesional} alCambiar={p.alProfesional}
          opciones={[{value:'',label:'Todo el equipo'},...p.profesionales.map((t)=>({value:t.id,label:t.name,detalle:t.activo?undefined:'Dado de baja'}))]} />
      </div>}
      {p.resumen && <div className="agenda-controls__stats" aria-label="Resumen de la semana">
        <span><b>{p.resumen.reservas}</b> reservas</span><span><b>{p.resumen.libres}</b> cupos</span><span><b>{p.resumen.ocupacion}%</b> ocupación</span>
      </div>}
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
