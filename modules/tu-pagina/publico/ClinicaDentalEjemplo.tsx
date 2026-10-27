'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Info, MapPin, Search, ShieldCheck, Sparkles, X, ZoomIn } from 'lucide-react';
import ImagenAmpliada from './ImagenAmpliada';
import './negocios-ejemplo.css';

export type DisenoClinica = 'clara' | 'editorial' | 'tienda';

const SERVICIOS = [
  { id: 0, nombre: 'Evaluación dental', descripcion: 'Conoce el estado de tu sonrisa y recibe un plan claro para cuidarla.', duracion: 30, precio: 60, categoria: 'Diagnóstico' },
  { id: 1, nombre: 'Limpieza profesional', descripcion: 'Higiene profunda y recomendaciones para tu cuidado diario.', duracion: 45, precio: 120, categoria: 'Prevención' },
  { id: 2, nombre: 'Consulta de ortodoncia', descripcion: 'Revisamos tu caso y resolvemos tus dudas sobre alineación dental.', duracion: 40, precio: 80, categoria: 'Ortodoncia' },
] as const;
const HORAS = ['09:00', '10:30', '12:00', '15:00', '16:30'] as const;

function diasDisponibles(hoy: string) {
  const dias: Date[] = [];
  const fecha = new Date(`${hoy}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + 1);
  while (dias.length < 12) {
    if (fecha.getUTCDay() !== 0) dias.push(new Date(fecha));
    fecha.setUTCDate(fecha.getUTCDate() + 1);
  }
  return dias;
}

const fechaClave = (fecha: Date) => fecha.toISOString().slice(0, 10);

export default function ClinicaDentalEjemplo({ diseno, hoy }: { diseno: DisenoClinica; hoy: string }) {
  const [servicio, setServicio] = useState<number>(0);
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [semana, setSemana] = useState(0);
  const [confirmado, setConfirmado] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [detalle, setDetalle] = useState<number | null>(null);
  const [zoom, setZoom] = useState(false);
  const dias = useMemo(() => diasDisponibles(hoy), [hoy]);
  const actual = SERVICIOS[servicio];
  const visibles = SERVICIOS.filter((s) => `${s.nombre} ${s.descripcion}`.toLocaleLowerCase('es').includes(buscar.trim().toLocaleLowerCase('es')));
  const elegirServicio = (id: number) => { setServicio(id); setFecha(''); setHora(''); setConfirmado(false); };
  const irAgenda = (id: number) => { elegirServicio(id); document.getElementById('reservar')?.scrollIntoView({ behavior: 'smooth' }); };

  useEffect(() => {
    if (detalle === null || zoom) return;
    const alPulsar = (evento: KeyboardEvent) => { if (evento.key === 'Escape') setDetalle(null); };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [detalle, zoom]);

  return <div className={`ne ne-dental ne-dental--${diseno}`}>
    <div className="ne-aviso-demo"><span><Info size={15} /> Clínica dental de ejemplo · horarios y precios ilustrativos</span><a href="/panel/tu-pagina">Crear mi página <ArrowRight size={15} /></a></div>
    <nav className="ne-ejemplos" aria-label="Ejemplos de negocios"><b>Explorar ejemplos</b><a href="/ejemplos/la-baguette">La Baguette · panadería</a><a href="/ejemplos/barberia">Barbería · Luxury</a><a href="/ejemplos/cafeteria">Cafetería · tienda</a><a aria-current={diseno === 'clara' ? 'page' : undefined} href="/ejemplos/clinica-dental?diseno=clara">Agenda clara</a><a aria-current={diseno === 'editorial' ? 'page' : undefined} href="/ejemplos/clinica-dental?diseno=editorial">Agenda editorial</a><a aria-current={diseno === 'tienda' ? 'page' : undefined} href="/ejemplos/clinica-dental?diseno=tienda">Clínica · tienda</a></nav>
    <header className="ne-dental-header"><div className="ne-dental-brand"><span>✳</span><div><b>Sonrisa Norte</b><small>Clínica dental · Lima</small></div></div><nav><a href="#servicios">Tratamientos</a><a href="#equipo">Nosotros</a><a className="ne-dental-header-cta" href={diseno === 'tienda' ? '#servicios' : '#reservar'}>{diseno === 'tienda' ? 'Ver servicios' : 'Reservar cita'} <ArrowRight size={15} /></a></nav></header>
    {diseno === 'editorial' ? <section className="ne-dental-hero ne-dental-hero--editorial"><div className="ne-dental-hero-foto" role="img" aria-label="Odontóloga conversando con una paciente en Sonrisa Norte" /><div className="ne-dental-hero-texto"><span>ODONTOLOGÍA CERCANA · LIMA</span><h1>Cuidamos tu sonrisa desde la primera conversación.</h1><p>Agenda tu visita con calma. Elige el servicio y el horario que mejor te acomode.</p><a href="#reservar">Encontrar horario <ArrowRight size={17} /></a></div></section> : <section className="ne-dental-hero ne-dental-hero--clara"><div className="ne-dental-hero-texto"><span><Sparkles size={16} /> TU SONRISA, EN BUENAS MANOS</span><h1>{diseno === 'tienda' ? 'Cuidamos tu sonrisa en cada etapa.' : 'Tu próxima cita dental, sin complicaciones.'}</h1><p>Atención cercana, tiempos claros y un equipo que te escucha desde la primera visita.</p><a href={diseno === 'tienda' ? '#servicios' : '#reservar'}>{diseno === 'tienda' ? 'Explorar servicios' : 'Elegir mi cita'} <ArrowRight size={17} /></a><div className="ne-dental-hero-puntos"><span><ShieldCheck size={17} /> Atención profesional</span><span><Clock3 size={17} /> Horarios flexibles</span></div></div><div className="ne-dental-hero-foto" role="img" aria-label="Odontóloga conversando con una paciente en Sonrisa Norte" /></section>}
    <section id="equipo" className="ne-dental-confianza"><span><MapPin size={18} /> Miraflores, Lima</span><span><CalendarDays size={18} /> Lunes a sábado</span><span><ShieldCheck size={18} /> Atención personalizada</span></section>
    <section id="servicios" className="ne-dental-servicios"><div className="ne-dental-seccion-titulo"><span>SONRISA NORTE</span><h2>{diseno === 'tienda' ? 'Servicios para tu sonrisa' : 'Elige cómo podemos ayudarte'}</h2><p>Información sencilla para que sepas qué esperar en cada visita.</p></div>{diseno === 'tienda' && <label className="ne-dental-buscar"><Search size={18} /><input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar tratamiento" aria-label="Buscar tratamiento" /></label>}<div className="ne-dental-servicios-grid">{visibles.map((s) => <article key={s.id} className="ne-dental-servicio"><div className={`ne-dental-servicio-foto ne-dental-servicio-foto--${s.id}`} role="img" aria-label={s.nombre} /><div><small>{s.categoria}</small><h3>{s.nombre}</h3><p>{s.descripcion}</p><div className="ne-dental-servicio-pie"><span><Clock3 size={15} /> {s.duracion} min</span><strong>Desde S/ {s.precio}</strong></div>{diseno === 'tienda' ? <button type="button" onClick={() => setDetalle(s.id)}>Ver servicio <ArrowRight size={16} /></button> : <button type="button" onClick={() => irAgenda(s.id)}>Elegir este servicio <ArrowRight size={16} /></button>}</div></article>)}</div>{!visibles.length && <div className="ne-vacio">No encontramos tratamientos con esa búsqueda.</div>}</section>
    {diseno !== 'tienda' && <section id="reservar" className="ne-dental-reservar"><div className="ne-dental-seccion-titulo"><span>EN POCOS PASOS</span><h2>Encuentra tu momento</h2><p>Esta agenda es una demostración. No se separa una cita real.</p></div><div className="ne-dental-widget"><aside><span className="ne-dental-widget-logo">✳</span><b>Sonrisa Norte</b><h3>{actual.nombre}</h3><p>{actual.descripcion}</p><span><Clock3 size={16} /> {actual.duracion} minutos</span><span><MapPin size={16} /> Miraflores, Lima</span><label>Servicio<select value={servicio} onChange={(e) => elegirServicio(Number(e.target.value))}>{SERVICIOS.map((s) => <option value={s.id} key={s.id}>{s.nombre}</option>)}</select></label></aside><div className="ne-dental-widget-calendario"><div className="ne-dental-widget-mes"><b>Elige un día</b><div><button type="button" aria-label="Días anteriores" disabled={semana === 0} onClick={() => setSemana(0)}><ChevronLeft size={18} /></button><button type="button" aria-label="Días siguientes" disabled={semana === 1} onClick={() => setSemana(1)}><ChevronRight size={18} /></button></div></div><div className="ne-dental-dias">{dias.slice(semana * 6, semana * 6 + 6).map((dia) => { const clave = fechaClave(dia); return <button key={clave} type="button" aria-pressed={fecha === clave} onClick={() => { setFecha(clave); setHora(''); setConfirmado(false); }}><small>{new Intl.DateTimeFormat('es-PE', { weekday: 'short' }).format(dia)}</small><b>{dia.getDate()}</b></button>; })}</div><p>{fecha ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'full' }).format(dias.find((d) => fechaClave(d) === fecha)) : 'Selecciona un día para ver horarios'}</p></div><div className="ne-dental-widget-horas"><b>Hora disponible</b>{fecha ? <div>{HORAS.map((h) => <button key={h} type="button" aria-pressed={hora === h} onClick={() => { setHora(h); setConfirmado(false); }}>{h}</button>)}</div> : <p>Primero elige un día.</p>}{hora && <button className="ne-dental-confirmar" type="button" onClick={() => setConfirmado(true)}>Ver resumen de ejemplo <ArrowRight size={16} /></button>}</div></div>{confirmado && <div className="ne-dental-resumen" role="status"><Check size={21} /><div><b>Así se vería tu reserva</b><span>{actual.nombre} · {fecha} · {hora}. Esta es una muestra y no se guardó ninguna cita.</span></div><button type="button" aria-label="Cerrar resumen" onClick={() => setConfirmado(false)}><X size={18} /></button></div>}</section>}
    <footer className="ne-dental-footer"><div><b>✳ Sonrisa Norte</b><p>Una clínica dental de ejemplo creada con Vendemia.</p></div><span>Las fotos, horas, servicios y precios son ilustrativos.</span><a href="/panel/tu-pagina">Crea tu página</a></footer>
    {detalle !== null && <div className="ne-modal" role="presentation" onClick={() => setDetalle(null)}>
      <div className="ne-modal-dialogo ne-dental-modal" role="dialog" aria-modal="true" aria-label={SERVICIOS[detalle].nombre} onClick={(e) => e.stopPropagation()}>
        <button className="ne-modal-cerrar" type="button" aria-label="Cerrar detalle" onClick={() => setDetalle(null)}><X size={21} /></button>
        <button className="ne-modal-foto" type="button" aria-label={`Ampliar foto de ${SERVICIOS[detalle].nombre}`} onClick={() => setZoom(true)}><span className={`ne-dental-servicio-foto ne-dental-servicio-foto--${detalle}`} /><span className="ne-modal-ampliar"><ZoomIn size={17} /> Toca para ampliar</span></button>
        <div className="ne-modal-info"><small>{SERVICIOS[detalle].categoria}</small><h2>{SERVICIOS[detalle].nombre}</h2><p>{SERVICIOS[detalle].descripcion}</p><strong>Desde S/ {SERVICIOS[detalle].precio}</strong><span>Duración estimada: {SERVICIOS[detalle].duracion} minutos.</span><div className="ne-modal-acciones"><a href="/ejemplos/clinica-dental?diseno=clara#reservar">Ver agenda <ArrowRight size={17} /></a><button type="button" onClick={() => setDetalle(null)}>Ver más servicios</button></div><span>Precios y disponibilidad ilustrativos.</span></div>
      </div>
    </div>}
    {detalle !== null && zoom && <ImagenAmpliada src={`/assets/negocios-ejemplo/dental-${detalle}.webp`} alt={SERVICIOS[detalle].nombre} onClose={() => setZoom(false)} />}
  </div>;
}
