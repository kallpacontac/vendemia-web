'use client';

/**
 * Quién falta seguido: los clientes con dos o más «No vino» en los últimos 90
 * días. Es lo que pide un negocio de canchas antes de darle a alguien un turno
 * fijo o de reservarle sin adelanto. Sale de las mismas citas que ya cargó la
 * agenda (las 500 últimas), marcadas en «Ya pasaron» → «No vino».
 */
import { useMemo } from 'react';
import { UserX } from 'lucide-react';
import { telefono as comoTelefono } from '@/lib/panel/format';
import type { Cita, Lead } from '@/lib/supabase/queries';

const DIAS = 90;
const MINIMO = 2;
const TOPE = 8;

export default function FaltanSeguido({ citas, leads }: { citas: Cita[]; leads: Lead[] }) {
  const lista = useMemo(() => {
    const desde = new Date(Date.now() - DIAS * 864e5).toISOString().slice(0, 10);
    const porLead = new Map<string, { n: number; ultima: string }>();
    for (const c of citas) {
      if (c.status !== 'no_show' || c.slot_start.startsWith('sched:') || c.slot_start.slice(0, 10) < desde) continue;
      const a = porLead.get(c.lead_id) ?? { n: 0, ultima: '' };
      porLead.set(c.lead_id, { n: a.n + 1, ultima: c.slot_start > a.ultima ? c.slot_start : a.ultima });
    }
    const quien = new Map(leads.map((l) => [l.id, l]));
    return [...porLead.entries()]
      .filter(([, x]) => x.n >= MINIMO)
      .sort((a, b) => b[1].n - a[1].n || b[1].ultima.localeCompare(a[1].ultima))
      .map(([id, x]) => ({ id, ...x, nombre: quien.get(id)?.name || 'Sin nombre', telefono: quien.get(id)?.phone ?? '' }));
  }, [citas, leads]);

  if (!lista.length) return null;
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-head">
        <h3><UserX size={16} style={{ verticalAlign: -3 }} /> Faltan seguido</h3>
        <small className="muted">{MINIMO} o más «No vino» en {DIAS} días</small>
      </div>
      <div className="confirmar-lista">
        {lista.slice(0, TOPE).map((x) => (
          <div key={x.id} className="confirmar-fila">
            <div className="confirmar-quien">
              <b>{x.nombre}</b>
              <small className="muted">{comoTelefono(x.telefono)} · la última, el {x.ultima.slice(0, 10).split('-').reverse().join('/')}</small>
            </div>
            <div className="confirmar-sellos">
              <span className="badge-pill" style={{ color: '#FF5B79', background: '#FF5B7918' }}>{x.n} faltas</span>
            </div>
          </div>
        ))}
      </div>
      {lista.length > TOPE && <small className="muted" style={{ display: 'block', padding: '0 16px 12px' }}>Y {lista.length - TOPE} más.</small>}
    </div>
  );
}
