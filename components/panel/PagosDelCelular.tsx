'use client';

/**
 * «Pagos del celular de cobros» en Caja › Cierre del día (lector 0001/0002). Alvaro, 24-nov: si el
 * emparejamiento es seguro no se pone nada en ningún lado; lo que haya que revisar va en UN sitio,
 * con toda la información, dentro de lo que ya existe: el cierre del día, donde se cuadra.
 *
 *   · Plegada: una línea con cuántos llegaron, el total y cuántos se asignaron solos.
 *   · Si alguno quedó por asignar (raro: dos citas iguales a la vez y el nombre no decide), sale
 *     arriba, abierto, con sus citas posibles como botones grandes.
 *   · Cada pago: quién pagó, por qué app y a qué hora, y a qué cita fue. Tocarlo enseña el detalle y
 *     «No era de esta cita».
 * Dueño y administrador. Sin celular conectado ni pagos ese día, no sale.
 */
import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { useSondeo } from '@/components/panel/useSondeo';
import { hora12, soles } from '@/lib/panel/format';
import './lector-de-pagos.css';
import './yape-por-asignar.css';

export interface PagoLeido {
  id: number;
  centimos: number | null;
  nombre: string;
  origen: string;
  cuando: string;
  cita_id?: string | null;
  cliente?: string | null;
  servicio?: string | null;
  slot?: string | null;
  resultado?: string | null;
  asignado?: string | null;
  por_asignar?: boolean;
}
export interface Opcion { cita_id: string; cliente: string; servicio: string; slot: string; falta: number; exacto: boolean }
export interface PorAsignar { id: number; centimos: number; nombre: string; origen: string; cuando: string; opciones: Opcion[] }

const RESULTADO: Record<string, string> = {
  cobrada: 'cobrada', confirmada: 'reserva confirmada', a_cuenta: 'a cuenta', parcial: 'a cuenta', cotejado: 'comprobante cotejado',
};
// «7:49 pm», como el resto del panel (el «p. m.» del navegador se parte en dos líneas en el celular).
const horaLima = (iso: string) =>
  hora12(new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false }));
const diaLima = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const bonito = (s: string) => s.trim().toLowerCase().replace(/\b\p{L}/gu, (l) => l.toUpperCase());

export default function PagosDelCelular({ companyId, dia, recarga }: { companyId: string; dia: string; recarga?: unknown }) {
  const avisar = useAvisar();
  const [ocupado, setOcupado] = useState(0);
  const { datos, releer } = useCargar(async () => {
    const desde = new Date(`${dia}T00:00:00-05:00`).toISOString();
    const [estado, dudas] = await Promise.all([
      supabase().rpc('lector_estado', { p_company: companyId, p_desde: desde }),
      supabase().rpc('lector_por_asignar', { p_company: companyId }),
    ]);
    if (estado.error) return null;
    const e = estado.data as { dispositivos: unknown[]; avisos: PagoLeido[] };
    return {
      conectado: e.dispositivos.length > 0,
      pagos: e.avisos.filter((a) => a.centimos !== null && diaLima(a.cuando) === dia),
      dudas: ((dudas.data ?? []) as PorAsignar[]).filter((d) => diaLima(d.cuando) === dia),
    };
  }, [companyId, dia, recarga]);
  useSondeo(releer, 30_000);

  if (!datos || (!datos.conectado && !datos.pagos.length)) return null;

  async function asignar(p: PorAsignar, o: Opcion) {
    setOcupado(p.id);
    const { error } = await supabase().rpc('lector_asignar', { p_company: companyId, p_aviso: p.id, p_cita: o.cita_id });
    setOcupado(0);
    if (error) return avisar(error.message, 'error');
    avisar(`Listo: ${soles(p.centimos / 100)} a la cita de ${o.cliente || 'ese cliente'}.`, 'ok');
    releer();
  }

  async function quitar(a: PagoLeido) {
    if (!window.confirm(`¿Quitar este pago de la cita de ${a.cliente || 'ese cliente'}? La cita vuelve a quedar por cobrar.`)) return;
    const { error } = await supabase().rpc('lector_desasignar', { p_company: companyId, p_aviso: a.id });
    if (error) return avisar(error.message, 'error');
    avisar('Listo: la cita vuelve a quedar por cobrar.', 'ok');
    releer();
  }

  return <PagosDelCelularVista pagos={datos.pagos} dudas={datos.dudas} ocupado={ocupado} alAsignar={asignar} alQuitar={quitar} />;
}

/** La sección sin la base (también la usa la vista previa de /dev). */
export function PagosDelCelularVista({ pagos, dudas, ocupado = 0, alAsignar, alQuitar }: {
  pagos: PagoLeido[]; dudas: PorAsignar[]; ocupado?: number;
  alAsignar: (p: PorAsignar, o: Opcion) => void; alQuitar: (a: PagoLeido) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const [detalle, setDetalle] = useState<number | null>(null);
  const total = pagos.reduce((t, a) => t + (a.centimos ?? 0), 0) / 100;
  const solos = pagos.filter((a) => a.cita_id && a.asignado === 'auto').length;
  const sinCita = pagos.filter((a) => !a.cita_id && !a.por_asignar).length;

  return (
    <section className="card ldp ldp-caja" aria-label="Pagos del celular de cobros">
      <button type="button" className="ldp-caja__cab" aria-expanded={abierta} onClick={() => setAbierta((v) => !v)}>
        <span>
          <b>Pagos del celular de cobros</b>
          <small className="muted">
            {pagos.length
              ? `${pagos.length} ${pagos.length === 1 ? 'pago' : 'pagos'} · ${soles(total)}${solos ? ` · ${solos} ${solos === 1 ? 'asignado solo' : 'asignados solos'}` : ''}${sinCita ? ` · ${sinCita} sin cita` : ''}`
              : 'Ninguno este día'}
          </small>
        </span>
        <ChevronDown size={18} aria-hidden="true" style={{ transform: abierta ? 'rotate(180deg)' : undefined, flex: 'none' }} />
      </button>

      {/* Lo único que pide una decisión: siempre a la vista, aunque la sección esté plegada. */}
      {dudas.map((p) => (
        <article key={p.id} className="ypa ypa--en-caja">
          <p className="ypa__pago">
            <b>¿De qué cita es?</b> {soles(p.centimos / 100)} de {bonito(p.nombre) || 'alguien sin nombre'} · {horaLima(p.cuando)}
          </p>
          <div className="ypa__opciones">
            {p.opciones.map((o) => (
              <button key={o.cita_id} type="button" className="ypa__opcion" disabled={ocupado === p.id} onClick={() => alAsignar(p, o)}>
                <b>{o.cliente || 'Cliente'}</b>
                <span>{o.servicio} · {hora12(o.slot.slice(11, 16))}{!o.exacto ? ` · le faltan ${soles(o.falta)}` : ''}</span>
              </button>
            ))}
          </div>
        </article>
      ))}

      {abierta && pagos.length > 0 && (
        <ul className="ldp-lista">
          {pagos.map((a) => {
            const destino = a.cita_id
              ? `${a.cliente || 'Una cita'} · ${RESULTADO[a.resultado ?? ''] ?? 'asignado'}`
              : a.por_asignar ? 'Elige su cita arriba' : 'Sin cita · venta suelta';
            return (
              <li key={a.id}>
                <button type="button" className="ldp-fila" disabled={!a.cita_id} aria-expanded={a.cita_id ? detalle === a.id : undefined}
                  onClick={() => setDetalle((x) => (x === a.id ? null : a.id))}>
                  <span className="ldp-hora">{horaLima(a.cuando)}</span>
                  <span className="ldp-quien">
                    <b>{bonito(a.nombre) || 'Sin nombre'}</b>
                    <small>{a.cita_id && <Check size={12} aria-hidden="true" />} {a.origen} · {destino}</small>
                  </span>
                  <span className="ldp-monto">{soles((a.centimos ?? 0) / 100)}</span>
                </button>
                {detalle === a.id && a.cita_id && (
                  <div className="ldp-detalle">
                    <span>
                      {a.servicio}{a.slot ? ` · ${hora12(a.slot.slice(11, 16))}` : ''} · {a.asignado === 'auto' ? 'asignado solo' : 'lo asignaste tú'}
                    </span>
                    <button type="button" className="ldp-quitar" onClick={() => alQuitar(a)}>No era de esta cita</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
