'use client';

/**
 * FIDELIZA · TUS NÚMEROS — el club de un vistazo, con el mismo diseño que el
 * resumen del Dashboard (components/panel/resumen-negocio.css): tarjeta
 * principal, cuatro indicadores con su comparación y el gráfico de barras.
 * Debajo, cuándo vienen (día × hora) y quién viene y quién dejó de venir.
 *
 * Se calcula en el navegador (dominio/numeros.ts) con las visitas del último
 * año que el panel ya puede leer: sin SQL nuevo. Arriba de todo, los leads
 * (quién creó su tarjeta y si ya compró). Lo que solo sabe el servidor
 * (quién abrió «Únete», premios, recuperados) sale de loyalty_metrics; si
 * falla, la pantalla sigue sin esas cifras.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarHeart, Megaphone, Repeat2, UserPlus, Users, Wallet } from 'lucide-react';
import ContadorAnimado from '@/components/panel/ContadorAnimado';
import '@/components/panel/resumen-negocio.css';
import { useCargar } from '@/components/panel/useCargar';
import { delta } from '@/lib/panel/serie';
import { accion, lecturas } from '@/modules/fideliza/cliente/api';
import type { Metricas } from '@/modules/fideliza/dominio/metricas';
import { calcularNumeros, DIAS_CORTOS, DIAS_LARGOS, grupos, porDia, porFranja, type Numeros as NumerosCalc } from '@/modules/fideliza/dominio/numeros';
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
const diaLima = (msAtras: number) => new Date(Date.now() - msAtras).toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });
const hace = (iso: string) => {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`;
};

/** Lo que solo sabe el servidor, para el mismo periodo. */
export interface ExtraNumeros {
  abrieronUnete: number;
  premiosGanados: number;
  premiosCanjeados: number;
  premiosPorCanjear: number;
  recuperados: number;
}

export default function Numeros({ companyId }: { companyId: string }) {
  const [dias, setDias] = useState(30);
  const { datos, cargando, error, releer } = useCargar(async () => {
    // Un año + un periodo anterior de un año para comparar: 730 días.
    const desde = new Date(Date.now() - 730 * 86_400_000).toISOString();
    const [visitas, altas] = await Promise.all([lecturas.visitasDesde(companyId, desde), lecturas.altas(companyId)]);
    return { visitas, altas };
  }, [companyId]);
  const { datos: m } = useCargar(async () => {
    try {
      return await accion<Metricas>('metricas', { companyId, from: diaLima((dias - 1) * 86_400_000), to: diaLima(0) });
    } catch {
      return null;
    }
  }, [companyId, dias]);
  const n = useMemo(() => (datos ? calcularNumeros(datos.visitas, datos.altas, dias) : null), [datos, dias]);
  const extra: ExtraNumeros | null = m
    ? {
        abrieronUnete: m.funnel.join_views,
        premiosGanados: m.rewards.issued,
        premiosCanjeados: m.rewards.redeemed,
        premiosPorCanjear: m.rewards.available_now,
        recuperados: m.recovered ?? 0,
      }
    : null;

  if (cargando && !datos) return <Cargando texto="Calculando tus números…" />;
  if (error) return <Fallo texto={error} reintentar={releer} />;
  if (!n) return null;
  return <VistaNumeros n={n} dias={dias} setDias={setDias} extra={extra} />;
}

/** Solo la vista: se puede pintar con cualquier `Numeros` (p. ej. de ejemplo). */
export function VistaNumeros({ n, dias, setDias, extra = null }: { n: NumerosCalc; dias: number; setDias: (d: number) => void; extra?: ExtraNumeros | null }) {

  const periodo = PERIODOS.find((p) => p.dias === dias)!.nombre.toLowerCase();
  const porMiembro = n.vinieron ? (n.visitas / n.vinieron).toFixed(1).replace('.', ',') : '0';
  const porRecuperar = n.segmentos.atrasados + n.segmentos.dormidos;

  // Gráfico: mismas piezas que «Evolución de ingresos», con primera visita frente a regresan.
  const mayor = Math.max(...n.semanas.map((s) => Math.max(s.primera, s.regresan)), 0);
  const techo = mayor ? Math.max(4, Math.ceil(mayor / 4) * 4) : 4;
  const ticks = [1, 0.75, 0.5, 0.25, 0];

  // Cuándo vienen, por franjas del día y por día de la semana (24-nov-2026, como Stamply).
  const { franjas, celdas } = porFranja(n.calor);
  const maxCelda = Math.max(1, ...celdas.flat());
  const pico = celdas.flatMap((fila, f) => fila.map((v, dia) => ({ v, f, dia }))).sort((a, b) => b.v - a.v)[0];
  const dias7 = porDia(n.calor);
  const maxDia = Math.max(1, ...dias7);
  const mejorDia = dias7.indexOf(Math.max(...dias7));
  const peorDia = dias7.indexOf(Math.min(...dias7));
  const hayVisitas = dias7.some((v) => v > 0);
  const gruposN = grupos(n.segmentos);
  const totalGrupos = Math.max(1, gruposN.reduce((t, g) => t + g.valor, 0));
  const solesRedondo = (c: number) => `S/ ${Math.round(c / 100).toLocaleString('es-PE')}`;

  // Embudo de leads: «Abrieron Únete» solo si el servidor lo dio y hay algo que contar.
  const pasos = [
    ...(extra && extra.abrieronUnete > 0 ? [{ id: 'abrieron', nombre: 'Abrieron «Únete»', valor: extra.abrieronUnete, nota: 'Escanearon el QR o tocaron la placa' }] : []),
    { id: 'registrados', nombre: 'Crearon su tarjeta', valor: n.embudo.registrados, nota: 'Clientes nuevos del período' },
    { id: 'compraron', nombre: 'Hicieron su primera compra', valor: n.embudo.compraron, nota: 'Ya pasaron por caja' },
    { id: 'volvieron', nombre: 'Volvieron', valor: n.embudo.volvieron, nota: 'Dos visitas o más' },
  ];
  const baseEmbudo = Math.max(1, ...pasos.map((p) => p.valor));
  const sinComprar = n.segmentos.sin_visitas;
  const pctDe = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : '—');

  return (
    <section className="fz-numeros" aria-label="Tus números">
      <div className="fz-numeros__cab">
        <div>
          <h2>Tus números</h2>
          <p>Quién viene, cuándo viene y quién se está yendo.</p>
        </div>
        <div className="chip-tabs" role="tablist" aria-label="Periodo">
          {PERIODOS.map((p) => (
            <button key={p.dias} role="tab" aria-selected={dias === p.dias} className={dias === p.dias ? 'active' : ''} onClick={() => setDias(p.dias)}>
              {p.nombre}
            </button>
          ))}
        </div>
      </div>

      {/* 1 · Lo más importante, con las piezas del Dashboard. */}
      <div className="negocio-overview">
        <article className="negocio-balance">
          <div className="negocio-card-head"><h2>Clientes que vinieron</h2><span className="negocio-currency">de {n.miembros.toLocaleString('es-PE')} con tarjeta</span></div>
          <p className="negocio-periodo">Últimos {periodo}</p>
          <strong className="negocio-importe"><ContadorAnimado valor={n.vinieron} /></strong>
          <div className="negocio-comparacion"><Cambio actual={n.vinieron} previo={n.vinieronAntes} /><span>vs. período anterior</span></div>
          <div className="negocio-acciones">
            <Link href="/panel/fideliza/caja" className="negocio-boton negocio-boton--dark"><Wallet size={16} /> Abrir caja</Link>
            <Link href="/panel/fideliza/clientes" className="negocio-boton"><Users size={16} /> Ver clientes</Link>
          </div>
          <div className="negocio-contexto">
            <span>La plata de tu club, en este período</span>
            <div className="negocio-mini-grid">
              <div><small>Ventas</small><b>{n.plata.conImporte ? solesRedondo(n.plata.ventas) : '—'}</b><span>{n.plata.conImporte ? `${n.plata.conImporte} con importe` : 'Anota el importe'}</span></div>
              <div><small>Gasta el que vuelve</small><b>{n.plata.ticketVuelve === null ? '—' : solesRedondo(n.plata.ticketVuelve)}</b><span>{n.plata.ticketNuevo === null ? 'por visita' : `${solesRedondo(n.plata.ticketNuevo)} la 1.ª vez`}</span></div>
              <div><small>Premios</small><b>{extra ? extra.premiosCanjeados : '—'}</b><span>{extra ? `canjeados · ${extra.premiosPorCanjear} por canjear` : 'canjeados'}</span></div>
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
            <div className="negocio-indicador-head"><span>Tarjetas nuevas</span><UserPlus size={17} /></div>
            <strong><ContadorAnimado valor={n.nuevos} /></strong>
            <p>Clientes que se unieron</p>
            <div className="negocio-indicador-foot"><Cambio actual={n.nuevos} previo={n.nuevosAntes} /></div>
          </div>
          <div className="negocio-indicador">
            <div className="negocio-indicador-head"><span>Vuelven</span><Repeat2 size={17} /></div>
            <strong>{n.regresan === null ? '—' : `${n.regresan} %`}</strong>
            <p>Vuelven en 30 días tras su primera visita</p>
            <div className="negocio-indicador-foot">
              {n.regresan !== null && n.regresanAntes !== null ? <Cambio actual={n.regresan} previo={n.regresanAntes} puntos /> : <span>Aún sin base para comparar</span>}
            </div>
          </div>
          <Link href="/panel/fideliza" className="negocio-indicador">
            <div className="negocio-indicador-head"><span>Se están yendo</span><Users size={17} /></div>
            <strong><ContadorAnimado valor={porRecuperar} /></strong>
            <p>Tardan más de lo normal en volver</p>
            <div className="negocio-indicador-foot"><span>Escríbeles hoy</span><ArrowUpRight size={15} aria-hidden="true" /></div>
          </Link>
        </section>

        <article className="negocio-evolucion">
          <div className="negocio-card-head"><h2>Visitas por semana</h2></div>
          <div className="negocio-chart-box">
            <div className="negocio-leyenda">
              <span><i className="anterior" /> Primera visita</span><span><i className="actual" /> Volvieron</span>
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
                      const texto = `Semana del ${fechaCorta(s.desde)}: ${s.primera} primera${s.primera === 1 ? '' : 's'} visita${s.primera === 1 ? '' : 's'}, ${s.regresan} ${s.regresan === 1 ? 'volvió' : 'volvieron'}.`;
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
          <p className="negocio-chart-note">Las últimas 12 semanas. La de esta semana aún está en curso.</p>
        </article>
      </div>

      {/* 2 · Cuándo vienen: por franjas del día y por día de la semana. */}
      <div className="fz-numeros__fila fz-cuando">
        <article className="fz-numeros__card">
          <div className="negocio-card-head"><h2>Horas más llenas</h2><span className="negocio-currency">últimos {periodo}</span></div>
          <p className="fz-numeros__sub">
            {hayVisitas && pico ? <>Lo más lleno: <b>{DIAS_LARGOS[pico.dia]} en la {franjas[pico.f].nombre.toLowerCase()}</b>.</> : 'Aún no hay visitas en este período.'}
          </p>
          <div className="fz-franjas" role="img" aria-label={hayVisitas && pico ? `Lo más lleno es el ${DIAS_LARGOS[pico.dia]} en la ${franjas[pico.f].nombre.toLowerCase()}` : 'Sin visitas'}>
            <span />
            {DIAS_CORTOS.map((d) => <span key={d} className="fz-franjas__dia">{d}</span>)}
            {franjas.map((f, fi) => (
              <div key={f.id} className="fz-franjas__fila">
                <span className="fz-franjas__nombre"><b>{f.nombre}</b><small>{f.rango}</small></span>
                {celdas[fi].map((v, dia) => {
                  const fuerza = v / maxCelda;
                  return (
                    <i key={dia} className={v ? (fuerza > 0.55 ? 'fuerte' : '') : 'vacia'} title={`${DIAS_LARGOS[dia]}, ${f.nombre.toLowerCase()}: ${v} visita${v === 1 ? '' : 's'}`}
                      style={v ? { background: `rgba(255, 90, 54, ${0.14 + 0.86 * fuerza})` } : undefined}>
                      {v || ''}
                    </i>
                  );
                })}
              </div>
            ))}
          </div>
        </article>

        <article className="fz-numeros__card">
          <div className="negocio-card-head"><h2>Días más llenos</h2><span className="negocio-currency">últimos {periodo}</span></div>
          <p className="fz-numeros__sub">
            {hayVisitas ? <>Tu mejor día es el <b>{DIAS_LARGOS[mejorDia]}</b>. El más flojo, el {DIAS_LARGOS[peorDia]}: buen día para una promo.</> : 'Aún no hay visitas en este período.'}
          </p>
          <div className="fz-dias" role="img" aria-label={dias7.map((v, i) => `${DIAS_LARGOS[i]} ${v}`).join(', ')}>
            {dias7.map((v, i) => (
              <div key={i} className="fz-dias__col">
                <b>{v}</b>
                <i className={i === mejorDia && v > 0 ? 'mejor' : ''} style={{ height: `${Math.max(3, (v / maxDia) * 100)}%`, animationDelay: `${i * 40}ms` }} />
                <span>{DIAS_CORTOS[i]}</span>
              </div>
            ))}
          </div>
        </article>
      </div>

      {/* 3 · Quién viene y quién se está yendo, en 4 grupos. */}
      <article className="fz-numeros__card fz-grupos">
        <div className="negocio-card-head"><h2>Quién viene y quién se está yendo</h2><span className="negocio-currency">{n.miembros.toLocaleString('es-PE')} con tarjeta · hoy</span></div>
        <div className="fz-grupos__barra" role="img" aria-label={gruposN.map((g) => `${g.nombre}: ${g.valor}`).join(', ')}>
          {gruposN.map((g) => g.valor > 0 && <i key={g.id} className={`fz-grupo--${g.tono}`} style={{ width: `${(g.valor / totalGrupos) * 100}%` }} />)}
        </div>
        <ul className="fz-grupos__lista">
          {gruposN.map((g) => (
            <li key={g.id}>
              <i className={`fz-grupo--${g.tono}`} aria-hidden="true" />
              <div><b>{g.nombre}</b><small>{g.describe}</small></div>
              <strong>{g.valor}</strong>
            </li>
          ))}
        </ul>
        {porRecuperar + n.segmentos.no_regresaron > 0 && (
          <Link href="/panel/fideliza" className="negocio-boton negocio-boton--dark fz-grupos__accion">
            <Megaphone size={15} /> Escríbeles hoy desde Inicio
          </Link>
        )}
      </article>

      {/* 4 · De dónde salen: el embudo y los que aún no compran. */}
      <div className="fz-numeros__fila fz-leads">
        <article className="fz-numeros__card">
          <div className="negocio-card-head"><h2>Tus clientes nuevos</h2><span className="negocio-currency">últimos {periodo}</span></div>
          <p className="fz-numeros__sub">De quien escaneó tu QR a quien ya volvió.</p>
          <ol className="fz-embudo">
            {pasos.map((p, i) => (
              <li key={p.id} className={`fz-embudo__paso fz-embudo__paso--${p.id}`}>
                <div className="fz-embudo__txt">
                  <b>{p.nombre}</b>
                  <small>{p.nota}{i > 0 ? ` · ${pctDe(p.valor, pasos[i - 1].valor)} del paso anterior` : ''}</small>
                </div>
                <strong><ContadorAnimado valor={p.valor} /></strong>
                <i style={{ width: `${Math.max(4, (p.valor / baseEmbudo) * 100)}%` }} />
              </li>
            ))}
          </ol>
        </article>

        <article className="fz-numeros__card">
          <div className="negocio-card-head"><h2>Sacaron su tarjeta y no vienen</h2><span className="negocio-currency">{sinComprar} en total</span></div>
          <p className="fz-numeros__sub">Son los más fáciles de traer: ya te conocen.</p>
          {n.leads.length === 0 ? (
            <p className="fz-numeros__nota">Nadie pendiente: todos los que sacaron su tarjeta ya compraron.</p>
          ) : (
            <ul className="fz-leads__lista">
              {n.leads.slice(0, 4).map((l) => (
                <li key={l.id}>
                  <Link href={`/panel/fideliza/clientes/${l.id}`}>
                    <span className="fz-leads__ini" aria-hidden="true">{(l.alias || '?').trim().charAt(0).toUpperCase()}</span>
                    <span className="fz-leads__nom">{l.alias || 'Sin nombre'}</span>
                    <small>se unió {hace(l.created_at)}</small>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {sinComprar > 0 && (
            <div className="fz-fila" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
              <Link href="/panel/fideliza/clientes?filtro=never" className="negocio-boton"><Users size={15} /> Ver los {sinComprar}</Link>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
