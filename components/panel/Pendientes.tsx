'use client';

/**
 * «Pendientes» · lo que hay que hacer hoy, arriba del panel principal (18-nov-2026).
 *
 * Alvaro, con la captura de otro sistema: «que en el panel principal, que es donde entra por
 * defecto, tenga las acciones que tiene pendientes». Cada tarjeta dice cuántas hay y lleva
 * a la pantalla donde se resuelven; no se resuelve nada aquí (eso ya vive en Agenda y Caja).
 *
 * Solo sale lo que tiene algo. Sin nada pendiente, no se pinta. Cada consulta aguanta que su
 * SQL no esté instalada o que el rol no la vea (cuenta 0), y se relee cada 30 s.
 */
import Link from 'next/link';
import { useState } from 'react';
import { AlertTriangle, ChevronRight, FileWarning, HandCoins, ReceiptText, RotateCcw, SearchCheck } from 'lucide-react';
import { useCargar } from '@/components/panel/useCargar';
import { useSondeo } from '@/components/panel/useSondeo';
import { calcularPorPagar, leerCierres, solesExactos } from '@/lib/panel/cierres';
import { isoLocal } from '@/lib/panel/format';
import { supabase } from '@/lib/supabase/client';
import './pendientes.css';

interface Pendiente {
  clave: string;
  n: number;
  titulo: string;
  detalle: string;
  href: string;
  /** aviso = dinero sin confirmar o algo que falló; tarea = trabajo del día. */
  tono: 'aviso' | 'tarea';
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
  const [porVerificar, porCotejar, listos, adelantos, boletas, equipo] = await Promise.all([
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
  ]);

  const todas: Pendiente[] = [
    {
      clave: 'verificar', n: porVerificar, tono: 'aviso', Icono: AlertTriangle, href: '/panel/agenda',
      titulo: `${plural(porVerificar, 'pago', 'pagos')} por verificar`,
      detalle: 'Revisa la captura y apruébalo.',
    },
    {
      clave: 'cotejar', n: porCotejar, tono: 'aviso', Icono: SearchCheck, href: '/panel/agenda',
      titulo: `${plural(porCotejar, 'pago', 'pagos')} por cotejar`,
      detalle: 'Mira en tu app si de verdad llegaron.',
    },
    {
      clave: 'boletas', n: boletas, tono: 'aviso', Icono: FileWarning, href: '/panel/comprobantes',
      titulo: `${plural(boletas, 'boleta', 'boletas')} por revisar`,
      detalle: 'SUNAT aún no contesta o no salieron.',
    },
    {
      clave: 'listos', n: listos, tono: 'tarea', Icono: ReceiptText, href: '/panel/caja',
      titulo: `${plural(listos, 'cliente', 'clientes')} por cobrar`,
      detalle: 'Ya atendidos hoy; falta el cobro.',
    },
    {
      clave: 'cierres', n: equipo.n, tono: 'tarea', Icono: HandCoins, href: '/panel/comisiones',
      titulo: `${plural(equipo.n, 'cierre', 'cierres')} por pagar`,
      detalle: `${solesExactos(equipo.total)} a tu equipo.`,
    },
    {
      clave: 'adelantos', n: adelantos, tono: 'tarea', Icono: RotateCcw, href: '/panel/agenda',
      titulo: `${plural(adelantos, 'adelanto', 'adelantos')} por reprogramar`,
      detalle: 'Pagaron y no vinieron: dales otra hora.',
    },
  ];
  return todas.filter((p) => p.n > 0);
}

export default function Pendientes({ companyId }: { companyId: string | null }) {
  const [ronda, setRonda] = useState(0);
  const { datos } = useCargar(() => (companyId ? leer(companyId) : Promise.resolve([])), [companyId, ronda]);
  useSondeo(() => setRonda((r) => r + 1), 30_000, Boolean(companyId));

  if (!datos?.length) return null;
  return (
    <section className="pendientes" aria-label="Pendientes">
      {datos.map(({ clave, titulo, detalle, href, tono, Icono }) => (
        <Link key={clave} href={href} className={`pendiente pendiente--${tono}`}>
          <Icono size={22} className="pendiente__icono" aria-hidden />
          <span className="pendiente__texto">
            <b>{titulo}</b>
            <span>{detalle}</span>
          </span>
          <ChevronRight size={18} className="pendiente__ir" aria-hidden />
        </Link>
      ))}
    </section>
  );
}
