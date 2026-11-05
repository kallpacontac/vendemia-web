'use client';

/**
 * «Validar pago» desde el tablero de canchas: el dueño o el administrador vio el Yape (en su app,
 * en el celular del cliente, en efectivo) y lo apunta aquí. Postgres hace lo mismo que con un
 * comprobante validado: exige el adelanto para confirmar una apartada y comprueba que ESA cancha
 * siga libre. «Adelanto» y «Completo» con un toque, y un «¿Seguro?» antes de registrar nada.
 *
 * Foto del pago (opcional): se lee con las mismas reglas que la página, rellena monto y método,
 * y queda guardada con el pago. La misma foto o la misma operación no se registran dos veces.
 */
import { useState } from 'react';
import { Camera, Check, X } from 'lucide-react';
import Confirmar from '@/components/panel/Confirmar';
import ElegirMonto, { METODOS_TODOS } from '@/components/panel/ElegirMonto';
import { useAvisar } from '@/components/panel/Avisos';
import { supabase } from '@/lib/supabase/client';
import { achicarImagen } from '@/lib/achicarImagen';
import { efectoDelPago, faltaDe, fechaCorta, leerMonto, minimoParaConfirmar, NOMBRE_METODO, soles, type Cobro } from '@/lib/panel/cobro-cancha';
import type { ReservaTablero } from '@/lib/panel/tablero-canchas';

interface Foto {
  url: string;
  hash: string;
  operacion: string;
  leida: boolean;
  decision: 'aprobar' | 'revisar' | 'rechazar';
  motivo: string;
  monto: number | null;
  metodo: string;
  destino: string;
}

/** Lo que se leyó de la foto, en una línea: «S/ 40 · Yape · a •••701 · op. 12345678». */
function leido(f: Foto): string {
  const partes = [
    f.monto !== null ? soles(f.monto) : '',
    NOMBRE_METODO[f.metodo] ?? '',
    f.destino ? `a •••${f.destino.replace(/\D/g, '').slice(-3)}` : '',
    f.operacion ? `op. ${f.operacion}` : '',
  ].filter(Boolean);
  return partes.length ? partes.join(' · ') : 'No se pudo leer nada';
}

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
  const [foto, setFoto] = useState<Foto | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [pregunta, setPregunta] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (reserva.estado === 'cobrada' || reserva.estado === 'no_vino' || falta <= 0) return null;

  async function subirFoto(archivo: File | undefined) {
    if (!archivo) return;
    if (!archivo.type.startsWith('image/')) {
      avisar('Elige una foto o captura (JPG, PNG o WEBP).', 'error');
      return;
    }
    setLeyendo(true);
    try {
      const { data } = await supabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        avisar('Tu sesión terminó. Vuelve a entrar al panel.', 'error');
        return;
      }
      const form = new FormData();
      form.append('companyId', companyId);
      form.append('archivo', await achicarImagen(archivo), 'pago.jpg');
      const r = await fetch('/api/canchas/evidencia', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
      const j = (await r.json().catch(() => null)) as (Foto & { status: string; mensaje?: string }) | null;
      if (!r.ok || !j || j.status !== 'ok') {
        avisar(j?.mensaje ?? 'No pudimos leer la foto. Inténtalo otra vez o escribe el monto a mano.', 'error');
        return;
      }
      setFoto(j);
      if (j.monto !== null && j.monto > 0) setMonto(String(Math.min(j.monto, falta)));
      if (j.metodo === 'yape' || j.metodo === 'plin') setMetodo(j.metodo);
    } catch {
      avisar('Sin conexión. Revisa tu internet e inténtalo otra vez.', 'error');
    } finally {
      setLeyendo(false);
    }
  }

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

      {foto ? (
        <div className={`tc-foto tc-foto--${foto.decision}`}>
          <a href={foto.url} target="_blank" rel="noopener" aria-label="Abrir la foto del pago">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={foto.url} alt="" />
          </a>
          <div>
            <b>{foto.leida ? `Leído: ${leido(foto)}` : 'Foto guardada'}</b>
            {foto.motivo && <small>{foto.motivo}</small>}
            {!foto.motivo && foto.decision === 'aprobar' && <small>Coincide con tu Yape o Plin y es de hace menos de 4 horas.</small>}
          </div>
          <button type="button" aria-label="Quitar la foto" onClick={() => setFoto(null)}><X size={16} aria-hidden="true" /></button>
        </div>
      ) : (
        <label className={`tc-foto__boton ${leyendo ? 'is-leyendo' : ''}`}>
          <Camera size={17} aria-hidden="true" />
          {leyendo ? 'Leyendo la foto…' : 'Foto del pago (opcional)'}
          <input type="file" accept="image/*" disabled={leyendo} onChange={(e) => { void subirFoto(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
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
