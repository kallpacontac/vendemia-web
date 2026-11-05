'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * MI PÁGINA · reserva de canchas por modalidad, día y horario
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Lo que sale en /reservar cuando la página tiene canchas (dominio/canchas.ts).
 * Cada hora muestra el precio de ese turno (día o noche). Tras elegir una hora,
 * la persona puede sumar turnos consecutivos libres (hasta MAX_TURNOS).
 * Una hora ocupada ofrece «Avísame si se libera»: nombre y celular, y el
 * dueño lo ve en Mi página → «Avísame».
 *
 * En el celular los horarios van por cancha, sin desplazamiento lateral. La
 * familia del catálogo permite filtrar entre modalidades disponibles.
 *
 * Lo libre/ocupado es una foto de hace como mucho 15 s: el servidor lo rehace
 * con candado al reservar (rutas/reserva.ts → agenda_srv_reservar).
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bell, Check, ChevronLeft, ChevronRight, Clock3, MessageCircle, Minus, Plus, X } from 'lucide-react';
import { sumarDias, sumarMin } from '@/modules/tu-pagina/dominio/agenda';
import { guardarReservaDemo, leerReservasDemo, validarReservaDemo } from '@/modules/tu-pagina/dominio/canchas-ejemplo';
import SubirComprobante from '@/modules/tu-pagina/publico/SubirComprobante';
import {
  MAX_TURNOS,
  adelantoDe,
  canchaLibre,
  canchasDe,
  estadoCasilla,
  filasDelDia,
  mensajeCancha,
  plazoDe,
  precioReserva,
  precioTurno,
  type ConfigCanchas,
} from '@/modules/tu-pagina/dominio/canchas';
import { fechaCorta, urlWhatsApp } from '@/modules/tu-pagina/dominio/envio';
import { soles, validarCliente, type ErroresCliente, type Escaparate, type Item } from '@/modules/tu-pagina/dominio/tienda';
import { CamposCliente, useCliente, useEnviar } from '@/modules/tu-pagina/publico/Escaparate';

const DIAS_A_LA_VISTA = 14;

const MENSAJE_FALLO: Record<string, string> = {
  lleno: 'Alguien acaba de reservar esa cancha. Elige otra hora.',
  pasada: 'Esa hora ya pasó. Elige otra.',
  demasiados: 'Ya tienes varias reservas sin confirmar. Escríbenos por WhatsApp.',
  no_existe: 'Esa cancha ya no está disponible.',
  not_found: 'Esta página ya no recibe reservas en línea. Escríbenos por WhatsApp.',
};

interface MetodoDePago {
  tipo: string;
  numero: string;
  titular: string;
}

interface Terminada {
  codigo: string;
  mensaje: string;
  apartada?: boolean;
  adelanto?: number;
  metodos?: MetodoDePago[];
  telefono?: string;
  precio?: number | null;
  demo?: { id: string; fecha: string };
}

const textoPlazo = (m: number) => (m < 60 ? `${m} minutos` : m < 1440 ? `${m / 60} ${m === 60 ? 'hora' : 'horas'}` : '24 horas');
const numeroBonito = (n: string) => n.replace(/^51(?=\d{9}$)/, '').replace(/(\d{3})(?=\d)/g, '$1 ').trim();

interface Seleccion {
  item: string;
  inicio: string;
  turnos: number;
}

const etiquetaDia = (fecha: string, hoy: string) =>
  fecha === hoy ? 'Hoy' : fecha === sumarDias(hoy, 1) ? 'Mañana' : fechaCorta(fecha).split(' ')[0];

export default function TablaCanchas({ esc, cfg, slug, whatsapp, negocio, ejemplo = false }: {
  esc: Escaparate; cfg: ConfigCanchas; slug: string; whatsapp: string; negocio: string; ejemplo?: boolean;
}) {
  const canchas = useMemo(() => canchasDe(esc), [esc]);
  const tipos = useMemo(() => [...new Set(canchas.map((c) => c.familia).filter(Boolean))], [canchas]);
  const [tipo, setTipo] = useState(tipos[0] ?? '');
  const plazo = plazoDe(cfg);
  const modoComprobante = cfg.comprobante ?? 'whatsapp';
  const visibles = tipo ? canchas.filter((c) => c.familia === tipo) : canchas;

  const dias = useMemo(
    () => Array.from({ length: DIAS_A_LA_VISTA }, (_, i) => sumarDias(esc.hoy, i)).filter((f) => filasDelDia(esc.agenda, f).length > 0),
    [esc.hoy, esc.agenda],
  );
  const [dia, setDia] = useState(dias[0] ?? '');
  const [paginaDias, setPaginaDias] = useState(0);
  const filas = dia ? filasDelDia(esc.agenda, dia) : [];
  const diasVisibles = dias.slice(paginaDias * 7, paginaDias * 7 + 7);

  // Lo que el servidor dijo «lleno» después de pintar: se pinta ocupado sin recargar.
  const [tomadas, setTomadas] = useState<{ item: string; inicio: string; fin: string }[]>([]);
  const agenda = useMemo(
    () => ({ ...esc.agenda, ocupados: [...esc.agenda.ocupados, ...tomadas.map((t) => ({ inicio: t.inicio, fin: t.fin, empleado: '', item: t.item }))] }),
    [esc.agenda, tomadas],
  );

  const [sel, setSel] = useState<Seleccion | null>(null);
  const [avisame, setAvisame] = useState<{ item: Item; inicio: string } | null>(null);
  const [hecho, setHecho] = useState<Terminada | null>(null);

  // Lo que ya se reservó en esta demo sigue ocupado al volver desde el panel del dueño.
  useEffect(() => {
    if (ejemplo) setTomadas(leerReservasDemo().map((r) => ({ item: r.cancha, inicio: r.inicio, fin: r.fin })));
  }, [ejemplo]);

  useEffect(() => {
    if (!sel && !avisame) return;
    const cerrar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSel(null); setAvisame(null); }
    };
    document.addEventListener('keydown', cerrar);
    return () => document.removeEventListener('keydown', cerrar);
  }, [sel, avisame]);

  const itemSel = sel ? canchas.find((c) => c.id === sel.item) ?? null : null;
  const finSel = sel && itemSel ? sumarMin(sel.inicio, itemSel.duracion * sel.turnos) : '';

  function tocarLibre(item: Item, inicio: string) {
    setAvisame(null);
    if (sel && sel.item === item.id) {
      const ultimo = sumarMin(sel.inicio, item.duracion * (sel.turnos - 1));
      // La siguiente de la misma cancha: un turno más, si está libre todo el rato.
      if (inicio === sumarMin(ultimo, item.duracion) && sel.turnos < MAX_TURNOS
          && canchaLibre(agenda, item.id, sel.inicio, item.duracion * (sel.turnos + 1), plazo)) {
        setSel({ ...sel, turnos: sel.turnos + 1 });
        return;
      }
      // La última elegida: un turno menos. La primera con uno solo: se suelta.
      if (inicio === ultimo) {
        setSel(sel.turnos > 1 ? { ...sel, turnos: sel.turnos - 1 } : null);
        return;
      }
    }
    setSel({ item: item.id, inicio, turnos: 1 });
  }

  function moverDias(pagina: number) {
    setPaginaDias(pagina);
    setDia(dias[pagina * 7] ?? dia);
    setSel(null);
    setAvisame(null);
  }

  if (hecho) {
    return (
      <section className="tp-hecho" aria-live="polite">
        <div className="tp-hecho__marca"><Check size={36} aria-hidden="true" /></div>
        <h2 className="tp-h1">{hecho.apartada ? 'Tu cancha está apartada, falta confirmarla' : ejemplo ? 'Así se vería tu reserva' : '¡Tu cancha está reservada!'}</h2>
        <p className="tp-lead">{hecho.apartada ? `${modoComprobante === 'whatsapp' ? 'Confírmala por WhatsApp y paga' : 'Paga y envía tu comprobante'} en los próximos ${textoPlazo(plazo)}. Si no, la cancha se vuelve a ofrecer.` : ejemplo ? 'Es una demostración: no se guardó ni envió nada.' : 'Guarda tu código y avísanos por WhatsApp.'}</p>
        {hecho.apartada && (
          <ol className="tp-pago" aria-label="Cómo confirmar tu reserva">
            {modoComprobante === 'whatsapp' && <li><b>Confirma por WhatsApp</b><span>Se envía el detalle con tu código {hecho.codigo}.</span></li>}
            <li>
              <b>{hecho.adelanto ? `Paga ${soles(hecho.adelanto)}` : 'Paga'} y {modoComprobante === 'pagina' ? 'sube' : modoComprobante === 'ambos' ? 'envía o sube' : 'manda'} la captura</b>
              {hecho.metodos?.[0]
                ? <span className="tp-pago__numero">{[...new Set(hecho.metodos.map((m) => (m.tipo === 'plin' ? 'Plin' : 'Yape')))].join(' o ')}: {numeroBonito(hecho.metodos[0].numero)}</span>
                : <span>Por Yape o Plin. Te pasamos el número en el chat.</span>}
              {hecho.metodos?.[0]?.titular && <span>A nombre de {hecho.metodos[0].titular}</span>}
            </li>
            <li><b>Revisamos tu pago y confirmamos</b><span>{modoComprobante === 'pagina' ? 'Lo ves aquí mismo.' : 'Te avisamos en cuanto esté listo.'}</span></li>
          </ol>
        )}
        <div className="tp-codigo">{hecho.codigo}</div>
        {hecho.apartada && modoComprobante !== 'whatsapp' && <SubirComprobante slug={slug} codigo={hecho.codigo} telefono={hecho.telefono ?? ''} ejemplo={ejemplo} faltaEjemplo={Math.max((hecho.precio ?? 0) - (hecho.adelanto ?? 0), 0)} alValidar={() => { if (hecho.demo) validarReservaDemo(hecho.demo.id); }} />}
        {!ejemplo && (!hecho.apartada || modoComprobante !== 'pagina') && <a className={`tp-boton ${modoComprobante === 'ambos' ? 'tp-boton--suave' : 'tp-boton--wsp'}`} href={urlWhatsApp(whatsapp, hecho.mensaje)} rel="noopener">
          <MessageCircle size={20} aria-hidden="true" /> {hecho.apartada ? 'Confirmar mi reserva por WhatsApp' : 'Avisar por WhatsApp'}
        </a>}
        <p className="tp-resumen">{hecho.mensaje}</p>
        {hecho.demo && <a className="tp-boton tp-boton--enlace" href={`/ejemplos/canchas/panel?fecha=${hecho.demo.fecha}&nueva=${encodeURIComponent(hecho.demo.id)}`}>Ver cómo le llega al dueño <ArrowRight size={18} aria-hidden="true" /></a>}
        <button type="button" className="tp-boton tp-boton--suave" onClick={() => { setHecho(null); setSel(null); }}>Reservar otra</button>
      </section>
    );
  }

  if (!canchas.length || !dias.length) {
    return <p className="tp-vacio">Por ahora no hay canchas para reservar aquí. Escríbenos por WhatsApp.</p>;
  }

  return (
    <div className="tp-canchas">
      {tipos.length > 1 && <section className="tp-canchas__paso" aria-label="Modalidad de fútbol">
        <div className="tp-canchas__paso-titulo"><span>01</span><h2>¿Cuántos juegan?</h2></div>
        <div className="tp-canchas__tipos" role="group" aria-label="Modalidad">
          {tipos.map((t) => <button key={t} type="button" className="tp-canchas__tipo" aria-pressed={tipo === t} onClick={() => { setTipo(t); setSel(null); setAvisame(null); }}>{t}</button>)}
          <button type="button" className="tp-canchas__tipo" aria-pressed={!tipo} onClick={() => { setTipo(''); setSel(null); setAvisame(null); }}>Todas</button>
        </div>
      </section>}

      <section className="tp-canchas__paso" aria-label="Elegir día">
        <div className="tp-canchas__paso-titulo"><span>{tipos.length > 1 ? '02' : '01'}</span><h2>Elige el día</h2><div className="tp-canchas__flechas">
          <button type="button" aria-label="Semana anterior" disabled={paginaDias === 0} onClick={() => moverDias(paginaDias - 1)}><ChevronLeft size={18} /></button>
          <button type="button" aria-label="Semana siguiente" disabled={(paginaDias + 1) * 7 >= dias.length} onClick={() => moverDias(paginaDias + 1)}><ChevronRight size={18} /></button>
        </div></div>
        <div className="tp-canchas__dias" role="group" aria-label="Días disponibles">
          {diasVisibles.map((f) => <button key={f} type="button" aria-pressed={dia === f} onClick={() => { setDia(f); setSel(null); setAvisame(null); }}>
            <small>{etiquetaDia(f, esc.hoy)}</small><b>{f.slice(8, 10)}</b><span>{fechaCorta(f).split(' ').slice(2).join(' ')}</span>
          </button>)}
        </div>
      </section>

      <section className="tp-canchas__paso" aria-label="Elegir cancha y horario">
        <div className="tp-canchas__paso-titulo"><span>{tipos.length > 1 ? '03' : '02'}</span><h2>Cancha y horario</h2></div>
        <p className="tp-canchas__ayuda">{fechaCorta(dia)} · Toca una hora disponible para reservar.</p>
        <div className="tp-canchas__lista">
          {visibles.map((c) => {
            const libres = filas.filter((inicio) => estadoCasilla(agenda, c, inicio, esc.ahora, plazo) === 'libre').length;
            return <article className="tp-canchas__cancha" key={c.id}>
              <div className="tp-canchas__cancha-cabeza"><div><small>{c.familia || 'Fútbol'}</small><h3>{c.nombre}</h3></div><span className="tp-canchas__disponibles">{libres ? `${libres} ${libres === 1 ? 'hora libre' : 'horas libres'}` : 'Sin horas libres'}</span></div>
              <div className="tp-canchas__horarios" role="group" aria-label={`Horarios de ${c.nombre}`}>
                {filas.map((inicio) => {
                  const estado = estadoCasilla(agenda, c, inicio, esc.ahora, plazo);
                  const elegida = Boolean(sel && sel.item === c.id && inicio >= sel.inicio && inicio < finSel);
                  if (estado === 'libre') return <button key={inicio} type="button" className="tp-canchas__horario" aria-pressed={elegida} aria-label={`${c.nombre}, ${inicio.slice(11, 16)}, disponible, ${soles(precioTurno(cfg, c, inicio))}`} onClick={() => tocarLibre(c, inicio)}><b>{inicio.slice(11, 16)}</b><small>{soles(precioTurno(cfg, c, inicio))}</small></button>;
                  if (estado === 'ocupada') return <button key={inicio} type="button" className="tp-canchas__horario tp-canchas__horario--ocupado" aria-label={`${c.nombre}, ${inicio.slice(11, 16)}, ocupada. Avísame si se libera`} onClick={() => { setSel(null); setAvisame({ item: c, inicio }); }}><b>{inicio.slice(11, 16)}</b><small><Bell size={12} aria-hidden="true" /> Avísame</small></button>;
                  return null;
                })}
                {!libres && !filas.some((inicio) => estadoCasilla(agenda, c, inicio, esc.ahora, plazo) === 'ocupada') && <p className="tp-canchas__sin-horas">No hay horarios disponibles este día.</p>}
              </div>
            </article>;
          })}
        </div>
        <p className="tp-canchas__ayuda tp-canchas__ayuda--pie"><Clock3 size={15} aria-hidden="true" /> Puedes ampliar el tiempo de juego al confirmar.</p>
      </section>

      {sel && itemSel && (
        <div className="tp-canchas__velo" onMouseDown={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
        <Confirmar
          key={`${sel.item}|${sel.inicio}`}
          item={itemSel}
          sel={sel}
          precio={precioReserva(cfg, itemSel, sel.inicio, sel.turnos)}
          slug={slug}
          ejemplo={ejemplo}
          adelanto={adelantoDe(cfg, precioReserva(cfg, itemSel, sel.inicio, sel.turnos))}
          direccion={esc.direccion}
          alCerrar={() => setSel(null)}
          puedeSumar={sel.turnos < MAX_TURNOS && canchaLibre(agenda, itemSel.id, sel.inicio, itemSel.duracion * (sel.turnos + 1), plazo)}
          alCambiarTurnos={(n) => setSel((actual) => actual ? { ...actual, turnos: n } : actual)}
          alLlenarse={() => { setTomadas((t) => [...t, { item: sel.item, inicio: sel.inicio, fin: finSel }]); setSel(null); }}
          alTerminar={(h) => {
            if (ejemplo) {
              const id = `demo-${sel.item}-${sel.inicio}`;
              guardarReservaDemo({ id, cancha: sel.item, cliente: h.cliente, inicio: sel.inicio, fin: finSel, total: h.precio ?? 0 });
              setTomadas((t) => [...t, { item: sel.item, inicio: sel.inicio, fin: finSel }]);
              setHecho({ ...h, demo: { id, fecha: sel.inicio.slice(0, 10) } });
              return;
            }
            setHecho(h);
          }}
        />
        </div>
      )}
      {avisame && <div className="tp-canchas__velo" onMouseDown={(e) => { if (e.target === e.currentTarget) setAvisame(null); }}><Avisame key={`${avisame.item.id}|${avisame.inicio}`} item={avisame.item} inicio={avisame.inicio} slug={slug} negocio={negocio} ejemplo={ejemplo} alCerrar={() => setAvisame(null)} /></div>}
    </div>
  );
}

function Confirmar({ item, sel, precio, adelanto, slug, direccion, ejemplo, alCerrar, puedeSumar, alCambiarTurnos, alLlenarse, alTerminar }: {
  item: Item; sel: Seleccion; precio: number | null; adelanto: number; slug: string; direccion: string; ejemplo: boolean;
  alCerrar: () => void; puedeSumar: boolean; alCambiarTurnos: (n: number) => void;
  alLlenarse: () => void; alTerminar: (h: Terminada & { cliente: string; precio: number | null }) => void;
}) {
  const { cliente, setCliente, recordar } = useCliente();
  const [errores, setErrores] = useState<ErroresCliente>({});
  const [fallo, setFallo] = useState('');
  const [extras, setExtras] = useState<string[]>([]);
  const { enviar, enviando } = useEnviar('/api/tu-pagina/publico/reserva');
  const minutos = item.duracion * sel.turnos;
  const sugerencias = ['Agua', 'Gatorade', 'Piqueos y snacks'];

  async function reservar() {
    const e = validarCliente(cliente);
    setErrores(e);
    setFallo('');
    if (Object.keys(e).length) return;
    if (ejemplo) {
      const apartada = adelanto > 0;
      alTerminar({ codigo: 'R-DEMO', telefono: cliente.telefono, cliente: cliente.nombre.trim(), precio, apartada, adelanto, mensaje: mensajeCancha('R-DEMO', { cancha: item.nombre, inicio: sel.inicio, minutos, precio, nombre: cliente.nombre, extras, apartada, adelanto }) });
      return;
    }
    const j = await enviar({ slug, item: item.id, inicio: sel.inicio, turnos: sel.turnos, nombre: cliente.nombre, telefono: cliente.telefono, web: '' });
    if (j.status === 'ok' && typeof j.codigo === 'string') {
      recordar(cliente);
      const apartada = j.estado === 'pending_payment';
      alTerminar({ codigo: j.codigo, apartada, adelanto, telefono: cliente.telefono, metodos: Array.isArray(j.metodos) ? (j.metodos as MetodoDePago[]) : [], cliente: cliente.nombre.trim(), precio, mensaje: mensajeCancha(j.codigo, { cancha: item.nombre, inicio: sel.inicio, minutos, precio, nombre: cliente.nombre, extras, apartada, adelanto }) });
      return;
    }
    if (j.errores) setErrores(j.errores as ErroresCliente);
    setFallo(MENSAJE_FALLO[String(j.status)] ?? (j.status === 'sin_red' ? 'Sin conexión. Revisa tu internet.' : 'No pudimos reservar. Inténtalo otra vez.'));
    if (j.status === 'lleno' || j.status === 'pasada') alLlenarse();
  }

  return (
    <section className="tp-canchas__hoja" role="dialog" aria-modal="true" aria-label="Completar reserva">
      <div className="tp-canchas__hoja-cabeza">
        <h2>Tu reserva</h2>
        <button type="button" className="tp-canchas__cerrar" aria-label="Quitar selección" autoFocus onClick={alCerrar}><X size={18} aria-hidden="true" /></button>
      </div>
      <div className="tp-reserva-resumen"><dl>
        <div><dt>Cancha</dt><dd>{item.nombre}{item.familia ? ` · ${item.familia}` : ''}</dd></div>
        <div><dt>Día</dt><dd>{fechaCorta(sel.inicio.slice(0, 10))}</dd></div>
        <div><dt>Hora</dt><dd>{sel.inicio.slice(11, 16)} – {sumarMin(sel.inicio, minutos).slice(11, 16)}</dd></div>
        {direccion && <div><dt>Dirección</dt><dd>{direccion}</dd></div>}
        <div className="tp-reserva-resumen__precio"><dt>Total</dt><dd>{soles(precio)}</dd></div>
        {adelanto > 0 && precio !== null && <div><dt>Adelanto para confirmar</dt><dd>{soles(adelanto)}</dd></div>}
        {adelanto > 0 && precio !== null && <div><dt>Resto en la cancha</dt><dd>{soles(precio - adelanto)}</dd></div>}
      </dl></div>
      <div className="tp-canchas__duracion"><div><b>Tiempo de juego</b><small>{minutos} min · {sel.turnos} {sel.turnos === 1 ? 'turno' : 'turnos'}</small></div><div className="tp-canchas__duracion-botones"><button type="button" aria-label="Quitar un turno" disabled={sel.turnos === 1} onClick={() => alCambiarTurnos(sel.turnos - 1)}><Minus size={16} /></button><button type="button" aria-label="Añadir un turno" disabled={!puedeSumar} onClick={() => alCambiarTurnos(sel.turnos + 1)}><Plus size={16} /></button></div></div>
      <div className="tp-canchas__extras">
        <h3>¿Algo para el partido? <small>Opcional</small></h3>
        <p>Selecciona lo que te interese y lo pediremos por WhatsApp al confirmar. Precio y disponibilidad a consultar.</p>
        <div role="group" aria-label="Complementos sugeridos">{sugerencias.map((extra) => <button type="button" key={extra} aria-pressed={extras.includes(extra)} onClick={() => setExtras((actuales) => actuales.includes(extra) ? actuales.filter((x) => x !== extra) : [...actuales, extra])}>{extras.includes(extra) && <Check size={14} aria-hidden="true" />}{extra}</button>)}</div>
      </div>
      <CamposCliente d={cliente} errores={errores} alCambiar={(k, v) => { setCliente((c) => ({ ...c, [k]: v })); setErrores((x) => ({ ...x, [k]: undefined })); }} />
      {fallo && <p className="tp-aviso" role="alert">{fallo}</p>}
      <button type="button" className="tp-boton" disabled={enviando} onClick={() => void reservar()}>{enviando ? 'Reservando…' : <>{adelanto > 0 ? 'Apartar mi cancha' : 'Confirmar reserva'} <ArrowRight size={18} aria-hidden="true" /></>}</button>
      <p className="tp-nota">{ejemplo ? 'Esta muestra no guarda ni envía reservas.' : adelanto > 0 ? 'Pon el celular de tu WhatsApp: con ese número revisamos tu pago y confirmamos tu reserva.' : 'La cancha se reserva aquí. Los complementos se solicitan por WhatsApp después.'}</p>
    </section>
  );
}

function Avisame({ item, inicio, slug, negocio, ejemplo, alCerrar }: { item: Item; inicio: string; slug: string; negocio: string; ejemplo: boolean; alCerrar: () => void }) {
  const { cliente, setCliente, recordar } = useCliente();
  const [errores, setErrores] = useState<ErroresCliente>({});
  const [acepta, setAcepta] = useState(false);
  const [fallo, setFallo] = useState('');
  const [horaLibre, setHoraLibre] = useState(false);
  const [listo, setListo] = useState(false);
  const { enviar, enviando } = useEnviar('/api/tu-pagina/publico/avisame');

  async function apuntar() {
    const e = validarCliente(cliente);
    setErrores(e);
    setFallo('');
    setHoraLibre(false);
    if (Object.keys(e).length) return;
    if (!acepta) { setFallo('Marca la casilla para que podamos escribirte.'); return; }
    if (ejemplo) { setListo(true); return; }
    const j = await enviar({ slug, item: item.id, inicio, nombre: cliente.nombre, telefono: cliente.telefono, acepta: true, web: '' });
    if (j.status === 'ok') { recordar(cliente); setListo(true); return; }
    if (j.errores) setErrores(j.errores as ErroresCliente);
    setHoraLibre(j.status === 'libre');
    setFallo(j.status === 'libre' ? 'Esa hora acaba de liberarse. Actualiza los horarios para reservarla.' : j.status === 'pasada' ? 'Esa hora ya pasó.' : j.status === 'demasiados' ? 'Ya te apuntaste a muchas horas hoy.' : j.status === 'sin_red' ? 'Sin conexión. Revisa tu internet.' : 'No pudimos apuntarte. Inténtalo otra vez.');
  }

  return (
    <section className="tp-canchas__hoja" role="dialog" aria-modal="true" aria-label="Avísame si se libera">
      <div className="tp-canchas__hoja-cabeza">
        <h2>Avísame si se libera</h2>
        <button type="button" className="tp-canchas__cerrar" aria-label="Cerrar" autoFocus onClick={alCerrar}><X size={18} aria-hidden="true" /></button>
      </div>
      <p className="tp-lead">{item.nombre} · {fechaCorta(inicio.slice(0, 10))}, {inicio.slice(11, 16)}</p>
      <p className="tp-canchas__aviso-intro">Deja solo tu nombre y celular. Si se libera, {negocio || 'el negocio'} podrá avisarte por WhatsApp. Esto no aparta la cancha.</p>
      {listo ? (
        <p className="tp-canchas__ok" role="status"><Check size={18} aria-hidden="true" /> {ejemplo ? 'Así funcionaría el aviso. En esta muestra no se guardó ni envió nada.' : 'Listo. Dejaste tus datos para esta cancha y hora. Si se libera, podrán contactarte por WhatsApp.'}</p>
      ) : (
        <>
          <CamposCliente d={cliente} errores={errores} alCambiar={(k, v) => { setCliente((c) => ({ ...c, [k]: v })); setErrores((x) => ({ ...x, [k]: undefined })); }} />
          <label className="tp-canchas__acepto">
            <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
            <span>Acepto que {negocio || 'el negocio'} me escriba por WhatsApp para avisarme de esta hora.</span>
          </label>
          {fallo && <p className="tp-aviso" role="alert">{fallo}</p>}
          {horaLibre && <button type="button" className="tp-boton tp-boton--suave" onClick={() => window.location.reload()}>Actualizar horarios</button>}
          {!horaLibre && <button type="button" className="tp-boton" disabled={enviando} onClick={() => void apuntar()}>{enviando ? 'Guardando…' : 'Dejar mis datos'}</button>}
        </>
      )}
    </section>
  );
}
