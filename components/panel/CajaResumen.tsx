'use client';
import type { FormEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { isoLocal, soles } from '@/lib/panel/format';

export default function CajaResumen({ dia, hoy, alDia, calculo }: {
  dia: string; hoy: string; alDia: (dia: string) => void;
  calculo: { cobrado: number; gastado: number; neto: number } | null;
}) {
  function mover(n: number) {
    const fecha = new Date(`${dia}T12:00:00`);
    fecha.setDate(fecha.getDate() + n);
    alDia(isoLocal(fecha));
  }
  function seleccionar(e: FormEvent<HTMLInputElement>) {
    const campo = e.currentTarget;
    if (campo.validity.valid && campo.value && campo.value <= hoy) alDia(campo.value);
  }
  return <section className="caja-resumen" aria-label="Fecha y resumen de caja">
    <div className="caja-fecha">
      <button type="button" className="btn btn-ghost" aria-label="Día anterior" onClick={() => mover(-1)}><ChevronLeft size={16}/></button>
      <label><span className="sr-only">Fecha de caja</span><input className="input" type="date" value={dia} max={hoy}
        onInput={seleccionar} onChange={seleccionar}/></label>
      <button type="button" className="btn btn-ghost" aria-label="Día siguiente" disabled={dia >= hoy} onClick={() => mover(1)}><ChevronRight size={16}/></button>
      <button type="button" className="btn btn-ghost caja-hoy" disabled={dia === hoy} onClick={() => alDia(hoy)}>Hoy</button>
    </div>
    <dl className="caja-totales" aria-live="polite">
      <div><dt>Cobrado</dt><dd>{calculo ? soles(calculo.cobrado) : '—'}</dd></div>
      <div><dt>Gastos</dt><dd>{calculo ? soles(calculo.gastado) : '—'}</dd></div>
      <div><dt>Neto del día</dt><dd>{calculo ? soles(calculo.neto) : '—'}</dd></div>
    </dl>
  </section>;
}
