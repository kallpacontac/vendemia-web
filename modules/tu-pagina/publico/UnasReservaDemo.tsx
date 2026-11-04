'use client';

import { useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';

const horas = ['09:00', '10:30', '12:00', '15:00', '16:30', '18:00'];
export default function UnasReservaDemo({ servicios, hoy }: { servicios: string[]; hoy: string }) {
  const dias = Array.from({ length: 21 }, (_, indice) => {
    const fecha = new Date(`${hoy}T12:00:00`);
    fecha.setDate(fecha.getDate() + indice);
    return fecha;
  });
  const [servicio, setServicio] = useState(servicios[0] || 'Manicure clásico');
  const [dia, setDia] = useState<number | null>(null);
  const [hora, setHora] = useState('');
  const [pagina, setPagina] = useState(0);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [confirmada, setConfirmada] = useState(false);
  const visibles = dias.slice(pagina * 7, pagina * 7 + 7);
  const fechaTexto = dia === null ? '' : new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }).format(dias[dia]);

  return <div className="tp-agenda-widget un-demo-widget">
    <div className="tp-agenda-widget__resumen"><span className="tp-agenda-widget__paso">1 · TU SERVICIO</span><span className="tp-agenda-widget__marca"><CalendarDays size={22} aria-hidden="true" /></span><h3>Tu cita comienza aquí</h3><p>Elige el cuidado que quieres para tus manos.</p><label htmlFor="un-demo-servicio">Servicio</label><select id="un-demo-servicio" value={servicio} onChange={(e) => setServicio(e.target.value)}>{(servicios.length ? servicios : ['Manicure clásico', 'Esmaltado semipermanente', 'Diseño de uñas']).map((item) => <option key={item}>{item}</option>)}</select></div>
    <div className="tp-agenda-widget__calendario"><span className="tp-agenda-widget__paso">2 · ELIGE UN DÍA</span><div className="tp-agenda-widget__cabecera"><h3>Tu día especial</h3><div><button type="button" aria-label="Días anteriores" disabled={pagina === 0} onClick={() => setPagina((actual) => actual - 1)}><ChevronLeft size={17} /></button><button type="button" aria-label="Días siguientes" disabled={pagina === 2} onClick={() => setPagina((actual) => actual + 1)}><ChevronRight size={17} /></button></div></div><div className="tp-agenda-widget__dias" role="group" aria-label="Días disponibles">{visibles.map((fecha, indice) => <button key={fecha.toISOString()} type="button" aria-pressed={dia === pagina * 7 + indice} onClick={() => { setDia(pagina * 7 + indice); setHora(''); setConfirmada(false); }}><small>{new Intl.DateTimeFormat('es-PE', { weekday: 'short' }).format(fecha)}</small><b>{fecha.getDate()}</b></button>)}</div><p>{fechaTexto ? `Seleccionaste ${fechaTexto}` : 'Escoge un día para ver horarios.'}</p></div>
    <div className="tp-agenda-widget__horas"><span className="tp-agenda-widget__paso">3 · ELIGE UNA HORA</span><h3>Horarios de ejemplo</h3><div role="group" aria-label="Horarios disponibles">{horas.map((valor) => <button key={valor} type="button" disabled={dia === null} aria-pressed={hora === valor} onClick={() => { setHora(valor); setConfirmada(false); }}>{valor}</button>)}</div></div>
    <div className="tp-agenda-widget__datos"><span className="tp-agenda-widget__paso">4 · TUS DATOS</span><h3>Reserva tu momento</h3><label htmlFor="un-demo-nombre">Tu nombre</label><input id="un-demo-nombre" value={nombre} autoComplete="name" onChange={(e) => setNombre(e.target.value)} placeholder="¿Cómo te llamas?" /><label htmlFor="un-demo-telefono">Tu celular</label><input id="un-demo-telefono" value={telefono} inputMode="tel" autoComplete="tel" onChange={(e) => setTelefono(e.target.value)} placeholder="987 654 321" /><p className="un-demo-widget__resumen"><Clock3 size={15} aria-hidden="true" /> {dia === null ? 'Elige un día' : fechaTexto}{hora ? ` · ${hora}` : ''}</p><button type="button" className="un-demo-widget__boton" disabled={dia === null || !hora || !nombre.trim() || telefono.replace(/\D/g, '').length < 9} onClick={() => setConfirmada(true)}>{confirmada ? <><Check size={17} /> Reserva de ejemplo lista</> : 'Probar reserva'}</button><p className="un-demo-widget__nota" role="status">{confirmada ? 'Así se vería tu reserva. No se separó una cita real.' : 'Demostración: no se enviarán tus datos ni se separará una cita.'}</p></div>
  </div>;
}
