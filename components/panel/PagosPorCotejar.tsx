'use client';

/**
 * Los pagos que la IA dio por buenos en la página y el dueño todavía no miró en su app (sql/0032).
 *
 * Por qué existe: una captura NUNCA prueba que el dinero llegó. Hay apps que fabrican comprobantes
 * de Yape y Plin, y la IA solo puede descartar los burdos. La validación automática le confirma al
 * cliente al momento (para que el flujo no se quede colgado) y aquí el dueño cierra el círculo: abre
 * Yape, busca el monto, la hora y el código de seguridad, y toca «Llegó» o «No llegó».
 *
 * «No llegó» quita el pago de la Caja, cancela la cita si se queda sin adelanto y deja marcado ese
 * celular: sus próximas capturas van siempre a revisión. Antes de hacerlo, un «¿Seguro?».
 */
import { useState } from 'react';
import { Check, ChevronDown, ExternalLink, X } from 'lucide-react';
import AvisarCliente from '@/components/panel/AvisarCliente';
import Confirmar from '@/components/panel/Confirmar';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { supabase } from '@/lib/supabase/client';
import { hora12 } from '@/lib/panel/format';
import { fechaCorta, NOMBRE_METODO, soles } from '@/lib/panel/cobro-cancha';
import './tablero-canchas.css';

export interface PorCotejar {
  id: string;
  cliente: string;
  telefono: string;
  servicio: string;
  slot: string;
  estado_cita: string;
  monto: number | null;
  metodo: string;
  operacion: string;
  codigo_seguridad: string;
  /** ISO con -05:00, como lo leyó la IA. */
  fecha_pago: string;
  url: string;
  creado: string;
}

/** «hoy 3:04 pm» / «16 nov 3:04 pm»: lo que el dueño busca en su lista de movimientos. */
export function cuandoPago(iso: string, hoy: string = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10)): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(iso ?? '');
  if (!m) return '';
  const dia = `${m[1]}-${m[2]}-${m[3]}` === hoy ? 'hoy' : `${Number(m[3])}/${Number(m[2])}`;
  return `${dia} ${hora12(m[4])}`;
}

export function PagosPorCotejarVista({ datos, alCotejar }: {
  datos: PorCotejar[];
  /** Devuelve true si se aplicó. */
  alCotejar: (p: PorCotejar, llego: boolean) => Promise<boolean>;
}) {
  const [abierta, setAbierta] = useState(false);
  const [pregunta, setPregunta] = useState<PorCotejar | null>(null);
  const [ocupado, setOcupado] = useState<string>('');

  if (!datos.length) return null;

  async function marcar(p: PorCotejar, llego: boolean) {
    setOcupado(p.id);
    const ok = await alCotejar(p, llego);
    setOcupado('');
    if (ok) setPregunta(null);
  }

  return (
    <section className="tc-revisar tc-cotejar" aria-label="Pagos por cotejar en tu app">
      <button type="button" className="tc-revisar__cab" aria-expanded={abierta} onClick={() => setAbierta((a) => !a)}>
        <span>
          <b className="tc-revisar__titulo">{datos.length === 1 ? '1 pago validado por cotejar' : `${datos.length} pagos validados por cotejar`}</b>
          <small className="tc-cotejar__sub">Se confirmaron solos. Mira en tu Yape o Plin que llegaron.</small>
        </span>
        <span className="tc-revisar__plegar">
          {abierta ? 'Minimizar' : 'Ver'}
          <ChevronDown size={16} aria-hidden="true" style={{ transform: abierta ? 'rotate(180deg)' : undefined }} />
        </span>
      </button>
      {abierta && datos.map((p) => (
        <article key={p.id} className="tc-revisar__item">
          {p.url && <a className="tc-revisar__foto" href={p.url} target="_blank" rel="noopener" aria-label={`Abrir el comprobante de ${p.cliente}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" loading="lazy" /><ExternalLink size={14} aria-hidden="true" />
          </a>}
          <div className="tc-revisar__datos">
            <b>{p.cliente}</b>
            <span className="tc-cotejar__busca">
              {p.monto !== null && <b>{soles(Number(p.monto))}</b>}
              {NOMBRE_METODO[p.metodo] ? ` por ${NOMBRE_METODO[p.metodo]}` : ''}
              {cuandoPago(p.fecha_pago) ? ` · ${cuandoPago(p.fecha_pago)}` : ''}
            </span>
            {p.codigo_seguridad && <small className="tc-op">Código de seguridad {p.codigo_seguridad}</small>}
            {p.operacion && <small className="tc-op">N.º de operación {p.operacion}</small>}
            <small>{p.servicio} · {fechaCorta(p.slot)}{p.estado_cita === 'cancelled' ? ' · cancelada' : ''}</small>
          </div>
          <div className="tc-revisar__acciones">
            <div className="tc-revisar__botones">
              <button type="button" className="tc__accion" disabled={ocupado === p.id} onClick={() => void marcar(p, true)}>
                <Check size={16} aria-hidden="true" /> Llegó
              </button>
              <button type="button" className="tc__accion tc__accion--suave" disabled={ocupado === p.id} onClick={() => setPregunta(p)}>
                <X size={16} aria-hidden="true" /> No llegó
              </button>
            </div>
          </div>
        </article>
      ))}

      {pregunta && (
        <Confirmar
          titulo="¿El pago no llegó a tu app?"
          textoConfirmar="Sí, no llegó"
          peligro
          ocupado={ocupado === pregunta.id}
          alCerrar={() => { if (!ocupado) setPregunta(null); }}
          alConfirmar={() => void marcar(pregunta, false)}
          detalle={<>
            <p><b>{pregunta.cliente}</b> · {pregunta.monto !== null ? soles(Number(pregunta.monto)) : 'sin monto'} · {pregunta.servicio} · {fechaCorta(pregunta.slot)}</p>
            <p>Busca bien antes: el monto{pregunta.codigo_seguridad ? <>, el código de seguridad <b>{pregunta.codigo_seguridad}</b></> : null} y la hora en tus movimientos de Yape o Plin.</p>
            <p>Si confirmas: el pago sale de la Caja, la reserva se cancela si se queda sin adelanto y las próximas capturas de este celular las revisarás tú.</p>
            <p className="muted">Después te doy el mensaje para escribirle por WhatsApp.</p>
          </>}
        />
      )}
    </section>
  );
}

export default function PagosPorCotejar({ companyId, recarga, alCambiar }: { companyId: string; recarga: unknown; alCambiar: () => void }) {
  const avisar = useAvisar();
  const [aviso, setAviso] = useState<{ titulo: string; mensaje: string; waLink: string; nota?: string } | null>(null);

  // Sin la 0032 la función no existe: no sale nada.
  const { datos, recargar } = useCargar(async () => {
    const { data, error } = await supabase().rpc('comprobantes_por_cotejar', { p_company: companyId });
    return error ? [] : ((data ?? []) as PorCotejar[]);
  }, [companyId, recarga]);

  async function cotejar(p: PorCotejar, llego: boolean): Promise<boolean> {
    const { data, error } = await supabase().rpc('comprobante_cotejar', { p_company: companyId, p_id: p.id, p_llego: llego });
    if (error) {
      avisar(error.message, 'error');
      return false;
    }
    const r = (data ?? {}) as { detalle?: string; mensaje?: string; wa_link?: string; cancelada?: boolean };
    avisar(r.detalle ?? 'Listo.', 'ok');
    if (!llego && r.mensaje) {
      setAviso({ titulo: `${p.cliente}: el pago no llegó`, mensaje: r.mensaje, waLink: r.wa_link ?? '', nota: r.cancelada ? 'La hora quedó libre otra vez.' : undefined });
    }
    recargar();
    if (!llego) alCambiar();
    return true;
  }

  return (
    <>
      {aviso && <AvisarCliente {...aviso} alCerrar={() => setAviso(null)} />}
      <PagosPorCotejarVista datos={datos ?? []} alCotejar={cotejar} />
    </>
  );
}
