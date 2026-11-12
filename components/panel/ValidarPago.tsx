'use client';

/**
 * «Validar pago» desde el tablero de canchas: el dueño o el administrador vio el Yape (en su app,
 * en el celular del cliente, en efectivo) y lo apunta aquí. Postgres hace lo mismo que con un
 * comprobante validado: exige el adelanto para confirmar una apartada y comprueba que ESA cancha
 * siga libre. «Adelanto» y «Completo» con un toque, y un «¿Seguro?» antes de registrar nada.
 *
 * Foto del pago: según «Comprobante al cobrar» (Configuración › Negocio, datos 0010) no sale,
 * es opcional u obligatoria para Yape, Plin y transferencia. Se lee con las mismas reglas que la
 * página, rellena monto y método, y queda guardada con el pago. La misma foto o la misma
 * operación no se registran dos veces.
 */
import { useState } from 'react';
import { Check } from 'lucide-react';
import Confirmar from '@/components/panel/Confirmar';
import ElegirMonto, { METODOS_TODOS } from '@/components/panel/ElegirMonto';
import FotoDelPago from '@/components/panel/FotoDelPago';
import { useAvisar } from '@/components/panel/Avisos';
import { useSesion } from '@/components/panel/Sesion';
import { supabase } from '@/lib/supabase/client';
import { efectoDelPago, faltaDe, fechaCorta, leerMonto, minimoParaConfirmar, NOMBRE_METODO, soles, type Cobro } from '@/lib/panel/cobro-cancha';
import { exigeFoto, ofreceFoto, type FotoPago } from '@/lib/panel/fotoPago';
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
  const { cobroFoto } = useSesion();
  const cobro: Cobro = { total: reserva.total, pagado: reserva.pagado, adelanto, apartada: reserva.estado === 'esperando_pago' };
  const falta = faltaDe(cobro);
  const minimo = minimoParaConfirmar(cobro);
  const [monto, setMonto] = useState(String(minimo || falta || ''));
  const [metodo, setMetodo] = useState('yape');
  const [foto, setFoto] = useState<FotoPago | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [pregunta, setPregunta] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (reserva.estado === 'cobrada' || reserva.estado === 'no_vino' || falta <= 0) return null;

  const conFoto = ofreceFoto(cobroFoto);
  const sinFotoNoVale = exigeFoto(cobroFoto, metodo) && !foto;

  function alFoto(f: FotoPago | null) {
    setFoto(f);
    if (!f) return;
    if (f.monto !== null && f.monto > 0) setMonto(String(Math.min(f.monto, falta)));
    if (f.metodo === 'yape' || f.metodo === 'plin') setMetodo(f.metodo);
  }

  function preguntar() {
    if (sinFotoNoVale) {
      avisar(`Este negocio pide la foto del comprobante para cobrar por ${NOMBRE_METODO[metodo] ?? metodo}.`, 'error');
      return;
    }
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
    const base = { p_company: companyId, p_appointment: reserva.id, p_monto: pregunta, p_metodo: metodo };
    let { data, error } = await supabase().rpc('cancha_validar_pago', foto ? { ...base, p_url: foto.url, p_hash: foto.hash, p_op: foto.operacion } : base);
    let sinFoto = false;
    // Sin la 0018 la función aún no acepta la foto: el pago se registra igual y se dice.
    if (error && foto && /p_url|PGRST202|function/i.test(`${error.code ?? ''} ${error.message}`)) {
      ({ data, error } = await supabase().rpc('cancha_validar_pago', base));
      sinFoto = !error;
    }
    setEnviando(false);
    if (error) {
      // Sin la 0017 la función no existe: se dice qué falta, no un error técnico.
      avisar(/cancha_validar_pago/.test(error.message) ? 'Falta aplicar la actualización 0017 en la base de datos.' : error.message, 'error');
      return;
    }
    setPregunta(null);
    const detalle = String((data as { detalle?: string } | null)?.detalle ?? 'Pago validado.');
    avisar(sinFoto ? `${detalle} La foto no se guardó: falta correr la actualización 0018.` : detalle, 'ok');
    alValidar();
  }

  return (
    <div className="tc-validar">
      <b>Validar pago</b>
      <small>{minimo > 0 ? `Con ${soles(minimo)} se confirma. Falta ${soles(falta)} en total.` : `Falta ${soles(falta)}.`}</small>

      {conFoto && (
        <FotoDelPago companyId={companyId} foto={foto} obligatoria={exigeFoto(cobroFoto, metodo)} alFoto={alFoto} alLeyendo={setLeyendo} />
      )}

      <ElegirMonto cobro={cobro} monto={monto} metodo={metodo} metodos={METODOS_TODOS} etiquetaMonto="Monto recibido (S/)" alMonto={setMonto} alMetodo={setMetodo} />
      <button type="button" className="tc__accion" disabled={leyendo} onClick={preguntar}>
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
            <p>Se registra <b>{soles(pregunta)}</b> por <b>{NOMBRE_METODO[metodo] ?? metodo}</b>{foto?.operacion ? <>, operación <b>{foto.operacion}</b></> : null}{foto ? ', con la foto del pago' : ''}.</p>
            <p>{efectoDelPago(cobro, pregunta)}</p>
            {foto && foto.decision !== 'aprobar' && foto.motivo && <p className="tc-aviso-rojo">Ojo: {foto.motivo}</p>}
            {metodo !== 'cash' && <p className="muted">Antes de validar, comprueba en tu app que el dinero llegó.</p>}
          </>}
        />
      )}
    </div>
  );
}
