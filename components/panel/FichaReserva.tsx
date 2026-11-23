'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * FICHA DE UNA RESERVA · lo que abre el aviso «Nueva cita»
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Antes el aviso llevaba al chat con el cliente (23-nov-2026, Alvaro: «debería
 * llevarme a una ficha de reserva para validar pago y con botón para conversar
 * con el cliente y avisar al barbero, todo por WhatsApp»). Aquí, en una ventana
 * sobre la Agenda:
 *
 *   · Quién, qué, cuándo, con quién y en qué sede; el estado y lo pagado.
 *   · Validar el pago: si el cliente subió una captura, ella misma con «Aprobar
 *     pago» / «Rechazar» (comprobante_revisar); si no, «Validar pago» apunta lo
 *     que se vio en el Yape (registrar_pago, igual que la Agenda de canchas).
 *   · «Escribir al cliente» (WhatsApp) y «Ver la conversación» (el chat con Mia).
 *   · «Avisar a <barbero>» por WhatsApp, a SU celular (Equipo › ficha, datos
 *     0018). Sin importes ni el teléfono del cliente: lo mismo que el aviso al
 *     equipo (avisos 0004).
 *
 * Nada se manda solo: cada botón de WhatsApp abre el mensaje ya escrito y lo
 * envía una persona, como en AvisarCliente.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Check, MessageCircle, MessagesSquare, Scissors, Wallet, X } from 'lucide-react';
import AvisarCliente from '@/components/panel/AvisarCliente';
import {
  ComprobantesPorRevisarVista,
  revisarComprobante,
  waDe,
  type Accion,
  type AvisoPago,
  type PorRevisar,
} from '@/components/panel/ComprobantesPorRevisar';
import { RegistrarPago } from '@/components/panel/Saldos';
import { sedeCorta } from '@/components/panel/SelectorSede';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { useSesion } from '@/components/panel/Sesion';
import { supabase } from '@/lib/supabase/client';
import { fechaCorta } from '@/lib/panel/cobro-cancha';
import { quienDeCita } from '@/lib/panel/ficha';
import { ESTADO_CITA, soles } from '@/lib/panel/format';
import { cobroPorApuntar } from '@/lib/panel/metodosPago';
import { selloCita } from '@/lib/panel/adelantos';
import type { Saldo } from '@/lib/panel/saldo';
import type { Vocabulario } from '@/lib/panel/vocabulario';
import type { Cita, Trabajador } from '@/lib/supabase/queries';

const primerNombre = (s: string) => {
  const n = (s ?? '').trim().split(/\s+/)[0] ?? '';
  return /^\d/.test(n) ? '' : n;
};

export default function FichaReserva({
  companyId,
  cita,
  cliente,
  telefono,
  negocio,
  trabajadores,
  pago,
  v,
  enDonde = 'en el local',
  alCambiar,
  alCerrar,
}: {
  companyId: string;
  cita: Cita;
  /** El nombre del contacto (o su número si no dio nombre). */
  cliente: string;
  telefono: string;
  negocio: string;
  trabajadores: Trabajador[];
  /** Lo pagado de la cita (getPagosDeCitas). Sin pagos, undefined. */
  pago?: Saldo;
  v: Vocabulario;
  enDonde?: string;
  alCambiar: () => void;
  alCerrar: () => void;
}) {
  const avisar = useAvisar();
  const { rol } = useSesion();
  const [pagando, setPagando] = useState(false);
  const [avisoPago, setAvisoPago] = useState<AvisoPago | null>(null);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [alCerrar]);

  // La captura que subió el cliente para ESTA cita (sql/0017 + 0021), si hay alguna por revisar.
  // comprobantes_panel no trae el id de la cita: se reconoce por su hora y el celular del cliente.
  // Y el celular del barbero (datos 0018), que solo lee el dueño o el administrador.
  const puedeFicha = rol === 'dueno' || rol === 'admin';
  const { datos, recargar } = useCargar(async () => {
    const [lista, pagina, fichas] = await Promise.all([
      supabase().rpc('comprobantes_panel', { p_company: companyId }),
      supabase().from('tu_pagina').select('secciones').eq('company_id', companyId).maybeSingle(),
      puedeFicha ? supabase().rpc('empleado_fichas_leer', { p_company: companyId }) : Promise.resolve({ data: null, error: null }),
    ]);
    const adelanto = Number((pagina.data as { secciones?: { canchas?: { adelanto?: number } } } | null)?.secciones?.canchas?.adelanto) || 0;
    const slot = cita.slot_start.slice(0, 16);
    const tel = telefono.replace(/\D/g, '');
    const comprobantes = (lista.error ? [] : ((lista.data ?? []) as PorRevisar[])).filter(
      (c) => String(c.slot ?? '').slice(0, 16) === slot && (!tel || String(c.telefono ?? '').replace(/\D/g, '') === tel),
    );
    const telefonos = fichas.error ? {} : ((fichas.data ?? {}) as Record<string, { telefono?: string }>);
    return { comprobantes, adelanto, telefonos };
  }, [companyId, cita.id, cita.pagado_por, cita.status, puedeFicha]);

  const persona = quienDeCita(cita, cliente);
  const cuando = fechaCorta(cita.slot_start);
  const barbero = trabajadores.find((t) => t.id === cita.employee_id);
  const estado = ESTADO_CITA[cita.status ?? 'confirmed'];
  const sello = selloCita(cita, pago, soles);
  const pagada = Boolean(cita.pagado_por) || Boolean(pago?.completo);
  const porRevisar = datos?.comprobantes ?? [];

  /** El saludo al cliente: ya escrito, se retoca en WhatsApp antes de enviarlo. */
  const waCliente = useMemo(() => {
    const nombre = primerNombre(cliente);
    const texto = `Hola${nombre ? ` ${nombre}` : ''}! Te escribimos de ${negocio || 'la barbería'} por tu ${v.reserva} de ${cita.service || v.item} del ${cuando.replace(' · ', ' a las ')}.`;
    return waDe(telefono, texto);
  }, [cliente, negocio, v, cita.service, cuando, telefono]);

  /** Al barbero: quién, qué y cuándo. Sin importes ni el número del cliente (avisos 0004). */
  const telBarbero = barbero ? (datos?.telefonos[barbero.id]?.telefono ?? '') : '';
  const waBarbero = useMemo(() => {
    if (!barbero || !telBarbero) return '';
    const texto = [
      `Hola ${primerNombre(barbero.name) || barbero.name}! Tienes ${v.una} ${v.reserva} nuev${v.a}:`,
      `${persona.nombre}${cita.service ? ` · ${cita.service}` : ''}`,
      `${cuando.replace(' · ', ' a las ')}${cita.sede ? ` · ${sedeCorta(cita.sede)}` : ''}`,
    ].join('\n');
    return waDe(telBarbero, texto);
  }, [barbero, telBarbero, v, persona.nombre, cita.service, cita.sede, cuando]);

  async function revisar(c: PorRevisar, accion: Accion, monto: number | null, metodo: string) {
    const ok = await revisarComprobante(companyId, c, accion, monto, metodo, avisar);
    if (ok) {
      recargar();
      alCambiar();
    }
    return ok;
  }

  const puedeValidar = !pagada && cobroPorApuntar(cita.status, cita.pagado_por) && sello?.clave !== 'pago_sin_hora';

  return (
    <div
      className="modal-fondo"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) alCerrar();
      }}
    >
      <div className="modal ficha-reserva" role="dialog" aria-modal="true" aria-label={`${v.reserva} de ${persona.nombre}`}>
        <div className="modal__cab ficha-reserva__cab">
          <CalendarDays size={16} />
          <b>
            {persona.nombre}
            {persona.deQuien && <small className="muted"> · {persona.deQuien}</small>}
          </b>
          <button type="button" className="q-icon ficha-reserva__cerrar" aria-label="Cerrar" onClick={alCerrar}>
            <X size={16} />
          </button>
        </div>

        <div className="modal__cuerpo">
          <dl className="ficha-reserva__datos">
            <dt>Cuándo</dt>
            <dd><b>{cuando}</b></dd>
            {cita.service && (<><dt>{v.item[0].toUpperCase() + v.item.slice(1)}</dt><dd>{cita.service}</dd></>)}
            {trabajadores.length > 0 && (<><dt>Con</dt><dd>{barbero?.name ?? 'Sin asignar'}</dd></>)}
            {cita.sede && (<><dt>Sede</dt><dd>{sedeCorta(cita.sede)}</dd></>)}
            <dt>Estado</dt>
            <dd className="ficha-reserva__sellos">
              {sello ? (
                <span className="badge-pill" style={{ color: sello.color, background: `${sello.color}18` }} title={sello.ayuda}>{sello.label}</span>
              ) : estado && (
                <span className="badge-pill" style={{ color: estado.color, background: `${estado.color}18` }}>{estado.label}</span>
              )}
              {pagada && <span className="badge-pill" style={{ color: '#0FA968', background: '#0FA96818' }}><Check size={12} /> Pagada</span>}
            </dd>
            {pago && pago.total > 0 && (
              <><dt>Pago</dt><dd>Pagó {soles(pago.pagado)} de {soles(pago.total)}{pago.saldo > 0 ? ` · faltan ${soles(pago.saldo)}` : ''}</dd></>
            )}
          </dl>
          {sello?.ayuda && <p className="muted">{sello.ayuda}</p>}

          {/* Validar el pago: la captura del cliente primero; si no subió ninguna, a mano. */}
          {porRevisar.length > 0 && (
            <ComprobantesPorRevisarVista
              datos={porRevisar}
              adelanto={datos?.adelanto ?? 0}
              alRevisar={revisar}
              alAvisar={setAvisoPago}
              enDonde={enDonde}
              abiertaDeEntrada
            />
          )}
          {avisoPago && <AvisarCliente {...avisoPago} alCerrar={() => setAvisoPago(null)} />}
          {porRevisar.length === 0 && puedeValidar && (
            pagando ? (
              <div className="form-cita ficha-reserva__pago">
                <RegistrarPago
                  leadId={cita.lead_id}
                  appointmentId={cita.id}
                  sugerido={pago?.saldo ?? 0}
                  alCerrar={() => setPagando(false)}
                  alGuardar={() => {
                    recargar();
                    alCambiar();
                  }}
                />
              </div>
            ) : (
              <p className="muted ficha-reserva__nota">
                {cita.status === 'pending_payment'
                  ? 'Está apartada hasta que pague. Si ya viste su Yape o Plin, valídalo aquí.'
                  : `Si ya te pagó (adelanto o todo), apúntalo aquí; si no, se cobra ${enDonde}.`}
              </p>
            )
          )}
        </div>

        <div className="modal__pie ficha-reserva__pie">
          {porRevisar.length === 0 && puedeValidar && !pagando && (
            <button type="button" className="btn btn-primary" onClick={() => setPagando(true)}>
              <Wallet size={16} /> Validar pago
            </button>
          )}
          {waCliente ? (
            <a className="btn btn-ghost" href={waCliente} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={16} /> Escribir a {primerNombre(cliente) || `tu ${v.persona}`}
            </a>
          ) : null}
          <Link className="btn btn-ghost" href={`/panel/mensajes?lead=${encodeURIComponent(cita.lead_id)}`}>
            <MessagesSquare size={16} /> Ver la conversación
          </Link>
          {barbero && (
            waBarbero ? (
              <a className="btn btn-ghost" href={waBarbero} target="_blank" rel="noopener noreferrer">
                <Scissors size={16} /> Avisar a {primerNombre(barbero.name) || barbero.name}
              </a>
            ) : puedeFicha && datos ? (
              <Link className="btn btn-ghost" href="/panel/equipo" title={`Pon el celular de ${barbero.name} en su ficha para avisarle por WhatsApp`}>
                <Scissors size={16} /> Falta el celular de {primerNombre(barbero.name) || barbero.name}
              </Link>
            ) : null
          )}
        </div>
      </div>
    </div>
  );
}
