'use client';

/**
 * Los pagos de una reserva, en su ficha del tablero: cuánto, cuándo, el número de operación de
 * Yape o Plin (leído de la captura o de la foto del panel) y la foto, si la hay. Para que el
 * dueño pueda cotejar con su app sin pedirle nada al cliente.
 */
import { ExternalLink } from 'lucide-react';
import { useCargar } from '@/components/panel/useCargar';
import { supabase } from '@/lib/supabase/client';
import { soles } from '@/lib/panel/cobro-cancha';

interface Pago {
  id: string;
  amount: number | string | null;
  operation_id: string | null;
  voucher_path: string | null;
  created_at: number | string | null;
}

/** Solo los números de operación de verdad: los del panel («panel:…») y los inventados no. */
const operacionReal = (op: string | null) => (op && /^\d{4,}$/.test(op) ? op : '');

/** created_at llega en segundos (lo que escribe el bot) o como fecha ISO: los dos valen. */
function cuando(valor: number | string | null): string {
  if (valor === null || valor === '') return '';
  const n = Number(valor);
  const ms = Number.isFinite(n) ? (n > 1e12 ? n : n * 1000) : Date.parse(String(valor));
  if (!Number.isFinite(ms) || ms <= 0) return '';
  return new Date(ms).toLocaleString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function PagosDeReserva({ companyId, reservaId, pagado }: { companyId: string; reservaId: string; pagado: number }) {
  const { datos } = useCargar(async () => {
    const { data, error } = await supabase()
      .from('pending_payments')
      .select('id, amount, operation_id, voucher_path, created_at')
      .eq('company_id', companyId)
      .eq('appointment_id', reservaId)
      .order('created_at', { ascending: true })
      .limit(20);
    return error ? [] : ((data ?? []) as Pago[]);
  }, [companyId, reservaId, pagado]);

  if (!datos?.length) return null;
  return (
    <div className="tc-pagos">
      <b>Pagos</b>
      <ul>
        {datos.map((p) => {
          const op = operacionReal(p.operation_id);
          const foto = p.voucher_path && /^https:\/\//.test(p.voucher_path) ? p.voucher_path : '';
          return (
            <li key={p.id}>
              <span className="tc-pagos__monto">{soles(Number(p.amount) || 0)}</span>
              <span className="tc-pagos__dato">
                {op ? <>Op. <b>{op}</b></> : 'Sin n.º de operación'}
                {cuando(p.created_at) && <small>{cuando(p.created_at)}</small>}
              </span>
              {foto && <a href={foto} target="_blank" rel="noopener">Ver foto <ExternalLink size={13} aria-hidden="true" /></a>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
