'use client';

/**
 * «Foto al generar ticket» (tu-pagina 0039, 26-nov-2026, The 24/7: «la configuración tampoco»).
 * Sin foto / opcional (de serie) / obligatoria, para el formulario «Generar ticket» de Mi agenda.
 * Lo cambian el dueño y el administrador; la base lo vuelve a mirar. Sin la 0039 no sale.
 */
import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { MODOS_FOTO_TICKET, TEXTO_FOTO_TICKET, type ModoFotoTicket } from '@/lib/panel/fotoTicket';

export default function FotoDelTicket({ companyId, puede }: { companyId: string; puede: boolean }) {
  const avisar = useAvisar();
  const [guardando, setGuardando] = useState(false);
  const { datos, releer } = useCargar(async (): Promise<ModoFotoTicket | null> => {
    const { data, error } = await supabase().rpc('ticket_foto_modo', { p_company: companyId });
    if (error) return null;
    return data === 'apagada' || data === 'obligatoria' ? data : 'opcional';
  }, [companyId]);
  if (!datos) return null;

  async function cambiar(modo: ModoFotoTicket) {
    if (modo === datos) return;
    setGuardando(true);
    const { error } = await supabase().rpc('ticket_foto_guardar', { p_company: companyId, p_modo: modo });
    setGuardando(false);
    if (error) return avisar(error.message, 'error');
    avisar(`Foto al generar ticket: ${TEXTO_FOTO_TICKET[modo].titulo.toLowerCase()}.`, 'ok');
    releer();
  }

  return (
    <div style={{ marginTop: 16 }}>
      <b style={{ display: 'block', fontSize: 14 }}>Foto al generar ticket</b>
      <small className="muted" style={{ display: 'block', margin: '2px 0 8px' }}>
        En Mi agenda, cuando el barbero genera un ticket: la foto del voucher o del ticket de papel (hasta 2). La ve la caja al cobrar; no
        registra ningún pago.
      </small>
      {!puede && <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Lo cambia el dueño o el administrador.</p>}
      <div className="opciones opciones--3" role="radiogroup" aria-label="Foto al generar ticket">
        {MODOS_FOTO_TICKET.map((m) => (
          <button key={m} type="button" className={`opcion ${datos === m ? 'on' : ''}`} role="radio" aria-checked={datos === m}
            disabled={!puede || guardando} onClick={() => void cambiar(m)}>
            <b>{TEXTO_FOTO_TICKET[m].titulo}</b>
            <small>{TEXTO_FOTO_TICKET[m].detalle}</small>
            {m === 'opcional' && <span className="opcion__def">por defecto</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
