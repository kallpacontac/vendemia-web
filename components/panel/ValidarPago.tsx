'use client';

/**
 * «Validar pago» desde el tablero de canchas: el dueño o el administrador vio el Yape (en su app,
 * en el chat, en efectivo) y lo apunta aquí. Postgres hace lo mismo que con un comprobante
 * validado: exige el adelanto para confirmar una apartada y comprueba que ESA cancha siga libre.
 * «Adelanto» y «Completo» con un toque, y un «¿Seguro?» antes de registrar nada.
 */
import { useState } from 'react';
import { Check } from 'lucide-react';
import Confirmar from '@/components/panel/Confirmar';
import ElegirMonto, { METODOS_TODOS } from '@/components/panel/ElegirMonto';
import { useAvisar } from '@/components/panel/Avisos';
import { supabase } from '@/lib/supabase/client';
import { efectoDelPago, faltaDe, fechaCorta, leerMonto, minimoParaConfirmar, NOMBRE_METODO, soles, type Cobro } from '@/lib/panel/cobro-cancha';
import type { ReservaTablero } from '@/lib/panel/tablero-canchas';

export default function ValidarPago({ companyId, reserva, nombreCancha, adelanto, alValidar }: {
  companyId: string;
  reserva: ReservaTablero;
  /** reserva.cancha es el id del catálogo: el nombre lo pone quien la pinta. */
  nombreCancha?: string;
  /** El de Mi página. 0 = sin adelanto: cualquier pago confirma. */
  adelanto: number;
  alValidar: () => void;
}) {
  const avisar = useAvisar();
  const cobro: Cobro = { total: reserva.total, pagado: reserva.pagado, adelanto, apartada: reserva.estado === 'esperando_pago' };
  const falta = faltaDe(cobro);
  const minimo = minimoParaConfirmar(cobro);
  const [monto, setMonto] = useState(String(minimo || falta || ''));
  const [metodo, setMetodo] = useState('yape');
  const [pregunta, setPregunta] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (reserva.estado === 'cobrada' || reserva.estado === 'no_vino' || falta <= 0) return null;

  function preguntar() {
    const r = leerMonto(monto, cobro);
    if ('error' in r) {
      avisar(r.error, 'error');
      return;
    }
    setPregunta(r.monto);
  }

  async function validar() {
    if (pregunta === null) return;
    setEnviando(true);
    const { data, error } = await supabase().rpc('cancha_validar_pago', {
      p_company: companyId, p_appointment: reserva.id, p_monto: pregunta, p_metodo: metodo,
    });
    setEnviando(false);
    if (error) {
      // Sin la 0017 la función no existe: se dice qué falta, no un error técnico.
      avisar(/cancha_validar_pago/.test(error.message) ? 'Falta aplicar la actualización 0017 en la base de datos.' : error.message, 'error');
      return;
    }
    setPregunta(null);
    avisar(String((data as { detalle?: string } | null)?.detalle ?? 'Pago validado.'), 'ok');
    alValidar();
  }

  return (
    <div className="tc-validar">
      <b>Validar pago</b>
      <small>{minimo > 0 ? `Con ${soles(minimo)} se confirma. Falta ${soles(falta)} en total.` : `Falta ${soles(falta)}.`}</small>
      <ElegirMonto cobro={cobro} monto={monto} metodo={metodo} metodos={METODOS_TODOS} etiquetaMonto="Monto recibido (S/)" alMonto={setMonto} alMetodo={setMetodo} />
      <button type="button" className="tc__accion" onClick={preguntar}>
        <Check size={17} aria-hidden="true" /> Validar pago
      </button>

      {pregunta !== null && (
        <Confirmar
          titulo="¿Validar este pago?"
          textoConfirmar={`Sí, registrar ${soles(pregunta)}`}
          ocupado={enviando}
          alCerrar={() => { if (!enviando) setPregunta(null); }}
          alConfirmar={() => void validar()}
          detalle={<>
            <p><b>{reserva.cliente}</b> · {nombreCancha ?? 'Cancha'} · {fechaCorta(reserva.inicio)}</p>
            <p>Se registra <b>{soles(pregunta)}</b> por <b>{NOMBRE_METODO[metodo] ?? metodo}</b>.</p>
            <p>{efectoDelPago(cobro, pregunta)}</p>
            {metodo !== 'cash' && <p className="muted">Antes de validar, comprueba en tu app que el dinero llegó.</p>}
          </>}
        />
      )}
    </div>
  );
}
