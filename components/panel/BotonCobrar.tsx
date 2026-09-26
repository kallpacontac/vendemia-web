'use client';

/**
 * «Cobrada» → ¿con qué? Un botón que, al pulsarlo, se abre en los métodos de
 * pago en el mismo sitio. El método es lo que desglosa la caja del día: un
 * cobro sin método entra como «sin método» y la caja no cuadra con lo que hay
 * en el cajón y en el Yape.
 *
 * Lo usan la Agenda («Ya pasaron») y la Caja («Por cobrar»).
 */
import { useState } from 'react';
import { Wallet, X } from 'lucide-react';
import { METODO_LABEL, METODOS_CITA, type MetodoPago } from '@/lib/panel/metodosPago';

export function BotonCobrar({
  ocupado,
  alCobrar,
  metodos = METODOS_CITA,
}: {
  ocupado?: boolean;
  alCobrar: (metodo: MetodoPago) => void;
  metodos?: MetodoPago[];
}) {
  const [eligiendo, setEligiendo] = useState(false);

  if (!eligiendo) {
    return (
      <button className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => setEligiendo(true)}>
        <Wallet size={14} /> Cobrada
      </button>
    );
  }
  return (
    <span className="elegir-metodo" role="group" aria-label="¿Con qué se pagó?">
      {metodos.map((m) => (
        <button
          key={m}
          className="btn btn-primary btn-sm"
          disabled={ocupado}
          onClick={() => {
            setEligiendo(false);
            alCobrar(m);
          }}
        >
          {METODO_LABEL[m]}
        </button>
      ))}
      <button className="btn btn-ghost btn-sm" onClick={() => setEligiendo(false)} aria-label="Cancelar">
        <X size={14} />
      </button>
    </span>
  );
}
