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
  CalendarPlus,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Pencil,
  User,
  Wallet,
  X,
} from 'lucide-react';
import Topbar from '@/components/panel/Topbar';
import AvisarCliente from '@/components/panel/AvisarCliente';
import NuevaCita from '@/components/panel/NuevaCita';
import Confirmar from '@/components/panel/Confirmar';
import Paginacion, { usePaginacion } from '@/components/panel/Paginacion';
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
  parseSlot,
  type Cita,
  type Trabajador,
} from '@/lib/supabase/queries';
import { json } from '@/lib/supabase/parse';
import type { ResultadoMarcarPagado, ResultadoModificarCita } from '@/lib/supabase/commands';
import type { FranjaRecurrente } from '@/lib/supabase/types';

/* ── Qué citas van en cada pestaña ──────────────────────────────────────── */

/**
 * Las tres listas salen de aquí y no de dentro de cada componente, porque la
 * cabecera necesita CONTARLAS antes de pintar ninguna.
 */

/** Puntuales por venir y todavía vivas. Ordenadas de la más cercana en adelante. */
function porVenir(citas: Cita[]): Cita[] {
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
}

/**
 * Puntuales YA PASADAS, de la más reciente hacia atrás.
 *
 * Las recurrentes se quedan fuera: su `slot_start` es "sched:<producto>:<grupo>"
 * y no tienen una hora que haya pasado, así que preguntar «¿vino?» de un grupo
 * no significa nada.
 */
function yaPasaron(citas: Cita[]): Cita[] {
  const ahora = Date.now();
  return citas
    .filter((c) => !c.recurrente && c.inicio && c.inicio.getTime() < ahora && c.status !== 'cancelled')
    .sort((a, b) => (b.inicio?.getTime() ?? 0) - (a.inicio?.getTime() ?? 0));
}

/** De las pasadas, las que piden algo: sin resolver, presuntas, o sin cobrar. */
function pidenAlgo(pasadas: Cita[]): Cita[] {
  return pasadas.filter((c) => {
    const cumplido = selloCumplido('appointment', c.status, c.cumplido_por);
    return (
      cumplido.grado === 'pendiente' || pideRevision(cumplido) || faltaCobrar('appointment', c.status)
    );
  });
}

export default function Agenda() {
  const { companyId } = useSesion();
  const [offset, setOffset] = useState(0);
  const [vista, setVista] = useState<'negocio' | 'cliente'>('negocio');
  /**
   * ⚠️ Las dos listas de citas van en PESTAÑAS, no apiladas encima de la
   * rejilla. «Citas que ya pasaron» crece con cada cita atendida —en un año son
   * miles—, y colgada arriba empujaba hacia abajo justo aquello a lo que se
   * entra a mirar. Ver components/panel/Paginacion.tsx.
   */
  const [tab, setTab] = useState<'semana' | 'proximas' | 'pasadas'>('semana');
  /** Ver la agenda de una sola persona. '' = todo el equipo. */
  const [fEmpleado, setFEmpleado] = useState('');
  /** El formulario de alta: la cita que se pide por teléfono o en el mostrador. */
  const [creando, setCreando] = useState(false);

  const comando = useComando();
  /** La cita que va por el aire ahora mismo, y el hueco sobre el que está. */
  const [arrastrada, setArrastrada] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [porConfirmar, setPorConfirmar] = useState<Pendiente | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);

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
      // Con equipo, el aforo SON ellos (su horario y sus bloqueos), no las
      // sillas. Es la regla del bot: ver construirSemana().
      empleados: datos.trabajadores.map((t) => ({
        id: t.id,
        activo: t.activo,
        horario: t.horario,
      })),
      empleadoId: fEmpleado || undefined,
    });
  }, [datos, offset, fEmpleado]);

  const esRecurrente = datos?.empresa?.business_mode === 'recurring_appointment';

  /**
   * Las citas que se enseñan, ya filtradas por profesional.
   *
   * ⚠️ Las inscripciones a grupos NO se filtran aquí (no tienen `employee_id`):
   * su pestaña usa la lista completa, o elegir a alguien vaciaría los grupos.
   */
  const citasVista = useMemo(() => {
    const todas = datos?.citas ?? [];
    return fEmpleado ? todas.filter((c) => c.employee_id === fEmpleado) : todas;
  }, [datos, fEmpleado]);

  /**
   * Soltar una cita en otro hueco.
   *
   * ⚠️ NO se aplica aquí. Se pide confirmación con el antes y el después: un
   * arrastre se hace sin querer con una facilidad que un botón no tiene, y esto
   * le cambia el día a un cliente de verdad.
   */
  function soltar(slotStart: string) {
    const cita = (datos?.citas ?? []).find((c) => c.id === arrastrada);
    setArrastrada(null);
    setSobre(null);
    // Soltarla donde ya estaba no es un cambio.
    if (!cita || cita.slot_start.slice(0, 16) === slotStart) return;

    const lead = (datos?.leads ?? []).find((l) => l.id === cita.lead_id);
    setPorConfirmar({
      titulo: '¿Cambiar la hora de esta cita?',
      textoConfirmar: 'Sí, moverla',
      detalle: (
        <>
          <p>
            <b>{lead?.name || lead?.phone || 'Cliente'}</b>
            {cita.service ? ` · ${cita.service}` : ''}
          </p>
          <p>
            {textoSlot(cita.slot_start)} → <b>{textoSlot(slotStart)}</b>
          </p>
          <p className="muted">
            Si no cabe, Mia te dirá por qué y la cita se queda como está. Al cliente no le llega
            nada solo: al terminar te doy el mensaje para avisarle.
          </p>
        </>
      ),
      hacer: async () => {
        const a = await mandarCambio(
          comando,
          cita.id,
          { accion: 'mover', slot_start: slotStart },
          'Cita movida',
          recargar,
        );
        if (a) setAviso(a);
      },
    });
  }

  const dnd: Arrastre = {
    activo: arrastrada !== null,
    sobre,
    empezar: setArrastrada,
    terminar: () => {
      setArrastrada(null);
      setSobre(null);
    },
    entrar: setSobre,
    soltar,
  };

  /** Solo para los números de las pestañas: cada lista se filtra luego dentro. */
  const nProximas = useMemo(() => porVenir(citasVista).length, [citasVista]);
  const nPendientes = useMemo(() => pidenAlgo(yaPasaron(citasVista)).length, [citasVista]);

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

        {/*
          El número va en la pestaña a propósito: lo que no se ve, se olvida.
          «Ya pasaron» enseña las que PIDEN algo, no todas — el resto es
          historial y no hay nada que hacer con él.
        */}
        <div className="view-toggle tabs-agenda">
          <button className={tab === 'semana' ? 'active' : ''} onClick={() => setTab('semana')}>
            <CalendarCheck size={15} /> {esRecurrente ? 'Grupos' : 'Semana'}
          </button>
          <button className={tab === 'proximas' ? 'active' : ''} onClick={() => setTab('proximas')}>
            <Clock size={15} /> Próximas{nProximas > 0 ? ` (${nProximas})` : ''}
          </button>
          <button
            className={tab === 'pasadas' ? 'active' : ''}
            onClick={() => setTab('pasadas')}
            title="Citas que ya pasaron y siguen sin confirmar o sin cobrar"
          >
            <CheckCircle size={15} /> Ya pasaron{nPendientes > 0 ? ` (${nPendientes})` : ''}
          </button>
        </div>

        {/*
          ⚠️ El filtro cambia lo que SIGNIFICA la rejilla, no solo lo que enseña.
          Con un profesional elegido es SU agenda: cabe una cita a la vez y sus
          ausencias sí cierran la franja. Con «todo el equipo», lo que cabe a la
          vez es lo menor entre las sillas y la gente que hay para atender.
        */}
        {(!esRecurrente || (datos?.trabajadores.length ?? 0) > 0) && (
          <div className="filtro-fila">
            {/* En un negocio recurrente no se agenda por hora: se inscribe en un
                grupo, y de eso se encarga el bot al vender. */}
            {!esRecurrente && (
              <button className="btn btn-primary btn-sm" onClick={() => setCreando((v) => !v)}>
                <CalendarPlus size={15} /> Nueva cita
              </button>
            )}
            {(datos?.trabajadores.length ?? 0) > 0 && (
              <>
                <select
                  className="select"
                  style={{ maxWidth: 220 }}
                  value={fEmpleado}
                  onChange={(e) => setFEmpleado(e.target.value)}
                >
                  <option value="">Todo el equipo</option>
                  {(datos?.trabajadores ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.activo ? '' : ' · dado de baja'}
                    </option>
                  ))}
                </select>
                {fEmpleado && (
                  <span className="muted" style={{ fontSize: 12 }}>
                    Su agenda: una cita a la vez, y sus ausencias cierran la franja.
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {creando && !esRecurrente && (
          <NuevaCita
            leads={datos?.leads ?? []}
            catalogo={datos?.catalogo ?? []}
            trabajadores={datos?.trabajadores ?? []}
            alCerrar={() => setCreando(false)}
            alCambiar={recargar}
          />
        )}

        {/* El mensaje para el cliente de lo que se acaba de mover arrastrando. */}
        {aviso && <AvisarCliente {...aviso} alCerrar={() => setAviso(null)} />}

        {porConfirmar && (
          <Confirmar
            titulo={porConfirmar.titulo}
            detalle={porConfirmar.detalle}
            textoConfirmar={porConfirmar.textoConfirmar}
            peligro={porConfirmar.peligro}
            ocupado={aplicando}
            alCerrar={() => setPorConfirmar(null)}
            alConfirmar={() => {
              void (async () => {
                setAplicando(true);
                await porConfirmar.hacer();
                setAplicando(false);
                setPorConfirmar(null);
              })();
            }}
          />
        )}

        {tab === 'pasadas' && (
          <PorConfirmar
            citas={citasVista}
            nombrePorLead={new Map((datos?.leads ?? []).map((l) => [l.id, l.name || l.phone]))}
            alCambiar={recargar}
          />
        )}

        {tab === 'proximas' && (
          <Proximas
            citas={citasVista}
            nombrePorLead={new Map((datos?.leads ?? []).map((l) => [l.id, l.name || l.phone]))}
            trabajadores={datos?.trabajadores ?? []}
            alCambiar={recargar}
          />
        )}

        {tab === 'semana' && (esRecurrente ? (
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
                      <Celda key={d.iso + hora} hueco={d.huecos[i]} vista={vista} dnd={dnd} />
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
        ))}
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

/**
 * ⚠️ UNA SOLA CAJA, y no un `return` por cada caso como antes.
 *
 * Los manejadores de arrastre tienen que estar en TODAS las celdas que puedan
 * recibir una cita: con un return distinto por rama, soltar solo habría
 * funcionado en la de «Libre», y arrastrar a una celda que ya tiene una reserva
 * —que es legítimo mientras quede aforo— no habría hecho nada.
 */
function Celda({
  hueco,
  vista,
  dnd,
}: {
  hueco: ReturnType<typeof construirSemana>['dias'][number]['huecos'][number];
  vista: 'negocio' | 'cliente';
  dnd?: Arrastre;
}) {
  /* En el pasado no se suelta: el bot rechaza mover una cita a una hora que ya
     pasó, y ofrecer el gesto para que falle después es peor que no ofrecerlo. */
  const puedeRecibir = Boolean(dnd?.activo) && !hueco.cerrado && !hueco.pasado;
  const sobre = puedeRecibir && dnd?.sobre === hueco.slotStart;

  let clase = '';
  let titulo: string | undefined;
  let contenido: React.ReactNode = null;

  if (hueco.cerrado) {
    clase = 'closed';
    contenido = '—';
  } else if (vista === 'negocio') {
    if (hueco.reservas.length > 0) {
      contenido = (
        <>
          {hueco.reservas.slice(0, 2).map((r) => (
            <div
              className="bk"
              key={r.id}
              /* Solo las de por venir: las pasadas son historial. */
              draggable={Boolean(dnd) && !hueco.pasado}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', r.id);
                e.dataTransfer.effectAllowed = 'move';
                dnd?.empezar(r.id);
              }}
              onDragEnd={() => dnd?.terminar()}
              title={dnd && !hueco.pasado ? 'Arrástrala a otro hueco para cambiarle la hora' : undefined}
            >
              <b>{r.cliente}</b>
              <span className="sv">{r.servicio}</span>
              {r.trabajador && <span className="bb">{r.trabajador}</span>}
            </div>
          ))}
          {hueco.reservas.length > 2 && <div className="more">+{hueco.reservas.length - 2} más</div>}
        </>
      );
    } else if (hueco.cierre) {
      /* Por qué no se puede reservar ahí: «Bloqueado», «Sin nadie» o «No
         trabaja». Antes decía "Libre" en franjas sin nadie en turno. */
      clase = 'closed';
      titulo = hueco.bloqueo ?? '';
      contenido = hueco.cierre;
    } else if (hueco.pasado) {
      clase = 'past';
    } else {
      clase = 'free';
      contenido = 'Libre';
    }
  } else if (hueco.pasado) {
    clase = 'past';
  } else if (hueco.libres > 0 && !hueco.cierre) {
    clase = 'avail';
    contenido = (
      <>
        Disponible
        <span className="sl">
          {hueco.libres} cupo{hueco.libres > 1 ? 's' : ''}
        </span>
      </>
    );
  } else {
    clase = 'full';
    contenido = 'Copado';
  }

  return (
    <div
      className={`cell ${clase} ${sobre ? 'sobre' : ''}`}
      style={hueco.reservas.length > 0 && vista === 'negocio' ? { gap: 4 } : undefined}
      title={titulo}
      // `preventDefault` en dragOver es lo ÚNICO que hace que un sitio acepte
      // lo que se suelta. Sin él, el navegador lo rechaza en silencio.
      onDragOver={
        puedeRecibir
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }
          : undefined
      }
      onDragEnter={puedeRecibir ? () => dnd?.entrar(hueco.slotStart) : undefined}
      onDrop={
        puedeRecibir
          ? (e) => {
              e.preventDefault();
              dnd?.soltar(hueco.slotStart);
            }
          : undefined
      }
    >
      {contenido}
    </div>
  );
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

/**
 * Un cambio pedido y todavía sin confirmar.
 *
 * ⚠️ NADA que toque la cita de un cliente se aplica en el clic: primero el
 * cuadro de confirmación, con el antes y el después escritos. Importa el doble
 * desde que se puede arrastrar en la rejilla — soltar es un gesto fácil de
 * hacer sin querer.
 */
interface Pendiente {
  titulo: string;
  detalle: React.ReactNode;
  textoConfirmar: string;
  peligro?: boolean;
  hacer: () => Promise<void>;
}

/** "2026-09-18 16:00" → "18 sep · 16:00". */
function textoSlot(slot: string): string {
  const d = parseSlot(slot);
  return d ? `${diaMes(d)} · ${horaDe(d)}` : slot;
}

/**
 * Manda el cambio y devuelve lo que hay que enseñar después, o `null` si no se
 * aplicó (ahí useComando ya ha enseñado el motivo del bot).
 *
 * Vive fuera de los componentes porque lo usan los dos caminos —el formulario y
 * el arrastre en la rejilla— y son el mismo comando: duplicarlo sería tener dos
 * sitios donde el mensaje al cliente puede quedarse sin enseñar.
 */
async function mandarCambio(
  comando: ReturnType<typeof useComando>,
  id: string,
  payload: Record<string, unknown>,
  titulo: string,
  alCambiar: () => void,
): Promise<Aviso | null> {
  const r = await comando<ResultadoModificarCita>(
    'modificar_cita',
    { id, ...payload },
    undefined,
    alCambiar,
  );
  if (!r) return null;
  return {
    titulo,
    mensaje: r.mensaje,
    waLink: r.wa_link,
    nota: r.accion === 'cancelar' ? `Queda libre ${r.libera}.` : undefined,
  };
}

/** Lo que la rejilla necesita para poder arrastrar citas de un hueco a otro. */
interface Arrastre {
  /** Hay una cita en el aire ahora mismo. */
  activo: boolean;
  /** El hueco sobre el que está, para pintarlo. */
  sobre: string | null;
  empezar: (citaId: string) => void;
  terminar: () => void;
  entrar: (slotStart: string) => void;
  soltar: (slotStart: string) => void;
}

/** Filas por página en las dos listas de citas. */
const POR_PAGINA = 10;

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
  const avisar = useAvisar();
  const [enVuelo, setEnVuelo] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [destino, setDestino] = useState('');
  const [aviso, setAviso] = useState<Aviso | null>(null);
  /** Nada se aplica en el clic: primero el cuadro con el antes y el después. */
  const [porConfirmar, setPorConfirmar] = useState<Pendiente | null>(null);

  const nombrePorTrabajador = useMemo(
    () => new Map(trabajadores.map((t) => [t.id, t.name])),
    [trabajadores],
  );
  const activos = useMemo(() => trabajadores.filter((t) => t.activo), [trabajadores]);

  const todas = useMemo(() => porVenir(citas), [citas]);
  // Antes de cualquier return: es un hook. Ver usePaginacion().
  const pag = usePaginacion(todas, POR_PAGINA);

  /** Abre el editor con lo que la cita tiene AHORA, no en blanco. */
  function abrir(c: Cita) {
    setFecha(c.slot_start.slice(0, 10));
    setHora(c.slot_start.slice(11, 16));
    setDestino(c.employee_id ?? '');
    setAbierto(c.id);
  }

  /**
   * Hora y profesional se mandan JUNTOS cuando cambian los dos.
   *
   * ⚠️ El bot los acepta en la misma orden (`reasignar` admite `slot_start`), y
   * hacerlo en dos pasos es peor que feo: el primer comando dejaría la cita con
   * el profesional nuevo a la hora vieja —donde puede no caber— y el segundo
   * fallaría por un choque que en realidad no existe.
   *
   * Se manda solo lo que cambió: `accion` la decide el campo que se tocó.
   */
  async function guardar(c: Cita) {
    const slot = `${fecha} ${hora}`;
    const cambiaHora = Boolean(fecha && hora) && slot !== c.slot_start.slice(0, 16);
    /* Vaciar el profesional no es reasignar: el bot exige `employee_id` para
       eso. Quitarle el profesional a una cita no tiene comando, así que no se
       ofrece. */
    const cambiaQuien = Boolean(destino) && destino !== (c.employee_id ?? '');

    if (!cambiaHora && !cambiaQuien) {
      avisar('No has cambiado nada.', 'espera');
      return;
    }

    const payload = cambiaQuien
      ? {
          accion: 'reasignar',
          employee_id: destino,
          ...(cambiaHora ? { slot_start: slot } : {}),
        }
      : { accion: 'mover', slot_start: slot };

    const titulo =
      cambiaHora && cambiaQuien
        ? 'Cita movida y reasignada'
        : cambiaQuien
          ? 'Cita reasignada'
          : 'Cita movida';

    setPorConfirmar({
      titulo: '¿Cambiar esta cita?',
      textoConfirmar: 'Sí, cambiarla',
      detalle: (
        <>
          <p>
            <b>{nombrePorLead.get(c.lead_id) ?? 'Cliente'}</b>
            {c.service ? ` · ${c.service}` : ''}
          </p>
          {cambiaHora && (
            <p>
              Hora: {textoSlot(c.slot_start)} → <b>{textoSlot(slot)}</b>
            </p>
          )}
          {cambiaQuien && (
            <p>
              Profesional:{' '}
              {c.employee_id ? (nombrePorTrabajador.get(c.employee_id) ?? '—') : 'sin asignar'} →{' '}
              <b>{nombrePorTrabajador.get(destino) ?? '—'}</b>
            </p>
          )}
          <p className="muted">
            Si no cabe, Mia te dirá por qué y la cita se queda como está. Al cliente no le llega
            nada solo: al terminar te doy el mensaje para avisarle.
          </p>
        </>
      ),
      hacer: () => ejecutar(c, payload, titulo),
    });
  }

  async function ejecutar(c: Cita, payload: Record<string, unknown>, titulo: string) {
    setEnVuelo(c.id);
    // El mismo camino que usa el arrastre en la rejilla. Ver mandarCambio().
    const a = await mandarCambio(comando, c.id, payload, titulo, alCambiar);
    setEnVuelo(null);
    // Si el bot lo rechazó, useComando ya ha enseñado su motivo: no hay nada
    // que avisar porque la cita no se tocó.
    if (!a) return;
    setAbierto(null);
    setAviso(a);
  }

  /* El mismo cuadro que para mover, y no `window.confirm`: ahí no cabe decir de
     quién es la cita ni qué día era, que es justo lo que hay que mirar antes de
     cancelarle el turno a alguien. */
  function cancelar(c: Cita, quien: string) {
    setPorConfirmar({
      titulo: '¿Cancelar esta cita?',
      textoConfirmar: 'Sí, cancelarla',
      peligro: true,
      detalle: (
        <>
          <p>
            <b>{quien}</b>
            {c.service ? ` · ${c.service}` : ''}
          </p>
          <p>{textoSlot(c.slot_start)}</p>
          <p className="muted">
            Queda libre el horario y Mia podrá venderlo. El cliente no se entera solo: al terminar
            te doy el mensaje para avisarle.
          </p>
        </>
      ),
      hacer: () => ejecutar(c, { accion: 'cancelar' }, 'Cita cancelada'),
    });
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-head">
        <h3>Próximas citas</h3>
        <small className="muted">{todas.length} por delante</small>
      </div>

      {todas.length === 0 && (
        <p className="vacio" style={{ padding: '18px 20px' }}>
          <b>Sin citas por delante</b>
          Cuando Mia cierre una, aparecerá aquí para poder moverla o cancelarla.
        </p>
      )}

      {aviso && (
        <div style={{ padding: '0 16px' }}>
          <AvisarCliente {...aviso} alCerrar={() => setAviso(null)} />
        </div>
      )}

      <div className="confirmar-lista">
        {pag.visibles.map((c) => {
          const quien = nombrePorLead.get(c.lead_id) ?? 'Cliente';
          const estado = ESTADO_CITA[c.status ?? 'confirmed'];
          const ocupado = enVuelo === c.id;
          /* El asignado entra en la lista aunque esté dado de baja: si no,
             el desplegable enseñaría a otra persona como si fuera la suya. */
          const asignado = trabajadores.find((t) => t.id === c.employee_id);
          const opciones = asignado && !asignado.activo ? [asignado, ...activos] : activos;
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
                  <button className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => abrir(c)}>
                    <Pencil size={14} /> Editar
                  </button>
                  <button
                    className="btn btn-ghost btn-sm confirmar-no"
                    disabled={ocupado}
                    onClick={() => void cancelar(c, quien)}
                  >
                    <CalendarOff size={14} /> Cancelar
                  </button>
                </div>
              </div>

              {abierto === c.id && (
                <div className="form-cita">
                  <div>
                    <label className="field-label">Fecha</label>
                    <input
                      className="input"
                      type="date"
                      min={hoyLima()}
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="field-label">Hora</label>
                    <input
                      className="input"
                      type="time"
                      value={hora}
                      onChange={(e) => setHora(e.target.value)}
                    />
                  </div>

                  {/*
                    El profesional solo si el negocio tiene equipo. Y el asignado
                    aparece AUNQUE esté dado de baja: si no, el desplegable
                    enseñaría a otra persona como si fuera la suya y bastaría
                    tocar cualquier otra cosa para reasignarla sin querer.
                  */}
                  {opciones.length > 0 && (
                    <div>
                      <label className="field-label">Profesional</label>
                      <select
                        className="select"
                        value={destino}
                        onChange={(e) => setDestino(e.target.value)}
                      >
                        {!c.employee_id && <option value="">Sin asignar</option>}
                        {opciones.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                            {t.activo ? '' : ' · dado de baja'}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button
                    className="btn btn-primary btn-sm"
                    disabled={ocupado || !fecha || !hora}
                    onClick={() => void guardar(c)}
                  >
                    <Check size={14} /> {ocupado ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setAbierto(null)}>
                    Dejarlo
                  </button>

                  <small className="muted" style={{ flexBasis: '100%', fontSize: 11.5 }}>
                    {/*
                      Se ofrece a todos: quién puede de verdad lo sabe el bot, que
                      lo calcula con la misma función con la que vende.
                    */}
                    Si no se puede —está ocupado, de vacaciones o fuera de su horario— Mia te dirá
                    exactamente por qué y la cita se queda como está.{' '}
                    {/*
                      Y se dice lo que NO se puede tocar, en vez de callarlo: el
                      bot conserva la duración y el servicio, así que un campo
                      aquí prometería un cambio que nunca ocurre.
                    */}
                    <b>
                      La duración ({c.slot_minutes ?? '—'} min) y el servicio ({c.service || '—'}) todavía
                      no se editan desde el panel.
                    </b>
                  </small>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Paginacion pagina={pag.pagina} paginas={pag.paginas} irA={pag.irA} />

      {porConfirmar && (
        <Confirmar
          titulo={porConfirmar.titulo}
          detalle={porConfirmar.detalle}
          textoConfirmar={porConfirmar.textoConfirmar}
          peligro={porConfirmar.peligro}
          ocupado={enVuelo !== null}
          alCerrar={() => setPorConfirmar(null)}
          alConfirmar={() => {
            void (async () => {
              await porConfirmar.hacer();
              setPorConfirmar(null);
            })();
          }}
        />
      )}
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

  const pasadas = useMemo(() => yaPasaron(citas), [citas]);

  /** El recuento honesto de la cabecera: nunca «N atendidas» a secas. */
  const reparto = useMemo(() => repartoCumplido(pasadas, 'appointment'), [pasadas]);

  /** Las que piden algo: sin resolver, presuntas, sin dato, o sin cobrar. */
  const pendientes = useMemo(() => pidenAlgo(pasadas), [pasadas]);

  /**
   * Paginada, y esto no es opcional: la lista crece con cada cita atendida. Va
   * antes de cualquier return, que para eso es un hook.
   */
  const pag = usePaginacion(pendientes, POR_PAGINA);

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
          <b>{pasadas.length === 0 ? 'Todavía no hay citas pasadas' : 'Nada que revisar'}</b>
          {pasadas.length === 0
            ? 'Cuando pase la hora de una cita, aparecerá aquí para confirmar si vino y si se cobró.'
            : 'Todas las que ya pasaron están confirmadas a mano y cobradas.'}
        </p>
      ) : (
        <div className="confirmar-lista">
          {pag.visibles.map((c) => (
            <FilaPorConfirmar
              key={c.id}
              cita={c}
              cliente={nombrePorLead.get(c.lead_id) ?? 'Cliente'}
              ocupado={enVuelo === c.id}
              alResolver={(vino) => void resolver(c, vino)}
              alCobrar={() => void cobrar(c)}
            />
          ))}
          <Paginacion pagina={pag.pagina} paginas={pag.paginas} irA={pag.irA} />
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
