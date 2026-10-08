'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  ChevronRight,
  MessageCircle,
  Scissors,
  Sparkles,
  TrendingUp,
  User,
} from 'lucide-react';
import Topbar from '@/components/panel/Topbar';
import ResumenNegocio from '@/components/panel/ResumenNegocio';
import InvitacionAvisos from '@/components/panel/InvitacionAvisos';
import { useSesion } from '@/components/panel/Sesion';
import { useCargar } from '@/components/panel/useCargar';
import { useSondeo } from '@/components/panel/useSondeo';
import { cuando, hora, intent, isoLocal, soles } from '@/lib/panel/format';
import { esAppointmentFamily } from '@/lib/panel/modo';
import { anterior, rangoDe, total } from '@/lib/panel/serie';
import { cap, vocabulario } from '@/lib/panel/vocabulario';
import {
  getCitas,
  getCompania,
  getConversaciones,
  getIngresosPorProducto,
  getMetricasDiarias,
  getPendientesDePago,
  getSerie,
} from '@/lib/supabase/queries';
import type { GranoSerie } from '@/lib/supabase/types';

const SONDEO_DASHBOARD_MS = 60000;
const COLORES_SERVICIO = ['#FF5A1F', '#1F8A83', '#E7A62A', '#4F7CFF', '#8B63E6'];
const ICONOS_CITA = [
  ['#FFF0E8', '#D8430B', Scissors],
  ['#EAF7F5', '#14756F', CalendarDays],
  ['#F1EDFF', '#7654D8', User],
] as const;

type ClavePeriodo = 'hoy' | 'semana' | 'mes' | 'anio';

const PERIODOS: Record<ClavePeriodo, { label: string; dias: number; grano: GranoSerie; frase: string }> = {
  hoy: { label: 'Hoy', dias: 1, grano: 'day', frase: 'hoy' },
  semana: { label: 'Semana', dias: 7, grano: 'day', frase: 'en los últimos 7 días' },
  mes: { label: 'Mes', dias: 30, grano: 'day', frase: 'en los últimos 30 días' },
  anio: { label: 'Año', dias: 365, grano: 'month', frase: 'en los últimos 12 meses' },
};

function saludo() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function Dashboard() {
  const { companyId, compania } = useSesion();
  const [periodo, setPeriodo] = useState<ClavePeriodo>('semana');
  const seleccion = PERIODOS[periodo];

  const { datos, cargando, error, releer } = useCargar(async () => {
    if (!companyId) return null;
    const actual = rangoDe(seleccion.dias);
    const previo = anterior(seleccion.dias);
    const hoy = isoLocal(new Date());

    const [metricas, serie, serieAnterior, citas, leads, productos, empresa] = await Promise.all([
      getMetricasDiarias(companyId, hoy, hoy),
      getSerie(companyId, actual.desde, actual.hasta, seleccion.grano),
      getSerie(companyId, previo.desde, previo.hasta, seleccion.grano),
      getCitas(companyId),
      getConversaciones(companyId, 500),
      getIngresosPorProducto(companyId, actual.desde, actual.hasta).catch(() => null),
      getCompania(companyId),
    ]);
    const porPagar = await getPendientesDePago(companyId, esAppointmentFamily(empresa?.business_mode));
    return { metricas, serie, serieAnterior, citas, leads, productos, empresa, porPagar };
  }, [companyId, periodo]);

  useSondeo(releer, SONDEO_DASHBOARD_MS, !!companyId);

  const hoy = isoLocal(new Date());
  const modo = compania?.business_mode ?? datos?.empresa?.business_mode;
  const v = vocabulario(modo);
  const conCitas = esAppointmentFamily(modo);
  const serie = datos?.serie ?? [];
  const serieAnterior = datos?.serieAnterior ?? [];
  const actividad = total(serie, conCitas ? 'citas' : 'pedidos');
  const metricaHoy = datos?.metricas[0];
  const pendientes = metricaHoy?.escalations_pending ?? 0;
  const porPagar = datos?.porPagar ?? 0;

  const agendaHoy = useMemo(
    () =>
      (datos?.citas ?? [])
        .filter((c) => c.inicio && isoLocal(c.inicio) === hoy && c.status !== 'cancelled')
        .sort((a, b) => (a.inicio?.getTime() ?? 0) - (b.inicio?.getTime() ?? 0)),
    [datos, hoy],
  );

  const nombrePorLead = useMemo(
    () => new Map((datos?.leads ?? []).map((l) => [l.id, l.name || l.phone])),
    [datos],
  );

  const recientes = (datos?.leads ?? []).filter((l) => l.ultimoMensaje).slice(0, 4);
  const productos = (datos?.productos ?? []).slice(0, 5);
  const maxProducto = Math.max(...productos.map((p) => p.revenue), 1);
  const fechaLarga = new Date().toLocaleDateString('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  if (cargando && !datos) {
    return (
      <main className="main main--dashboard">
        <div className="cargando">
          <div className="spin" />
          Preparando el resumen…
        </div>
      </main>
    );
  }


  return (
    <main className="main main--dashboard">
      <div className="wrap dashboard-v2">
        <Topbar
          titulo={`${saludo()}, ${compania?.nombre ?? 'bienvenido'}`}
          sub={`${fechaLarga.charAt(0).toUpperCase()}${fechaLarga.slice(1)} · Esto es lo importante del negocio`}
          accionesTitulo={
          <div className="period-switch" role="group" aria-label="Cambiar periodo">
            {(Object.entries(PERIODOS) as [ClavePeriodo, (typeof PERIODOS)[ClavePeriodo]][]).map(([clave, p]) => (
              <button
                key={clave}
                type="button"
                className={periodo === clave ? 'active' : ''}
                aria-pressed={periodo === clave}
                onClick={() => setPeriodo(clave)}
              >
                {p.label}
              </button>
            ))}
          </div>
          }
        />

        {/* Una vez y descartable: lleva a Ajustes, no pide permiso en frío. */}
        <InvitacionAvisos />

        {error && <div className="dashboard-error" role="alert">No se pudo actualizar el resumen. {datos ? 'Mostramos la última lectura disponible.' : 'Reintenta para consultar las cifras.'}<button type="button" onClick={releer}>Reintentar</button></div>}

        {datos && <>
        <ResumenNegocio
          serie={serie}
          anterior={serieAnterior}
          grano={seleccion.grano}
          periodo={seleccion.frase}
          reservas={cap(v.reservas)}
          conCitas={conCitas}
          academia={v.sesion === 'clase'}
          pendientes={pendientes}
          porPagar={porPagar}
        />

        <section className="dash-lower-grid">
          <article className="card dash-agenda-card">
            <div className="dash-section-head">
              <div>
                <span className="dash-eyebrow">Operación</span>
                <h3>{conCitas ? `${cap(v.agenda)} de hoy` : 'Pedidos del negocio'}</h3>
              </div>
              <Link className="round-link" href={conCitas ? '/panel/agenda' : '/panel/pedidos'} aria-label={`Abrir ${conCitas ? v.agenda.toLowerCase() : 'pedidos'}`}>
                <ChevronRight size={17} />
              </Link>
            </div>

            {conCitas && agendaHoy.length > 0 ? (
              <div className="today-list">
                {agendaHoy.slice(0, 5).map((c, i) => {
                  const [fondo, color, Icono] = ICONOS_CITA[i % ICONOS_CITA.length];
                  return (
                    <div className="today-row" key={c.id}>
                      <div className="today-row__time">{c.inicio ? hora(c.inicio) : '—'}</div>
                      <div className="today-row__icon" style={{ background: fondo, color }}><Icono size={17} /></div>
                      <div className="today-row__info">
                        <b>{c.service || cap(v.sesion)}</b>
                        <span>{nombrePorLead.get(c.lead_id) ?? cap(v.persona)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="dash-empty">
                <span><CalendarDays size={22} /></span>
                <b>{v.sesion === 'clase' ? 'Tus clases viven en el calendario' : conCitas ? `No hay ${v.reservas} para hoy` : 'Gestiona los pedidos del negocio'}</b>
                <p>{v.sesion === 'clase' ? 'Revisa grupos, horarios y cupos desde Clases.' : 'Puedes aprovechar el espacio para contactar clientes pendientes.'}</p>
              </div>
            )}
            <Link className="dash-card-link" href={conCitas ? '/panel/agenda' : '/panel/pedidos'}>
              Ver {conCitas ? v.agenda.toLowerCase() : 'pedidos'} <ChevronRight size={14} />
            </Link>
          </article>
          <article className="card dash-conversations-card">
            <div className="dash-section-head">
              <div>
                <span className="dash-eyebrow">Clientes</span>
                <h3>Conversaciones recientes</h3>
              </div>
              <Link className="dash-text-link" href="/panel/mensajes">Ver todas</Link>
            </div>
            {recientes.length === 0 ? (
              <div className="dash-empty dash-empty--small"><p>Todavía no hay conversaciones.</p></div>
            ) : (
              <div className="conversation-grid">
                {recientes.map((l) => {
                  const it = intent(l.intent);
                  return (
                    <Link key={l.id} href={`/panel/mensajes?lead=${l.id}`} className="conversation-row">
                      <span className="conversation-avatar" style={{ background: it.color }}>{(l.name || l.phone).slice(0, 2).toUpperCase()}</span>
                      <span className="conversation-info"><b>{l.name || l.phone}</b><small>{l.ultimoMensaje}</small></span>
                      <span className="conversation-meta"><em className={`badge-pill ${it.cls}`}>{it.short}</em><small>{cuando(l.ultimoAt)}</small></span>
                    </Link>
                  );
                })}
              </div>
            )}
          </article>

          <article className="card dash-action-card">
            <div className="dash-section-head">
              <div>
                <span className="dash-eyebrow">Prioridades</span>
                <h3>Lo que necesita atención</h3>
              </div>
              <Sparkles size={18} className="section-icon" />
            </div>
            <div className="action-list">
              <Link href="/panel/mensajes" className="action-row">
                <span className="action-row__icon action-row__icon--orange"><MessageCircle size={17} /></span>
                <span><b>{pendientes} conversaciones pendientes</b><small>Consultas que necesitan intervención</small></span>
                <ChevronRight size={16} />
              </Link>
              <Link href="/panel/retargeting" className="action-row">
                <span className="action-row__icon action-row__icon--teal"><TrendingUp size={17} /></span>
                <span><b>Seguimiento de clientes</b><small>Revisa oportunidades para volver a contactar</small></span>
                <ChevronRight size={16} />
              </Link>
              <Link href={conCitas ? '/panel/agenda' : '/panel/pedidos'} className="action-row">
                <span className="action-row__icon action-row__icon--violet"><CalendarDays size={17} /></span>
                <span>
                  <b>{conCitas ? v.sesion === 'clase' ? 'Organiza tus clases' : `${agendaHoy.length} atenciones programadas hoy` : `${actividad} pedidos ${seleccion.frase}`}</b>
                  <small>{conCitas ? 'Organiza la jornada antes de empezar' : 'Revisa preparación, cobro y entrega'}</small>
                </span>
                <ChevronRight size={16} />
              </Link>
            </div>
          </article>

          <article className="card dash-services-card">
            <div className="dash-section-head">
              <div>
                <span className="dash-eyebrow">Preferencias</span>
                <h3>{cap(v.items)} más vendid{v.aItem}s</h3>
              </div>
              <Link className="round-link" href="/panel/catalogo" aria-label="Abrir catálogo"><ChevronRight size={17} /></Link>
            </div>
            {datos.productos === null ? (
              <div className="dash-empty dash-empty--small" role="status"><p>No se pudo cargar el detalle de ventas.</p><button className="dash-text-link" type="button" onClick={releer}>Reintentar</button></div>
            ) : productos.length === 0 ? (
              <div className="dash-empty dash-empty--small"><p>Sin ventas registradas en este período.</p></div>
            ) : (
              <div className="service-list">
                {productos.map((p, i) => (
                  <div className="service-row" key={p.name}>
                    <span className="service-row__rank">{String(i + 1).padStart(2, '0')}</span>
                    <div><b>{p.name}</b><small>{p.units} ventas · {soles(p.revenue)}</small></div>
                    <span className="service-row__bar"><i style={{ width: `${(p.revenue / maxProducto) * 100}%`, background: COLORES_SERVICIO[i % COLORES_SERVICIO.length] }} /></span>
                  </div>
                ))}
              </div>
            )}
          </article>


        </section>
        </>}
      </div>
    </main>
  );
}
