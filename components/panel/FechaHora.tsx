'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * FECHA Y HORA · el calendario y las horas del panel
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Pedido por Alvaro (17-nov-2026, The 24/7, en la tablet): «el diseño del date picker y las horas,
 * modernízalo». El `<input type="date">` del sistema se ve distinto en cada aparato y en la tablet
 * abría una rueda pequeña; un `<select>` de 48 horas obligaba a desplazarse a ciegas.
 *
 *   · ElegirFecha: un botón que dice el día en palabras («Hoy · lun 17 nov») y abre el calendario
 *     de react-day-picker (en español, la semana empieza en lunes). Atajos «Hoy» y «Mañana».
 *     Los días cerrados del negocio salen apagados.
 *   · ElegirHora: las horas como botones, en tres grupos (mañana, tarde, noche), en formato de
 *     12 h. Las que ya están llenas salen tachadas con «lleno». Se ven todas de un vistazo.
 */
import { useEffect, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { es } from 'react-day-picker/locale';
import 'react-day-picker/style.css';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { hora12, isoLocal } from '@/lib/panel/format';

const deIso = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d, 12);
};
const sumarDias = (iso: string, n: number) => {
  const d = deIso(iso);
  d.setDate(d.getDate() + n);
  return isoLocal(d);
};

/** «Hoy · lun 17 nov», «Mañana · mar 18 nov», «vie 21 nov». */
export function fechaEnPalabras(iso: string, hoy = isoLocal(new Date())): string {
  const d = deIso(iso);
  const corto = d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '').replace(',', '');
  if (iso === hoy) return `Hoy · ${corto}`;
  if (iso === sumarDias(hoy, 1)) return `Mañana · ${corto}`;
  if (iso === sumarDias(hoy, -1)) return `Ayer · ${corto}`;
  return corto;
}

export function ElegirFecha({
  valor,
  alCambiar,
  min,
  max,
  cerrado,
  etiqueta = 'Día',
  atajos = true,
}: {
  valor: string;
  alCambiar: (iso: string) => void;
  /** 'YYYY-MM-DD' inclusive. */
  min?: string;
  max?: string;
  /** ¿Ese día el negocio está cerrado? Sale apagado en el calendario. */
  cerrado?: (iso: string) => boolean;
  etiqueta?: string;
  /** «Hoy» y «Mañana» al lado del botón. */
  atajos?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const hoy = isoLocal(new Date());
  const manana = sumarDias(hoy, 1);
  const vale = (iso: string) => (!min || iso >= min) && (!max || iso <= max) && !cerrado?.(iso);

  useEffect(() => {
    if (!abierto) return;
    // Que se vea entero: dentro de una ventana con desplazamiento puede abrirse por debajo del borde.
    window.requestAnimationFrame(() => caja.current?.querySelector('.fh-pop')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    const fuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  return (
    <div className="fh-fecha" ref={caja}>
      <div className="fh-fecha__fila">
        <button type="button" className="fh-boton" aria-haspopup="dialog" aria-expanded={abierto} aria-label={`${etiqueta}: ${fechaEnPalabras(valor, hoy)}`}
          onClick={() => setAbierto((a) => !a)}>
          <CalendarDays size={17} />
          <span>{fechaEnPalabras(valor, hoy)}</span>
          <ChevronDown size={16} className="fh-boton__flecha" />
        </button>
        {atajos && vale(hoy) && valor !== hoy && (
          <button type="button" className="fh-atajo" onClick={() => alCambiar(hoy)}>Hoy</button>
        )}
        {atajos && vale(manana) && valor !== manana && (
          <button type="button" className="fh-atajo" onClick={() => alCambiar(manana)}>Mañana</button>
        )}
      </div>
      {abierto && (
        <div className="fh-pop" role="dialog" aria-label={`Elegir ${etiqueta.toLowerCase()}`}>
          <DayPicker
            mode="single"
            locale={es}
            weekStartsOn={1}
            selected={deIso(valor)}
            defaultMonth={deIso(valor)}
            startMonth={min ? deIso(min) : undefined}
            endMonth={max ? deIso(max) : undefined}
            disabled={(d) => !vale(isoLocal(d))}
            onSelect={(d) => {
              if (!d) return;
              alCambiar(isoLocal(d));
              setAbierto(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

const TRAMOS: [string, (h: number) => boolean][] = [
  ['Mañana', (h) => h < 12],
  ['Tarde', (h) => h >= 12 && h < 18],
  ['Noche', (h) => h >= 18],
];

export function ElegirHora({
  horas,
  valor,
  alCambiar,
  llenas,
}: {
  /** 'HH:MM' en 24 h, en orden. */
  horas: string[];
  valor: string;
  alCambiar: (h: string) => void;
  /** Las que ya no tienen sitio. */
  llenas?: Set<string>;
}) {
  if (horas.length === 0) return <p className="fh-vacio">Ese día no hay horas: el local está cerrado o ya pasó la hora de cierre.</p>;
  return (
    <div className="fh-horas" role="radiogroup" aria-label="Hora">
      {TRAMOS.map(([nombre, cabe]) => {
        const del = horas.filter((h) => cabe(Number(h.slice(0, 2))));
        if (!del.length) return null;
        return (
          <div key={nombre} className="fh-tramo">
            <span className="fh-tramo__nombre">{nombre}</span>
            <div className="fh-tramo__horas">
              {del.map((h) => {
                const llena = llenas?.has(h) ?? false;
                return (
                  <button key={h} type="button" role="radio" aria-checked={valor === h} disabled={llena && valor !== h}
                    className={`fh-hora${valor === h ? ' on' : ''}${llena ? ' llena' : ''}`} onClick={() => alCambiar(h)}
                    title={llena ? 'Lleno a esa hora' : undefined}>
                    {hora12(h)}
                    {llena && <small>lleno</small>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
