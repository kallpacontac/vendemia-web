'use client';

/**
 * Los comprobantes subidos en la página que tiene que mirar una persona. Sale encima del tablero
 * de canchas solo si hay alguno. Aprobar registra el pago y confirma la reserva, con la misma
 * comprobación de la cancha que la validación automática.
 */
import { useState } from 'react';
import { Check, ExternalLink, X } from 'lucide-react';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { supabase } from '@/lib/supabase/client';

interface PorRevisar {
  id: string;
  cliente: string;
  telefono: string;
  servicio: string;
  slot: string;
  total: number;
  pagado: number;
  url: string;
  monto: number | null;
  metodo: string;
  motivo: string;
}

export default function ComprobantesPorRevisar({ companyId, recarga, alCambiar }: { companyId: string; recarga: unknown; alCambiar: () => void }) {
  const avisar = useAvisar();
  const [montos, setMontos] = useState<Record<string, string>>({});
  const [metodos, setMetodos] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState('');

  // Sin la 0017 la función no existe: la pantalla sigue sin esta tarjeta.
  const { datos, recargar } = useCargar(async () => {
    const { data, error } = await supabase().rpc('comprobantes_panel', { p_company: companyId });
    return error ? [] : ((data ?? []) as PorRevisar[]);
  }, [companyId, recarga]);

  if (!datos?.length) return null;

  async function revisar(c: PorRevisar, accion: 'aprobar' | 'rechazar') {
    const monto = Number((montos[c.id] ?? String(c.monto ?? '')).replace(',', '.'));
    if (accion === 'aprobar' && !(monto > 0)) {
      avisar('Escribe el monto que ves en el comprobante.', 'error');
      return;
    }
    setOcupado(c.id);
    const { data, error } = await supabase().rpc('comprobante_revisar', {
      p_company: companyId, p_id: c.id, p_accion: accion,
      p_monto: accion === 'aprobar' ? monto : null,
      p_metodo: metodos[c.id] ?? (c.metodo || 'yape'),
    });
    setOcupado('');
    if (error) {
      avisar(error.message, 'error');
      return;
    }
    avisar(accion === 'rechazar' ? 'Comprobante rechazado. Avísale al cliente por WhatsApp.' : String((data as { detalle?: string } | null)?.detalle ?? 'Pago registrado.'), 'ok');
    recargar();
    alCambiar();
  }

  return (
    <section className="tc-revisar" aria-label="Comprobantes por revisar">
      <h3>{datos.length === 1 ? '1 comprobante por revisar' : `${datos.length} comprobantes por revisar`}</h3>
      {datos.map((c) => (
        <article key={c.id} className="tc-revisar__item">
          {c.url && <a className="tc-revisar__foto" href={c.url} target="_blank" rel="noopener" aria-label={`Abrir el comprobante de ${c.cliente}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.url} alt="" loading="lazy" /><ExternalLink size={14} aria-hidden="true" />
          </a>}
          <div className="tc-revisar__datos">
            <b>{c.cliente}</b>
            <small>{c.servicio} · {c.slot} · {c.telefono}</small>
            <small>Total S/ {c.total} · ya pagó S/ {c.pagado}</small>
            {c.motivo && <small className="tc-revisar__motivo">{c.motivo}</small>}
            <div className="tc-revisar__campos">
              <label>Monto (S/)
                <input inputMode="decimal" value={montos[c.id] ?? (c.monto === null ? '' : String(c.monto))} onChange={(e) => setMontos((m) => ({ ...m, [c.id]: e.target.value }))} />
              </label>
              <label>Método
                <select value={metodos[c.id] ?? (c.metodo || 'yape')} onChange={(e) => setMetodos((m) => ({ ...m, [c.id]: e.target.value }))}>
                  <option value="yape">Yape</option>
                  <option value="plin">Plin</option>
                  <option value="bank_transfer">Transferencia</option>
                </select>
              </label>
            </div>
            <div className="tc-revisar__botones">
              <button type="button" className="tc__accion" disabled={ocupado === c.id} onClick={() => void revisar(c, 'aprobar')}><Check size={16} aria-hidden="true" /> Aprobar pago</button>
              <button type="button" className="tc__accion tc__accion--suave" disabled={ocupado === c.id} onClick={() => void revisar(c, 'rechazar')}><X size={16} aria-hidden="true" /> Rechazar</button>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
