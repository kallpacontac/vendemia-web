'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { isoLocal, soles } from '@/lib/panel/format';
import { ElegirFecha } from './FechaHora';

export default function CajaResumen({ dia, hoy, alDia, calculo }: {
  dia: string; hoy: string; alDia: (dia: string) => void;
  calculo: { entro: number; aCuentaTotal: number; gastado: number; neto: number } | null;
}) {
  function mover(n: number) {
    const fecha = new Date(`${dia}T12:00:00`);
    fecha.setDate(fecha.getDate() + n);
    alDia(isoLocal(fecha));
  }
  return <section className="caja-resumen" aria-label="Fecha y resumen de caja">
    <div className="caja-fecha">
      <button type="button" className="btn btn-ghost" aria-label="Día anterior" onClick={() => mover(-1)}><ChevronLeft size={16}/></button>
      <ElegirFecha valor={dia} alCambiar={alDia} max={hoy} etiqueta="Día de caja" atajos={false} />
      <button type="button" className="btn btn-ghost" aria-label="Día siguiente" disabled={dia >= hoy} onClick={() => mover(1)}><ChevronRight size={16}/></button>
      {dia !== hoy && <button type="button" className="btn btn-ghost caja-hoy" onClick={() => alDia(hoy)}>Volver a hoy</button>}
    </div>
    <dl className="caja-totales" aria-live="polite">
      {/* Todo lo que entró, a cuenta incluido; lo a cuenta se nombra aparte (Alvaro, 19-oct-2026). */}
      <div><dt>Entró</dt><dd>{calculo ? soles(calculo.entro) : '—'}</dd>
        {calculo && calculo.aCuentaTotal > 0 && <small className="muted">{soles(calculo.aCuentaTotal)} a cuenta</small>}</div>
      <div><dt>Gastos</dt><dd>{calculo ? soles(calculo.gastado) : '—'}</dd></div>
      <div><dt>Neto del día</dt><dd>{calculo ? soles(calculo.neto) : '—'}</dd></div>
    </dl>
  </section>;
}
