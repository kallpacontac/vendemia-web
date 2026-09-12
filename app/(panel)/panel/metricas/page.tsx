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
import { useMemo, useState } from 'react';
import { CalendarCheck, Send, Target, Users, Wallet, ShoppingBag } from 'lucide-react';
import Topbar from '@/components/panel/Topbar';
import { useSesion } from '@/components/panel/Sesion';
import { useCargar } from '@/components/panel/useCargar';
import { conversionDeHoy } from '@/lib/panel/conversion';
import { construirSemana } from '@/lib/panel/agenda';
import { INTENT, intent, isoLocal, soles } from '@/lib/panel/format';
import { motivoDe } from '@/lib/panel/retargeting';
import {
  anterior,
  delta,
  etiquetaCubo,
  GRANOS,
  PRESETS,
  rangoCubo,
  rangoDe,
  total,
} from '@/lib/panel/serie';
import {
  porMotivo,
  recuperacion,
  textoRecuperacion,
  VENTANA_DIAS,
} from '@/lib/panel/seguimientos';
import {
  getActividad,
  getCitas,
  getCompania,
  getIngresosPorProducto,
  getIntencionPorDia,
  getLeads,
  getMetricasDiarias,
  getPedidos,
  getSeguimientos,
  getSerie,
  getTrabajadores,
} from '@/lib/supabase/queries';
import type { GranoSerie, LeadIntent, PuntoSerie, TipoFechaSerie } from '@/lib/supabase/types';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
/** El heatmap tiene 12 columnas en el CSS: de 9:00 a 20:00. */
const HORAS = Array.from({ length: 12 }, (_, i) => 9 + i);
const COLORES = ['#FF4900', '#0E7C86', '#FBB040', '#0FA968', '#7C5CFF'];

export default function Metricas() {
  const { companyId, compania } = useSesion();

  /**
   * El periodo lo elige quien mira, y el grano por defecto lo trae el propio
   * periodo (90 días en barras diarias no se lee). Cambiar el grano a mano lo
   * fija hasta que se cambie de periodo.
   */
  const [presetClave, setPresetClave] = useState('30d');
  const [granoFijado, setGranoFijado] = useState<GranoSerie | null>(null);
  const [fecha, setFecha] = useState<TipoFechaSerie>('creacion');
  const preset = PRESETS.find((p) => p.clave === presetClave) ?? PRESETS[1];
  const grano = granoFijado ?? preset.grano;

  const { datos, cargando } = useCargar(async () => {
    if (!companyId) return null;
    const { desde, hasta } = rangoDe(preset.dias);
    const previo = anterior(preset.dias);
    const [serie, serieAnterior, metricas, intencion, productos, actividad, empresa, citas, leads, trabajadores, pedidos, seguimientos] =
      await Promise.all([
        // Una sola definición de "esto es dinero" para toda la serie, con los
        // cubos vacíos ya incluidos. Ver la migración 0026.
        getSerie(companyId, desde, hasta, grano, fecha),
        // La línea base: el mismo número de días, justo antes.
        getSerie(companyId, previo.desde, previo.hasta, grano, fecha),
        getMetricasDiarias(companyId, desde, hasta),
        getIntencionPorDia(companyId, desde),
        getIngresosPorProducto(companyId, desde, hasta).catch(() => []),
        getActividad(companyId, 7),
        getCompania(companyId),
        getCitas(companyId),
        getLeads(companyId),
        getTrabajadores(companyId),
        getPedidos(companyId),
        // Una tabla nueva: si el espejo aún no la trae, la pantalla sigue.
        getSeguimientos(companyId).catch(() => []),
      ]);
    return { serie, serieAnterior, metricas, intencion, productos, actividad, empresa, citas, leads, trabajadores, pedidos, seguimientos };
  }, [companyId, preset.dias, grano, fecha]);

  const serie = useMemo(() => datos?.serie ?? [], [datos]);
  const serieAnterior = useMemo(() => datos?.serieAnterior ?? [], [datos]);

  /** Lo que se compara con el periodo anterior. Ver lib/panel/serie.ts. */
  const comparado = useMemo(
    () =>
      (['leads', 'cerrados', 'ingresos'] as const).map((campo) => ({
        campo,
        valor: total(serie, campo),
        previo: total(serieAnterior, campo),
      })),
    [serie, serieAnterior],
  );

  /** La tasa de recuperación, de todos los mensajes, no solo los del periodo. */
  const recupera = useMemo(() => recuperacion(datos?.seguimientos ?? []), [datos]);
  const recuperaMotivos = useMemo(() => porMotivo(datos?.seguimientos ?? []), [datos]);

  const hoy = isoLocal(new Date());
  const metricaHoy = datos?.metricas.find((m) => m.date === hoy);
  const leadsHoy = metricaHoy?.leads ?? 0;
  /** Pedidos cobrados + citas en pie. Ver el azulejo "Cerrados hoy". */
  const cerradosHoy = (metricaHoy?.paid_orders ?? 0) + (metricaHoy?.appointments ?? 0);

  /**
   * ⚠️ El MISMO cálculo que el dashboard, importado y no copiado. Estaba
   * duplicado aquí con `paid_orders ÷ leads`, que daba 0 % en negocios de citas
   * y hasta 2787 % en barberia-01. Dos pantallas del mismo panel enseñando
   * conversiones distintas es peor que cualquiera de las dos cifras.
   */
  const conversion = useMemo(
    () => conversionDeHoy(datos?.leads ?? [], datos?.citas ?? [], datos?.pedidos ?? []),
    [datos],
  );

  const ingresosPeriodo = total(serie, 'ingresos');

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
      `${leadsHoy} leads · ${metricaHoy?.appointments ?? 0} citas · ${conversion.pct}% conversión · ${soles(metricaHoy?.revenue)} hoy\n` +
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

        {/*
          El periodo, el grano y con qué fecha se agrupa.

          ⚠️ «Fecha» NO tiene una respuesta correcta y el panel no la elige: de
          reserva es cuándo se cerró la venta, de atención cuándo se presta. Para
          una barbería, «lo que facturé la semana pasada» es la segunda; para
          medir cómo vende Mia, la primera.
        */}
        <div className="rango">
          <span className="etq">Periodo</span>
          <select
            className="select"
            value={presetClave}
            onChange={(e) => {
              setPresetClave(e.target.value);
              setGranoFijado(null);
            }}
          >
            {PRESETS.map((p) => (
              <option key={p.clave} value={p.clave}>
                {p.label}
              </option>
            ))}
          </select>

          <span className="etq">Agrupar por</span>
          <div className="view-toggle">
            {GRANOS.map((g) => (
              <button
                key={g.valor}
                className={grano === g.valor ? 'active' : ''}
                onClick={() => setGranoFijado(g.valor)}
              >
                {g.label}
              </button>
            ))}
          </div>

          <span className="etq">Fecha</span>
          <select
            className="select"
            value={fecha}
            onChange={(e) => setFecha(e.target.value as TipoFechaSerie)}
          >
            <option value="creacion">de reserva</option>
            <option value="servicio">de atención</option>
          </select>
        </div>

        {fecha === 'servicio' && (
          <div className="desfase" style={{ marginBottom: 14 }}>
            Agrupando por <b>fecha de atención</b>: cada venta cuenta el día que se presta, no el
            día que se cerró. Los pedidos <b>sin fecha de entrega concretada</b> no tienen esa fecha
            y se caen de la serie.
          </div>
        )}

        {/*
          El periodo comparado con el anterior. Un número sin línea base no es un
          KPI: «S/ 4.200» no dice nada hasta saber si antes fueron 3.000 o 6.000.
        */}
        <div className="sum-grid">
          {comparado.map((c) => (
            <Comparado
              key={c.campo}
              etiqueta={
                c.campo === 'leads' ? 'Leads' : c.campo === 'cerrados' ? 'Cerrados' : 'Ingresos'
              }
              texto={c.campo === 'ingresos' ? soles(c.valor) : String(c.valor)}
              valor={c.valor}
              previo={c.previo}
              pie={
                c.campo === 'cerrados'
                  ? 'lo que Mia concertó, se haya cobrado o no'
                  : c.campo === 'ingresos'
                    ? 'solo lo que ya cuenta como dinero'
                    : `frente a ${c.previo} en los ${preset.dias} días anteriores`
              }
            />
          ))}
        </div>

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
            valor={`${conversion.pct}%`}
            etiqueta={
              conversion.total > 0
                ? `Conversión · ${conversion.cerrados}/${conversion.total} de hoy`
                : 'Conversión'
            }
          />
          <Kpi
            icono={<ShoppingBag size={18} />}
            fondo="#EAF3FF"
            color="#3B82F6"
            // ⚠️ NO "Pedidos pagados". Un negocio de citas no tiene pedidos: era
            // un tercer azulejo estructuralmente clavado en 0, igual que lo
            // estaban los ingresos. "Cerrados" significa lo mismo en los tres
            // modos — un pedido cobrado o una cita en pie.
            valor={cerradosHoy}
            etiqueta="Cerrados hoy"
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
              <h3>Leads por {GRANOS.find((g) => g.valor === grano)?.cubo}</h3>
              <span className="badge-pill b-mute">{preset.label.toLowerCase()}</span>
            </div>
            {serie.length ? (
              <SerieBarras serie={serie} campo="leads" grano={grano} />
            ) : (
              <p className="vacio">Sin datos en el periodo.</p>
            )}
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
              <h3>Ingresos por {GRANOS.find((g) => g.valor === grano)?.cubo}</h3>
              <span className="badge-pill b-new">Total {soles(ingresosPeriodo)}</span>
            </div>
            {serie.length ? (
              <SerieBarras serie={serie} campo="ingresos" grano={grano} dinero />
            ) : (
              <p className="vacio">Sin ingresos en el periodo.</p>
            )}
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

        {/*
          ⚠️ Solo cuentan los mensajes con la ventana de 7 días ya cerrada. Los de
          esta semana todavía pueden convertir: contarlos como fallos hunde la
          tasa sin motivo, y eso es un error de medición, no un matiz.
        */}
        <div className="card">
          <div className="card-head">
            <h3>Mensajes de recuperación</h3>
            <small className="muted">
              se cuenta la venta si llega en {VENTANA_DIAS} días
            </small>
          </div>
          {recupera.intentos === 0 ? (
            <p className="vacio">
              <b>Aún sin medir</b>
              {recupera.enCurso > 0
                ? `Hay ${recupera.enCurso} mensaje(s) enviados esta semana. Todavía pueden acabar en venta, así que no cuentan ni a favor ni en contra.`
                : 'Cuando escribas a alguien desde Retargeting, aquí se verá en qué acabó.'}
            </p>
          ) : (
            <>
              <div className="big">{textoRecuperacion(recupera)}</div>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                {recupera.pct}% de los que ya cerraron su ventana.
                {recupera.enCurso > 0 &&
                  ` Otros ${recupera.enCurso} se enviaron en los últimos ${VENTANA_DIAS} días y todavía no cuentan.`}
              </p>
              {recuperaMotivos.length > 1 &&
                recuperaMotivos.map(({ motivo, r }) => (
                  <div className="slotbar" key={motivo}>
                    <div className="lab">
                      <b>{motivoDe(motivo).label}</b>
                      <span>
                        {r.ventas} de {r.intentos}
                      </span>
                    </div>
                    <div className="track">
                      <div
                        className="fill"
                        style={{ width: `${r.pct ?? 0}%`, background: motivoDe(motivo).color }}
                      />
                    </div>
                  </div>
                ))}
            </>
          )}
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

/**
 * Las barras de la serie.
 *
 * ⚠️ El cubo `parcial` va rayado, y no es decoración: la semana en curso tiene
 * menos días que las de al lado, y pintada igual se lee como una caída del
 * negocio. Lo mismo con el primer cubo cuando el rango lo corta por la mitad.
 */
function SerieBarras({
  serie,
  campo,
  grano,
  dinero = false,
}: {
  serie: PuntoSerie[];
  campo: 'leads' | 'ingresos' | 'cerrados';
  grano: GranoSerie;
  dinero?: boolean;
}) {
  const max = Math.max(...serie.map((p) => p[campo]), 1);
  // Con 90 barras no caben 90 etiquetas: se pone una de cada tantas.
  const paso = Math.max(1, Math.ceil(serie.length / 8));

  return (
    <>
      <div className={`serie ${dinero ? 'serie--dinero' : ''}`}>
        {serie.map((p) => (
          <div
            key={p.periodo}
            className={`cubo ${p.parcial ? 'parcial' : ''}`}
            title={`${rangoCubo(p)} · ${dinero ? soles(p[campo]) : p[campo]}${
              p.parcial ? ' · todavía no ha terminado' : ''
            }`}
          >
            <i style={{ height: `${(p[campo] / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="serie-x">
        {serie.map((p, i) => (
          <span key={p.periodo}>{i % paso === 0 ? etiquetaCubo(p, grano) : ''}</span>
        ))}
      </div>
    </>
  );
}

/** Una cifra del periodo con su variación respecto al periodo anterior. */
function Comparado({
  etiqueta,
  texto,
  valor,
  previo,
  pie,
}: {
  etiqueta: string;
  texto: string;
  valor: number;
  previo: number;
  pie: string;
}) {
  const d = delta(valor, previo);
  return (
    <div className="sum">
      <small>{etiqueta}</small>
      <b>{texto}</b>
      <span className={`delta ${d.clase}`}>{d.texto}</span>
      <small className="pie">{pie}</small>
    </div>
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
