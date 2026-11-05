'use client';

/**
 * El tablero del día de un negocio de canchas. Solo pinta: lo usan el panel
 * (TableroCanchas.tsx, con datos reales) y el ejemplo público (sin sesión).
 * En el celular se ve una cancha cada vez: cuatro columnas no caben en 360 píxeles.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, Plus, RefreshCw, Wallet, X } from 'lucide-react';
import { sumarDias } from '@/modules/tu-pagina/dominio/agenda';
import { fechaCorta } from '@/modules/tu-pagina/dominio/envio';
import type { EstadoCobro, ReservaTablero, Tablero } from '@/lib/panel/tablero-canchas';
import './tablero-canchas.css';

const soles = (n: number | null) => (n === null ? 'A consultar' : `S/ ${Number.isInteger(n) ? n : n.toFixed(2)}`);

export function etiquetaCobro(r: Pick<ReservaTablero, 'estado' | 'pagado' | 'total'>): string {
  const textos: Record<EstadoCobro, string> = {
    cobrada: 'Cobrada',
    a_cuenta: `Por cobrar · ${soles(r.pagado)} de ${soles(r.total)}`,
    por_cobrar: 'Por cobrar',
    esperando_pago: 'Esperando pago',
    no_vino: 'No vino',
  };
  return textos[r.estado];
}

export default function TableroCanchasVista({ tablero, fecha, hoy, alFecha, alLibre, acciones, alRefrescar, enlaceCaja, resaltar, cargando = false }: {
  tablero: Tablero;
  fecha: string;
  hoy: string;
  alFecha: (fecha: string) => void;
  alLibre: (cancha: string, inicio: string) => void;
  /** Lo que se puede hacer con la reserva abierta: cada lado pone lo suyo. */
  acciones: (r: ReservaTablero, cerrar: () => void) => ReactNode;
  alRefrescar?: () => void;
  enlaceCaja?: ReactNode;
  resaltar?: string;
  cargando?: boolean;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [activa, setActiva] = useState('');
  const reserva = tablero.reservas.find((r) => r.id === abierta) ?? null;
  const columnaActiva = tablero.columnas.some((c) => c.cancha.id === activa) ? activa : tablero.columnas[0]?.cancha.id ?? '';
  const { resumen: t } = tablero;

  useEffect(() => {
    if (!reserva) return;
    const cerrar = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierta(null); };
    document.addEventListener('keydown', cerrar);
    return () => document.removeEventListener('keydown', cerrar);
  }, [reserva]);

  // Lo que se acaba de reservar: en el celular, abrir su cancha en vez de la primera.
  const canchaResaltada = tablero.reservas.find((x) => x.id === resaltar)?.cancha;
  useEffect(() => {
    if (canchaResaltada) setActiva(canchaResaltada);
  }, [canchaResaltada]);

  return (
    <section className="tc" aria-label="Tablero de canchas">
      <div className="tc__cabeza">
        <div className="tc__dia">
          <button type="button" aria-label="Día anterior" onClick={() => alFecha(sumarDias(fecha, -1))}><ChevronLeft size={17} aria-hidden="true" /></button>
          {/* Tocar la fecha abre el calendario: saltar al 21 sin pulsar la flecha diez veces. */}
          <label className="tc__fecha">
            <CalendarDays size={16} aria-hidden="true" />
            <b aria-live="polite">{fecha === hoy ? 'Hoy · ' : ''}{fechaCorta(fecha)}</b>
            <input type="date" aria-label="Elegir día" value={fecha}
              onChange={(e) => { if (e.target.value) alFecha(e.target.value); }}
              onClick={(e) => { try { e.currentTarget.showPicker(); } catch { /* sin showPicker el navegador lo abre solo */ } }} />
          </label>
          <button type="button" aria-label="Día siguiente" onClick={() => alFecha(sumarDias(fecha, 1))}><ChevronRight size={17} aria-hidden="true" /></button>
          {fecha !== hoy && <button type="button" className="tc__hoy" onClick={() => alFecha(hoy)}>Hoy</button>}
          {alRefrescar && <button type="button" aria-label="Actualizar" disabled={cargando} onClick={alRefrescar}><RefreshCw size={15} aria-hidden="true" /></button>}
        </div>
      </div>

      <dl className="tc__cifras">
        <div><dt><Wallet size={15} aria-hidden="true" /> Ya cobrado</dt><dd>{soles(t.cobrado)}</dd><small>de {soles(t.total)} en reservas</small></div>
        <div><dt><CircleDollarSign size={15} aria-hidden="true" /> Falta cobrar</dt><dd>{soles(t.porCobrar)}</dd><small>{t.reservas} {t.reservas === 1 ? 'reserva' : 'reservas'}</small></div>
        <div><dt><CalendarClock size={15} aria-hidden="true" /> Horas libres</dt><dd>{t.libres}</dd><small>{t.ocupacion}% ocupado</small></div>
      </dl>
      <p className="tc__nota">Es el dinero de las reservas de este día. Lo que entró hoy, por fecha de pago, está en Caja.{enlaceCaja ? <> {enlaceCaja}</> : null}</p>

      {tablero.filas.length === 0 ? (
        <p className="tc__vacio">Este día está cerrado.</p>
      ) : tablero.columnas.length === 0 ? (
        <p className="tc__vacio">Aún no hay canchas. Agrégalas en Catálogo.</p>
      ) : (
        <>
          <div className="tc__selector" role="group" aria-label="Elegir cancha">
            {tablero.columnas.map((c) => (
              <button key={c.cancha.id} type="button" aria-pressed={c.cancha.id === columnaActiva} onClick={() => setActiva(c.cancha.id)}>
                {c.cancha.nombre}<small>{c.libres} {c.libres === 1 ? 'libre' : 'libres'}</small>
              </button>
            ))}
          </div>
          <div className="tc__marco">
            <table className="tc__tabla">
              <thead>
                <tr>
                  <th scope="col" className="tc__hora"><span className="sr-only">Hora</span></th>
                  {tablero.columnas.map((c) => (
                    <th key={c.cancha.id} scope="col" className={c.cancha.id === columnaActiva ? 'is-activa' : ''}>
                      {c.cancha.nombre}{c.cancha.familia && <small>{c.cancha.familia}</small>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tablero.filas.map((fila, i) => (
                  <tr key={fila}>
                    <th scope="row" className="tc__hora">{fila.slice(11, 16)}</th>
                    {tablero.columnas.map((c) => {
                      const celda = c.celdas[i];
                      const clase = c.cancha.id === columnaActiva ? 'is-activa' : '';
                      if (celda.tipo === 'cubierta') return null;
                      if (celda.tipo === 'pasada') return <td key={c.cancha.id} className={`tc__pasada ${clase}`} aria-label="Hora pasada" />;
                      if (celda.tipo === 'libre') {
                        return (
                          <td key={c.cancha.id} className={clase}>
                            <button type="button" className="tc__libre" aria-label={`${c.cancha.nombre}, ${fila.slice(11, 16)}, libre, ${soles(celda.precio)}. Crear reserva`} onClick={() => alLibre(c.cancha.id, fila)}>
                              <span>{soles(celda.precio)}</span><Plus size={14} aria-hidden="true" />
                            </button>
                          </td>
                        );
                      }
                      const r = celda.reserva;
                      return (
                        <td key={c.cancha.id} rowSpan={celda.filas} className={clase}>
                          <button type="button" className={`tc__reserva tc__reserva--${r.estado} ${r.id === resaltar ? 'tc__reserva--nueva' : ''}`} onClick={() => setAbierta(r.id)}>
                            <b>{r.cliente}</b>
                            <small>{r.estado === 'a_cuenta' ? etiquetaCobro(r) : `${soles(r.total)} · ${etiquetaCobro(r)}`}</small>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="tc__leyenda" aria-label="Leyenda">
            <li><i className="tc__punto tc__punto--cobrada" /> Cobrada</li>
            <li><i className="tc__punto tc__punto--por_cobrar" /> Por cobrar</li>
            <li><i className="tc__punto tc__punto--esperando_pago" /> Esperando pago</li>
            <li><i className="tc__punto tc__punto--libre" /> Libre: tócala para reservar</li>
          </ul>
        </>
      )}

      {reserva && (
        <div className="tc__velo" onMouseDown={(e) => { if (e.target === e.currentTarget) setAbierta(null); }}>
          <section className="tc__hoja" role="dialog" aria-modal="true" aria-label={`Reserva de ${reserva.cliente}`}>
            <div className="tc__hoja-cabeza">
              <h3>{reserva.cliente}</h3>
              <button type="button" aria-label="Cerrar" autoFocus onClick={() => setAbierta(null)}><X size={18} aria-hidden="true" /></button>
            </div>
            <dl className="tc__detalle">
              <div><dt>Cancha</dt><dd>{tablero.columnas.find((c) => c.cancha.id === reserva.cancha)?.cancha.nombre}</dd></div>
              <div><dt>Hora</dt><dd>{fechaCorta(reserva.inicio.slice(0, 10))}, {reserva.inicio.slice(11, 16)} – {reserva.fin.slice(11, 16)}</dd></div>
              {reserva.telefono && <div><dt>Celular</dt><dd>{reserva.telefono}</dd></div>}
              <div><dt>Total</dt><dd>{soles(reserva.total)}</dd></div>
              <div><dt>Estado</dt><dd>{etiquetaCobro(reserva)}</dd></div>
            </dl>
            {acciones(reserva, () => setAbierta(null))}
          </section>
        </div>
      )}
    </section>
  );
}
