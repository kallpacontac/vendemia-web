'use client';

/**
 * «Por sede» en Métricas (17-nov-2026, The 24/7: «métricas por sede o todo»). Las sedes lado a lado
 * en el periodo elegido: citas, atendidas, no vinieron e ingresos, y el total del negocio.
 *
 *   · Las series de arriba salen de vistas de la base, que no saben de sedes: esta tarjeta las
 *     cuenta aquí, con las citas del periodo (por fecha de la cita) y su importe (v_movimientos,
 *     solo lo que cuenta como ingreso, la misma regla que el resto de Métricas).
 *   · Una cita sin sede (las de antes de la 0023) va en «Sin sede», que solo sale si hay alguna.
 *   · Con menos de 2 sedes no sale.
 */
import { MapPin } from 'lucide-react';
import { useCargar } from '@/components/panel/useCargar';
import { useSedes } from '@/components/panel/SelectorSede';
import { soles } from '@/lib/panel/format';
import { getCitasDelPeriodo, getMovimientos } from '@/lib/supabase/queries';

export interface Fila { nombre: string; citas: number; atendidas: number; noVino: number; ingresos: number }

const vacia = (nombre: string): Fila => ({ nombre, citas: 0, atendidas: 0, noVino: 0, ingresos: 0 });

export default function MetricasPorSede({ companyId, desde, hasta }: { companyId: string; desde: string; hasta: string }) {
  const sedes = useSedes(companyId);
  const hay = sedes.length >= 2;

  const { datos, cargando } = useCargar(async () => {
    if (!hay) return null;
    const [citas, movimientos] = await Promise.all([getCitasDelPeriodo(companyId, desde, hasta), getMovimientos(companyId, desde, hasta)]);
    const ingreso = new Map<string, number>();
    for (const m of movimientos) {
      if (m.fuente === 'appointment' && m.cuenta_ingreso) ingreso.set(m.movimiento_id, (ingreso.get(m.movimiento_id) ?? 0) + m.importe);
    }
    const filas = new Map<string, Fila>(sedes.map((s) => [s.nombre, vacia(s.nombre)]));
    const sinSede = vacia('Sin sede');
    for (const c of citas) {
      if (c.status === 'cancelled') continue;
      const f = filas.get(c.sede ?? '') ?? sinSede;
      f.citas += 1;
      if (c.status === 'completed') f.atendidas += 1;
      if (c.status === 'no_show') f.noVino += 1;
      f.ingresos += ingreso.get(c.id) ?? 0;
    }
    const lista = [...filas.values()];
    if (sinSede.citas) lista.push(sinSede);
    const total = lista.reduce((t, f) => ({ ...t, citas: t.citas + f.citas, atendidas: t.atendidas + f.atendidas, noVino: t.noVino + f.noVino, ingresos: t.ingresos + f.ingresos }), vacia('Todas'));
    return { lista, total };
  }, [companyId, desde, hasta, hay, sedes.map((s) => s.nombre).join('|')]);

  if (!hay) return null;

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-head">
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={16} aria-hidden="true" /> Por sede</h3>
          <small className="muted">Citas del periodo por su fecha (sin las canceladas) e ingresos de esas citas.</small>
        </div>
      </div>
      {!datos ? (
        <p className="vacio">{cargando ? 'Contando por sede…' : 'No se pudo contar por sede.'}</p>
      ) : (
        <PorSedeVista lista={datos.lista} total={datos.total} />
      )}
    </div>
  );
}

/** La tabla, sin red: para verla con datos de mentira. Cabe en un celular de 360 px. */
export function PorSedeVista({ lista, total }: { lista: Fila[]; total: Fila }) {
  const num: React.CSSProperties = { textAlign: 'right', padding: '9px 0 9px 8px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  const fila = (f: Fila, esTotal: boolean) => {
    const parte = !esTotal && total.ingresos > 0 ? Math.round((f.ingresos / total.ingresos) * 100) : null;
    return (
      <tr key={f.nombre} style={esTotal ? { fontWeight: 800, borderTop: '2px solid var(--line)' } : { borderTop: '1px solid var(--line)' }}>
        <td style={{ padding: '9px 0', fontWeight: 700, overflowWrap: 'anywhere' }}>{f.nombre}</td>
        <td style={num}>
          <b>{soles(f.ingresos)}</b>
          {parte !== null && <small className="muted" style={{ display: 'block', fontWeight: 600 }}>{parte} %</small>}
        </td>
        <td style={num}>{f.citas}</td>
        <td style={num}>{f.atendidas}</td>
        <td style={num}>{f.noVino}</td>
      </tr>
    );
  };
  const cab: React.CSSProperties = { ...num, padding: '0 0 6px 8px', fontSize: 12, color: 'var(--ink-soft)', fontWeight: 700 };
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
      <thead>
        <tr>
          <th style={{ ...cab, textAlign: 'left', paddingLeft: 0 }}>Sede</th>
          <th style={cab}>Ingresos</th>
          <th style={cab}>Citas</th>
          <th style={cab}>Vino</th>
          <th style={cab}>No vino</th>
        </tr>
      </thead>
      <tbody>
        {lista.map((f) => fila(f, false))}
        {fila(total, true)}
      </tbody>
    </table>
  );
}
