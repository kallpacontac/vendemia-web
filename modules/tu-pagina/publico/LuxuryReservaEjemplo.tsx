'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Clock3, MapPin, Users } from 'lucide-react';
import { BARBEROS_EJEMPLO, HORAS_BARBERIA, HORAS_POR_BARBERO, SERVICIOS_BARBERIA } from '@/modules/tu-pagina/dominio/barberia-ejemplo';
import AnimacionesPlantilla from './AnimacionesPlantilla';

function proximosDias(hoy: string) {
  const dias: Date[] = [];
  const actual = new Date(`${hoy}T12:00:00Z`);
  while (dias.length < 12) {
    actual.setUTCDate(actual.getUTCDate() + 1);
    if (actual.getUTCDay() !== 0) dias.push(new Date(actual));
  }
  return dias;
}

const clave = (fecha: Date) => fecha.toISOString().slice(0, 10);
const fechaLarga = (fecha: Date) => new Intl.DateTimeFormat('es-PE', { dateStyle: 'full', timeZone: 'UTC' }).format(fecha);

export default function LuxuryReservaEjemplo({ hoy, inicial, barberoInicial = -1 }: { hoy: string; inicial: number; barberoInicial?: number }) {
  const [servicio, setServicio] = useState(inicial);
  const [barbero, setBarbero] = useState(barberoInicial);
  const [semana, setSemana] = useState(0);
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [resumen, setResumen] = useState(false);
  const dias = useMemo(() => proximosDias(hoy), [hoy]);
  const actual = SERVICIOS_BARBERIA[servicio];
  const horasDisponibles = barbero < 0 ? HORAS_BARBERIA : HORAS_POR_BARBERO[barbero];
  const diaElegido = dias.find((d) => clave(d) === fecha);

  return <main className="tp lx-reserva" data-diseno="agenda" data-plantilla="luxury" style={{ '--tp-color': '#D0AB75', '--tp-tinta': '#171717' } as React.CSSProperties}>
    <AnimacionesPlantilla />
    <header className="lx-reserva__nav"><a href="/ejemplos/barberia"><ArrowLeft size={18} aria-hidden="true" /> Volver a Atelier Norte</a><span>ATELIER NORTE</span><small>VISTA DE EJEMPLO</small></header>
    <div className="lx-reserva__intro"><span>AGENDA · ATELIER NORTE</span><h1>Elige tu cita</h1><p>Escoge tu servicio, tu barbero de preferencia y el horario que mejor te acomode.</p></div>
    <section className="lx-reserva__panel" aria-label="Agenda de ejemplo">
      <aside className="lx-reserva__servicio">
        <div className="lx-reserva__foto" style={{ backgroundImage: `url("${actual.foto}")` }} role="img" aria-label={actual.nombre} />
        <div className="lx-reserva__servicio-info">
          <span>01 / SERVICIO</span>
          <label htmlFor="lx-servicio">Tu servicio</label>
          <select id="lx-servicio" value={servicio} onChange={(e) => { setServicio(Number(e.target.value)); setFecha(''); setHora(''); setResumen(false); }}>
            {SERVICIOS_BARBERIA.map((s, i) => <option value={i} key={s.nombre}>{s.nombre}</option>)}
          </select>
          <p>{actual.descripcion}</p>
          <div className="lx-reserva__detalle"><span><Clock3 size={16} aria-hidden="true" /> {actual.duracion} min</span><strong>S/ {actual.precio}</strong></div>
          <span className="lx-reserva__direccion"><MapPin size={15} aria-hidden="true" /> Miraflores, Lima</span>
        </div>
      </aside>
      <div className="lx-reserva__calendario">
        <div className="lx-reserva__barbero"><span>02 / BARBERO</span><h2>¿Con quién te atiendes?</h2><div className="lx-reserva__barberos" role="group" aria-label="Elige tu barbero de preferencia">
          <button type="button" aria-pressed={barbero === -1} onClick={() => { setBarbero(-1); setHora(''); setResumen(false); }}><span className="lx-reserva__barbero-foto lx-reserva__barbero-foto--todos"><Users size={28} aria-hidden="true" /></span><b>Cualquiera</b><small>Primer turno libre</small></button>
          {BARBEROS_EJEMPLO.map((persona, indice) => <button type="button" key={persona.nombre} aria-pressed={barbero === indice} onClick={() => { setBarbero(indice); setHora(''); setResumen(false); }}><span className="lx-reserva__barbero-foto"><img src={persona.foto} alt="" loading="lazy" /></span><b>{persona.nombre}</b><small>{persona.especialidad}</small></button>)}
        </div><p>Fotos y nombres ilustrativos. Los horarios cambian según el barbero elegido.</p></div>
        <div className="lx-reserva__parte"><span>03 / DÍA</span><h2>Elige un día</h2><div className="lx-reserva__flechas"><button type="button" aria-label="Días anteriores" disabled={semana === 0} onClick={() => setSemana(0)}><ChevronLeft size={20} /></button><button type="button" aria-label="Días siguientes" disabled={semana === 1} onClick={() => setSemana(1)}><ChevronRight size={20} /></button></div></div>
        <div className="lx-reserva__dias" role="group" aria-label="Días disponibles">
          {dias.slice(semana * 6, semana * 6 + 6).map((d) => <button type="button" key={clave(d)} aria-pressed={fecha === clave(d)} onClick={() => { setFecha(clave(d)); setHora(''); setResumen(false); }}><small>{new Intl.DateTimeFormat('es-PE', { weekday: 'short', timeZone: 'UTC' }).format(d)}</small><b>{d.getUTCDate()}</b></button>)}
        </div>
        <p className="lx-reserva__fecha">{diaElegido ? fechaLarga(diaElegido) : 'Selecciona un día para ver las horas.'}</p>
        <div className="lx-reserva__horas" key={fecha || 'sin-fecha'}><span>04 / HORA</span><h2>Escoge tu horario</h2>{diaElegido ? <div role="group" aria-label="Horas disponibles">{horasDisponibles.map((h) => <button type="button" key={h} aria-pressed={hora === h} onClick={() => { setHora(h); setResumen(false); }}>{h}</button>)}</div> : <p>Primero elige un día.</p>}</div>
        {diaElegido && hora && <button type="button" className="lx-reserva__confirmar" onClick={() => setResumen(true)}>Ver resumen de ejemplo <ArrowRight size={18} aria-hidden="true" /></button>}
      </div>
    </section>
    {resumen && diaElegido && <div className="lx-reserva__resumen" role="status"><Check size={23} aria-hidden="true" /><div><b>Así quedaría tu visita</b><span>{actual.nombre} · {barbero < 0 ? 'Primer barbero disponible' : BARBEROS_EJEMPLO[barbero].nombre} · {fechaLarga(diaElegido)} · {hora}</span><small>Es una demostración: no se ha guardado ninguna cita.</small></div><button type="button" onClick={() => setResumen(false)}>Cambiar hora</button></div>}
    <p className="lx-reserva__pie">Fotos de referencia de <a href="https://www.pexels.com/" target="_blank" rel="noopener noreferrer">Pexels</a> · Precios y horarios de ejemplo · Hecho con <a href="https://vendemias.com/?utm_source=tu-pagina">Vendemia</a></p>
  </main>;
}
