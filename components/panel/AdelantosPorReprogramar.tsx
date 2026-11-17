'use client';

/**
 * «Adelantos por reprogramar» (tu-pagina 0027). Pedido por Alvaro el 16-nov-2026 (The 24/7): si el
 * cliente no vino o canceló, el adelanto NO se pierde, pasa a otra hora que le indique el local.
 *
 *   · Sale arriba de la Agenda, sola, solo si hay alguna: una cita «No vino» o cancelada con dinero
 *     pagado que aún no se reprogramó. Nada que buscar (Alvaro: «lo más práctico»).
 *   · «Darle otra hora»: día, hora y sede. Crea una cita NUEVA y le pasa el pago; la vieja se queda
 *     como «No vino». Son independientes: marcar «No vino» ya liberó la hora para otro, y reprogramar
 *     se puede hacer hoy o cuando el cliente escriba.
 *   · Si no cabe (local cerrado, sillas de la sede ocupadas), la base no crea nada y dice por qué:
 *     se enseña tal cual.
 *   · Al terminar, el mensaje para el cliente (AvisarCliente): nadie le escribe solo.
 */
import { useState } from 'react';
import { CalendarClock, ChevronDown, X } from 'lucide-react';
import AvisarCliente from '@/components/panel/AvisarCliente';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { supabase } from '@/lib/supabase/client';
import { fechaCorta, soles } from '@/lib/panel/cobro-cancha';
import { isoLocal } from '@/lib/panel/format';
import type { Sede } from '@/modules/tu-pagina/dominio/adelantoCitas';
import './tablero-canchas.css';

interface SinUsar {
  id: string;
  cliente: string;
  telefono: string;
  servicio: string;
  slot: string;
  sede: string;
  estado: 'no_show' | 'cancelled';
  pagado: number;
  total: number;
}

interface Hecho { titulo: string; mensaje: string; waLink: string; nota?: string }

const manana = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return isoLocal(d);
};

export default function AdelantosPorReprogramar({ companyId, sedes, recarga, alCambiar }: {
  companyId: string;
  sedes: Sede[];
  recarga: unknown;
  alCambiar: () => void;
}) {
  const avisar = useAvisar();
  const [abierta, setAbierta] = useState<SinUsar | null>(null);
  const [hecho, setHecho] = useState<Hecho | null>(null);
  /** Minimizada de entrada, como «Comprobantes por revisar»: el título dice cuántos hay. */
  const [desplegada, setDesplegada] = useState(false);

  // Sin la 0027 la función no existe: la Agenda sigue sin esta tarjeta.
  const { datos, recargar } = useCargar(async () => {
    const { data, error } = await supabase().rpc('agenda_adelantos_sin_usar', { p_company: companyId });
    return error ? [] : ((data ?? []) as SinUsar[]);
  }, [companyId, recarga]);

  const lista = datos ?? [];
  if (!lista.length && !hecho) return null;

  return (
    <>
      {hecho && <AvisarCliente {...hecho} alCerrar={() => setHecho(null)} />}
      {lista.length > 0 && (
        <section className="tc-revisar" aria-label="Adelantos por reprogramar">
          <button type="button" className="tc-revisar__cab" aria-expanded={desplegada} onClick={() => setDesplegada((a) => !a)}>
            <b className="tc-revisar__titulo">{lista.length === 1 ? '1 adelanto por reprogramar' : `${lista.length} adelantos por reprogramar`}</b>
            <span className="tc-revisar__plegar">
              {desplegada ? 'Minimizar' : 'Ver'}
              <ChevronDown size={16} aria-hidden="true" style={{ transform: desplegada ? 'rotate(180deg)' : undefined }} />
            </span>
          </button>
          {desplegada && <small className="muted">No vinieron o cancelaron, pero ya pagaron: su dinero sigue a su favor. Dales otra hora cuando te escriban.</small>}
          {desplegada && lista.map((c) => (
            <article key={c.id} className="tc-repro">
              <div className="tc-revisar__datos">
                <b>{c.cliente}</b>
                <small>{c.servicio} · {fechaCorta(c.slot)}{c.sede ? ` · ${c.sede}` : ''}</small>
                <small>{c.estado === 'cancelled' ? 'Cancelada' : 'No vino'} · pagó <b>{soles(Number(c.pagado) || 0)}</b> de {soles(Number(c.total) || 0)}</small>
              </div>
              <button type="button" className="tc__accion" onClick={() => setAbierta(c)}>
                <CalendarClock size={16} aria-hidden="true" /> Darle otra hora
              </button>
            </article>
          ))}
        </section>
      )}
      {abierta && (
        <Reprogramar
          companyId={companyId}
          cita={abierta}
          sedes={sedes}
          alCerrar={() => setAbierta(null)}
          alListo={(h) => {
            setAbierta(null);
            setHecho(h);
            avisar('Cita reprogramada con su adelanto.', 'ok');
            recargar();
            alCambiar();
          }}
        />
      )}
    </>
  );
}

function Reprogramar({ companyId, cita, sedes, alCerrar, alListo }: {
  companyId: string;
  cita: SinUsar;
  sedes: Sede[];
  alCerrar: () => void;
  alListo: (h: Hecho) => void;
}) {
  const [fecha, setFecha] = useState(manana);
  const [hora, setHora] = useState(cita.slot.slice(11, 16) || '10:00');
  const [sede, setSede] = useState(cita.sede);
  const [enviando, setEnviando] = useState(false);
  /** El motivo de la base si no cabe: se queda a la vista, junto a lo que hay que cambiar. */
  const [noCabe, setNoCabe] = useState('');
  const pideSede = sedes.length > 1;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setNoCabe('');
    if (!fecha || !hora) return setNoCabe('Elige el día y la hora.');
    if (pideSede && !sede) return setNoCabe('Elige la sede.');
    setEnviando(true);
    const { data, error } = await supabase().rpc('agenda_reprogramar', {
      p_company: companyId,
      p_datos: { id: cita.id, slot_start: `${fecha} ${hora}`, sede: pideSede ? sede : '' },
    });
    setEnviando(false);
    if (error) return setNoCabe(error.message);
    const r = data as { mensaje?: string; wa_link?: string; falta?: number; slot_start?: string };
    alListo({
      titulo: `${cita.cliente}: nueva cita ${fechaCorta(r.slot_start ?? `${fecha} ${hora}`)}`,
      mensaje: r.mensaje ?? '',
      waLink: r.wa_link ?? '',
      nota: Number(r.falta) > 0 ? `Le faltan ${soles(Number(r.falta))} por pagar en el local.` : 'Ya está pagada completa.',
    });
  }

  return (
    <div className="modal-fondo" role="presentation" onClick={(e) => { if (e.target === e.currentTarget && !enviando) alCerrar(); }}>
      <form className="modal" role="dialog" aria-modal="true" aria-label="Darle otra hora" onSubmit={guardar}>
        <div className="modal__cab">
          <CalendarClock size={16} />
          <b>Darle otra hora</b>
          <button type="button" className="q-icon" aria-label="Cerrar" onClick={alCerrar} disabled={enviando} style={{ marginLeft: 'auto' }}>
            <X size={14} />
          </button>
        </div>
        <div className="modal__cuerpo" style={{ display: 'grid', gap: 10 }}>
          <p style={{ margin: 0 }}>
            <b>{cita.cliente}</b> · {cita.servicio}
          </p>
          <p className="tc-tipo-pago tc-tipo-pago--adelanto" style={{ justifySelf: 'start' }}>
            Pagó {soles(Number(cita.pagado) || 0)}: pasa a la nueva cita
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label className="field-label" style={{ display: 'grid', gap: 4 }}>
              Día
              <input className="input" type="date" min={isoLocal(new Date())} value={fecha} onChange={(e) => { setFecha(e.target.value); setNoCabe(''); }} />
            </label>
            <label className="field-label" style={{ display: 'grid', gap: 4 }}>
              Hora
              <input className="input" type="time" step={900} value={hora} onChange={(e) => { setHora(e.target.value); setNoCabe(''); }} />
            </label>
          </div>
          {pideSede && (
            <label className="field-label" style={{ display: 'grid', gap: 4 }}>
              Sede
              <select className="input" value={sede} onChange={(e) => { setSede(e.target.value); setNoCabe(''); }}>
                <option value="">Elige la sede</option>
                {sedes.map((s) => (
                  <option key={s.nombre} value={s.nombre}>{s.capacidad ? `${s.nombre} · ${s.capacidad} a la vez` : s.nombre}</option>
                ))}
              </select>
            </label>
          )}
          {noCabe && <div className="acceso__error" role="alert">{noCabe}</div>}
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            La cita de antes se queda como «{cita.estado === 'cancelled' ? 'Cancelada' : 'No vino'}» en su historial. Al cliente no le llega nada
            solo: al terminar te doy el mensaje para avisarle.
          </p>
        </div>
        <div className="modal__pie">
          <button type="button" className="btn btn-ghost" onClick={alCerrar} disabled={enviando}>Dejarlo</button>
          <button type="submit" className="btn btn-primary" disabled={enviando}>{enviando ? 'Guardando…' : 'Reprogramar'}</button>
        </div>
      </form>
    </div>
  );
}
