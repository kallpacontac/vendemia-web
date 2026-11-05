'use client';

/**
 * Los comprobantes subidos en la página que tiene que mirar una persona. Sale encima del tablero
 * de canchas solo si hay alguno. Aprobar registra el pago y confirma la reserva, con la misma
 * comprobación de la cancha que la validación automática. Antes de aplicar nada, un «¿Seguro?»
 * dice quién, cuánto y qué le pasará a la reserva.
 */
import { useState } from 'react';
import { Check, ExternalLink, X } from 'lucide-react';
import Confirmar from '@/components/panel/Confirmar';
import ElegirMonto, { METODOS_COMPROBANTE } from '@/components/panel/ElegirMonto';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { supabase } from '@/lib/supabase/client';
import { efectoDelPago, fechaCorta, leerMonto, NOMBRE_METODO, soles, type Cobro } from '@/lib/panel/cobro-cancha';

export interface PorRevisar {
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
  /** Leído de la captura. Sin la 0018, no viene. */
  operacion?: string;
}

type Accion = 'aprobar' | 'rechazar';

/** La que pinta: sin red, para poder verla y probarla con datos de mentira. */
export function ComprobantesPorRevisarVista({ datos, adelanto, alRevisar }: {
  datos: PorRevisar[];
  adelanto: number;
  /** Devuelve true si se aplicó. */
  alRevisar: (c: PorRevisar, accion: Accion, monto: number | null, metodo: string) => Promise<boolean>;
}) {
  const avisar = useAvisar();
  const [montos, setMontos] = useState<Record<string, string>>({});
  const [metodos, setMetodos] = useState<Record<string, string>>({});
  const [pregunta, setPregunta] = useState<{ c: PorRevisar; accion: Accion; monto: number | null; metodo: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  if (!datos.length) return null;

  const cobroDe = (c: PorRevisar): Cobro => {
    const total = Number(c.total) || 0;
    const pagado = Number(c.pagado) || 0;
    // Apartada mientras lo pagado no llegue al adelanto: la lista no trae el estado de la cita.
    return { total, pagado, adelanto, apartada: adelanto > 0 && pagado < Math.min(adelanto, total) };
  };
  const montoDe = (c: PorRevisar) => montos[c.id] ?? (c.monto === null ? '' : String(c.monto));
  const metodoDe = (c: PorRevisar) => metodos[c.id] ?? (METODOS_COMPROBANTE.includes(c.metodo) ? c.metodo : 'yape');

  function preguntar(c: PorRevisar, accion: Accion) {
    if (accion === 'rechazar') {
      setPregunta({ c, accion, monto: null, metodo: metodoDe(c) });
      return;
    }
    const r = leerMonto(montoDe(c), cobroDe(c));
    if ('error' in r) {
      avisar(r.error, 'error');
      return;
    }
    setPregunta({ c, accion, monto: r.monto, metodo: metodoDe(c) });
  }

  async function aplicar() {
    if (!pregunta) return;
    setOcupado(true);
    const ok = await alRevisar(pregunta.c, pregunta.accion, pregunta.monto, pregunta.metodo);
    setOcupado(false);
    if (ok) setPregunta(null);
  }

  const cerrar = () => { if (!ocupado) setPregunta(null); };

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
            <small>{c.servicio} · {fechaCorta(c.slot)}</small>
            <small>{c.telefono}</small>
            <small>Total {soles(Number(c.total) || 0)} · ya pagó {soles(Number(c.pagado) || 0)}</small>
            {c.operacion && <small className="tc-op">N.º de operación {c.operacion}</small>}
            {c.motivo && <small className="tc-revisar__motivo">{c.motivo}</small>}
          </div>
          <div className="tc-revisar__acciones">
            <ElegirMonto cobro={cobroDe(c)} monto={montoDe(c)} metodo={metodoDe(c)} metodos={METODOS_COMPROBANTE}
              alMonto={(v) => setMontos((m) => ({ ...m, [c.id]: v }))} alMetodo={(v) => setMetodos((m) => ({ ...m, [c.id]: v }))} />
            <div className="tc-revisar__botones">
              <button type="button" className="tc__accion" onClick={() => preguntar(c, 'aprobar')}><Check size={16} aria-hidden="true" /> Aprobar pago</button>
              <button type="button" className="tc__accion tc__accion--suave" onClick={() => preguntar(c, 'rechazar')}><X size={16} aria-hidden="true" /> Rechazar</button>
            </div>
          </div>
        </article>
      ))}

      {pregunta && pregunta.accion === 'aprobar' && (
        <Confirmar
          titulo="¿Aprobar este pago?"
          textoConfirmar={`Sí, registrar ${soles(pregunta.monto ?? 0)}`}
          ocupado={ocupado}
          alCerrar={cerrar}
          alConfirmar={() => void aplicar()}
          detalle={<>
            <p><b>{pregunta.c.cliente}</b> · {pregunta.c.servicio} · {fechaCorta(pregunta.c.slot)}</p>
            <p>Se registra <b>{soles(pregunta.monto ?? 0)}</b> por <b>{NOMBRE_METODO[pregunta.metodo] ?? pregunta.metodo}</b>{pregunta.c.operacion ? <>, operación <b>{pregunta.c.operacion}</b></> : null}.</p>
            <p>{efectoDelPago(cobroDe(pregunta.c), pregunta.monto ?? 0)}</p>
            <p className="muted">Antes de aprobar, comprueba en tu app de Yape o Plin que el dinero llegó.</p>
          </>}
        />
      )}
      {pregunta && pregunta.accion === 'rechazar' && (
        <Confirmar
          titulo="¿Rechazar este comprobante?"
          textoConfirmar="Sí, rechazar"
          peligro
          ocupado={ocupado}
          alCerrar={cerrar}
          alConfirmar={() => void aplicar()}
          detalle={<>
            <p><b>{pregunta.c.cliente}</b> · {pregunta.c.servicio} · {fechaCorta(pregunta.c.slot)}</p>
            <p>No se registra ningún pago. La cancha sigue apartada hasta que venza su plazo.</p>
            <p className="muted">El cliente no recibe aviso automático: escríbele para que suba otra captura.</p>
          </>}
        />
      )}
    </section>
  );
}

export default function ComprobantesPorRevisar({ companyId, recarga, alCambiar }: { companyId: string; recarga: unknown; alCambiar: () => void }) {
  const avisar = useAvisar();

  // Sin la 0017 la función no existe: la pantalla sigue sin esta tarjeta.
  const { datos, recargar } = useCargar(async () => {
    const [lista, pagina] = await Promise.all([
      supabase().rpc('comprobantes_panel', { p_company: companyId }),
      supabase().from('tu_pagina').select('secciones').eq('company_id', companyId).maybeSingle(),
    ]);
    const adelanto = Number((pagina.data as { secciones?: { canchas?: { adelanto?: number } } } | null)?.secciones?.canchas?.adelanto) || 0;
    return { lista: lista.error ? [] : ((lista.data ?? []) as PorRevisar[]), adelanto };
  }, [companyId, recarga]);

  if (!datos?.lista.length) return null;

  async function revisar(c: PorRevisar, accion: Accion, monto: number | null, metodo: string): Promise<boolean> {
    const { data, error } = await supabase().rpc('comprobante_revisar', {
      p_company: companyId, p_id: c.id, p_accion: accion, p_monto: accion === 'aprobar' ? monto : null, p_metodo: metodo,
    });
    if (error) {
      avisar(error.message, 'error');
      return false;
    }
    avisar(accion === 'rechazar' ? 'Comprobante rechazado. Avísale al cliente por WhatsApp.' : String((data as { detalle?: string } | null)?.detalle ?? 'Pago registrado.'), 'ok');
    recargar();
    alCambiar();
    return true;
  }

  return <ComprobantesPorRevisarVista datos={datos.lista} adelanto={datos.adelanto} alRevisar={revisar} />;
}
