'use client';

/**
 * FIDELIZA · TUS NÚMEROS — el club de un vistazo, con el mismo diseño que el
 * resumen del Dashboard (components/panel/resumen-negocio.css): tarjeta
 * principal, cuatro indicadores con su comparación y el gráfico de barras.
 * Debajo, cuándo vienen (día × hora) y quién viene y quién dejó de venir.
 *
 * Se calcula en el navegador (dominio/numeros.ts) con las visitas del último
 * año que el panel ya puede leer: sin SQL nuevo.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarHeart, Repeat2, UserPlus, Users, Wallet } from 'lucide-react';
import ContadorAnimado from '@/components/panel/ContadorAnimado';
import '@/components/panel/resumen-negocio.css';
import { useCargar } from '@/components/panel/useCargar';
import { delta } from '@/lib/panel/serie';
import { lecturas } from '@/modules/fideliza/cliente/api';
import { calcularNumeros, DIAS_CORTOS, DIAS_LARGOS, SEGMENTOS, type Numeros as NumerosCalc } from '@/modules/fideliza/dominio/numeros';
import { Cargando, Fallo } from '@/modules/fideliza/ui/Estados';

const PERIODOS = [
  { dias: 30, nombre: '30 días' },
  { dias: 90, nombre: '90 días' },
  { dias: 365, nombre: 'Un año' },
];

function Cambio({ actual, previo, puntos }: { actual: number; previo: number; puntos?: boolean }) {
  if (puntos) {
    const d = actual - previo;
    return <span className={`resumen-cambio ${d > 0 ? 'sube' : d < 0 ? 'baja' : 'igual'}`}>{d === 0 ? 'igual que antes' : `${d > 0 ? '+' : ''}${d} pts`}</span>;
  }
  const d = delta(actual, previo);
  return <span className={`resumen-cambio ${d.clase}`}>{d.pct === null ? (actual === 0 ? 'Sin variación' : 'Sin base comparable') : d.texto}</span>;
}

const fechaCorta = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });

export default function Numeros({ companyId }: { companyId: string }) {
  const [dias, setDias] = useState(30);
  const { datos, cargando, error, releer } = useCargar(async () => {
    // Un año + un periodo anterior de un año para comparar: 730 días.
    const desde = new Date(Date.now() - 730 * 86_400_000).toISOString();
    const [visitas, altas] = await Promise.all([lecturas.visitasDesde(companyId, desde), lecturas.altas(companyId)]);
    return { visitas, altas };
  }, [companyId]);
  const n = useMemo(() => (datos ? calcularNumeros(datos.visitas, datos.altas, dias) : null), [datos, dias]);

  if (cargando && !datos) return <Cargando texto="Calculando tus números…" />;
  if (error) return <Fallo texto={error} reintentar={releer} />;
  if (!n) return null;
  return <VistaNumeros n={n} dias={dias} setDias={setDias} />;
}

/** Solo la vista: se puede pintar con cualquier `Numeros` (p. ej. de ejemplo). */
export function VistaNumeros({ n, dias, setDias }: { n: NumerosCalc; dias: number; setDias: (d: number) => void }) {

  const periodo = PERIODOS.find((p) => p.dias === dias)!.nombre.toLowerCase();
  const porMiembro = n.vinieron ? (n.visitas / n.vinieron).toFixed(1).replace('.', ',') : '0';
  const porRecuperar = n.segmentos.atrasados + n.segmentos.dormidos;

  // Gráfico: mismas piezas que «Evolución de ingresos», con primera visita frente a regresan.
  const mayor = Math.max(...n.semanas.map((s) => Math.max(s.primera, s.regresan)), 0);
  const techo = mayor ? Math.max(4, Math.ceil(mayor / 4) * 4) : 4;
  const ticks = [1, 0.75, 0.5, 0.25, 0];

  // Mapa: solo las horas con movimiento (o 8–21 si aún no hay nada).
  const horas = n.calor.flatMap((fila) => fila.map((v, h) => (v ? h : -1))).filter((h) => h >= 0);
  const hDesde = horas.length ? Math.min(...horas) : 8;
  const hHasta = horas.length ? Math.max(...horas) : 21;
  const columnas = Array.from({ length: hHasta - hDesde + 1 }, (_, i) => hDesde + i);
  const maxCalor = Math.max(1, ...n.calor.flat());
  const totalSeg = Math.max(1, n.miembros);

  return (
    <section className="fz-numeros" aria-label="Tus números">
      <div className="fz-numeros__cab">
        <div>
          <h2>Tus números</h2>
          <p>Quién viene, cada cuánto, cuándo y quién dejó de venir.</p>
        </div>
        <div className="chip-tabs" role="tablist" aria-label="Periodo">
          {PERIODOS.map((p) => (
            <button key={p.dias} role="tab" aria-selected={dias === p.dias} className={dias === p.dias ? 'active' : ''} onClick={() => setDias(p.dias)}>
              {p.nombre}
            </button>
          ))}
        </div>
      </div>

      <div className="negocio-overview">
        <article className="negocio-balance">
          <div className="negocio-card-head"><h2>Clientes que vinieron</h2><span className="negocio-currency">de {n.miembros.toLocaleString('es-PE')} miembros</span></div>
          <p className="negocio-periodo">Últimos {periodo}</p>
          <strong className="negocio-importe"><ContadorAnimado valor={n.vinieron} /></strong>
          <div className="negocio-comparacion"><Cambio actual={n.vinieron} previo={n.vinieronAntes} /><span>vs. período anterior</span></div>
          <div className="negocio-acciones">
            <Link href="/panel/fideliza/caja" className="negocio-boton negocio-boton--dark"><Wallet size={16} /> Abrir caja</Link>
            <Link href="/panel/fideliza/clientes" className="negocio-boton"><Users size={16} /> Ver clientes</Link>
          </div>
          <div className="negocio-contexto">
            <span>Tu club, en este período</span>
            <div className="negocio-mini-grid">
              <div><small>Anterior</small><b><ContadorAnimado valor={n.vinieronAntes} /></b><span>Vinieron</span></div>
              <div><small>Visitas</small><b><ContadorAnimado valor={n.visitas} /></b><span>{porMiembro} por cliente</span></div>
              <div><small>Miembros</small><b><ContadorAnimado valor={n.miembros} /></b><span>Con tarjeta</span></div>
            </div>
          </div>
        </article>

        <section className="negocio-indicadores" aria-label="Indicadores">
          <div className="negocio-indicador negocio-indicador--coral">
            <div className="negocio-indicador-head"><span>Visitas</span><CalendarHeart size={17} /></div>
            <strong><ContadorAnimado valor={n.visitas} /></strong>
            <p>{porMiembro} por cliente que vino</p>
            <div className="negocio-indicador-foot"><Cambio actual={n.visitas} previo={n.visitasAntes} /></div>
          </div>
          <div className="negocio-indicador">
            <div className="negocio-indicador-head"><span>Miembros nuevos</span><UserPlus size={17} /></div>
            <strong><ContadorAnimado valor={n.nuevos} /></strong>
            <p>Tarjetas creadas en el período</p>
            <div className="negocio-indicador-foot"><Cambio actual={n.nuevos} previo={n.nuevosAntes} /></div>
          </div>
          <div className="negocio-indicador">
            <div className="negocio-indicador-head"><span>Regresan</span><Repeat2 size={17} /></div>
            <strong>{n.regresan === null ? '—' : `${n.regresan} %`}</strong>
            <p>Vuelven en 30 días tras su primera visita</p>
            <div className="negocio-indicador-foot">
              {n.regresan !== null && n.regresanAntes !== null ? <Cambio actual={n.regresan} previo={n.regresanAntes} puntos /> : <span>Aún sin base para comparar</span>}
            </div>
          </div>
          <Link href="/panel/fideliza/campanas" className="negocio-indicador">
            <div className="negocio-indicador-head"><span>Para recuperar</span><Users size={17} /></div>
            <strong><ContadorAnimado valor={porRecuperar} /></strong>
            <p>Atrasados y dormidos · ahora</p>
            <div className="negocio-indicador-foot"><span>Escríbeles con una campaña</span><ArrowUpRight size={15} aria-hidden="true" /></div>
          </Link>
        </section>

        <article className="negocio-evolucion">
          <div className="negocio-card-head"><h2>Visitas por semana</h2></div>
          <div className="negocio-chart-box">
            <div className="negocio-leyenda">
              <span><i className="anterior" /> Primera visita</span><span><i className="actual" /> Regresan</span>
            </div>
            {mayor === 0 ? (
              <div className="negocio-chart-empty"><CalendarHeart size={26} /><b>Aún no hay visitas</b><p>Cada compra registrada en caja aparecerá aquí.</p></div>
            ) : (
              <div className="negocio-chart-scroll" tabIndex={0} aria-label="Visitas por semana; desplaza para ver todas">
                <div className="negocio-plot" style={{ minWidth: 12 * 38 + 60 }}>
                  <div className="negocio-eje" aria-hidden="true">{ticks.map((t) => <span key={t}>{Math.round(techo * t)}</span>)}</div>
                  <div className="negocio-barras">
                    <div className="negocio-guias" aria-hidden="true">{ticks.map((t) => <i key={t} />)}</div>
                    {n.semanas.map((s, i) => {
                      const texto = `Semana del ${fechaCorta(s.desde)}: ${s.primera} primera${s.primera === 1 ? '' : 's'} visita${s.primera === 1 ? '' : 's'}, ${s.regresan} regreso${s.regresan === 1 ? '' : 's'}.`;
                      return (
                        <div key={s.desde} className="negocio-cubo">
                          <button type="button" className="negocio-par" aria-label={texto}>
                            <i className="anterior" style={{ height: `${(s.primera / techo) * 100}%`, animationDelay: `${i * 25}ms` }} />
                            <i className={`actual ${i === 11 ? 'parcial' : ''}`} style={{ height: `${(s.regresan / techo) * 100}%`, animationDelay: `${i * 25 + 60}ms` }} />
                            <span className="negocio-tooltip">{texto}</span>
                          </button>
                          <span className="negocio-x">{fechaCorta(s.desde)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
          <p className="negocio-chart-note">Las últimas 12 semanas, de lunes a domingo. La semana actual aún está en curso.</p>
        </article>
      </div>

      <div className="fz-numeros__fila">
        <article className="fz-numeros__card">
          <div className="negocio-card-head"><h2>Cuándo vienen</h2></div>
          <p className="fz-numeros__sub">Visitas por día y hora, últimos {periodo}.</p>
          <div className="fz-calor" style={{ gridTemplateColumns: `34px repeat(${columnas.length}, minmax(14px, 1fr))` }} role="img" aria-label="Mapa de visitas por día y hora">
            <span />
            {columnas.map((h) => <span key={h} className="fz-calor__h">{h % 2 === 0 ? h : ''}</span>)}
            {DIAS_CORTOS.map((d, dia) => (
              <div key={d} className="fz-calor__fila">
                <span className="fz-calor__d">{d}</span>
                {columnas.map((h) => {
                  const v = n.calor[dia][h];
                  return <i key={h} title={`${DIAS_LARGOS[dia]} ${h}:00 · ${v} visita${v === 1 ? '' : 's'}`} style={{ opacity: v ? 0.18 + 0.82 * (v / maxCalor) : 1, background: v ? undefined : '#f1f2ee' }} />;
                })}
              </div>
            ))}
          </div>
          <p className="fz-numeros__nota">
            {n.horaPico ? <>La hora más llena: <b>{DIAS_LARGOS[n.horaPico.dia]} a las {n.horaPico.hora}:00</b>.</> : 'Aún no hay visitas en este período.'}
          </p>
        </article>

        <article className="fz-numeros__card">
          <div className="negocio-card-head"><h2>Quién viene y quién dejó de venir</h2></div>
          <p className="fz-numeros__sub">Cada cliente contra su propio ritmo de visitas.</p>
          <ul className="fz-segmentos">
            {SEGMENTOS.map((s) => {
              const v = n.segmentos[s.id];
              return (
                <li key={s.id} className={`fz-segmento fz-segmento--${s.tono}`}>
                  <div><b>{s.nombre}</b><small>{s.describe}</small></div>
                  <strong>{v}</strong>
                  <i style={{ width: `${(v / totalSeg) * 100}%` }} />
                </li>
              );
            })}
          </ul>
          {porRecuperar > 0 && (
            <Link href="/panel/fideliza/campanas" className="negocio-boton" style={{ marginTop: 12, alignSelf: 'flex-start' }}>
              Recuperar a {porRecuperar} con una campaña <ArrowUpRight size={15} />
            </Link>
          )}
        </article>
      </div>
    </section>
  );
}
