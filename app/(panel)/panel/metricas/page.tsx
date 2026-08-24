'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * MÉTRICAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Casi todo sale de vistas ya calculadas —`v_daily_metrics`, `v_leads_by_day`,
 * `v_orders_by_day`, `v_intent_by_day`— y de la RPC `analytics_products`. El
 * front no agrega nada a mano salvo el mapa de calor, que no tiene vista.
 *
 * ⚠️ Dos cosas que hay que saber para no discutir con las cifras:
 *
 *   · Se agrupan en HORA DE LIMA, no UTC. Entre las 19:00 y las 23:59 no
 *     cuadran al dedillo con las del bot.
 *   · Los ingresos SOLO cuentan pedidos `paid`. Un pedido `delivered` que nunca
 *     pasó por `paid` no aparece en `revenue`.
 */
import { useMemo } from 'react';
import { CalendarCheck, Send, Target, Users, Wallet, ShoppingBag } from 'lucide-react';
import Topbar from '@/components/panel/Topbar';
import { useSesion } from '@/components/panel/Sesion';
import { useCargar } from '@/components/panel/useCargar';
import { areaPath, seriesPts, smoothPath } from '@/lib/panel/charts';
import { construirSemana } from '@/lib/panel/agenda';
import { hace, INTENT, intent, isoLocal, soles } from '@/lib/panel/format';
import {
  getActividad,
  getCitas,
  getCompania,
  getIngresosPorProducto,
  getIntencionPorDia,
  getLeads,
  getLeadsPorDia,
  getMetricasDiarias,
  getPedidosPorDia,
  getTrabajadores,
} from '@/lib/supabase/queries';
import type { LeadIntent } from '@/lib/supabase/types';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
/** El heatmap tiene 12 columnas en el CSS: de 9:00 a 20:00. */
const HORAS = Array.from({ length: 12 }, (_, i) => 9 + i);
const COLORES = ['#3D5AF1', '#F26B45', '#3ED598', '#FBB040', '#A78BFA'];

export default function Metricas() {
  const { companyId, compania } = useSesion();

  const { datos, cargando } = useCargar(async () => {
    if (!companyId) return null;
    const desde = isoLocal(hace(29));
    const hasta = isoLocal(new Date());
    const [metricas, leadsDia, pedidosDia, intencion, productos, actividad, empresa, citas, leads, trabajadores] =
      await Promise.all([
        getMetricasDiarias(companyId, desde, hasta),
        getLeadsPorDia(companyId, desde),
        getPedidosPorDia(companyId, desde),
        getIntencionPorDia(companyId, desde),
        getIngresosPorProducto(companyId, desde, hasta).catch(() => []),
        getActividad(companyId, 7),
        getCompania(companyId),
        getCitas(companyId),
        getLeads(companyId),
        getTrabajadores(companyId),
      ]);
    return { metricas, leadsDia, pedidosDia, intencion, productos, actividad, empresa, citas, leads, trabajadores };
  }, [companyId]);

  const hoy = isoLocal(new Date());
  const metricaHoy = datos?.metricas.find((m) => m.date === hoy);
  const leadsHoy = metricaHoy?.leads ?? 0;
  const pagadosHoy = metricaHoy?.paid_orders ?? 0;
  const conversion = leadsHoy ? Math.round((pagadosHoy / leadsHoy) * 1000) / 10 : 0;

  const puntosLeads = useMemo(
    () => seriesPts((datos?.leadsDia ?? []).map((p) => p.count), 700, 200, 14),
    [datos],
  );
  const puntosIngresos = useMemo(
    () => seriesPts((datos?.pedidosDia ?? []).map((p) => p.revenue), 700, 200, 14),
    [datos],
  );
  const ingresosMes = (datos?.pedidosDia ?? []).reduce((s, p) => s + p.revenue, 0);

  /** v_intent_by_day viene por día: para el donut se suma el mes entero. */
  const distribucion = useMemo(() => {
    const acc = new Map<LeadIntent, number>();
    for (const p of datos?.intencion ?? []) acc.set(p.intent, (acc.get(p.intent) ?? 0) + p.count);
    return [...acc.entries()].map(([k, count]) => ({ intent: k, count })).sort((a, b) => b.count - a.count);
  }, [datos]);
  const totalIntencion = distribucion.reduce((s, d) => s + d.count, 0);

  const productos = (datos?.productos ?? []).slice(0, 5);
  const maxProducto = Math.max(...productos.map((p) => p.revenue), 1);

  const maxActividad = Math.max(...(datos?.actividad ?? [[0]]).flat(), 1);

  /** Ocupación de esta semana, día a día. Mismo cálculo que la Agenda. */
  const ocupacion = useMemo(() => {
    if (!datos?.empresa) return [];
    const semana = construirSemana(0, {
      citas: datos.citas,
      nombrePorLead: new Map(),
      nombrePorTrabajador: new Map(),
      bloqueos: [],
      horario: datos.empresa.horario,
      slotMinutos: datos.empresa.slot_minutes ?? 30,
    });
    return semana.dias.map((d, i) => {
      const abiertos = d.huecos.filter((h) => !h.cerrado);
      const capacidad = abiertos.reduce((s, h) => s + h.capacidad, 0);
      const reservado = abiertos.reduce((s, h) => s + h.reservas.length, 0);
      return { dia: DIAS[i], reservado, capacidad };
    });
  }, [datos]);

  /* ── Resumen de la semana ───────────────────────────────────────────── */
  const servicioTop = productos[0]?.name ?? '—';

  const horaPico = useMemo(() => {
    let mejor = { h: -1, v: 0 };
    for (const fila of datos?.actividad ?? [])
      fila.forEach((v, h) => {
        if (v > mejor.v) mejor = { h, v };
      });
    return mejor.h < 0 ? '—' : `${mejor.h}:00 – ${mejor.h + 1}:00`;
  }, [datos]);

  const mejorDia = useMemo(() => {
    const suma = (datos?.actividad ?? []).map((f) => f.reduce((s, v) => s + v, 0));
    if (!suma.length || Math.max(...suma) === 0) return '—';
    return DIAS[suma.indexOf(Math.max(...suma))];
  }, [datos]);

  function resumenWhatsApp() {
    const texto =
      `📊 Resumen Vendemia — ${compania?.nombre ?? ''}\n` +
      `${leadsHoy} leads · ${metricaHoy?.appointments ?? 0} citas · ${conversion}% conversión · ${soles(metricaHoy?.revenue)} hoy\n` +
      `Servicio top: ${servicioTop} · Mejor día: ${mejorDia}`;
    // 'noopener' o la pestaña de WhatsApp recibe window.opener y puede
    // redirigir esta desde fuera; 'noreferrer' evita además mandarle la URL
    // actual, que lleva el negocio y a veces un id de lead.
    window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank', 'noopener,noreferrer');
  }

  if (cargando && !datos) {
    return (
      <main className="main">
        <div className="cargando">
          <div className="spin" />
          Calculando métricas…
        </div>
      </main>
    );
  }

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Métricas" sub="Cómo trabaja Mia para tu negocio">
          <button className="btn btn-primary btn-sm" onClick={resumenWhatsApp}>
            <Send size={16} /> Resumen por WhatsApp
          </button>
        </Topbar>

        <div className="kpi5">
          <Kpi icono={<Users size={18} />} fondo="#FFF1E6" color="#F58220" valor={leadsHoy} etiqueta="Leads hoy" />
          <Kpi
            icono={<CalendarCheck size={18} />}
            fondo="#E9FBF3"
            color="#00C48C"
            valor={metricaHoy?.appointments ?? 0}
            etiqueta="Citas hoy"
          />
          <Kpi
            icono={<Target size={18} />}
            fondo="#FEF6E7"
            color="#FFA502"
            valor={`${conversion}%`}
            etiqueta="Conversión"
          />
          <Kpi
            icono={<ShoppingBag size={18} />}
            fondo="#EAF3FF"
            color="#3B82F6"
            valor={pagadosHoy}
            etiqueta="Pedidos pagados"
          />
          <Kpi
            icono={<Wallet size={18} />}
            fondo="#F3EEFF"
            color="#A78BFA"
            valor={soles(metricaHoy?.revenue)}
            etiqueta="Ingresos hoy"
          />
        </div>

        <div className="row-2">
          <div className="card">
            <div className="card-head">
              <h3>Leads por día (30 días)</h3>
            </div>
            <div className="line-wrap">
              {puntosLeads.length > 1 ? (
                <svg viewBox="0 0 700 200" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="gL" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#3D5AF1" stopOpacity=".2" />
                      <stop offset="1" stopColor="#3D5AF1" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={areaPath(puntosLeads, 700, 200)} fill="url(#gL)" />
                  <path d={smoothPath(puntosLeads)} fill="none" stroke="#3D5AF1" strokeWidth="2.5" />
                </svg>
              ) : (
                <p className="vacio">Todavía no hay suficientes días con datos.</p>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Distribución de intención</h3>
            </div>
            {totalIntencion === 0 ? (
              <p className="vacio">Sin leads en los últimos 30 días.</p>
            ) : (
              <div className="donut-wrap">
                <div className="donut">
                  <svg viewBox="0 0 36 36">
                    {
                      // Cada arco arranca donde acabó el anterior: por eso el
                      // desplazamiento acumulado va en negativo.
                      (() => {
                        let off = 0;
                        return distribucion.map((d) => {
                          const pct = (d.count / totalIntencion) * 100;
                          const el = (
                            <circle
                              key={d.intent}
                              cx="18"
                              cy="18"
                              r="15.9"
                              fill="none"
                              stroke={intent(d.intent).color}
                              strokeWidth="4"
                              strokeDasharray={`${pct.toFixed(1)} ${(100 - pct).toFixed(1)}`}
                              strokeDashoffset={(-off).toFixed(1)}
                              transform="rotate(-90 18 18)"
                            />
                          );
                          off += pct;
                          return el;
                        });
                      })()
                    }
                  </svg>
                  <div className="center">
                    <b>{totalIntencion}</b>
                    <small>leads</small>
                  </div>
                </div>
                <div className="dleg">
                  {distribucion.map((d) => (
                    <span key={d.intent}>
                      <i style={{ background: intent(d.intent).color }} />
                      {INTENT[d.intent]?.label ?? d.intent}
                      <b>{d.count}</b>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="row-2">
          <div className="card">
            <div className="card-head">
              <h3>Ingresos por día (30 días)</h3>
              <span className="badge-pill b-new">Total {soles(ingresosMes)}</span>
            </div>
            <div className="line-wrap">
              {puntosIngresos.length > 1 ? (
                <svg viewBox="0 0 700 200" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#3ED598" stopOpacity=".24" />
                      <stop offset="1" stopColor="#3ED598" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={areaPath(puntosIngresos, 700, 200)} fill="url(#gR)" />
                  <path d={smoothPath(puntosIngresos)} fill="none" stroke="#0FA968" strokeWidth="2.5" />
                </svg>
              ) : (
                <p className="vacio">Sin pedidos pagados en el periodo.</p>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Top servicios por ingresos</h3>
            </div>
            {productos.length === 0 ? (
              <p className="vacio">Sin ventas en los últimos 30 días.</p>
            ) : (
              productos.map((p, i) => (
                <div className="slotbar" key={p.name}>
                  <div className="lab">
                    <b>{p.name}</b>
                    <span>
                      {soles(p.revenue)} · {p.units}u
                    </span>
                  </div>
                  <div className="track">
                    <div
                      className="fill"
                      style={{ width: `${(p.revenue / maxProducto) * 100}%`, background: COLORES[i % COLORES.length] }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="row-2">
          <div className="card">
            <div className="card-head">
              <h3>Actividad por hora y día</h3>
              <small className="muted">más oscuro = más mensajes</small>
            </div>
            <div className="heat">
              <div />
              {HORAS.map((h) => (
                <div className="hh" key={h}>
                  {h}
                </div>
              ))}
              {(datos?.actividad ?? []).map((fila, d) => (
                <FilaHeat key={d} dia={DIAS[d]} fila={fila} max={maxActividad} />
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Ocupación de esta semana</h3>
            </div>
            {ocupacion.length === 0 || ocupacion.every((o) => o.capacidad === 0) ? (
              <p className="vacio">Configura el horario de atención para ver la ocupación.</p>
            ) : (
              ocupacion.map((o) => {
                const pct = o.capacidad ? Math.round((o.reservado / o.capacidad) * 100) : 0;
                return (
                  <div className="slotbar" key={o.dia}>
                    <div className="lab">
                      <b>{o.dia}</b>
                      <span>
                        {o.reservado}/{o.capacidad}
                      </span>
                    </div>
                    <div className="track">
                      <div
                        className="fill"
                        style={{
                          width: `${pct}%`,
                          background: pct >= 100 ? 'var(--hot)' : pct >= 70 ? 'var(--warm)' : 'var(--bot-on)',
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Resumen de la semana</h3>
          </div>
          <div className="sum-grid">
            <div className="sum">
              <small>🏆 Servicio top</small>
              <b>{servicioTop}</b>
            </div>
            <div className="sum">
              <small>⏰ Hora pico</small>
              <b>{horaPico}</b>
            </div>
            <div className="sum">
              <small>📅 Mejor día</small>
              <b>{mejorDia}</b>
            </div>
          </div>
          <button className="btn btn-primary" onClick={resumenWhatsApp}>
            <Send size={16} /> Enviarme este resumen por WhatsApp
          </button>
        </div>
      </div>
    </main>
  );
}

function Kpi({
  icono,
  fondo,
  color,
  valor,
  etiqueta,
}: {
  icono: React.ReactNode;
  fondo: string;
  color: string;
  valor: string | number;
  etiqueta: string;
}) {
  return (
    <div className="kpi">
      <div className="kpi__top">
        <div className="kpi__ico" style={{ background: fondo, color }}>
          {icono}
        </div>
      </div>
      <div className="kpi__num">{valor}</div>
      <div className="kpi__label">{etiqueta}</div>
    </div>
  );
}

function FilaHeat({ dia, fila, max }: { dia: string; fila: number[]; max: number }) {
  return (
    <>
      <div className="hd">{dia}</div>
      {HORAS.map((h) => {
        const v = fila[h] ?? 0;
        const t = v / max;
        // Interpolación entre el gris del fondo y el azul de marca.
        const color = `rgb(${238 - t * (238 - 61)},${242 - t * (242 - 90)},${255 - t * (255 - 241)})`;
        return (
          <div
            className="cell"
            key={h}
            style={{ background: t < 0.06 ? '#F1F3F9' : color }}
            title={`${v} mensajes · ${dia} ${h}:00`}
          />
        );
      })}
    </>
  );
}
