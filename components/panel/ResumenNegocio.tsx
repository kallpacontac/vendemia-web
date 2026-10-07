'use client';

import Link from 'next/link';
import { ArrowUpRight, CalendarDays, MessageCircle, Users, Wallet } from 'lucide-react';
import { soles } from '@/lib/panel/format';
import { delta, etiquetaCubo, total } from '@/lib/panel/serie';
import type { GranoSerie, PuntoSerie } from '@/lib/supabase/types';
import './resumen-negocio.css';
import ContadorAnimado from './ContadorAnimado';

export interface ResumenNegocioProps {
  serie: PuntoSerie[];
  anterior: PuntoSerie[];
  grano: GranoSerie;
  periodo: string;
  reservas: string;
  conCitas: boolean;
  academia: boolean;
  pendientes: number;
  porPagar: number;
}

function Cambio({ actual, previo }: { actual: number; previo: number }) {
  const d = delta(actual, previo);
  return (
    <span className={`resumen-cambio ${d.clase}`}>
      {d.pct === null ? (actual === 0 ? 'Sin variación' : 'Sin base comparable') : d.texto}
    </span>
  );
}

export default function ResumenNegocio({ serie, anterior, grano, periodo, reservas, conCitas, academia, pendientes, porPagar }: ResumenNegocioProps) {
  const ingreso = total(serie, 'ingresos');
  const ingresoAnterior = total(anterior, 'ingresos');
  const reservasActuales = total(serie, conCitas ? 'citas' : 'pedidos');
  const contactos = total(serie, 'leads');
  const operacion = conCitas ? '/panel/agenda' : '/panel/pedidos';
  const mayor = Math.max(...serie.map((p) => p.ingresos), ...anterior.map((p) => p.ingresos), 0);
  // Escala compartida y alturas proporcionales: cero no dibuja una venta.
  const unidad = mayor ? 10 ** Math.floor(Math.log10(mayor)) : 1;
  const techo = mayor ? Math.ceil(mayor / unidad) * unidad : 100;
  const ticks = [1, .75, .5, .25, 0];
  const claveGrafico = `${grano}:${periodo}:${serie.map((p) => `${p.periodo}:${p.ingresos}`).join('|')}:${anterior.map((p) => p.ingresos).join('|')}`;
  const fecha = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: '2-digit' });
  const etiquetaRango = (p: PuntoSerie | undefined, ultimo: PuntoSerie | undefined) => p && ultimo ? `${fecha(p.periodo)} – ${fecha(ultimo.fin)}` : 'Sin datos';
  const indicadores = [
    { titulo: reservas, valor: reservasActuales, detalle: 'En el período seleccionado', href: operacion, Icono: CalendarDays, previo: total(anterior, conCitas ? 'citas' : 'pedidos'), destacado: true },
    { titulo: 'Nuevos contactos', valor: contactos, detalle: 'Conversaciones iniciadas', href: '/panel/leads', Icono: Users, previo: total(anterior, 'leads') },
    { titulo: 'Por responder', valor: pendientes, detalle: 'Requieren atención · ahora', href: '/panel/mensajes', Icono: MessageCircle },
    { titulo: 'Por pagar', valor: porPagar, detalle: `${academia ? 'Inscripciones' : reservas} pendientes · ahora`, href: academia ? '/panel/alumnos' : operacion, Icono: Wallet },
  ];

  return (
    <section className="negocio-overview" aria-label="Resumen del negocio">
      <article className="negocio-balance">
        <div className="negocio-card-head"><h2>Ingresos registrados</h2><span className="negocio-currency">PEN · S/</span></div>
        <p className="negocio-periodo">{periodo}</p>
        <strong className="negocio-importe"><ContadorAnimado valor={ingreso} moneda /></strong>
        <div className="negocio-comparacion"><Cambio actual={ingreso} previo={ingresoAnterior} /><span>vs. período anterior</span></div>
        <div className="negocio-acciones">
          <Link href="/panel/caja" className="negocio-boton negocio-boton--dark"><Wallet size={16} /> Abrir caja</Link>
          <Link href={operacion} className="negocio-boton"><CalendarDays size={16} /> {academia ? 'Ver clases' : conCitas ? 'Ver agenda' : 'Ver pedidos'}</Link>
        </div>
        <div className="negocio-contexto">
          <span>Tu negocio, en este período</span>
          <div className="negocio-mini-grid">
            <div><small>Anterior</small><b><ContadorAnimado valor={ingresoAnterior} moneda /></b><span>Ingreso registrado</span></div>
            <div><small>{reservas}</small><b><ContadorAnimado valor={reservasActuales} /></b><span>Registrad{conCitas ? 'as' : 'os'}</span></div>
            <div><small>Contactos</small><b><ContadorAnimado valor={contactos} /></b><span>Nuevos</span></div>
          </div>
        </div>
      </article>

      <section className="negocio-indicadores" aria-label="Indicadores y acciones">
        {indicadores.map(({ titulo, valor, detalle, href, Icono, previo, destacado }) => (
          <Link key={titulo} href={href} className={`negocio-indicador ${destacado ? 'negocio-indicador--coral' : ''}`}>
            <div className="negocio-indicador-head"><span>{titulo}</span><Icono size={17} /></div>
            <strong><ContadorAnimado valor={valor} /></strong>
            <p>{detalle}</p>
            <div className="negocio-indicador-foot">
              {previo !== undefined ? <Cambio actual={valor} previo={previo} /> : <span>Revisar pendientes</span>}
              <ArrowUpRight size={15} aria-hidden="true" />
            </div>
          </Link>
        ))}
      </section>

      <article className="negocio-evolucion">
        <div className="negocio-card-head"><h2>Evolución de ingresos</h2><Link href="/panel/metricas" aria-label="Abrir reportes"><ArrowUpRight size={19} /></Link></div>
        <div className="negocio-chart-box">
          <div className="negocio-leyenda">
            <span><i className="anterior" /> Anterior</span><span><i className="actual" /> Actual</span>
          </div>
          {mayor === 0 ? <div className="negocio-chart-empty"><Wallet size={26} /><b>Aún no hay ingresos</b><p>Las ventas registradas aparecerán aquí.</p></div> : (
            <div className="negocio-chart-scroll" tabIndex={0} aria-label="Comparación de ingresos; desplaza para ver todos los datos">
              <div key={claveGrafico} className="negocio-plot" style={{ minWidth: serie.length > 8 ? serie.length * (grano === 'month' ? 56 : 38) + 60 : undefined }}>
                <div className="negocio-eje" aria-hidden="true">{ticks.map((tick) => <span key={tick}>{soles(techo * tick)}</span>)}</div>
                <div className="negocio-barras">
                  <div className="negocio-guias" aria-hidden="true">{ticks.map((tick) => <i key={tick} />)}</div>
                  {serie.map((p, i) => {
                    const previo = anterior[i];
                    const descripcion = `Anterior ${previo ? etiquetaCubo(previo, grano) : ''}: ${soles(previo?.ingresos)}. Actual ${etiquetaCubo(p, grano)}: ${soles(p.ingresos)}.`;
                    return (
                      <div key={p.periodo} className="negocio-cubo">
                        <button type="button" className="negocio-par" aria-label={descripcion}>
                          <i className="anterior" style={{ height: `${((previo?.ingresos ?? 0) / techo) * 100}%`, animationDelay: `${Math.min(i, 12) * 25}ms` }} />
                          <i className={`actual ${p.parcial ? 'parcial' : ''}`} style={{ height: `${(p.ingresos / techo) * 100}%`, animationDelay: `${Math.min(i, 12) * 25 + 60}ms` }} />
                          <span className="negocio-tooltip">{descripcion}</span>
                        </button>
                        <span className="negocio-x">{etiquetaCubo(p, grano)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="negocio-chart-dates"><span>Anterior: {etiquetaRango(anterior[0], anterior.at(-1))}</span><span>Actual: {etiquetaRango(serie[0], serie.at(-1))}</span></div>
        <p className="negocio-chart-note">Comparación por posición en el período. El día actual aún está en curso.</p>
      </article>
    </section>
  );
}
