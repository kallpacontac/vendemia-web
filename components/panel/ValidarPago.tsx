'use client';

/**
 * «Validar pago» desde el tablero de canchas: el dueño o el administrador vio el Yape (en su app,
 * en el chat, en efectivo) y lo apunta aquí. Postgres hace lo mismo que con un comprobante
 * validado: exige el adelanto para confirmar una apartada y comprueba que ESA cancha siga libre.
 */
import { useState } from 'react';
import { Check } from 'lucide-react';
import { useAvisar } from '@/components/panel/Avisos';
import { supabase } from '@/lib/supabase/client';
import type { ReservaTablero } from '@/lib/panel/tablero-canchas';

const soles = (n: number) => `S/ ${Number.isInteger(n) ? n : n.toFixed(2)}`;

export default function ValidarPago({ companyId, reserva, adelanto, alValidar }: {
  companyId: string;
  reserva: ReservaTablero;
  /** El de Mi página. 0 = sin adelanto: cualquier pago confirma. */
  adelanto: number;
  alValidar: () => void;
}) {
  const avisar = useAvisar();
  const falta = Math.max(reserva.total - reserva.pagado, 0);
  const sugerido = reserva.estado === 'esperando_pago' && adelanto > 0 ? Math.min(adelanto, falta) : falta;
  const [monto, setMonto] = useState(sugerido ? String(sugerido) : '');
  const [metodo, setMetodo] = useState('yape');
  const [enviando, setEnviando] = useState(false);

  if (reserva.estado === 'cobrada' || reserva.estado === 'no_vino') return null;

  async function validar() {
    const n = Number(monto.replace(',', '.'));
    if (!(n > 0)) {
      avisar('Escribe el monto que recibiste.', 'error');
      return;
    }
    if (n > falta) {
      avisar(`Le faltan ${soles(falta)}: no se puede registrar más que eso.`, 'error');
      return;
    }
    setEnviando(true);
    const { data, error } = await supabase().rpc('cancha_validar_pago', {
      p_company: companyId, p_appointment: reserva.id, p_monto: n, p_metodo: metodo,
    });
    setEnviando(false);
    if (error) {
      // Sin la 0017 la función no existe: se dice qué falta, no un error técnico.
      avisar(/cancha_validar_pago/.test(error.message) ? 'Falta aplicar la actualización 0017 en la base de datos.' : error.message, 'error');
      return;
    }
    avisar(String((data as { detalle?: string } | null)?.detalle ?? 'Pago validado.'), 'ok');
    alValidar();
  }

  return (
    <div className="tc-validar">
      <b>Validar pago</b>
      <small>
        {reserva.estado === 'esperando_pago' && adelanto > 0
          ? `Con ${soles(Math.min(adelanto, reserva.total))} se confirma. Falta ${soles(falta)} en total.`
          : `Falta ${soles(falta)}.`}
      </small>
      <div className="tc-revisar__campos">
        <label>Monto recibido (S/)
          <input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </label>
        <label>Método
          <select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            <option value="yape">Yape</option>
            <option value="plin">Plin</option>
            <option value="cash">Efectivo</option>
            <option value="bank_transfer">Transferencia</option>
          </select>
        </label>
      </div>
      <button type="button" className="tc__accion" disabled={enviando} onClick={() => void validar()}>
        <Check size={17} aria-hidden="true" /> {enviando ? 'Validando…' : 'Validar pago'}
      </button>
    </div>
  );
}
