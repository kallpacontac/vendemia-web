'use client';

/**
 * Mi página → «Avísame»: quién espera que se libere una cancha (sql/0011).
 *
 * Arriba lo que ya se liberó y nadie ha avisado: es lo único que pide hacer
 * algo. «Avisar por WhatsApp» abre el chat con el texto y el enlace para
 * reservar ya puestos, y lo marca como avisado. No se manda nada solo: el
 * dueño escribe desde su WhatsApp, uno por uno.
 */
import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { useSesion } from '@/components/panel/Sesion';
import { supabase } from '@/lib/supabase/client';
import { urlReservar } from '@/modules/tu-pagina/dominio/config';
import { fechaCorta, telefonoBonito, urlWhatsApp } from '@/modules/tu-pagina/dominio/envio';

const POR_PAGINA = 30;

interface Espera {
  id: string;
  cancha: string;
  slot_start: string;
  nombre: string;
  telefono: string;
  creado: string;
  avisado: string | null;
  libre: boolean;
}

const cuando = (s: string) => `${fechaCorta(s.slice(0, 10))}, ${s.slice(11, 16)}`;

export default function Avisame({ companyId, slug, negocio }: { companyId: string; slug: string; negocio: string }) {
  const avisar = useAvisar();
  const modo = useSesion().compania?.business_mode;
  const [limite, setLimite] = useState(POR_PAGINA);
  const { datos, cargando, error, releer } = useCargar(async () => {
    const { data, error } = await supabase().rpc('avisame_panel', { p_company: companyId });
    if (error) throw new Error(error.message);
    return (data ?? []) as Espera[];
  }, [companyId]);
  const lista = (datos ?? []).slice(0, limite);
  const porAvisar = (datos ?? []).filter((e) => e.libre && !e.avisado).length;

  const mensaje = (e: Espera) =>
    `Hola ${e.nombre.trim().split(' ')[0]}, te escribe ${negocio}: se liberó la ${e.cancha} el ${cuando(e.slot_start)}. Si aún la quieres, resérvala aquí: ${urlReservar(slug, modo)}`;

  async function marcar(e: Espera, avisado: boolean) {
    const { error } = await supabase().rpc('avisame_marcar', { p_company: companyId, p_id: e.id, p_avisado: avisado });
    if (error) avisar('No se pudo marcar. Prueba de nuevo.', 'error');
    releer();
  }

  async function quitar(e: Espera) {
    const { error } = await supabase().rpc('avisame_borrar', { p_company: companyId, p_id: e.id });
    if (error) return avisar('No se pudo quitar. Prueba de nuevo.', 'error');
    avisar(`Quitaste a ${e.nombre} de la lista.`);
    releer();
  }

  return (
    <section className="card table-card">
      <div className="card-mini-head">
        <h3>Avísame si se libera</h3>
        {porAvisar > 0 && <span className="tp-rec-vence tp-rec-vence--ok">{porAvisar} por avisar</span>}
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '0 14px 10px' }}>
        Clientes que encontraron una cancha ocupada y quieren que les avises si se libera. Cuando se cancela esa reserva, aparece arriba como «Se liberó».
      </p>

      {error && <p className="vacio">No se pudo cargar: {error.includes('avisame') ? 'falta aplicar la 0011 de Mi página.' : error}</p>}
      {cargando && !datos && <p className="vacio">Cargando…</p>}
      {datos && lista.length === 0 && <p className="vacio">Nadie espera una cancha por ahora.</p>}

      {lista.map((e) => (
        <div key={e.id} className="tp-avisame-fila">
          <span>
            <b>{e.cancha} · {cuando(e.slot_start)}</b>
            <small>{e.nombre} · {telefonoBonito(e.telefono)}</small>
          </span>
          <span className={`tp-rec-vence${e.avisado ? '' : e.libre ? ' tp-rec-vence--ok' : ''}`}>
            {e.avisado ? 'Avisado' : e.libre ? 'Se liberó' : 'Sigue ocupada'}
          </span>
          <span className="tp-rec-acciones">
            {e.libre && (
              <a className={`btn btn-sm ${e.avisado ? 'btn-ghost' : 'btn-primary'}`} href={urlWhatsApp(e.telefono, mensaje(e))} target="_blank" rel="noopener"
                onClick={() => { if (!e.avisado) void marcar(e, true); }}>
                <MessageCircle size={15} /> {e.avisado ? 'Escribirle otra vez' : 'Avisar por WhatsApp'}
              </a>
            )}
            {e.avisado && <button className="btn btn-sm btn-ghost" onClick={() => void marcar(e, false)}>Desmarcar</button>}
            <button className="btn btn-sm btn-ghost" onClick={() => void quitar(e)}>Quitar</button>
          </span>
        </div>
      ))}
      {(datos?.length ?? 0) > limite && <button className="btn btn-ghost tp-panel-mas" onClick={() => setLimite((l) => l + POR_PAGINA)}>Ver más</button>}
    </section>
  );
}
