'use client';

/**
 * El día de un negocio de canchas, en UNA pantalla y sin pestañas: lo que hay que atender
 * arriba (las reservas desde la hora actual, con lo que falta cobrar) y el tablero de horas
 * libres debajo. Solo pinta: lo usan el panel (TableroCanchas.tsx, con datos reales) y el
 * ejemplo público (sin sesión). En el celular el tablero enseña una cancha cada vez.
 *
 * Pensado para que el dueño no tenga que pedir el código: quien llega a las 17:00 ya está
 * arriba de la lista. El buscador queda para el que viene de otro día.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CalendarClock, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Plus, RefreshCw, Search, Wallet, X } from 'lucide-react';
import { sumarDias } from '@/modules/tu-pagina/dominio/agenda';
import { fechaCorta } from '@/modules/tu-pagina/dominio/envio';
import { fechaCorta as fechaYHora } from '@/lib/panel/cobro-cancha';
import type { Celda, EstadoCobro, ReservaTablero, Tablero } from '@/lib/panel/tablero-canchas';
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

/** Lo corto que sale a la derecha de cada fila de la lista: lo que hay que hacer con ella. */
function pendienteDe(r: ReservaTablero): string {
  const falta = Math.max(r.total - r.pagado, 0);
  if (r.estado === 'cobrada') return 'Pagada';
  if (r.estado === 'no_vino') return 'No vino';
  if (r.estado === 'esperando_pago') return r.pagado > 0 ? `Pagó ${soles(r.pagado)}` : 'Sin pagar';
  return `Falta ${soles(falta)}`;
}

/** Una reserva encontrada con el buscador, de cualquier día. */
export interface Encontrada {
  id: string;
  slot: string;
  cliente: string;
  telefono: string;
  codigo: string;
  servicio: string;
  estado: string;
}

// Plegada o abierta: lo recuerda cada navegador. Puede no haber almacenamiento (privado, vista previa).
const CLAVE_LISTA = 'tc-lista-abierta';
const leerAbierta = () => { try { return localStorage.getItem(CLAVE_LISTA) === '1'; } catch { return false; } };
const guardarAbierta = (v: boolean) => { try { localStorage.setItem(CLAVE_LISTA, v ? '1' : '0'); } catch { /* sin almacenamiento */ } };

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function TableroCanchasVista({ tablero, fecha, hoy, ahora, alFecha, alLibre, acciones, alRefrescar, enlaceCaja, resaltar, codigos, buscar, cargando = false }: {
  tablero: Tablero;
  fecha: string;
  hoy: string;
  /** 'YYYY-MM-DD HH:MM' en Lima. Con él, hoy empieza en la hora actual. */
  ahora?: string;
  alFecha: (fecha: string) => void;
  alLibre: (cancha: string, inicio: string) => void;
  /** Lo que se puede hacer con la reserva abierta: cada lado pone lo suyo. */
  acciones: (r: ReservaTablero, cerrar: () => void) => ReactNode;
  alRefrescar?: () => void;
  enlaceCaja?: ReactNode;
  resaltar?: string;
  /** id de la reserva → su código R-XXXX (los que se hicieron en la página). */
  codigos?: Record<string, string>;
  /** Buscar en otros días por código, nombre o celular. Sin él, solo se filtra el día. */
  buscar?: (texto: string) => Promise<Encontrada[]>;
  cargando?: boolean;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [activa, setActiva] = useState('');
  const [texto, setTexto] = useState('');
  const [otros, setOtros] = useState<Encontrada[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [porAbrir, setPorAbrir] = useState<string | null>(null);
  const [verJugadas, setVerJugadas] = useState(false);
  const [verPasadas, setVerPasadas] = useState(false);
  // Plegada por defecto: el tablero manda; la lista se abre cuando hace falta.
  const [listaAbierta, setListaAbierta] = useState(false);
  useEffect(() => { setListaAbierta(leerAbierta()); }, []);
  const plegar = () => setListaAbierta((v) => { guardarAbierta(!v); return !v; });
  const reserva = tablero.reservas.find((r) => r.id === abierta) ?? null;
  const columnaActiva = tablero.columnas.some((c) => c.cancha.id === activa) ? activa : tablero.columnas[0]?.cancha.id ?? '';
  const { resumen: t } = tablero;
  const esHoy = fecha === hoy && Boolean(ahora);
  const codigoDe = (id: string) => codigos?.[id] ?? '';

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

  // Encontrada en otro día: se abre en cuanto ese día termina de cargar.
  useEffect(() => {
    if (porAbrir && tablero.reservas.some((r) => r.id === porAbrir)) {
      setAbierta(porAbrir);
      setPorAbrir(null);
    }
  }, [porAbrir, tablero.reservas]);

  // ── La lista: desde la hora actual; lo ya jugado, plegado al final ──────────
  const filtro = normal(texto.trim());
  const digitos = texto.replace(/\D/g, '');
  const coincide = (r: ReservaTablero) => !filtro
    || normal(r.cliente).includes(filtro)
    || normal(codigoDe(r.id)).includes(filtro.replace(/\s/g, ''))
    || (digitos.length >= 3 && (r.telefono ?? '').replace(/\D/g, '').includes(digitos));
  const delDia = tablero.reservas.filter(coincide);
  const vienen = esHoy && !filtro ? delDia.filter((r) => r.fin > ahora!) : delDia;
  const jugadas = esHoy && !filtro ? delDia.filter((r) => r.fin <= ahora!) : [];
  const porCobrarN = (esHoy ? tablero.reservas.filter((r) => r.fin > ahora!) : tablero.reservas)
    .filter((r) => r.estado !== 'cobrada' && r.estado !== 'no_vino').length;

  // Buscar en otros días: solo si se escribió algo y no está en este.
  useEffect(() => {
    setOtros(null);
    if (!buscar || texto.trim().length < 3) return;
    let vivo = true;
    const espera = setTimeout(() => {
      setBuscando(true);
      buscar(texto.trim())
        .then((r) => { if (vivo) setOtros(r.filter((x) => x.slot.slice(0, 10) !== fecha)); })
        .catch(() => { if (vivo) setOtros([]); })
        .finally(() => { if (vivo) setBuscando(false); });
    }, 400);
    return () => { vivo = false; clearTimeout(espera); };
  }, [texto, fecha, buscar]);

  // ── El tablero: hoy, sin las horas que ya terminaron ─────────────────────────
  const desde = useMemo(() => {
    if (!esHoy || verPasadas) return 0;
    const i = tablero.filas.findIndex((f, k) => (tablero.filas[k + 1] ?? '9999') > ahora!);
    return i < 0 ? 0 : i;
  }, [esHoy, verPasadas, tablero.filas, ahora]);
  /** La primera fila visible puede caer en medio de una reserva: se pinta desde ahí. */
  const celdaVisible = (celdas: Celda[], i: number): Celda => {
    const celda = celdas[i];
    if (i !== desde || celda.tipo !== 'cubierta') return celda;
    for (let k = i - 1; k >= 0; k--) {
      const antes = celdas[k];
      if (antes.tipo === 'reserva') return { ...antes, inicio: celda.inicio, filas: Math.max(antes.filas - (i - k), 1) };
    }
    return celda;
  };

  const fila = (r: ReservaTablero) => {
    const cancha = tablero.columnas.find((c) => c.cancha.id === r.cancha)?.cancha.nombre ?? '';
    const ahoraJuega = esHoy && r.inicio <= ahora! && r.fin > ahora!;
    return (
      <li key={r.id}>
        <button type="button" className={`tc-fila tc-fila--${r.estado} ${r.id === resaltar ? 'tc-fila--nueva' : ''}`} onClick={() => setAbierta(r.id)}>
          <span className="tc-fila__hora"><b>{r.inicio.slice(11, 16)}</b><small>{r.fin.slice(11, 16)}</small></span>
          <span className="tc-fila__quien">
            <b>{r.cliente}</b>
            <small>{cancha}{codigoDe(r.id) ? ` · ${codigoDe(r.id)}` : ''}{ahoraJuega ? ' · jugando ahora' : ''}</small>
          </span>
          <span className="tc-fila__cobro">{pendienteDe(r)}</span>
        </button>
      </li>
    );
  };

  return (
    <section className="tc" aria-label="Reservas del día">
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

      {/* ── Lo que hay que atender: plegado, con su resumen en una línea ── */}
      <div className={`tc-lista ${listaAbierta ? 'is-abierta' : ''}`}>
        <button type="button" className="tc-lista__plegar" aria-expanded={listaAbierta} aria-controls="tc-lista-cuerpo" onClick={plegar}>
          <span className="tc-lista__titulo">{esHoy ? 'Reservas desde ahora' : 'Reservas del día'}</span>
          <span className="tc-lista__resumen">
            {(esHoy ? tablero.reservas.filter((r) => r.fin > ahora!) : tablero.reservas).length} · {porCobrarN} por cobrar
          </span>
          <ChevronDown size={18} aria-hidden="true" className="tc-lista__flecha" />
        </button>
        {listaAbierta && <div id="tc-lista-cuerpo" className="tc-lista__cuerpo">
        <label className="tc-buscar">
          <Search size={15} aria-hidden="true" />
          <input type="search" placeholder="Código, nombre o celular" aria-label="Buscar reserva por código, nombre o celular" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>
        {vienen.length > 0 ? (
          <ul className="tc-lista__items">{vienen.map(fila)}</ul>
        ) : (
          <p className="tc-lista__vacia">
            {filtro ? 'Nada con eso en este día.' : esHoy ? 'No quedan reservas por jugar hoy.' : 'Sin reservas este día.'}
          </p>
        )}
        {jugadas.length > 0 && (
          verJugadas
            ? <ul className="tc-lista__items tc-lista__items--jugadas">{jugadas.map(fila)}</ul>
            : <button type="button" className="tc-lista__mas" onClick={() => setVerJugadas(true)}>Ver {jugadas.length} que ya jugaron hoy</button>
        )}
        {filtro && (buscando || (otros && otros.length > 0)) && (
          <div className="tc-lista__otros">
            <small>{buscando ? 'Buscando en otros días…' : 'En otros días'}</small>
            {otros && otros.length > 0 && (
              <ul className="tc-lista__items">
                {otros.map((o) => (
                  <li key={o.id}>
                    <button type="button" className="tc-fila" onClick={() => { setPorAbrir(o.id); setTexto(''); alFecha(o.slot.slice(0, 10)); }}>
                      <span className="tc-fila__hora"><b>{o.slot.slice(11, 16)}</b><small>{fechaYHora(o.slot).split(' · ')[0]}</small></span>
                      <span className="tc-fila__quien"><b>{o.cliente}</b><small>{o.servicio}{o.codigo ? ` · ${o.codigo}` : ''}</small></span>
                      <span className="tc-fila__cobro">Ver</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        </div>}
      </div>

      {/* ── Horarios libres ── */}
      {tablero.filas.length === 0 ? (
        <p className="tc__vacio">Este día está cerrado.</p>
      ) : tablero.columnas.length === 0 ? (
        <p className="tc__vacio">Aún no hay canchas. Agrégalas en Catálogo.</p>
      ) : (
        <>
          <h3 className="tc__titulo">Horarios</h3>
          <div className="tc__selector" role="group" aria-label="Elegir cancha">
            {tablero.columnas.map((c) => (
              <button key={c.cancha.id} type="button" aria-pressed={c.cancha.id === columnaActiva} onClick={() => setActiva(c.cancha.id)}>
                {c.cancha.nombre}<small>{c.libres} {c.libres === 1 ? 'libre' : 'libres'}</small>
              </button>
            ))}
          </div>
          {desde > 0 && <button type="button" className="tc-lista__mas" onClick={() => setVerPasadas(true)}>Ver las {desde} horas anteriores</button>}
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
                {tablero.filas.map((hora, i) => i < desde ? null : (
                  <tr key={hora}>
                    <th scope="row" className="tc__hora">{hora.slice(11, 16)}</th>
                    {tablero.columnas.map((c) => {
                      const celda = celdaVisible(c.celdas, i);
                      const clase = c.cancha.id === columnaActiva ? 'is-activa' : '';
                      if (celda.tipo === 'cubierta') return null;
                      if (celda.tipo === 'pasada') return <td key={c.cancha.id} className={`tc__pasada ${clase}`} aria-label="Hora pasada" />;
                      if (celda.tipo === 'libre') {
                        return (
                          <td key={c.cancha.id} className={clase}>
                            <button type="button" className="tc__libre" aria-label={`${c.cancha.nombre}, ${hora.slice(11, 16)}, libre, ${soles(celda.precio)}. Crear reserva`} onClick={() => alLibre(c.cancha.id, hora)}>
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
              {codigoDe(reserva.id) && <div><dt>Código</dt><dd>{codigoDe(reserva.id)}</dd></div>}
              {reserva.telefono && <div><dt>Celular</dt><dd>{reserva.telefono}</dd></div>}
              <div><dt>Total</dt><dd>{soles(reserva.total)}</dd></div>
              <div><dt>Pagado</dt><dd>{soles(reserva.pagado)}</dd></div>
              <div><dt>Estado</dt><dd>{etiquetaCobro(reserva)}</dd></div>
            </dl>
            {acciones(reserva, () => setAbierta(null))}
          </section>
        </div>
      )}
    </section>
  );
}
