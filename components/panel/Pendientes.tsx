'use client';

/**
 * «Lo que necesita atención» (18-nov-2026, The 24/7).
 *
 * Lo que hay que hacer y dónde se hace: por cobrar, citas sin marcar, pagos por verificar, lo que
 * se le debe al equipo… Aquí no se resuelve nada; cada fila lleva a la pantalla donde se resuelve.
 * En orden de urgencia: primero lo que tiene a alguien esperando AHORA.
 *
 * Sale en dos sitios, con UNA sola consulta (usePendientes, compartida cada 30 s):
 *   · TarjetaPendientes: en el inicio, debajo de ingresos y citas, con la estética del dashboard
 *     (las mismas .card, .dash-section-head y .action-row que «Agenda de hoy» o «Más vendidos»).
 *   · CampanaAvisos (components/panel/CampanaAvisos.tsx): la campana de la barra de arriba, en
 *     todas las pantallas; vibra mientras haya algo urgente y despliega la misma lista.
 *
 * Cada consulta aguanta que su SQL no esté instalada o que el rol no la vea (cuenta 0).
 */
import Link from 'next/link';
import { useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  FileWarning,
  HandCoins,
  ListChecks,
  MessageCircle,
  ReceiptText,
  RotateCcw,
  SearchCheck,
} from 'lucide-react';
import Campana from '@/components/panel/Campana';
import { useCargar } from '@/components/panel/useCargar';
import { useSondeo } from '@/components/panel/useSondeo';
import { calcularPorPagar, leerCierres, solesExactos } from '@/lib/panel/cierres';
import { isoLocal } from '@/lib/panel/format';
import { supabase } from '@/lib/supabase/client';
import './pendientes.css';

export interface Pendiente {
  clave: string;
  n: number;
  titulo: string;
  detalle: string;
  href: string;
  /** ya = alguien espera ahora (suena la campana); luego = se puede hacer más tarde. */
  tono: 'ya' | 'luego';
  /** El verbo del botón: lo que se hace al tocar. */
  accion: string;
  Icono: typeof AlertTriangle;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Una consulta que puede no existir todavía: 0 en vez de romper el panel. */
async function cuenta(p: PromiseLike<{ data: unknown; error: unknown; count?: number | null }>, filtro?: (x: unknown[]) => number) {
  try {
    const r = await p;
    if (r.error) return 0;
    if (typeof r.count === 'number') return r.count;
    const lista = Array.isArray(r.data) ? r.data : [];
    return filtro ? filtro(lista) : lista.length;
  } catch {
    return 0;
  }
}

/**
 * Lo que se le debe al equipo (datos 0014). Recalcula comisiones de semanas: se hace cada
 * 5 minutos, no en cada vuelta de 30 s.
 */
const cierresCache = new Map<string, { at: number; v: Promise<{ n: number; total: number }> }>();
function porPagarAlEquipo(companyId: string) {
  const c = cierresCache.get(companyId);
  if (c && Date.now() - c.at < 5 * 60_000) return c.v;
  const v = (async () => {
    try {
      const cierres = await leerCierres(companyId);
      if (!cierres) return { n: 0, total: 0 };
      const { porPagar } = await calcularPorPagar(companyId, cierres);
      const deuda = porPagar.filter((p) => p.aPagar > 0);
      return { n: deuda.length, total: deuda.reduce((t, p) => t + p.aPagar, 0) };
    } catch {
      return { n: 0, total: 0 };
    }
  })();
  cierresCache.set(companyId, { at: Date.now(), v });
  return v;
}

async function leer(companyId: string): Promise<Pendiente[]> {
  const sb = supabase();
  const hoy = isoLocal(new Date());
  const hace7 = isoLocal(new Date(Date.now() - 7 * 86_400_000));
  // `slot_start` es texto local («2026-11-18 16:00»): se compara como texto. Media hora de margen.
  const margen = new Date(Date.now() - 30 * 60_000);
  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const yaPaso = `${hoy} ${isoLocal(margen) === hoy ? hhmm(margen) : '00:00'}`;
  const [porVerificar, porCotejar, listos, adelantos, boletas, equipo, sinMarcar, conversaciones] = await Promise.all([
    // Capturas subidas en la página que mira una persona (tu-pagina 0017/0021).
    cuenta(sb.rpc('comprobantes_panel', { p_company: companyId })),
    // Validadas solas, falta mirar si llegaron en la app del banco (0032).
    cuenta(sb.rpc('comprobantes_por_cotejar', { p_company: companyId })),
    // Atendidas hoy y sin cobro apuntado: la cola de «Listos para cobrar».
    cuenta(
      sb.from('appointments').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('status', 'completed').like('slot_start', `${hoy}%`)
        .or('pagado_por.is.null,pagado_por.eq.'),
    ),
    // Pagaron adelanto y no vinieron (0027).
    cuenta(sb.rpc('agenda_adelantos_sin_usar', { p_company: companyId })),
    // Boletas de la semana que no llegaron bien a SUNAT (modules/facturacion). Solo dueño/admin.
    cuenta(sb.rpc('factura_lista', { p_company: companyId, p_desde: hace7, p_hasta: hoy }), (l) =>
      l.filter((c) => ['por_enviar', 'pendiente', 'error', 'anulando'].includes(String((c as { estado?: string }).estado))).length,
    ),
    // Comisión ganada desde el último pago, menos adelantos: un «cierre» por barbero (datos 0014).
    porPagarAlEquipo(companyId),
    // Ya pasó su hora hoy y nadie dijo si vino: sin marcar no se cobra ni cuenta la comisión.
    cuenta(
      sb.from('appointments').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('status', 'confirmed').like('slot_start', `${hoy}%`).lt('slot_start', yaPaso),
    ),
    // Mia pasó la conversación a una persona y nadie la tomó.
    cuenta(sb.from('escalations').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'pending')),
  ]);

  // En orden de urgencia: el cliente esperando en el mostrador, primero.
  const todas: Pendiente[] = [
    {
      clave: 'listos', n: listos, tono: 'ya', Icono: ReceiptText, href: '/panel/caja', accion: 'Cobrar',
      titulo: `${plural(listos, 'cliente', 'clientes')} por cobrar`,
      detalle: 'Ya atendidos hoy; falta cobrarles.',
    },
    {
      clave: 'verificar', n: porVerificar, tono: 'ya', Icono: AlertTriangle, href: '/panel/agenda', accion: 'Revisar',
      titulo: `${plural(porVerificar, 'pago', 'pagos')} por verificar`,
      detalle: 'Mira la captura y apruébalo.',
    },
    {
      clave: 'sinmarcar', n: sinMarcar, tono: 'ya', Icono: CalendarClock, href: '/panel/agenda', accion: 'Marcar',
      titulo: `${plural(sinMarcar, 'cita pasó', 'citas pasaron')} sin marcar`,
      detalle: 'Di si vino: sin eso no se cobra ni cuenta la comisión.',
    },
    {
      clave: 'conversaciones', n: conversaciones, tono: 'ya', Icono: MessageCircle, href: '/panel/mensajes', accion: 'Responder',
      titulo: `${plural(conversaciones, 'cliente espera', 'clientes esperan')} respuesta`,
      detalle: 'Mia te pasó la conversación.',
    },
    {
      clave: 'cierres', n: equipo.n, tono: 'luego', Icono: HandCoins, href: '/panel/comisiones', accion: 'Pagar',
      titulo: `${solesExactos(equipo.total)} por pagar a tu equipo`,
      detalle: `Comisión pendiente de ${plural(equipo.n, 'persona', 'personas')}.`,
    },
    {
      clave: 'cotejar', n: porCotejar, tono: 'luego', Icono: SearchCheck, href: '/panel/agenda', accion: 'Cotejar',
      titulo: `${plural(porCotejar, 'pago', 'pagos')} por cotejar`,
      detalle: 'Mira en tu app si de verdad llegaron.',
    },
    {
      clave: 'adelantos', n: adelantos, tono: 'luego', Icono: RotateCcw, href: '/panel/agenda', accion: 'Reprogramar',
      titulo: `${plural(adelantos, 'adelanto', 'adelantos')} por reprogramar`,
      detalle: 'Pagaron y no vinieron: dales otra hora.',
    },
    {
      clave: 'boletas', n: boletas, tono: 'luego', Icono: FileWarning, href: '/panel/comprobantes', accion: 'Ver',
      titulo: `${plural(boletas, 'boleta', 'boletas')} por revisar`,
      detalle: 'SUNAT aún no contesta o no salieron.',
    },
  ];
  return todas.filter((p) => p.n > 0);
}

/** Una consulta por negocio cada ~25 s, aunque la pidan la campana y el inicio a la vez. */
const compartida = new Map<string, { at: number; v: Promise<Pendiente[]> }>();
function leerCompartido(companyId: string): Promise<Pendiente[]> {
  const c = compartida.get(companyId);
  if (c && Date.now() - c.at < 25_000) return c.v;
  const v = leer(companyId).catch(() => [] as Pendiente[]);
  compartida.set(companyId, { at: Date.now(), v });
  return v;
}

/** Lo pendiente del negocio, releído cada 30 s sin recargar. null mientras carga la primera vez. */
export function usePendientes(companyId: string | null): Pendiente[] | null {
  const [ronda, setRonda] = useState(0);
  const { datos } = useCargar(() => (companyId ? leerCompartido(companyId) : Promise.resolve([])), [companyId, ronda]);
  useSondeo(() => setRonda((r) => r + 1), 30_000, Boolean(companyId));
  return datos ?? null;
}

const urgentesDe = (l: Pendiente[]) => l.filter((p) => p.tono === 'ya').length;

/**
 * Las filas, con la forma de las del dashboard (.action-row): ícono en su cuadro de color, título,
 * detalle gris y la flecha. Lo urgente, en naranja y con el ícono vibrando; lo demás, quieto.
 */
export function FilasPendientes({ datos, alElegir }: { datos: Pendiente[]; alElegir?: () => void }) {
  return (
    <>
      {datos.map(({ clave, n, titulo, detalle, href, tono, Icono }, i) => (
        <Link key={clave} href={href} onClick={alElegir}
          className={`action-row pend-row${tono === 'ya' ? ' pend-row--ya' : ''}`} style={{ ['--i' as string]: i }}>
          <span className={`action-row__icon ${tono === 'ya' ? 'action-row__icon--orange' : i % 2 ? 'action-row__icon--violet' : 'action-row__icon--teal'}`}>
            <Icono size={17} aria-hidden />
            <i className="pend-row__n" aria-hidden>{n > 99 ? '99+' : n}</i>
          </span>
          <span>
            <b>{titulo}</b>
            <small>{detalle}</small>
          </span>
          <ChevronRight size={16} aria-hidden />
        </Link>
      ))}
    </>
  );
}

/** La tarjeta del inicio: debajo de ingresos y citas, a todo lo ancho. */
export default function TarjetaPendientes({ companyId }: { companyId: string | null }) {
  const datos = usePendientes(companyId);
  if (!datos) return null;
  return <VistaPendientes datos={datos} />;
}

/** El dibujo, aparte de la consulta. */
export function VistaPendientes({ datos }: { datos: Pendiente[] }) {
  const urgentes = urgentesDe(datos);
  return (
    <article className="card dash-attention-card" aria-label="Lo que necesita atención" aria-live="polite">
      <div className="dash-section-head">
        <div>
          <span className="dash-eyebrow">Prioridades</span>
          <h3>{datos.length ? 'Lo que necesita atención' : 'Todo al día'}</h3>
        </div>
        <span className={`pend-estado${urgentes ? ' pend-estado--ya' : datos.length ? '' : ' pend-estado--ok'}`}>
          {urgentes ? <><Campana size={15} /> {urgentes === 1 ? '1 urgente' : `${urgentes} urgentes`}</>
            : datos.length ? `${datos.length} por hacer` : <><CheckCircle2 size={15} aria-hidden /> Nada pendiente</>}
        </span>
      </div>
      {datos.length > 0 ? (
        <div className="pend-grid">
          <FilasPendientes datos={datos} />
        </div>
      ) : (
        <p className="pend-vacio">Cuando algo llegue (un cliente por cobrar, un pago por revisar), aparece aquí solo.</p>
      )}
    </article>
  );
}
