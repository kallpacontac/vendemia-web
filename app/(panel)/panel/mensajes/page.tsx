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
 *   send_message       · escribirle tú al cliente por WhatsApp
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
import { AlertTriangle, Check, Search, Send } from 'lucide-react';
import { useSesion } from '@/components/panel/Sesion';
import { useComando } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import {
  escucharMensajes,
  getCitas,
  getEscalaciones,
  getLeads,
  getMensajes,
  type Lead,
  type Mensaje,
} from '@/lib/supabase/queries';
import { colorDe, cuando, hora, iniciales, intent, telefono } from '@/lib/panel/format';

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
  const { companyId } = useSesion();
  const comando = useComando();
  const params = useSearchParams();
  const leadDeLaUrl = params.get('lead');

  const [filtro, setFiltro] = useState<Filtro>('all');
  const [busqueda, setBusqueda] = useState('');
  const [activoId, setActivoId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [cargandoChat, setCargandoChat] = useState(false);
  const [borrador, setBorrador] = useState('');
  const [enviando, setEnviando] = useState(false);
  /** Lo que el usuario acaba de pulsar en el interruptor, hasta que el espejo confirme. */
  const [botPendiente, setBotPendiente] = useState<Record<string, boolean>>({});
  const [resueltas, setResueltas] = useState<Set<string>>(new Set());

  const cajaMsgs = useRef<HTMLDivElement>(null);

  const { datos, recargar } = useCargar(async () => {
    if (!companyId) return null;
    const [leads, citas, escalaciones] = await Promise.all([
      getLeads(companyId),
      getCitas(companyId),
      getEscalaciones(companyId),
    ]);
    return { leads, citas, escalaciones };
  }, [companyId]);

  const leads = useMemo(() => datos?.leads ?? [], [datos]);

  // Primera conversación: la de la URL si vino de Leads, si no la más reciente.
  useEffect(() => {
    if (activoId || !leads.length) return;
    setActivoId(leads.find((l) => l.id === leadDeLaUrl)?.id ?? leads[0].id);
  }, [leads, leadDeLaUrl, activoId]);

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

  const citasDelLead = (datos?.citas ?? []).filter((c) => c.lead_id === activoId);
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
    if (!activo || !texto || botActivo) return;
    setEnviando(true);
    const r = await comando<{ phone: string }>('send_message', { lead_id: activo.id, text: texto });
    setEnviando(false);
    // El mensaje NO se pinta a mano: llega por Realtime cuando el bot lo mandó
    // de verdad. Así lo que se ve en el chat es lo que el cliente recibió.
    if (r) setBorrador('');
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
              {escalacionesPendientes(datos?.escalaciones, resueltas) > 0 && (
                <span className="badge-pill b-hot">
                  {escalacionesPendientes(datos?.escalaciones, resueltas)} por revisar
                </span>
              )}
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
              <div key={m.id} className={`msg ${m.role === 'user' ? 'user' : 'bot'}`}>
                {m.role !== 'user' && <span className="tag">🤖 Mia</span>}
                {m.content}
              </div>
            ))}
          </div>

          <div className={`composer ${botActivo ? 'locked' : ''}`}>
            <input
              value={borrador}
              disabled={botActivo || enviando}
              placeholder={
                botActivo ? 'Pausa a Mia para escribir tú' : 'Escribe tu mensaje…'
              }
              onChange={(e) => setBorrador(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void enviar();
              }}
            />
            <button className="send" onClick={() => void enviar()} disabled={botActivo || enviando}>
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

          <h4>Historial de citas</h4>
          {citasDelLead.length === 0 ? (
            <p className="muted" style={{ fontSize: 12.5 }}>
              Sin citas.
            </p>
          ) : (
            citasDelLead.map((c) => (
              <div className="hist" key={c.id}>
                <b>{c.service || 'Cita'}</b>
                <small>
                  {c.recurrente ? 'Grupo recurrente' : c.slot_start} · {c.status}
                </small>
              </div>
            ))
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
