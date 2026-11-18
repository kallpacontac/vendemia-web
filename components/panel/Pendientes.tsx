'use client';

/**
 * «Lo que necesita atención» · arriba del panel principal (18-nov-2026).
 *
 * Alvaro, con la captura de otro sistema: «que en el panel principal, que es donde entra por
 * defecto, tenga las acciones que tiene pendientes». Y luego (The 24/7): «le interesa qué
 * acciones tiene pendientes, por ejemplo por cobrar, más que las conversaciones; una animación
 * como de timbre sobre lo que necesita atender, claro y entendible».
 *
 * Cada fila dice cuántas hay (número grande sobre el ícono), qué es, y un verbo (Cobrar, Marcar,
 * Pagar…) que lleva a la pantalla donde se resuelve; aquí no se resuelve nada. En orden de
 * urgencia: lo que tiene a alguien esperando AHORA (el cliente en el mostrador) primero, con la
 * campana sonando; lo que puede esperar, después y quieto. Sin nada: «Todo al día».
 *
 * Cada consulta aguanta que su SQL no esté instalada o que el rol no la vea (cuenta 0), y se
 * relee cada 30 s sin recargar.
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

async function leer(companyId: string, conversaciones: number): Promise<Pendiente[]> {
  const sb = supabase();
  const hoy = isoLocal(new Date());
  const hace7 = isoLocal(new Date(Date.now() - 7 * 86_400_000));
  // `slot_start` es texto local («2026-11-18 16:00»): se compara como texto. Media hora de margen.
  const margen = new Date(Date.now() - 30 * 60_000);
  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const yaPaso = `${hoy} ${isoLocal(margen) === hoy ? hhmm(margen) : '00:00'}`;
  const [porVerificar, porCotejar, listos, adelantos, boletas, equipo, sinMarcar] = await Promise.all([
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

export default function Pendientes({ companyId, conversaciones = 0 }: { companyId: string | null; conversaciones?: number }) {
  const [ronda, setRonda] = useState(0);
  const { datos } = useCargar(
    () => (companyId ? leer(companyId, conversaciones) : Promise.resolve([])),
    [companyId, ronda, conversaciones],
  );
  useSondeo(() => setRonda((r) => r + 1), 30_000, Boolean(companyId));

  return datos ? <VistaPendientes datos={datos} /> : null;
}

/** El dibujo, aparte de la consulta. */
export function VistaPendientes({ datos }: { datos: Pendiente[] }) {
  const urgentes = datos.filter((p) => p.tono === 'ya').length;
  const hay = datos.length > 0;

  return (
    <section className={`card atencion${urgentes ? ' atencion--suena' : ''}`} aria-label="Lo que necesita atención" aria-live="polite">
      <div className="atencion__cab">
        <span className={`atencion__timbre${!hay ? ' atencion__timbre--ok' : urgentes ? '' : ' atencion__timbre--calma'}`}>
          {urgentes ? <Campana size={22} /> : hay ? <ListChecks size={21} aria-hidden /> : <CheckCircle2 size={22} aria-hidden />}
        </span>
        <div>
          <h2>{hay ? 'Lo que necesita atención' : 'Todo al día'}</h2>
          <small>
            {!hay
              ? 'Nada pendiente ahora. Cuando algo llegue, suena aquí solo.'
              : urgentes
                ? `${plural(urgentes, 'cosa no puede', 'cosas no pueden')} esperar`
                : 'Nada urgente: cuando tengas un momento.'}
          </small>
        </div>
      </div>

      {hay && (
        <div className="atencion__lista">
          {datos.map(({ clave, n, titulo, detalle, href, tono, Icono, accion }, i) => (
            <Link key={clave} href={href} className={`pendiente pendiente--${tono}`} style={{ ['--i' as string]: i }}>
              <span className="pendiente__icono" aria-hidden>
                <Icono size={20} />
                <i className="pendiente__n">{n > 99 ? '99+' : n}</i>
              </span>
              <span className="pendiente__texto">
                <b>{titulo}</b>
                <span>{detalle}</span>
              </span>
              <span className="pendiente__accion">
                {accion} <ChevronRight size={16} aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
