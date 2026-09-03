'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * DASHBOARD
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Todas las cifras salen de las vistas ya calculadas (`v_daily_metrics`,
 * `v_orders_by_day`) o de las tablas espejadas. Las que el panel de muestra
 * traía inventadas —meta del día, meta mensual de 200 citas, "98% resueltas",
 * "2.4 s de respuesta"— NO están: no hay ninguna columna detrás de ellas, y un
 * número que no se puede sostener es peor que un hueco.
 *
 * ⚠️ Las métricas se agrupan en HORA DE LIMA, no UTC. Entre las 19:00 y las
 * 23:59 las cifras no cuadran al dedillo con las del bot.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Scissors,
  TrendingUp,
  User,
} from 'lucide-react';
import Topbar from '@/components/panel/Topbar';
import { useSesion } from '@/components/panel/Sesion';
import { useSalud } from '@/components/panel/Salud';
import { useCargar } from '@/components/panel/useCargar';
import { areaPath, seriesPts, smoothPath } from '@/lib/panel/charts';
import { cuando, hora, intent, isoLocal, hace, soles } from '@/lib/panel/format';
import {
  getCitas,
  getCompania,
  getIngresosPorProducto,
  getLeads,
  getMetricasDiarias,
  getPedidosPorDia,
} from '@/lib/supabase/queries';

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const COLORES_SERVICIO = ['#FF4900', '#0E7C86', '#FBB040', '#0FA968', '#7C5CFF'];
const ICONOS_CITA = [
  ['#FDEBE4', '#F26B45', Scissors],
  ['#FFEFE7', '#FF4900', CalendarDays],
  ['#FFE9EE', '#FF5B79', User],
  ['#E8FBF2', '#0FA968', Check],
] as const;

export default function Dashboard() {
  const { companyId, compania } = useSesion();
  const { salud, desconocido } = useSalud();
  const [mesOffset, setMesOffset] = useState(0);
  const [tip, setTip] = useState<{ x: number; y: number; texto: string } | null>(null);

  const { datos, cargando } = useCargar(async () => {
    if (!companyId) return null;
    const desde = isoLocal(hace(29));
    const hasta = isoLocal(new Date());
    // El estado del bot NO se pide aquí: lo sirve <ProveedorSalud> para todo el
    // panel, y se refresca cada 60 s por su cuenta. Pedirlo también en esta
    // pantalla haría dos consultas que pueden contradecirse entre sí.
    const [metricas, pedidosDia, citas, leads, productos, empresa] = await Promise.all([
      getMetricasDiarias(companyId, desde, hasta),
      getPedidosPorDia(companyId, desde),
      getCitas(companyId),
      getLeads(companyId, 200),
      getIngresosPorProducto(companyId, desde, hasta).catch(() => []),
      getCompania(companyId),
    ]);
    return { metricas, pedidosDia, citas, leads, productos, empresa };
  }, [companyId]);

  const hoy = isoLocal(new Date());

  /** Los últimos 7 días SIEMPRE, con ceros incluidos: una vista solo trae los días que tuvieron algo. */
  const semana = useMemo(() => {
    const porFecha = new Map((datos?.pedidosDia ?? []).map((p) => [p.date, p.revenue]));
    return Array.from({ length: 7 }, (_, i) => {
      const d = hace(6 - i);
      const iso = isoLocal(d);
      return { iso, dia: DIAS_CORTOS[d.getDay()], ingresos: porFecha.get(iso) ?? 0 };
    });
  }, [datos]);

  const metricaHoy = datos?.metricas.find((m) => m.date === hoy);
  const leadsHoy = metricaHoy?.leads ?? 0;
  const citasHoy = metricaHoy?.appointments ?? 0;
  const pagadosHoy = metricaHoy?.paid_orders ?? 0;
  const ingresosHoy = metricaHoy?.revenue ?? 0;
  const conversion = leadsHoy ? Math.round((pagadosHoy / leadsHoy) * 1000) / 10 : 0;

  /** Sparkline de leads: los 30 días de v_daily_metrics, tal cual. */
  const chispa = useMemo(() => {
    const vals = (datos?.metricas ?? []).map((m) => m.leads);
    return vals.length > 1 ? seriesPts(vals, 300, 52, 6) : [];
  }, [datos]);

  /** Citas del mes en curso, y cuántas acabaron bien. Es el anillo. */
  const anillo = useMemo(() => {
    const ahora = new Date();
    const delMes = (datos?.citas ?? []).filter(
      (c) => c.inicio && c.inicio.getMonth() === ahora.getMonth() && c.inicio.getFullYear() === ahora.getFullYear(),
    );
    const hechas = delMes.filter((c) => c.status === 'completed' || c.status === 'confirmed').length;
    const pct = delMes.length ? Math.round((hechas / delMes.length) * 100) : 0;
    return { total: delMes.length, hechas, pct };
  }, [datos]);

  const proximas = useMemo(() => {
    const ahora = Date.now();
    return (datos?.citas ?? [])
      .filter((c) => c.status === 'confirmed' && c.inicio && c.inicio.getTime() >= ahora)
      .slice(0, 4);
  }, [datos]);

  const nombrePorLead = useMemo(
    () => new Map((datos?.leads ?? []).map((l) => [l.id, l.name || l.phone])),
    [datos],
  );

  const recientes = (datos?.leads ?? []).filter((l) => l.last_message).slice(0, 4);
  const maxIngreso = Math.max(...semana.map((s) => s.ingresos), 1);
  const productos = (datos?.productos ?? []).slice(0, 5);
  const maxProducto = Math.max(...productos.map((p) => p.revenue), 1);

  /* ── Calendario del carril derecho ──────────────────────────────────── */
  const cal = useMemo(() => {
    const base = new Date();
    base.setDate(1);
    base.setMonth(base.getMonth() + mesOffset);
    const y = base.getFullYear();
    const m = base.getMonth();
    const hoyD = new Date();
    const esMesActual = y === hoyD.getFullYear() && m === hoyD.getMonth();

    const marcas = new Set(
      (datos?.citas ?? [])
        .filter((c) => c.inicio && c.inicio.getFullYear() === y && c.inicio.getMonth() === m)
        .map((c) => c.inicio!.getDate()),
    );

    return {
      titulo: base.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' }).replace(/^./, (c) => c.toUpperCase()),
      primero: new Date(y, m, 1).getDay(),
      dias: new Date(y, m + 1, 0).getDate(),
      hoy: esMesActual ? hoyD.getDate() : -1,
      marcas,
    };
  }, [mesOffset, datos]);

  if (cargando && !datos) {
    return (
      <main className="main">
        <div className="cargando">
          <div className="spin" />
          Cargando tu panel…
        </div>
      </main>
    );
  }

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Dashboard" sub={compania?.nombre ?? undefined} />

        <div className="dash">
          <div className="mgrid">
            {/* ── Ingresos ── */}
            <div className="card goal">
              <div className="card-mini-head">
                <h3>Ingresos de hoy</h3>
                <Link href="/panel/metricas" className="arr">
                  <ChevronRight size={15} />
                </Link>
              </div>
              <div className="big">Solo cuentan los pedidos pagados</div>
              <div className="num">{soles(ingresosHoy)}</div>
              <div className="bars-legend">
                <span>
                  <i style={{ background: '#FF4900' }} />
                  Ingresos · últimos 7 días
                </span>
              </div>
              <div className="bars">
                {semana.map((d, i) => (
                  <div
                    key={d.iso}
                    className="b"
                    onMouseEnter={(e) => {
                      const caja = e.currentTarget.closest('.goal')!.getBoundingClientRect();
                      const barra = e.currentTarget.getBoundingClientRect();
                      setTip({
                        x: barra.left - caja.left + barra.width / 2,
                        y: barra.top - caja.top - 6,
                        texto: `${d.dia} · ${soles(d.ingresos)}`,
                      });
                    }}
                    onMouseLeave={() => setTip(null)}
                  >
                    <i
                      style={{
                        height: `${(d.ingresos / maxIngreso) * 100}%`,
                        background: i === 6 ? '#FF4900' : '#FFB08A',
                      }}
                    />
                  </div>
                ))}
              </div>
              <div
                className={`bar-tip ${tip ? 'show' : ''}`}
                style={tip ? { left: tip.x, top: tip.y } : undefined}
              >
                {tip?.texto}
              </div>
              <div className="tiles">
                <div className="tile">
                  <div className="ic" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
                    <MessageCircle size={16} />
                  </div>
                  <b>{leadsHoy}</b>
                  <small>Leads</small>
                </div>
                <div className="tile">
                  <div className="ic" style={{ background: '#FDEBE4', color: '#F26B45' }}>
                    <CalendarDays size={16} />
                  </div>
                  <b>{citasHoy}</b>
                  <small>Citas</small>
                </div>
                <div className="tile">
                  <div className="ic" style={{ background: '#FFE9EE', color: '#FF5B79' }}>
                    <TrendingUp size={16} />
                  </div>
                  <b>{conversion}%</b>
                  <small>Conv.</small>
                </div>
              </div>
            </div>

            {/* ── Estado del bot ── */}
            <div className="card">
              <div className="card-mini-head">
                <h3>Estado del bot</h3>
                <span className={`badge-pill ${desconocido ? 'b-mute' : salud?.vivo ? 'b-new' : 'b-hot'}`}>
                  {desconocido ? 'sin registrar' : (salud?.status ?? '—')}
                </span>
              </div>
              {/*
                Dos chips y no uno: el proceso puede estar perfectamente vivo
                con la sesión de WhatsApp caída. Son dos problemas distintos y
                se arreglan de dos maneras distintas, así que se enseñan por
                separado. Sin instancia registrada, ninguno de los dos se pinta
                en rojo — todavía no hay nada que afirmar.
              */}
              <div className="status-top">
                <div className="status-chip">
                  <div
                    className="d"
                    style={
                      desconocido
                        ? { background: 'var(--bg-input)', color: 'var(--ink-mute)' }
                        : salud?.vivo
                          ? { background: '#E8FBF2', color: '#0FA968' }
                          : { background: '#FFE9EE', color: '#FF5B79' }
                    }
                  >
                    <CheckCircle size={14} />
                  </div>
                  <div>
                    <b>{desconocido ? '—' : salud?.vivo ? 'En línea' : 'Apagado'}</b>
                    <small>Proceso</small>
                  </div>
                </div>
                <div className="status-chip">
                  <div
                    className="d"
                    style={
                      desconocido
                        ? { background: 'var(--bg-input)', color: 'var(--ink-mute)' }
                        : salud?.wa_connected
                          ? { background: 'var(--brand-soft)', color: 'var(--brand)' }
                          : { background: '#FFE9EE', color: '#FF5B79' }
                    }
                  >
                    <MessageCircle size={14} />
                  </div>
                  <div>
                    <b>{desconocido ? '—' : salud?.wa_connected ? 'Vinculado' : 'Caído'}</b>
                    <small>WhatsApp</small>
                  </div>
                </div>
              </div>
              <div className="spark">
                {chispa.length > 0 && (
                  <svg viewBox="0 0 300 52" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#FF4900" stopOpacity=".2" />
                        <stop offset="1" stopColor="#FF4900" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={areaPath(chispa, 300, 52)} fill="url(#gS)" />
                    <path
                      d={smoothPath(chispa)}
                      fill="none"
                      stroke="#FF4900"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
              </div>
              <p className="muted" style={{ fontSize: 12 }}>
                {/* El diagnóstico viene ya redactado desde la vista: no se reescribe aquí. */}
                {desconocido
                  ? 'Esta compañía todavía no tiene una instancia del bot registrada.'
                  : (salud?.diagnostico ?? 'Leads de los últimos 30 días.')}
              </p>
            </div>

            {/* ── Citas del mes ── */}
            <div className="card">
              <div className="card-mini-head">
                <h3>Citas de este mes</h3>
              </div>
              <div className="ring-wrap">
                <div className="ring">
                  <svg viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#EEF0F6" strokeWidth="3.5" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.9"
                      fill="none"
                      stroke="#FF4900"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeDasharray={`${anillo.pct} ${100 - anillo.pct}`}
                      strokeDashoffset="25"
                      transform="rotate(-90 18 18)"
                    />
                  </svg>
                  <div className="c">{anillo.pct}%</div>
                </div>
                <div className="ring-txt">
                  <b>
                    {anillo.hechas} / {anillo.total} citas
                  </b>
                  <p>
                    {anillo.total === 0
                      ? 'Todavía no hay citas este mes.'
                      : 'Confirmadas o ya atendidas sobre el total del mes.'}
                  </p>
                </div>
              </div>
            </div>

            {/* ── Servicios top ── */}
            <div className="card">
              <div className="card-mini-head">
                <h3>Servicios más vendidos</h3>
              </div>
              {productos.length === 0 ? (
                <p className="vacio">Sin ventas registradas en los últimos 30 días.</p>
              ) : (
                productos.map((p, i) => (
                  <div className="svc-bar" key={p.name}>
                    <div className="l">
                      <b>{p.name}</b>
                      <span>
                        {soles(p.revenue)} · {p.units}u
                      </span>
                    </div>
                    <div className="svc-track">
                      <i
                        style={{
                          width: `${(p.revenue / maxProducto) * 100}%`,
                          background: COLORES_SERVICIO[i % COLORES_SERVICIO.length],
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* ── Mensajes recientes ── */}
            <div className="card span2">
              <div className="card-mini-head">
                <h3>Conversaciones recientes</h3>
                <Link
                  href="/panel/mensajes"
                  style={{ fontSize: 13, color: 'var(--brand)', fontWeight: 700 }}
                >
                  Ver todas
                </Link>
              </div>
              {recientes.length === 0 ? (
                <p className="vacio">Todavía no hay conversaciones.</p>
              ) : (
                recientes.map((l) => {
                  const it = intent(l.intent);
                  return (
                    <Link key={l.id} href={`/panel/mensajes?lead=${l.id}`} className="msg-row">
                      <div className="ava-ini" style={{ background: it.color }}>
                        {(l.name || l.phone).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="info">
                        <b>{l.name || l.phone}</b>
                        <p>{l.last_message}</p>
                      </div>
                      <div className="r">
                        <span className={`badge-pill ${it.cls}`}>{it.short}</span>
                        <br />
                        <small>{cuando(l.creado)}</small>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Carril derecho ── */}
          <div className="stack">
            <div className="rail">
              <div className="cal-head">
                <b>{cal.titulo}</b>
                <div className="cal-nav">
                  <div onClick={() => setMesOffset((m) => m - 1)}>
                    <ChevronLeft size={13} />
                  </div>
                  <div onClick={() => setMesOffset((m) => m + 1)}>
                    <ChevronRight size={13} />
                  </div>
                </div>
              </div>
              <div className="cal">
                {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => (
                  <div className="dow" key={i}>
                    {d}
                  </div>
                ))}
                {Array.from({ length: cal.primero }, (_, i) => (
                  <div className="day muted" key={`h${i}`} />
                ))}
                {Array.from({ length: cal.dias }, (_, i) => {
                  const d = i + 1;
                  const clases = ['day'];
                  if (d === cal.hoy) clases.push('today');
                  if (cal.marcas.has(d)) clases.push('mark');
                  return (
                    <div className={clases.join(' ')} key={d}>
                      {d}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rail">
              <div className="card-mini-head">
                <h3>Próximas citas</h3>
                <Link href="/panel/agenda" style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 700 }}>
                  Agenda
                </Link>
              </div>
              {proximas.length === 0 ? (
                <p className="vacio">Sin citas confirmadas por delante.</p>
              ) : (
                proximas.map((c, i) => {
                  const [fondo, color, Icono] = ICONOS_CITA[i % ICONOS_CITA.length];
                  const esHoy = c.inicio && isoLocal(c.inicio) === hoy;
                  return (
                    <div className="appt-row" key={c.id}>
                      <div className="appt-ic" style={{ background: fondo, color }}>
                        <Icono size={18} />
                      </div>
                      <div className="info">
                        <b>{c.service || 'Cita'}</b>
                        <small>
                          {c.inicio ? hora(c.inicio) : '—'} · {nombrePorLead.get(c.lead_id) ?? 'Cliente'}
                        </small>
                      </div>
                      <span className="date">
                        {esHoy ? 'Hoy' : c.inicio ? c.inicio.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }) : ''}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="rail">
              <div className="prof">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/logos/logo-mia.webp" alt="perfil" />
                <div className="who">
                  <b>{datos?.empresa?.name ?? compania?.nombre}</b>
                  <small>{datos?.empresa?.location || 'Sin ubicación configurada'}</small>
                </div>
              </div>
              <div className="prof-stats">
                <div>
                  <b style={{ color: 'var(--brand)' }}>{datos?.leads.length ?? 0}</b>
                  <small>Clientes</small>
                </div>
                <div>
                  <b style={{ color: '#0FA968' }}>{citasHoy}</b>
                  <small>Citas hoy</small>
                </div>
                <div>
                  <b style={{ color: '#FBB040' }}>{metricaHoy?.escalations_pending ?? 0}</b>
                  <small>Pendientes</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
