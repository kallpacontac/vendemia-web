'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * MENSAJES · el buzón
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Es la única pantalla del panel que escribe de verdad en la conversación, y
 * las tres escrituras pasan por la cola de comandos:
 *
 *   toggle_bot         · pausar o reactivar a Mia en ESTE lead
 *   send_message       · escribirle tú al cliente por WhatsApp — en su chat
 *                        (con Mia en pausa) o, con «Nuevo», abrirle tú la
 *                        conversación a un número (Mia sigue activa y retoma
 *                        cuando conteste; ver components/panel/NuevoMensaje)
 *   resolve_escalation · cerrar algo que el bot no supo resolver
 *
 * Ninguna de las tres se pinta como hecha antes de tiempo. Lo que se ve en el
 * chat son las filas que el bot escribió y el espejo subió: si el mensaje no
 * llegó a WhatsApp, aquí tampoco aparece. El INSERT en `messages` llega por
 * Realtime en 1-2 segundos.
 *
 * ⚠️ `messages` no tiene company_id: su política resuelve el permiso a través
 * de `leads`, así que siempre se consulta por lead_id.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Check, MessageSquarePlus, Search, Send } from 'lucide-react';
import { useSesion } from '@/components/panel/Sesion';
import { useComando } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { NuevoMensaje } from '@/components/panel/NuevoMensaje';
import { Burbuja } from '@/components/panel/Burbuja';
import { BotonAdjunto, ChipAdjunto, useAdjunto } from '@/components/panel/SelectorAdjunto';
import { useEnviarMensaje } from '@/components/panel/useEnviarMensaje';
import {
  escucharMensajes,
  getCitas,
  getEscalaciones,
  getLeads,
  getMensajes,
  getMovimientosDeLead,
  getTrabajadores,
  type Cita,
  type Lead,
  type Mensaje,
} from '@/lib/supabase/queries';
import { colorDe, cuando, diaMes, hora, iniciales, intent, soles, telefono } from '@/lib/panel/format';
import { selloCumplido } from '@/lib/panel/confirmacion';
import { esIngreso, suma } from '@/lib/panel/dinero';
import { haceCuanto, paraQuien, personasDe, separar } from '@/lib/panel/ficha';
import { esAppointmentFamily } from '@/lib/panel/modo';
import type { MovimientoRow } from '@/lib/supabase/types';

type Filtro = 'all' | 'hot' | 'new' | 'manual';

const ETIQUETA_ESCALACION: Record<string, string> = {
  paid_removal: 'Quitar cita (pagada)',
  paid_reschedule: 'Reprogramar cita (pagada)',
  paid_order_cancel: 'Cancelar pedido (pagado)',
};

export default function MensajesPage() {
  return (
    <Suspense
      fallback={
        <main className="main main--inbox">
          <div className="cargando">
            <div className="spin" />
            Cargando conversaciones…
          </div>
        </main>
      }
    >
      <Mensajes />
    </Suspense>
  );
}

function Mensajes() {
  const { companyId, compania } = useSesion();
  const conCitas = esAppointmentFamily(compania?.business_mode);
  const comando = useComando();
  const params = useSearchParams();
  const leadDeLaUrl = params.get('lead');

  const [filtro, setFiltro] = useState<Filtro>('all');
  const [busqueda, setBusqueda] = useState('');
  const [activoId, setActivoId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  /**
   * Pedidos y citas de este cliente, para la ficha. Ver el efecto de abajo.
   *
   * ⚠️ Con el lead al que PERTENECEN, no solo las filas. Al cambiar de
   * conversación, las filas viejas siguen puestas hasta que llegan las nuevas,
   * y durante ese instante la ficha de un cliente enseñaría lo que dejó otro.
   */
  const [cargados, setCargados] = useState<{ lead: string | null; filas: MovimientoRow[] }>({
    lead: null,
    filas: [],
  });
  const movimientosListos = cargados.lead === activoId;
  const movimientos = movimientosListos ? cargados.filas : [];
  const [cargandoChat, setCargandoChat] = useState(false);
  const [borrador, setBorrador] = useState('');
  const { enviar: enviarMensaje, enviando } = useEnviarMensaje();
  const {
    adjunto,
    subiendo: subiendoAdjunto,
    elegir: elegirAdjunto,
    quitar: quitarAdjunto,
  } = useAdjunto(companyId);
  /** Lo que el usuario acaba de pulsar en el interruptor, hasta que el espejo confirme. */
  const [botPendiente, setBotPendiente] = useState<Record<string, boolean>>({});
  const [resueltas, setResueltas] = useState<Set<string>>(new Set());
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  /**
   * El número al que acabas de escribir, hasta que su lead llega por el espejo.
   * Hace falta si el bot no devuelve `lead_id`: entonces la conversación se
   * abre en cuanto aparece un lead con ese teléfono.
   */
  const [telPendiente, setTelPendiente] = useState<string | null>(null);

  const cajaMsgs = useRef<HTMLDivElement>(null);

  const { datos, recargar } = useCargar(async () => {
    if (!companyId) return null;
    const [leads, citas, escalaciones, trabajadores] = await Promise.all([
      getLeads(companyId),
      getCitas(companyId),
      getEscalaciones(companyId),
      // Para poner nombre a quien atendió cada cita. Si falla, la ficha sale
      // sin nombres de profesional, pero la bandeja no se cae por eso.
      getTrabajadores(companyId).catch(() => []),
    ]);
    return { leads, citas, escalaciones, trabajadores };
  }, [companyId]);

  const leads = useMemo(() => datos?.leads ?? [], [datos]);

  // Primera conversación: la de la URL si vino de Leads, si no la más reciente.
  useEffect(() => {
    if (activoId || !leads.length) return;
    setActivoId(leads.find((l) => l.id === leadDeLaUrl)?.id ?? leads[0].id);
  }, [leads, leadDeLaUrl, activoId]);

  useEffect(() => {
    if (!telPendiente) return;
    const l = leads.find((x) => x.phone.replace(/\D/g, '') === telPendiente);
    if (l) {
      setActivoId(l.id);
      setTelPendiente(null);
    }
  }, [leads, telPendiente]);

  /** Tras escribirle a alguien nuevo, su conversación queda abierta y a la vista. */
  function trasNuevoMensaje(phone: string, leadId: string | null) {
    setNuevoAbierto(false);
    setFiltro('all');
    setBusqueda('');
    if (leadId) setActivoId(leadId);
    else setTelPendiente(phone);
    recargar();
  }

  const activo: Lead | null = leads.find((l) => l.id === activoId) ?? null;

  const botActivo = activo ? (botPendiente[activo.id] ?? activo.botActivo) : true;

  /* ── El chat ────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!activoId) return;
    let vivo = true;
    setCargandoChat(true);

    void getMensajes(activoId)
      .then((m) => {
        if (vivo) setMensajes(m);
      })
      .finally(() => {
        if (vivo) setCargandoChat(false);
      });

    // Los mensajes nuevos llegan por Realtime: los del cliente, los de Mia y
    // los que mandes tú desde aquí. Todos por el mismo camino, porque todos
    // pasan por el bot antes de existir.
    const parar = escucharMensajes(activoId, (m) =>
      setMensajes((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m])),
    );

    return () => {
      vivo = false;
      parar();
    };
  }, [activoId]);

  useEffect(() => {
    const c = cajaMsgs.current;
    if (c) c.scrollTop = c.scrollHeight;
  }, [mensajes]);

  /* ── Lo que ha dejado este cliente ──────────────────────────────────────
     Se pide por lead y no de una vez para toda la empresa: esto es una
     bandeja, y traerse los movimientos de todos los clientes para enseñar el
     total de uno es descargar de más en cada carga. Un fallo aquí no rompe la
     conversación —se queda la ficha sin cifras— porque `v_movimientos` es una
     vista y el panel no controla si existe en la base de ese cliente. */
  useEffect(() => {
    if (!activoId) return;
    let vivo = true;
    void getMovimientosDeLead(activoId)
      .then((m) => {
        if (vivo) setCargados({ lead: activoId, filas: m });
      })
      .catch(() => {
        if (vivo) setCargados({ lead: activoId, filas: [] });
      });
    return () => {
      vivo = false;
    };
  }, [activoId]);

  /* ── Lista ──────────────────────────────────────────────────────────── */
  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return leads.filter((l) => {
      if (filtro === 'hot' && l.intent !== 'purchase_ready') return false;
      if (filtro === 'new' && l.status !== 'new') return false;
      if (filtro === 'manual' && (botPendiente[l.id] ?? l.botActivo)) return false;
      if (q && !(l.name ?? '').toLowerCase().includes(q) && !(l.last_message ?? '').toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [leads, filtro, busqueda, botPendiente]);

  const citasDelLead = useMemo(
    () => (datos?.citas ?? []).filter((c) => c.lead_id === activoId),
    [datos, activoId],
  );
  /**
   * Lo que este cliente ha dejado, y en qué.
   *
   * `esIngreso` y no «todo lo que hay»: una cita cancelada o un pedido sin
   * pagar no es dinero de nadie, y sumarlo aquí inflaría al cliente delante de
   * quien está decidiendo cuánto mimarlo. Es el MISMO criterio que Métricas
   * —ver lib/panel/dinero.ts—, así que las dos cifras se pueden comparar.
   */
  const gastado = suma((movimientos ?? []).filter(esIngreso));
  const pedidosDelLead = (movimientos ?? []).filter((m) => m.fuente === 'order');

  /* ── La ficha: qué tiene por delante, qué se le hizo, y a quién ─────────
     Ver lib/panel/ficha.ts — sobre todo por qué «a quién» no es el cliente. */
  const historial = useMemo(() => separar(citasDelLead), [citasDelLead]);
  const personas = useMemo(() => personasDe(citasDelLead), [citasDelLead]);
  const nombreEmpleado = useMemo(
    () => new Map((datos?.trabajadores ?? []).map((t) => [t.id, t.name])),
    [datos],
  );
  /** El importe de cada cita sale de `v_movimientos`, no se recalcula aquí. */
  const importeCita = useMemo(
    () =>
      new Map(
        (movimientos ?? [])
          .filter((m) => m.fuente === 'appointment')
          .map((m) => [m.movimiento_id, m.importe]),
      ),
    [movimientos],
  );
  /**
   * El historial crece con cada visita, y en un lateral estrecho diez citas ya
   * empujan las escalaciones fuera de la vista. Se enseñan las últimas y se
   * dice cuántas hay — cortar sin decirlo sería esconderlas.
   */
  const [historialEntero, setHistorialEntero] = useState(false);
  // Al abrir otra conversación, plegado otra vez: si no, la siguiente clienta
  // aparece con todo su historial desplegado sin haberlo pedido nadie.
  useEffect(() => setHistorialEntero(false), [activoId]);
  // El archivo elegido es para ESA conversación: al cambiar de cliente se
  // descarta, o saldría hacia quien no era con un clic distraído.
  useEffect(() => quitarAdjunto(), [activoId, quitarAdjunto]);
  const VISIBLES_HISTORIAL = 5;
  const escalacionesDelLead = (datos?.escalaciones ?? []).filter(
    (e) => e.lead_id === activoId && e.status === 'pending' && !resueltas.has(e.id),
  );

  /* ── Acciones ───────────────────────────────────────────────────────── */
  async function alternarBot() {
    if (!activo) return;
    const nuevo = !botActivo;
    setBotPendiente((p) => ({ ...p, [activo.id]: nuevo }));

    const r = await comando<{ lead_id: string; bot_active: number }>(
      'toggle_bot',
      { lead_id: activo.id, active: nuevo },
      nuevo ? 'Mia vuelve a responder a este cliente' : 'Mia queda en pausa: respondes tú',
    );
    // Si el bot no aplicó el cambio, el interruptor vuelve a donde estaba: es
    // preferible a enseñar "manual" mientras Mia sigue contestando sola.
    if (!r) setBotPendiente((p) => ({ ...p, [activo.id]: activo.botActivo }));
    else recargar();
  }

  async function enviar() {
    const texto = borrador.trim();
    if (!activo || (!texto && !adjunto) || botActivo || subiendoAdjunto) return;
    // Doble clic, Enter repetido y reenvíos tras un «se está aplicando»: todo
    // eso lo resuelve useEnviarMensaje. Aquí solo se decide qué mandar.
    const r = await enviarMensaje({ lead_id: activo.id }, texto, adjunto);
    // El mensaje NO se pinta a mano: llega por Realtime cuando el bot lo mandó
    // de verdad. Así lo que se ve en el chat es lo que el cliente recibió.
    if (r) {
      setBorrador('');
      quitarAdjunto();
    }
  }

  async function resolver(id: string) {
    const r = await comando('resolve_escalation', { escalation_id: id }, 'Escalación resuelta');
    if (r) {
      setResueltas((s) => new Set(s).add(id));
      recargar();
    }
  }

  const it = activo ? intent(activo.intent) : null;

  return (
    <main className="main main--inbox">
      <div className="inbox">
        {/* ── LISTA ── */}
        <div className="list">
          <div className="list__head">
            <div className="t">
              <h2>Mensajes</h2>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {escalacionesPendientes(datos?.escalaciones, resueltas) > 0 && (
                  <span className="badge-pill b-hot">
                    {escalacionesPendientes(datos?.escalaciones, resueltas)} por revisar
                  </span>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  title="Escribirle tú primero a un cliente"
                  onClick={() => setNuevoAbierto(true)}
                >
                  <MessageSquarePlus size={15} /> Nuevo
                </button>
              </span>
            </div>
            <div className="search">
              <Search size={16} />
              <input
                placeholder="Buscar conversación…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
          </div>
          <div className="filters">
            {(
              [
                ['all', 'Todos'],
                ['hot', '🔥 Calientes'],
                ['new', 'Nuevos'],
                ['manual', '👤 Manual'],
              ] as [Filtro, string][]
            ).map(([k, txt]) => (
              <div
                key={k}
                className={`fpill ${filtro === k ? 'active' : ''}`}
                onClick={() => setFiltro(k)}
              >
                {txt}
              </div>
            ))}
          </div>
          <div className="convos">
            {lista.length === 0 && (
              <p className="vacio">
                {leads.length === 0 ? 'Todavía no hay conversaciones.' : 'Sin resultados.'}
              </p>
            )}
            {lista.map((l) => {
              const li = intent(l.intent);
              const on = botPendiente[l.id] ?? l.botActivo;
              return (
                <div
                  key={l.id}
                  className={`citem ${activoId === l.id ? 'active' : ''}`}
                  onClick={() => setActivoId(l.id)}
                >
                  <div className="ava-ini" style={{ background: colorDe(l.id) }}>
                    {iniciales(l.name, l.phone)}
                  </div>
                  <span className="botdot" style={{ background: on ? 'var(--bot-on)' : 'var(--bot-off)' }} />
                  <div className="info">
                    <div className="top">
                      <b>{l.name || telefono(l.phone)}</b>
                      <span className="time">{cuando(l.creado)}</span>
                    </div>
                    <div className="prev">{l.last_message ?? ''}</div>
                    <span className={`badge-pill ${li.cls}`} style={{ marginTop: 5 }}>
                      {li.short}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── CHAT ── */}
        <div className="chat">
          <div className="chat__bar">
            <div className="chat__who">
              <div className="ava-ini" style={{ background: activo ? colorDe(activo.id) : '#ccc' }}>
                {activo ? iniciales(activo.name, activo.phone) : '··'}
              </div>
              <div>
                <b>{activo ? activo.name || telefono(activo.phone) : '—'}</b>{' '}
                {it && <span className={`badge-pill ${it.cls}`}>{it.short}</span>}
                {activo?.handoff_at ? (
                  <span className="hoff">
                    🙋 Manual desde {hora(new Date(activo.handoff_at * 1000))}
                  </span>
                ) : null}
                <br />
                <small>{activo?.creado ? `Primer contacto: ${cuando(activo.creado)}` : ''}</small>
              </div>
            </div>
            <div className="bot-ctrl">
              <div className="lbl">
                <b>{botActivo ? '🤖 Bot activo' : '👤 Modo manual'}</b>
                <small>{botActivo ? 'respondiendo automáticamente' : 'tú respondes'}</small>
              </div>
              <div
                className={`toggle ${botActivo ? 'on' : ''}`}
                onClick={() => void alternarBot()}
                role="switch"
                aria-checked={botActivo}
              />
            </div>
          </div>

          <div className={`banner ${!botActivo ? 'show' : ''}`}>
            <AlertTriangle size={16} /> Bot pausado — tú tienes el control. Mia no responderá a este
            cliente hasta que la reactives.
          </div>

          <div className="msgs" ref={cajaMsgs}>
            {cargandoChat && <p className="vacio">Cargando la conversación…</p>}
            {!cargandoChat && mensajes.length === 0 && (
              <p className="vacio">No hay mensajes en esta conversación.</p>
            )}
            {mensajes.map((m) => (
              <Burbuja key={m.id} m={m} />
            ))}
          </div>

          {adjunto && !botActivo && (
            <div className="composer__adjunto">
              <ChipAdjunto adjunto={adjunto} alQuitar={quitarAdjunto} />
            </div>
          )}
          <div className={`composer ${botActivo ? 'locked' : ''}`}>
            <BotonAdjunto
              alElegir={(f) => void elegirAdjunto(f)}
              deshabilitado={botActivo || enviando}
              subiendo={subiendoAdjunto}
            />
            <input
              value={borrador}
              disabled={botActivo || enviando}
              placeholder={
                botActivo
                  ? 'Pausa a Mia para escribir tú'
                  : adjunto
                    ? 'Añade un texto (opcional)…'
                    : 'Escribe tu mensaje…'
              }
              onChange={(e) => setBorrador(e.target.value)}
              onKeyDown={(e) => {
                // `repeat`: con Enter mantenido el navegador repite el evento.
                if (e.key === 'Enter' && !e.repeat) void enviar();
              }}
            />
            <button
              className="send"
              onClick={() => void enviar()}
              disabled={botActivo || enviando || subiendoAdjunto}
            >
              <Send size={16} />
            </button>
          </div>
        </div>

        {/* ── INFO ── */}
        <div className="info-pane">
          <h4>Información</h4>
          <div className="kv">
            <b>Nombre</b>
            <span>{activo?.name || '—'}</span>
          </div>
          <div className="kv">
            <b>Teléfono</b>
            <span>{activo ? telefono(activo.phone) : '—'}</span>
          </div>
          <div className="kv">
            <b>Primer contacto</b>
            <span>{activo?.creado ? cuando(activo.creado) : '—'}</span>
          </div>
          <div className="kv">
            <b>Intención</b>
            <span>{it?.label ?? '—'}</span>
          </div>
          {/*
            Cuánto ha dejado, al lado de con quién estás hablando. Es el dato
            que cambia el tono de la respuesta —no se le contesta igual a quien
            lleva S/ 900 que a quien preguntó una vez— y hasta ahora había que
            deducirlo leyendo la conversación entera.
          */}
          <div className="kv">
            <b>Ha dejado</b>
            <span title="Pedidos cobrados y citas en pie. Mismo criterio que los ingresos de Métricas.">
              {!movimientosListos ? '…' : movimientos.length === 0 ? 'Todavía nada' : soles(gastado)}
            </span>
          </div>

          {/*
            Lo que describe a cada PERSONA, no al cliente. Con una sola persona
            —quien escribe, que es lo normal— van como dos líneas más de la
            información. Con beneficiarios, una por persona: «se atiende con
            Marco» dicho de la madre sería falso si Marco solo les corta a sus
            hijos. Ver lib/panel/ficha.ts.
          */}
          {conCitas &&
            (personas.length === 1 && !personas[0].nombre ? (
              <>
                <div className="kv">
                  <b>Última cita</b>
                  <span title="La última que no se canceló ni se marcó como «no vino». Que viniera de verdad solo consta si alguien lo marcó.">
                    {personas[0].ultima ? haceCuanto(personas[0].ultima) : '—'}
                  </span>
                </div>
                {personas[0].habitual && (
                  <div className="kv">
                    <b>Se atiende con</b>
                    <span>
                      {nombreEmpleado.get(personas[0].habitual.employeeId) ?? '—'} (
                      {personas[0].habitual.veces} de {personas[0].citas})
                    </span>
                  </div>
                )}
              </>
            ) : (
              personas.length > 0 && (
                <>
                  <h4>Para quién reserva</h4>
                  {personas.map((p) => (
                    <div className="hist" key={p.nombre || '·titular·'}>
                      <b>
                        {p.nombre || activo?.name || 'Quien escribe'}
                        {p.edad ? ` (${p.edad})` : ''}
                      </b>
                      <small>
                        {p.ultima ? `última cita ${haceCuanto(p.ultima)}` : 'ninguna cita todavía'}
                        {p.habitual
                          ? ` · con ${nombreEmpleado.get(p.habitual.employeeId) ?? '—'}`
                          : ''}
                      </small>
                    </div>
                  ))}
                </>
              )
            ))}

          {conCitas && (
            <>
              {historial.proximas.length > 0 && (
                <>
                  <h4>Próximas citas</h4>
                  {historial.proximas.map((c) => (
                    <FilaCita
                      key={c.id}
                      cita={c}
                      estilista={nombreEmpleado.get(c.employee_id ?? '')}
                    />
                  ))}
                </>
              )}

              <h4>
                Historial de citas
                {historial.pasadas.length > VISIBLES_HISTORIAL ? ` (${historial.pasadas.length})` : ''}
              </h4>
              {historial.pasadas.length === 0 ? (
                <p className="muted" style={{ fontSize: 12.5 }}>
                  Sin citas pasadas.
                </p>
              ) : (
                <>
                  {(historialEntero
                    ? historial.pasadas
                    : historial.pasadas.slice(0, VISIBLES_HISTORIAL)
                  ).map((c) => (
                    <FilaCita
                      key={c.id}
                      cita={c}
                      estilista={nombreEmpleado.get(c.employee_id ?? '')}
                      importe={importeCita.get(c.id)}
                      pasada
                    />
                  ))}
                  {historial.pasadas.length > VISIBLES_HISTORIAL && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ marginTop: 6 }}
                      onClick={() => setHistorialEntero((v) => !v)}
                    >
                      {historialEntero
                        ? 'Ver solo las últimas'
                        : `Ver las ${historial.pasadas.length - VISIBLES_HISTORIAL} anteriores`}
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {/*
            Solo si los hay. Un negocio de citas no crea pedidos, así que un
            «Sin pedidos» permanente en su lateral sería un hueco fijo que no
            informa de nada — el mismo criterio que el historial de citas, que
            desaparece entero cuando el negocio no agenda.
          */}
          {pedidosDelLead.length > 0 && (
            <>
              <h4>Historial de pedidos</h4>
              {pedidosDelLead.map((m) => (
                <div className="hist" key={m.movimiento_id}>
                  <b>{m.concepto || 'Pedido'}</b>
                  <small>
                    {m.fecha_servicio ?? m.fecha_creacion} · {m.estado} · {soles(m.importe)}
                  </small>
                </div>
              ))}
            </>
          )}

          <h4>Escalaciones</h4>
          {escalacionesDelLead.length === 0 ? (
            <p className="muted" style={{ fontSize: 12.5 }}>
              Sin escalaciones pendientes.
            </p>
          ) : (
            escalacionesDelLead.map((e) => (
              <div className="esc" key={e.id}>
                <b>⚠️ {ETIQUETA_ESCALACION[e.kind] ?? e.kind}</b>
                <p>{resumenDetalle(e.detalle)}</p>
                <button onClick={() => void resolver(e.id)}>
                  <Check size={11} /> Resolver
                </button>
              </div>
            ))
          )}

          <h4>Notas del cliente</h4>
          {/*
            Solo lectura: `customer_notes` lo escribe el bot según va hablando, y
            no hay comando para cambiarlo. Una caja de texto editable aquí
            guardaría en localStorage y daría la falsa impresión de que el bot
            se entera.
          */}
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            {activo?.customer_notes || 'Mia todavía no ha anotado nada de este cliente.'}
          </p>
        </div>
      </div>
      {nuevoAbierto && (
        <NuevoMensaje leads={leads} alEnviar={trasNuevoMensaje} alCerrar={() => setNuevoAbierto(false)} />
      )}
    </main>
  );
}

function escalacionesPendientes(
  escalaciones: { id: string; status: string }[] | undefined,
  resueltas: Set<string>,
): number {
  return (escalaciones ?? []).filter((e) => e.status === 'pending' && !resueltas.has(e.id)).length;
}

/** El `detail` es JSON abierto: se enseña algo legible sin dar por hecho su forma. */
function resumenDetalle(detalle: Record<string, unknown>): string {
  const texto = detalle.mensaje ?? detalle.message ?? detalle.detail ?? detalle.reason;
  if (typeof texto === 'string') return texto;
  const claves = Object.keys(detalle);
  if (!claves.length) return 'Sin detalle.';
  return claves.map((k) => `${k}: ${String(detalle[k])}`).join(' · ');
}

/**
 * Una cita en la ficha: qué, cuándo, con quién, para quién — y, si ya pasó,
 * cómo acabó y cuánto fue.
 *
 * El sello de «vino / no vino / presunta» es el de lib/panel/confirmacion.ts,
 * el mismo que la Agenda: una cita que cerró el reloj se lee «Presunta» aquí
 * y allí, no «Vino». Salvo la cancelada, que ese módulo no contempla —para él
 * es «Sin resolver», y en un historial eso es falso: sí se sabe qué pasó.
 */
function FilaCita({
  cita,
  estilista,
  importe,
  pasada = false,
}: {
  cita: Cita;
  estilista?: string;
  importe?: number;
  pasada?: boolean;
}) {
  const fecha = cita.recurrente
    ? 'Grupo recurrente'
    : cita.inicio
      ? pasada
        ? diaMes(cita.inicio)
        : `${diaMes(cita.inicio)}, ${hora(cita.inicio)}`
      : '—';
  const para = paraQuien(cita);

  const sello = !pasada
    ? null
    : cita.status === 'cancelled'
      ? { label: 'Cancelada', color: '#93938C', ayuda: 'Se canceló antes de la cita.' }
      : selloCumplido('appointment', cita.status, cita.cumplido_por);

  return (
    <div className="hist">
      <b>
        {cita.service || 'Cita'}
        {sello && (
          <span title={sello.ayuda} style={{ color: sello.color, fontWeight: 700, marginLeft: 6, fontSize: 11 }}>
            · {sello.label}
          </span>
        )}
      </b>
      <small>
        {[fecha, estilista && `con ${estilista}`, para, importe ? soles(importe) : '']
          .filter(Boolean)
          .join(' · ')}
      </small>
    </div>
  );
}
