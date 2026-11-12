'use client';

/**
 * «Cobrada» → ¿con qué? Un botón que, al pulsarlo, se abre en los métodos de
 * pago en el mismo sitio. El método es lo que desglosa la caja del día: un
 * cobro sin método entra como «sin método» y la caja no cuadra con lo que hay
 * en el cajón y en el Yape.
 *
 * Con «Comprobante al cobrar» encendido (Configuración › Negocio, datos 0010),
 * Yape, Plin y transferencia pasan por un paso más: la foto del pago, opcional
 * u obligatoria según el negocio. El efectivo sigue siendo un toque.
 *
 * Lo usan la Agenda («Ya pasaron») y la Caja («Por cobrar»).
 */
import { useState } from 'react';
import { Check, Wallet, X } from 'lucide-react';
import FotoDelPago from '@/components/panel/FotoDelPago';
import { useSesion } from '@/components/panel/Sesion';
import { METODO_LABEL, METODOS_CITA, type MetodoPago } from '@/lib/panel/metodosPago';
import { exigeFoto, fotoParaMetodo, type FotoPago } from '@/lib/panel/fotoPago';

export function BotonCobrar({
  ocupado,
  alCobrar,
  metodos = METODOS_CITA,
}: {
  ocupado?: boolean;
  /** `foto` solo llega si se adjuntó una: se manda con el cobro y Postgres la revisa. */
  alCobrar: (metodo: MetodoPago, foto?: FotoPago) => void;
  metodos?: MetodoPago[];
}) {
  const { companyId, cobroFoto } = useSesion();
  const [eligiendo, setEligiendo] = useState(false);
  /** El método elegido que espera su foto. */
  const [conFoto, setConFoto] = useState<MetodoPago | null>(null);
  const [foto, setFoto] = useState<FotoPago | null>(null);
  const [leyendo, setLeyendo] = useState(false);

  function cerrar() {
    setEligiendo(false);
    setConFoto(null);
    setFoto(null);
  }

  if (conFoto && companyId) {
    const obligatoria = exigeFoto(cobroFoto, conFoto);
    return (
      <div className="fp-cobrar" role="group" aria-label={`Cobrar con ${METODO_LABEL[conFoto]}`}>
        <span className="fp-cobrar__titulo">Cobrada con {METODO_LABEL[conFoto]}</span>
        <FotoDelPago companyId={companyId} foto={foto} obligatoria={obligatoria} alFoto={setFoto} alLeyendo={setLeyendo} />
        {foto && foto.decision !== 'aprobar' && foto.motivo && <p className="fp-aviso">Ojo: {foto.motivo}</p>}
        <button
          className="btn btn-primary btn-sm"
          disabled={ocupado || leyendo || (obligatoria && !foto)}
          title={obligatoria && !foto ? 'Este negocio pide la foto del comprobante' : undefined}
          onClick={() => {
            const m = conFoto;
            const f = foto ?? undefined;
            cerrar();
            alCobrar(m, f);
          }}
        >
          <Check size={14} /> {foto ? 'Registrar con foto' : obligatoria ? 'Falta la foto' : 'Registrar sin foto'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={cerrar} aria-label="Cancelar">
          <X size={14} />
        </button>
      </div>
    );
  }

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
            if (fotoParaMetodo(cobroFoto, m)) setConFoto(m);
            else alCobrar(m);
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
