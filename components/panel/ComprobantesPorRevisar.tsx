'use client';

/**
 * Los comprobantes subidos en la página que tiene que mirar una persona. Sale encima del tablero
 * de canchas, o arriba de la Agenda en un negocio de citas con adelanto (sql/0021), solo si hay alguno. Aprobar registra el pago y confirma la reserva, con la misma
 * comprobación de la cancha que la validación automática. Antes de aplicar nada, un «¿Seguro?»
 * dice quién, cuánto y qué le pasará a la reserva.
 */
import { useState } from 'react';
import { Check, ChevronDown, ExternalLink, X } from 'lucide-react';
import AvisarCliente from '@/components/panel/AvisarCliente';
import PagosPorCotejar from '@/components/panel/PagosPorCotejar';
import Confirmar from '@/components/panel/Confirmar';
import './tablero-canchas.css';
import ElegirMonto, { METODOS_COMPROBANTE } from '@/components/panel/ElegirMonto';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { supabase } from '@/lib/supabase/client';
import { efectoDelPago, faltaDe, fechaCorta, leerMonto, NOMBRE_METODO, soles, tipoDePago, type Cobro } from '@/lib/panel/cobro-cancha';

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
  /** Yape: los 3 dígitos que salen también en tu notificación. Sin la 0032, no viene. */
  codigo_seguridad?: string;
  /** Lo que confirma ESTA reserva (fijo en canchas, % del precio en citas). Sin la 0021, no viene. */
  adelanto?: number;
  /** Sigue sin confirmar. Sin la 0021, no viene: se deduce de lo pagado. */
  apartada?: boolean;
}

export type Accion = 'aprobar' | 'rechazar';

/** El mensaje para el cliente tras revisar su pago (AvisarCliente): nadie le escribe solo. */
export interface AvisoPago { titulo: string; mensaje: string; waLink: string; nota?: string }

/** wa.me del cliente: 9 dígitos que empiezan por 9 → con el 51 de Perú. Sin número, sin enlace. */
export function waDe(telefono: string, texto: string): string {
  const d = (telefono ?? '').replace(/\D/g, '');
  if (d.length < 8) return '';
  const n = /^9\d{8}$/.test(d) ? `51${d}` : d;
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
}

/** Lo que se le dice al cliente según lo que se aprobó (adelanto, todo, lo que faltaba o una parte). */
export function avisoDelPago(c: PorRevisar, cobro: Cobro, accion: Accion, monto: number, enDonde: string): AvisoPago {
  const nombre = (c.cliente ?? '').trim().split(/\s+/)[0];
  const hola = `Hola${nombre && !/^\d/.test(nombre) ? ` ${nombre}` : ''}!`;
  const cuando = fechaCorta(c.slot).replace(' · ', ' a las ');
  const cita = `tu cita de ${c.servicio} del ${cuando}`;
  if (accion === 'rechazar') {
    const mensaje = `${hola} No pudimos validar la captura de tu pago para ${cita}. ¿Nos envías otra captura o el número de operación? Así te la dejamos confirmada.`;
    return { titulo: `${c.cliente}: comprobante rechazado`, mensaje, waLink: waDe(c.telefono, mensaje) };
  }
  const queda = Math.max(faltaDe(cobro) - monto, 0);
  const tipo = tipoDePago(cobro, monto);
  const mensaje = queda <= 0.005
    ? `${hola} Recibimos tu pago de ${soles(monto)}. ${cita[0].toUpperCase()}${cita.slice(1)} está confirmada y pagada: no pagas nada ${enDonde}. ¡Te esperamos!`
    : tipo === 'adelanto'
      ? `${hola} Recibimos tu adelanto de ${soles(monto)}. ${cita[0].toUpperCase()}${cita.slice(1)} está confirmada. El resto, ${soles(queda)}, lo pagas ${enDonde}. ¡Te esperamos!`
      : `${hola} Recibimos ${soles(monto)} a cuenta de ${cita}. Te faltan ${soles(queda)}.`;
  return {
    titulo: `${c.cliente}: pago aprobado`,
    mensaje,
    waLink: waDe(c.telefono, mensaje),
    nota: queda > 0.005 ? `Le faltan ${soles(queda)} por pagar ${enDonde}.` : 'Ya está pagada completa.',
  };
}

/** El cliente puede pagar el adelanto o todo: el «¿Seguro?» lo dice en grande. */
const TITULO_APROBAR = {
  completo: '¿Aprobar el pago completo?',
  resto: '¿Aprobar lo que faltaba?',
  adelanto: '¿Aprobar el adelanto?',
  parcial: '¿Aprobar un pago parcial?',
} as const;
const ETIQUETA_PAGO = { completo: 'Pago completo', resto: 'Lo que faltaba', adelanto: 'Adelanto', parcial: 'Pago parcial' } as const;

/** La que pinta: sin red, para poder verla y probarla con datos de mentira. */
export function ComprobantesPorRevisarVista({ datos, adelanto, alRevisar, alAvisar, enDonde = 'en la cancha', abiertaDeEntrada = false }: {
  datos: PorRevisar[];
  /** La ficha de una reserva la enseña abierta: es lo que se viene a hacer. */
  abiertaDeEntrada?: boolean;
  adelanto: number;
  /** Dónde se cobra el resto: «en la cancha» o «en el local». */
  enDonde?: string;
  /** Devuelve true si se aplicó. */
  alRevisar: (c: PorRevisar, accion: Accion, monto: number | null, metodo: string) => Promise<boolean>;
  /** Tras aprobar o rechazar: el mensaje para el cliente con su enlace de WhatsApp. */
  alAvisar?: (a: AvisoPago) => void;
}) {
  const avisar = useAvisar();
  const [montos, setMontos] = useState<Record<string, string>>({});
  const [metodos, setMetodos] = useState<Record<string, string>>({});
  const [pregunta, setPregunta] = useState<{ c: PorRevisar; accion: Accion; monto: number | null; metodo: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /** Minimizada de entrada (Alvaro, 17-nov): el título dice cuántos hay; «Ver» la abre. */
  const [abierta, setAbierta] = useState(abiertaDeEntrada);

  if (!datos.length) return null;

  const cobroDe = (c: PorRevisar): Cobro => {
    const total = Number(c.total) || 0;
    const pagado = Number(c.pagado) || 0;
    const suyo = c.adelanto === undefined || c.adelanto === null ? adelanto : Number(c.adelanto) || 0;
    // Sin la 0021 la lista no trae el estado: apartada mientras lo pagado no llegue al adelanto.
    return { total, pagado, adelanto: suyo, apartada: typeof c.apartada === 'boolean' ? c.apartada : suyo > 0 && pagado < Math.min(suyo, total) };
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
    // El cobro de ANTES de aplicar: es el que dice si fue adelanto, todo o una parte.
    const aviso = avisoDelPago(pregunta.c, cobroDe(pregunta.c), pregunta.accion, pregunta.monto ?? 0, enDonde);
    const ok = await alRevisar(pregunta.c, pregunta.accion, pregunta.monto, pregunta.metodo);
    setOcupado(false);
    if (ok) {
      setPregunta(null);
      alAvisar?.(aviso);
    }
  }

  const cerrar = () => { if (!ocupado) setPregunta(null); };

  return (
    <section className="tc-revisar" aria-label="Comprobantes por revisar">
      <button type="button" className="tc-revisar__cab" aria-expanded={abierta} onClick={() => setAbierta((a) => !a)}>
        <b className="tc-revisar__titulo">{datos.length === 1 ? '1 pago web por validar' : `${datos.length} pagos web por validar`}</b>
        <span className="tc-revisar__plegar">
          {abierta ? 'Minimizar' : 'Ver'}
          <ChevronDown size={16} aria-hidden="true" style={{ transform: abierta ? 'rotate(180deg)' : undefined }} />
        </span>
      </button>
      {abierta && datos.map((c) => (
        <article key={c.id} className="tc-revisar__item">
          {c.url && <a className="tc-revisar__foto" href={c.url} target="_blank" rel="noopener" aria-label={`Abrir el comprobante de ${c.cliente}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.url} alt="" loading="lazy" /><ExternalLink size={14} aria-hidden="true" />
          </a>}
          <div className="tc-revisar__datos">
            <b>{c.cliente} <span className="tag-web" title="Reservó y pagó en tu página web">Web</span></b>
            <small>{c.servicio} · {fechaCorta(c.slot)}</small>
            <small>{c.telefono}</small>
            <small>Total {soles(Number(c.total) || 0)} · ya pagó {soles(Number(c.pagado) || 0)}</small>
            {c.operacion && <small className="tc-op">N.º de operación {c.operacion}</small>}
            {c.codigo_seguridad && <small className="tc-op">Código de seguridad {c.codigo_seguridad}</small>}
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
          titulo={TITULO_APROBAR[tipoDePago(cobroDe(pregunta.c), pregunta.monto ?? 0)]}
          textoConfirmar={`Sí, aprobar ${soles(pregunta.monto ?? 0)}`}
          ocupado={ocupado}
          alCerrar={cerrar}
          alConfirmar={() => void aplicar()}
          detalle={<>
            <p><b>{pregunta.c.cliente}</b> · {pregunta.c.servicio} · {fechaCorta(pregunta.c.slot)}</p>
            <p className={`tc-tipo-pago tc-tipo-pago--${tipoDePago(cobroDe(pregunta.c), pregunta.monto ?? 0)}`}>
              {ETIQUETA_PAGO[tipoDePago(cobroDe(pregunta.c), pregunta.monto ?? 0)]} · {soles(pregunta.monto ?? 0)} de {soles(Number(pregunta.c.total) || 0)}
            </p>
            <p>Se registra <b>{soles(pregunta.monto ?? 0)}</b> por <b>{NOMBRE_METODO[pregunta.metodo] ?? pregunta.metodo}</b>{pregunta.c.operacion ? <>, operación <b>{pregunta.c.operacion}</b></> : null}.</p>
            <p>{efectoDelPago(cobroDe(pregunta.c), pregunta.monto ?? 0, enDonde)}</p>
            <p className="muted">Antes de aprobar, comprueba en tu app de Yape o Plin que el dinero llegó{pregunta.c.codigo_seguridad ? <> (código de seguridad <b>{pregunta.c.codigo_seguridad}</b>)</> : null}. Una captura sola no lo prueba.</p>
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
            <p>No se registra ningún pago. La reserva sigue apartada hasta que venza su plazo.</p>
            <p className="muted">El cliente no recibe aviso automático: al rechazar te doy el mensaje para pedirle otra captura.</p>
          </>}
        />
      )}
    </section>
  );
}

/** Aprobar o rechazar un comprobante (sql/0017). También lo usa la ficha de una reserva (FichaReserva). */
export async function revisarComprobante(
  companyId: string, c: PorRevisar, accion: Accion, monto: number | null, metodo: string,
  avisar: (texto: string, tipo: 'ok' | 'error') => void,
): Promise<boolean> {
  const { data, error } = await supabase().rpc('comprobante_revisar', {
    p_company: companyId, p_id: c.id, p_accion: accion, p_monto: accion === 'aprobar' ? monto : null, p_metodo: metodo,
  });
  if (error) {
    avisar(error.message, 'error');
    return false;
  }
  avisar(accion === 'rechazar' ? 'Comprobante rechazado. Avísale al cliente por WhatsApp.' : String((data as { detalle?: string } | null)?.detalle ?? 'Pago registrado.'), 'ok');
  return true;
}

export default function ComprobantesPorRevisar({ companyId, recarga, alCambiar, enDonde }: { companyId: string; recarga: unknown; alCambiar: () => void; enDonde?: string }) {
  const avisar = useAvisar();
  /** El mensaje para el cliente del último pago revisado: se queda aunque la lista quede vacía. */
  const [aviso, setAviso] = useState<AvisoPago | null>(null);

  // Sin la 0017 la función no existe: la pantalla sigue sin esta tarjeta.
  const { datos, recargar } = useCargar(async () => {
    const [lista, pagina] = await Promise.all([
      supabase().rpc('comprobantes_panel', { p_company: companyId }),
      supabase().from('tu_pagina').select('secciones').eq('company_id', companyId).maybeSingle(),
    ]);
    const adelanto = Number((pagina.data as { secciones?: { canchas?: { adelanto?: number } } } | null)?.secciones?.canchas?.adelanto) || 0;
    return { lista: lista.error ? [] : ((lista.data ?? []) as PorRevisar[]), adelanto };
  }, [companyId, recarga]);

  const avisoCliente = aviso && <AvisarCliente {...aviso} alCerrar={() => setAviso(null)} />;
  // Debajo, los que se validaron solos y falta mirar en la app (sql/0032). Sale solo si hay alguno.
  const cotejar = <PagosPorCotejar companyId={companyId} recarga={recarga} alCambiar={alCambiar} />;
  if (!datos?.lista.length) return <>{avisoCliente}{cotejar}</>;

  async function revisar(c: PorRevisar, accion: Accion, monto: number | null, metodo: string): Promise<boolean> {
    const ok = await revisarComprobante(companyId, c, accion, monto, metodo, avisar);
    if (ok) {
      recargar();
      alCambiar();
    }
    return ok;
  }

  return (
    <>
      {avisoCliente}
      <ComprobantesPorRevisarVista datos={datos.lista} adelanto={datos.adelanto} alRevisar={revisar} alAvisar={setAviso} enDonde={enDonde} />
      {cotejar}
    </>
  );
}
