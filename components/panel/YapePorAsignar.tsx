'use client';

/**
 * «Yape por asignar» en la Agenda (lector 0002): los pagos que leyó Vendemia Caja y que no se
 * pudieron casar solos con una cita (dos citas del mismo monto a la vez y el nombre no decide,
 * o un pago en partes sin nombre que cuadre). El dueño elige la cita con un toque; el sistema
 * aprende ese pagador para la próxima. Solo dueño y administrador; sin nada por asignar, no sale.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { useSondeo } from '@/components/panel/useSondeo';
import { hora12 } from '@/lib/panel/format';
import { soles } from '@/lib/panel/cobro-cancha';
import './tablero-canchas.css';

interface Opcion {
  cita_id: string;
  cliente: string;
  servicio: string;
  slot: string;
  falta: number;
  exacto: boolean;
}
interface PorAsignar {
  id: number;
  centimos: number;
  nombre: string;
  origen: string;
  cuando: string;
  opciones: Opcion[];
}

const horaLima = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit', hour12: true });
const bonito = (s: string) => s.trim().toLowerCase().replace(/\b\p{L}/gu, (l) => l.toUpperCase());

export default function YapePorAsignar({ companyId, recarga, alCambiar }: { companyId: string; recarga?: unknown; alCambiar?: () => void }) {
  const avisar = useAvisar();
  const [abierta, setAbierta] = useState(true);
  const [ocupado, setOcupado] = useState(0);
  const { datos, releer } = useCargar(async () => {
    const { data, error } = await supabase().rpc('lector_por_asignar', { p_company: companyId });
    return error ? [] : ((data ?? []) as PorAsignar[]);
  }, [companyId, recarga]);
  useSondeo(releer, 30_000);

  if (!datos?.length) return null;

  async function asignar(p: PorAsignar, o: Opcion) {
    setOcupado(p.id);
    const { error } = await supabase().rpc('lector_asignar', { p_company: companyId, p_aviso: p.id, p_cita: o.cita_id });
    setOcupado(0);
    if (error) return avisar(error.message, 'error');
    avisar(`Listo: ${soles(p.centimos / 100)} a la cita de ${o.cliente || 'ese cliente'}.`, 'ok');
    releer();
    alCambiar?.();
  }

  return (
    <section className="tc-revisar tc-cotejar" aria-label="Yape por asignar">
      <button type="button" className="tc-revisar__cab" aria-expanded={abierta} onClick={() => setAbierta((a) => !a)}>
        <span>
          <b className="tc-revisar__titulo">{datos.length === 1 ? '1 Yape por asignar' : `${datos.length} Yape por asignar`}</b>
          <small className="tc-cotejar__sub">Llegaron al celular de cobros, pero pueden ser de más de una cita. Elige cuál.</small>
        </span>
        <span className="tc-revisar__plegar">
          {abierta ? 'Minimizar' : 'Ver'}
          <ChevronDown size={16} aria-hidden="true" style={{ transform: abierta ? 'rotate(180deg)' : undefined }} />
        </span>
      </button>
      {abierta && datos.map((p) => (
        <article key={p.id} className="tc-revisar__item">
          <div className="tc-revisar__datos">
            <b>{soles(p.centimos / 100)} · {p.origen}</b>
            <span>De {bonito(p.nombre) || 'alguien sin nombre'} · {horaLima(p.cuando)}</span>
            <div className="tc-revisar__acciones" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {p.opciones.map((o) => (
                <button key={o.cita_id} type="button" className="btn btn-ghost btn-sm" disabled={ocupado === p.id} onClick={() => asignar(p, o)}>
                  {o.cliente || 'Cliente'} · {o.servicio} · {hora12(o.slot.slice(11, 16))}
                  {!o.exacto && ` (faltan ${soles(o.falta)})`}
                </button>
              ))}
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
