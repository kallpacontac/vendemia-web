'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * AGENDA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La rejilla se calcula en el navegador cruzando horario + citas + bloqueos
 * (ver lib/panel/agenda.ts). Es una foto para mirar: aquí no se reserva.
 *
 * El panel de muestra tenía una "vista cliente" con celdas pulsables que
 * enseñaban un toast de reserva. No se puede sostener: las reservas públicas
 * viven en el bot (`POST /public/:companyId/book`), que no es alcanzable desde
 * internet, y no hay ningún comando de Supabase que cree una cita. La vista
 * cliente se queda —enseña lo mismo que ve el cliente cuando le pregunta a
 * Mia— pero sin botón que prometa algo que no ocurre.
 *
 * Los negocios recurrentes no tienen rejilla: sus citas son
 * "sched:<producto>:<grupo>", no una hora concreta, así que se enseñan como
 * grupos con su ocupación del mes.
 */
import { useMemo, useState } from 'react';
import {
  Briefcase,
  CalendarCheck,
  CalendarOff,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  User,
  UserCog,
  Wallet,
  X,
} from 'lucide-react';
import Topbar from '@/components/panel/Topbar';
import AvisarCliente from '@/components/panel/AvisarCliente';
import { useSesion } from '@/components/panel/Sesion';
import { useAvisar, useComando } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { construirSemana, lunesDe } from '@/lib/panel/agenda';
import { diaMes, ESTADO_CITA, hora as horaDe } from '@/lib/panel/format';
import {
  adelantada,
  claveGrupo,
  hoyLima,
  mesDe,
  ocupa,
  periodoLegible,
  reservando,
} from '@/lib/panel/inscripciones';
import {
  faltaCobrar,
  pideRevision,
  repartoCumplido,
  selloCumplido,
  selloPagado,
  textoReparto,
} from '@/lib/panel/confirmacion';
import {
  getBloqueos,
  getCatalogo,
  getCitas,
  getCompania,
  getLeads,
  getTrabajadores,
  type Cita,
  type Trabajador,
} from '@/lib/supabase/queries';
import { json } from '@/lib/supabase/parse';
import type { ResultadoMarcarPagado, ResultadoModificarCita } from '@/lib/supabase/commands';
import type { FranjaRecurrente } from '@/lib/supabase/types';

export default function Agenda() {
  const { companyId } = useSesion();
  const [offset, setOffset] = useState(0);
  const [vista, setVista] = useState<'negocio' | 'cliente'>('negocio');

  const { datos, cargando, recargar } = useCargar(async () => {
    if (!companyId) return null;
    const [empresa, citas, leads, trabajadores, bloqueos, catalogo] = await Promise.all([
      getCompania(companyId),
      getCitas(companyId),
      getLeads(companyId),
      getTrabajadores(companyId),
      getBloqueos(companyId).catch(() => []),
      getCatalogo(companyId),
    ]);
    return { empresa, citas, leads, trabajadores, bloqueos, catalogo };
  }, [companyId]);

  const semana = useMemo(() => {
    if (!datos?.empresa) return null;
    return construirSemana(offset, {
      citas: datos.citas,
      nombrePorLead: new Map(datos.leads.map((l) => [l.id, l.name || l.phone])),
      nombrePorTrabajador: new Map(datos.trabajadores.map((t) => [t.id, t.name])),
      bloqueos: datos.bloqueos,
      horario: datos.empresa.horario,
      slotMinutos: datos.empresa.slot_minutes ?? 30,
    });
  }, [datos, offset]);

  const esRecurrente = datos?.empresa?.business_mode === 'recurring_appointment';

  if (cargando && !datos) {
    return (
      <main className="main">
        <div className="cargando">
          <div className="spin" />
          Cargando la agenda…
        </div>
      </main>
    );
  }

  const ocupacion = semana?.totales.capacidad
    ? Math.round((semana.totales.reservado / semana.totales.capacidad) * 100)
    : 0;

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Agenda" sub="Disponibilidad y reservas" />

        <div className="summary">
          <div className="sm">
            <div className="ic" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
              <CalendarCheck size={18} />
            </div>
            <div>
              <b>{semana?.totales.reservado ?? 0}</b>
              <small>Reservas esta semana</small>
            </div>
          </div>
          <div className="sm">
            <div className="ic" style={{ background: '#E8FBF2', color: '#0FA968' }}>
              <CheckCircle size={18} />
            </div>
            <div>
              <b>{semana?.totales.libre ?? 0}</b>
              <small>Cupos libres</small>
            </div>
          </div>
          <div className="sm">
            <div className="ic" style={{ background: '#FFECEF', color: '#FF5B79' }}>
              <Flame size={18} />
            </div>
            <div>
              <b>{ocupacion}%</b>
              <small>Ocupación</small>
            </div>
          </div>
        </div>

        <PorConfirmar
          citas={datos?.citas ?? []}
          nombrePorLead={
            new Map((datos?.leads ?? []).map((l) => [l.id, l.name || l.phone]))
          }
          alCambiar={recargar}
        />

        <Proximas
          citas={datos?.citas ?? []}
          nombrePorLead={new Map((datos?.leads ?? []).map((l) => [l.id, l.name || l.phone]))}
          trabajadores={datos?.trabajadores ?? []}
          alCambiar={recargar}
        />

        {esRecurrente ? (
          <Recurrentes
            catalogo={datos?.catalogo ?? []}
            citas={datos?.citas ?? []}
            nombrePorLead={new Map((datos?.leads ?? []).map((l) => [l.id, l.name || l.phone]))}
            alCambiar={recargar}
          />
        ) : (
          <>
            <div className="agenda-head">
              <div className="week-nav">
                <div className="nb" onClick={() => setOffset((o) => o - 1)}>
                  <ChevronLeft size={16} />
                </div>
                <b>
                  {offset === 0 && 'Esta semana · '}
                  {diaMes(lunesDe(offset))} – {diaMes(new Date(lunesDe(offset).getTime() + 6 * 864e5))}
                </b>
                <div className="nb" onClick={() => setOffset((o) => o + 1)}>
                  <ChevronRight size={16} />
                </div>
              </div>
              <div className="view-toggle">
                <button className={vista === 'negocio' ? 'active' : ''} onClick={() => setVista('negocio')}>
                  <Briefcase size={15} /> Vista negocio
                </button>
                <button className={vista === 'cliente' ? 'active' : ''} onClick={() => setVista('cliente')}>
                  <User size={15} /> Vista cliente
                </button>
              </div>
            </div>

            <div className="legend2">
              {vista === 'negocio' ? (
                <>
                  <span>
                    <i style={{ background: 'var(--brand)' }} />
                    Reservado
                  </span>
                  <span>
                    <i style={{ background: 'var(--bg-soft)', border: '1px dashed var(--line-2)' }} />
                    Libre
                  </span>
                  <span>
                    <i style={{ background: '#E7E7E1' }} />
                    Cerrado
                  </span>
                </>
              ) : (
                <>
                  <span>
                    <i style={{ background: 'var(--brand-soft)', border: '1px solid var(--brand)' }} />
                    Disponible
                  </span>
                  <span>
                    <i style={{ background: '#FFECEF', border: '1px solid #FBD0D8' }} />
                    Copado
                  </span>
                  <span>
                    <i style={{ background: '#E7E7E1' }} />
                    Cerrado
                  </span>
                </>
              )}
            </div>

            <div className="cal-scroll">
              <div className="cal-grid">
                <div />
                {semana?.dias.map((d) => (
                  <div className={`gh ${d.esHoy ? 'today' : ''}`} key={d.iso}>
                    <div className="wd">{d.weekday.replace('.', '')}</div>
                    <div className="dt">{d.fecha.getDate()}</div>
                  </div>
                ))}

                {semana?.horas.map((hora, i) => (
                  <FilaDeHoras key={hora} hora={hora}>
                    {semana.dias.map((d) => (
                      <Celda key={d.iso + hora} hueco={d.huecos[i]} vista={vista} />
                    ))}
                  </FilaDeHoras>
                ))}
              </div>
            </div>

            {semana && semana.horas.length === 0 && (
              <div className="vacio">
                <b>No hay horario configurado</b>
                Define los días y las horas de atención en Ajustes y la rejilla aparece sola.
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

/** La rejilla es un grid plano: cada fila es la etiqueta de la hora y sus 7 celdas. */
function FilaDeHoras({ hora, children }: { hora: string; children: React.ReactNode }) {
  return (
    <>
      <div className="hourlbl">{hora}</div>
      {children}
    </>
  );
}

function Celda({
  hueco,
  vista,
}: {
  hueco: ReturnType<typeof construirSemana>['dias'][number]['huecos'][number];
  vista: 'negocio' | 'cliente';
}) {
  if (hueco.cerrado) return <div className="cell closed">—</div>;

  if (vista === 'negocio') {
    if (hueco.reservas.length > 0) {
      return (
        <div className="cell" style={{ gap: 4 }}>
          {hueco.reservas.slice(0, 2).map((r) => (
            <div className="bk" key={r.id}>
              <b>{r.cliente}</b>
              <span className="sv">{r.servicio}</span>
              {r.trabajador && <span className="bb">{r.trabajador}</span>}
            </div>
          ))}
          {hueco.reservas.length > 2 && <div className="more">+{hueco.reservas.length - 2} más</div>}
        </div>
      );
    }
    if (hueco.bloqueo !== null) {
      return (
        <div className="cell closed" title={hueco.bloqueo ?? ''}>
          Bloqueado
        </div>
      );
    }
    if (hueco.pasado) return <div className="cell past" />;
    return <div className="cell free">Libre</div>;
  }

  if (hueco.pasado) return <div className="cell past" />;
  if (hueco.libres > 0 && hueco.bloqueo === null) {
    return (
      <div className="cell avail" style={{ cursor: 'default' }}>
        Disponible
        <span className="sl">
          {hueco.libres} cupo{hueco.libres > 1 ? 's' : ''}
        </span>
      </div>
    );
  }
  return <div className="cell full">Copado</div>;
}

/**
 * Negocios recurrentes: las plazas son de un grupo semanal, no de una hora.
 *
 * `slot_start` vale "sched:<id del producto>:<id del grupo>" y el grupo vive en
 * catalog.schedule_slots. Quién ocupa plaza lo decide lib/panel/inscripciones.ts,
 * que es la regla del bot copiada: confirmada y con el periodo cubriendo hoy.
 */
function Recurrentes({
  catalogo,
  citas,
  nombrePorLead,
  alCambiar,
}: {
  catalogo: { id: string; name: string; schedule_slots: string | null }[];
  citas: Cita[];
  nombrePorLead: Map<string, string>;
  alCambiar: () => void;
}) {
  const DIAS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const [abierto, setAbierto] = useState<string | null>(null);
  const hoy = hoyLima();
  const comando = useComando();
  const [enVuelo, setEnVuelo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  /**
   * Dar de baja a un alumno. Es `cancelar`: lo ÚNICO que se puede hacer con una
   * inscripción desde aquí — moverla o reasignarla no significa nada, porque su
   * hueco es un grupo y no una hora, y cambiar de grupo es otra operación (ocupa
   * una plaza y libera otra) que hace el bot al inscribir.
   */
  async function darDeBaja(c: Cita, quien: string) {
    if (
      !window.confirm(
        `¿Dar de baja a ${quien}? Se libera su plaza del grupo. El cliente no se entera solo: al terminar te doy el mensaje para avisarle.`,
      )
    ) {
      return;
    }
    setEnVuelo(c.id);
    const r = await comando<ResultadoModificarCita>(
      'modificar_cita',
      { id: c.id, accion: 'cancelar' },
      undefined,
      alCambiar,
    );
    setEnVuelo(null);
    if (r) {
      setAviso({
        titulo: `${quien} ya no está en el grupo`,
        mensaje: r.mensaje,
        waLink: r.wa_link,
        nota: r.accion === 'cancelar' ? `Queda libre ${r.libera}.` : undefined,
      });
    }
  }

  /* El id del producto se conserva: sin él no hay clave, y el grupo `manana-lmv`
     de un nivel se confundiría con el del nivel de al lado. */
  const franjas = catalogo.flatMap((c) =>
    json<FranjaRecurrente[]>(c.schedule_slots, []).map((f) => ({
      ...f,
      servicio: c.name,
      clave: claveGrupo(c.id, f.id),
    })),
  );

  if (!franjas.length) {
    return (
      <div className="vacio">
        <b>Este negocio es de grupos recurrentes</b>
        Todavía no hay franjas definidas en el catálogo.
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Grupos · plazas de {mesDe(hoy)}</h3>
        <small className="muted">Cuentan los inscritos con {mesDe(hoy)} pagado</small>
      </div>

      {aviso && (
        <div style={{ padding: '0 16px' }}>
          <AvisarCliente {...aviso} alCerrar={() => setAviso(null)} />
        </div>
      )}
      {franjas.map((f) => {
        const inscritos = citas.filter((c) => ocupa(c, f.clave, hoy));
        const apartando = citas.filter((c) => reservando(c, f.clave, hoy));
        const siguientes = citas.filter((c) => adelantada(c, f.clave, hoy));
        const n = inscritos.length;
        const sinLimite = f.capacity === -1;
        const pct = sinLimite ? 0 : Math.min(100, Math.round((n / (f.capacity || 1)) * 100));

        /* «para octubre: 3». Casi siempre es un solo mes; si hubiera renovaciones
           a dos meses vista, cada mes va por separado y no sumado. */
        const porMes = new Map<string, number>();
        for (const c of siguientes) {
          const mes = mesDe(c.periodo_desde ?? '');
          porMes.set(mes, (porMes.get(mes) ?? 0) + 1);
        }
        const detalle = [...inscritos, ...siguientes, ...apartando];

        return (
          <div className="slotbar" key={f.clave}>
            <div className="lab">
              <b>
                {f.servicio} · {f.label} · {f.days.map((d) => DIAS[d]).join('-')} {f.time}
              </b>
              <span>{sinLimite ? `${n} inscritos` : `${n}/${f.capacity}`}</span>
            </div>
            <div className="track">
              <div
                className="fill"
                style={{
                  width: `${sinLimite ? 100 : pct}%`,
                  background: pct >= 100 ? 'var(--hot)' : pct >= 70 ? 'var(--warm)' : 'var(--bot-on)',
                }}
              />
            </div>
            {(apartando.length > 0 || porMes.size > 0 || detalle.length > 0) && (
              <div className="grupo-extra">
                {/* Aparte, NUNCA sumado a los inscritos: el bot no les guarda
                    la plaza hasta que pagan. */}
                {apartando.length > 0 && (
                  <span className="badge-pill" style={{ color: '#B26B00', background: '#FEF6E7' }}>
                    {apartando.length} reservando sin pagar
                  </span>
                )}
                {[...porMes].map(([mes, k]) => (
                  <span key={mes} className="badge-pill" style={{ color: '#3D5AF1', background: '#EEF1FE' }}>
                    para {mes}: {k}
                  </span>
                ))}
                {detalle.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setAbierto((a) => (a === f.clave ? null : f.clave))}
                  >
                    {abierto === f.clave ? 'Ocultar alumnos' : `Ver alumnos (${detalle.length})`}
                  </button>
                )}
              </div>
            )}
            {abierto === f.clave && (
              <ul className="grupo-alumnos">
                {detalle.map((c) => {
                  const quien = nombrePorLead.get(c.lead_id) ?? 'Alumno';
                  return (
                    <li key={c.id}>
                      <b>{quien}</b>
                      {/* `service` ya dice el pack Y el nivel donde ocupa plaza:
                          «Pack Promo Cyber — 10 Clases (Nivel Básico / Pollito)». */}
                      {c.service && c.service !== f.servicio && <small className="muted">{c.service}</small>}
                      <small className="muted">
                        {c.status === 'pending_payment'
                          ? 'sin pagar'
                          : c.periodo_desde
                            ? `cubre ${periodoLegible(c.periodo_desde, c.periodo_hasta)}`
                            : 'sin periodo · anterior a los periodos, cuenta siempre'}
                      </small>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm confirmar-no"
                        style={{ marginLeft: 'auto' }}
                        disabled={enVuelo === c.id}
                        onClick={() => void darDeBaja(c, quien)}
                        title="Cancelar su inscripción y liberar la plaza"
                      >
                        <X size={13} /> Dar de baja
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */

/**
 * Lo que hay que enseñar después de tocar una cita. Ver AvisarCliente.
 *
 * `waLink` en camelCase y no `wa_link`: lo de abajo es una prop de React, no la
 * fila del bot. La traducción se hace al construirlo, en un solo sitio.
 */
interface Aviso {
  titulo: string;
  mensaje: string;
  waLink: string;
  nota?: string;
}

/** Cuántas citas por delante se listan. Más es una lista que nadie recorre. */
const TOPE_PROXIMAS = 20;

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LAS CITAS QUE ESTÁN POR VENIR · cancelar, mover, cambiar de profesional
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Hasta ahora el panel no podía tocar una cita. Y el bot, cuando hay un pago de
 * por medio, se niega y lo deriva «a una persona del equipo»… que no tenía con
 * qué: `resolve_escalation` solo marcaba el aviso como resuelto y la cita seguía
 * intacta.
 *
 * ⚠️ AQUÍ NO SE CALCULA QUIÉN ESTÁ LIBRE, Y NO ES PEREZA. El panel no tiene el
 * horario de cada trabajador, ni sus bloqueos, ni quién está de turno. Se ofrece
 * la lista entera de activos, se intenta, y si no cabe se enseña el motivo que
 * devuelve el bot —escrito para el dueño— tal cual. Esa cuenta la hace él con la
 * misma función con la que vende; duplicarla aquí es como se acaba con dos
 * clientes a la misma hora.
 *
 * ⚠️ Y NO SE LE ESCRIBE AL CLIENTE: el comando devuelve el mensaje redactado y
 * el enlace, y lo manda una persona. Ver components/panel/AvisarCliente.tsx.
 */
function Proximas({
  citas,
  nombrePorLead,
  trabajadores,
  alCambiar,
}: {
  citas: Cita[];
  nombrePorLead: Map<string, string>;
  trabajadores: Trabajador[];
  alCambiar: () => void;
}) {
  const comando = useComando();
  const [enVuelo, setEnVuelo] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<{ id: string; modo: 'mover' | 'reasignar' } | null>(null);
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [destino, setDestino] = useState('');
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const nombrePorTrabajador = useMemo(
    () => new Map(trabajadores.map((t) => [t.id, t.name])),
    [trabajadores],
  );
  const activos = useMemo(() => trabajadores.filter((t) => t.activo), [trabajadores]);

  /**
   * Solo citas puntuales POR VENIR y todavía vivas. Las recurrentes no tienen
   * hora que mover y se gestionan en su grupo; las pasadas son historial y el
   * bot las rechaza («esa cita ya pasó»).
   */
  const todas = useMemo(() => {
    const ahora = Date.now();
    return citas
      .filter(
        (c) =>
          !c.recurrente &&
          c.inicio &&
          c.inicio.getTime() >= ahora &&
          (c.status === 'confirmed' || c.status === 'pending_payment'),
      )
      .sort((a, b) => (a.inicio?.getTime() ?? 0) - (b.inicio?.getTime() ?? 0));
  }, [citas]);

  const proximas = todas.slice(0, TOPE_PROXIMAS);
  if (todas.length === 0) return null;

  function abrir(c: Cita, modo: 'mover' | 'reasignar') {
    setFecha(c.slot_start.slice(0, 10));
    setHora(c.slot_start.slice(11, 16));
    setDestino('');
    setAbierto({ id: c.id, modo });
  }

  async function ejecutar(c: Cita, payload: Record<string, unknown>, titulo: string) {
    setEnVuelo(c.id);
    const r = await comando<ResultadoModificarCita>(
      'modificar_cita',
      { id: c.id, ...payload },
      undefined,
      alCambiar,
    );
    setEnVuelo(null);
    // Si el bot lo rechazó, useComando ya ha enseñado su motivo y no hay nada
    // que avisar: la cita no se tocó.
    if (!r) return;
    setAbierto(null);
    setAviso({
      titulo,
      mensaje: r.mensaje,
      waLink: r.wa_link,
      nota: r.accion === 'cancelar' ? `Queda libre ${r.libera}.` : undefined,
    });
  }

  async function cancelar(c: Cita, quien: string) {
    const cuando = c.inicio ? `${diaMes(c.inicio)} a las ${horaDe(c.inicio)}` : '';
    if (
      !window.confirm(
        `¿Cancelar la cita de ${quien} del ${cuando}? Queda libre el horario. El cliente no se entera solo: al terminar te doy el mensaje para avisarle.`,
      )
    ) {
      return;
    }
    await ejecutar(c, { accion: 'cancelar' }, 'Cita cancelada');
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-head">
        <h3>Próximas citas</h3>
        <small className="muted">
          {todas.length > TOPE_PROXIMAS
            ? `las ${TOPE_PROXIMAS} más cercanas de ${todas.length}`
            : `${todas.length} por delante`}
        </small>
      </div>

      {aviso && (
        <div style={{ padding: '0 16px' }}>
          <AvisarCliente {...aviso} alCerrar={() => setAviso(null)} />
        </div>
      )}

      <div className="confirmar-lista">
        {proximas.map((c) => {
          const quien = nombrePorLead.get(c.lead_id) ?? 'Cliente';
          const estado = ESTADO_CITA[c.status ?? 'confirmed'];
          const ocupado = enVuelo === c.id;
          return (
            <div key={c.id}>
              <div className="confirmar-fila">
                <div className="confirmar-quien">
                  <b>{quien}</b>
                  <small className="muted">
                    {c.inicio ? `${diaMes(c.inicio)} · ${horaDe(c.inicio)}` : '—'}
                    {c.service ? ` · ${c.service}` : ''}
                    {c.employee_id ? ` · ${nombrePorTrabajador.get(c.employee_id) ?? 'sin asignar'}` : ''}
                  </small>
                </div>

                <div className="confirmar-sellos">
                  {estado && (
                    <span
                      className="badge-pill"
                      style={{ color: estado.color, background: `${estado.color}18` }}
                    >
                      {estado.label}
                    </span>
                  )}
                </div>

                <div className="confirmar-acciones">
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={ocupado}
                    onClick={() => abrir(c, 'mover')}
                  >
                    <Clock size={14} /> Cambiar hora
                  </button>
                  {activos.length > 0 && (
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={ocupado}
                      onClick={() => abrir(c, 'reasignar')}
                    >
                      <UserCog size={14} /> Cambiar profesional
                    </button>
                  )}
                  <button
                    className="btn btn-ghost btn-sm confirmar-no"
                    disabled={ocupado}
                    onClick={() => void cancelar(c, quien)}
                  >
                    <CalendarOff size={14} /> Cancelar
                  </button>
                </div>
              </div>

              {abierto?.id === c.id && (
                <div className="form-cita">
                  {abierto.modo === 'mover' ? (
                    <>
                      <div>
                        <label className="field-label">Nueva fecha</label>
                        <input
                          className="input"
                          type="date"
                          min={hoyLima()}
                          value={fecha}
                          onChange={(e) => setFecha(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="field-label">Nueva hora</label>
                        <input
                          className="input"
                          type="time"
                          value={hora}
                          onChange={(e) => setHora(e.target.value)}
                        />
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={ocupado || !fecha || !hora}
                        onClick={() =>
                          void ejecutar(c, { accion: 'mover', slot_start: `${fecha} ${hora}` }, 'Cita movida')
                        }
                      >
                        <Check size={14} /> {ocupado ? 'Moviendo…' : 'Mover'}
                      </button>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="field-label">Pasar a</label>
                        <select
                          className="select"
                          value={destino}
                          onChange={(e) => setDestino(e.target.value)}
                        >
                          <option value="">Elige a quién</option>
                          {activos
                            .filter((t) => t.id !== c.employee_id)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                        </select>
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={ocupado || !destino}
                        onClick={() =>
                          void ejecutar(
                            c,
                            { accion: 'reasignar', employee_id: destino },
                            'Cita reasignada',
                          )
                        }
                      >
                        <Check size={14} /> {ocupado ? 'Cambiando…' : 'Cambiar'}
                      </button>
                    </>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => setAbierto(null)}>
                    Dejarlo
                  </button>
                  {/* Se ofrecen todos: quién puede de verdad lo sabe el bot. */}
                  <small className="muted" style={{ flexBasis: '100%', fontSize: 11.5 }}>
                    Si no se puede —está ocupado, de vacaciones o fuera de su horario— Mia te dirá
                    exactamente por qué y la cita se queda como está.
                  </small>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LO QUE YA PASÓ Y NADIE HA MIRADO
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Aquí es donde `cumplido_por` deja de ser una columna y se convierte en algo
 * útil. Un cron cierra las citas 2 h después de la hora como `completed`, lo
 * cual significa «pasó la hora y nadie dijo lo contrario» — no «vino».
 *
 * ⚠️ LA REGLA DE DISEÑO: una fila `cron` tiene que INVITAR a corregirse. Es la
 * única razón por la que existe esta sección. Si una presunción se pintara
 * igual que un hecho, nadie corregiría nada y la columna entera no serviría
 * para nada — solo habríamos añadido un campo a la base de datos.
 *
 * Por eso la lista NO son todas las citas pasadas: son solo las que piden algo.
 * Una cita que ya confirmó una persona desaparece de aquí, que es la
 * recompensa de haberla mirado.
 */
function PorConfirmar({
  citas,
  nombrePorLead,
  alCambiar,
}: {
  citas: Cita[];
  nombrePorLead: Map<string, string>;
  alCambiar: () => void;
}) {
  const comando = useComando();
  const avisar = useAvisar();
  const [enVuelo, setEnVuelo] = useState<string | null>(null);

  /**
   * Solo citas puntuales YA PASADAS. Las recurrentes se quedan fuera: su
   * `slot_start` es "sched:<producto>:<grupo>" y no tienen una hora que haya pasado, así
   * que `inicio` viene null y preguntar «¿vino?» de un grupo no significa nada.
   */
  const pasadas = useMemo(() => {
    const ahora = Date.now();
    return citas
      .filter((c) => !c.recurrente && c.inicio && c.inicio.getTime() < ahora && c.status !== 'cancelled')
      .sort((a, b) => (b.inicio?.getTime() ?? 0) - (a.inicio?.getTime() ?? 0));
  }, [citas]);

  /** El recuento honesto de la cabecera: nunca «N atendidas» a secas. */
  const reparto = useMemo(() => repartoCumplido(pasadas, 'appointment'), [pasadas]);

  /** Las que piden algo: sin resolver, presuntas, sin dato, o sin cobrar. */
  const pendientes = useMemo(
    () =>
      pasadas.filter((c) => {
        const cumplido = selloCumplido('appointment', c.status, c.cumplido_por);
        return (
          cumplido.grado === 'pendiente' ||
          pideRevision(cumplido) ||
          faltaCobrar('appointment', c.status)
        );
      }),
    [pasadas],
  );

  if (pasadas.length === 0) return null;

  async function resolver(c: Cita, vino: boolean) {
    setEnVuelo(c.id);
    await comando(
      'marcar_cumplido',
      { tipo: 'appointment', id: c.id, vino },
      vino ? 'Anotado: vino' : 'Anotado: no vino',
      alCambiar,
    );
    setEnVuelo(null);
  }

  async function cobrar(c: Cita) {
    setEnVuelo(c.id);
    /**
     * ⚠️ El `result` trae `cambio`. Si ya estaba cobrada no se anuncia nada:
     * decirle «cobrado» a alguien por algo que ya estaba cobrado le hace creer
     * que acaba de entrar dinero. Por eso el mensaje de éxito va vacío y se
     * decide aquí, con la respuesta delante.
     */
    const r = await comando<ResultadoMarcarPagado>(
      'marcar_pagado',
      { tipo: 'appointment', id: c.id },
      undefined,
      alCambiar,
    );
    if (r) {
      avisar(
        r.cambio
          ? 'Cobrada. El cupo queda confirmado.'
          : 'Esta cita ya constaba como cobrada: no se ha cambiado nada.',
        r.cambio ? 'ok' : 'espera',
      );
    }
    setEnVuelo(null);
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-head">
        <h3>Citas que ya pasaron</h3>
        {/*
          El desglose NO es un adorno: «12 atendidas» a secas mezcla lo que
          confirmó una persona con lo que supuso un reloj, y quien lea esa cifra
          creerá que las doce las miró alguien.
        */}
        <small className="muted">
          {reparto.total} resueltas{textoReparto(reparto) && ` — ${textoReparto(reparto)}`}
        </small>
      </div>

      {pendientes.length === 0 ? (
        <p className="vacio" style={{ padding: '18px 20px' }}>
          Todas confirmadas a mano. Nada que revisar.
        </p>
      ) : (
        <div className="confirmar-lista">
          {pendientes.map((c) => (
            <FilaPorConfirmar
              key={c.id}
              cita={c}
              cliente={nombrePorLead.get(c.lead_id) ?? 'Cliente'}
              ocupado={enVuelo === c.id}
              alResolver={(vino) => void resolver(c, vino)}
              alCobrar={() => void cobrar(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}


function FilaPorConfirmar({
  cita,
  cliente,
  ocupado,
  alResolver,
  alCobrar,
}: {
  cita: Cita;
  cliente: string;
  ocupado: boolean;
  alResolver: (vino: boolean) => void;
  alCobrar: () => void;
}) {
  const cumplido = selloCumplido('appointment', cita.status, cita.cumplido_por);
  const pagado = selloPagado('appointment', cita.status, cita.pagado_por);
  const revisar = pideRevision(cumplido);

  return (
    <div className={`confirmar-fila ${revisar ? 'revisar' : ''}`}>
      <div className="confirmar-quien">
        <b>{cliente}</b>
        <small className="muted">
          {cita.inicio ? `${diaMes(cita.inicio)} · ${horaDe(cita.inicio)}` : '—'}
          {cita.service ? ` · ${cita.service}` : ''}
        </small>
      </div>

      <div className="confirmar-sellos">
        <span
          className="badge-pill"
          style={{ color: cumplido.color, background: `${cumplido.color}18` }}
          title={cumplido.ayuda}
        >
          {cumplido.label}
        </span>
        <span
          className="badge-pill"
          style={{ color: pagado.color, background: `${pagado.color}18` }}
          title={pagado.ayuda}
        >
          {pagado.label}
        </span>
      </div>

      <div className="confirmar-acciones">
        {/*
          DOS OPCIONES, no un check.

          Un check sin marcar es ambiguo entre «no vino» y «todavía no lo he
          mirado», y esa ambigüedad es exactamente la que esta pantalla viene a
          quitar. Con dos botones, no marcar nada significa lo que significa: que
          aún no lo has mirado.
        */}
        <button
          className="btn btn-ghost btn-sm"
          disabled={ocupado}
          onClick={() => alResolver(true)}
          title="Confirmar que sí vino"
        >
          <Check size={14} /> Vino
        </button>
        <button
          className="btn btn-ghost btn-sm confirmar-no"
          disabled={ocupado}
          onClick={() => alResolver(false)}
          title="Marcar que no se presentó"
        >
          <X size={14} /> No vino
        </button>
        {/* Solo si falta cobrarla: su caso es `pending_payment`, donde cobrar
            además LIBERA EL CUPO al pasar a `confirmed`. */}
        {faltaCobrar('appointment', cita.status) && (
          <button className="btn btn-primary btn-sm" disabled={ocupado} onClick={alCobrar}>
            <Wallet size={14} /> Cobrada
          </button>
        )}
      </div>
    </div>
  );
}
