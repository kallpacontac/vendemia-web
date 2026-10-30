'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * TURNOS FIJOS DE CANCHA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * El mismo equipo, la misma cancha, el mismo día y hora cada semana. Se crean
 * desde «Nueva reserva» → «Repetir cada semana»; cada semana es una reserva
 * normal de la agenda (se cobra, se mueve o se cancela sola). Aquí se ven
 * juntas para renovarlas o cancelar todas las que faltan
 * (canchas_fijas_*, modules/tu-pagina/sql/0011).
 */
import { useState } from 'react';
import { CalendarOff, Repeat } from 'lucide-react';
import Confirmar from './Confirmar';
import Paginacion, { usePaginacion } from './Paginacion';
import { useAvisar } from './Avisos';
import { useCargar } from './useCargar';
import { telefono as comoTelefono } from '@/lib/panel/format';
import { supabase } from '@/lib/supabase/client';

const POR_PAGINA = 10;
const RENOVAR = 4;
const DIAS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];

interface Fijo {
  id: string;
  cliente: string;
  telefono: string;
  cancha: string;
  dia: number;
  hora: string;
  minutos: number;
  hasta: string;
  activa: boolean;
  quedan: number;
  siguiente: string | null;
}

const fecha = (d: string) => d.slice(0, 10).split('-').reverse().slice(0, 2).join('/');

export default function TurnosFijos({ companyId, alCambiar }: { companyId: string; alCambiar: () => void }) {
  const avisar = useAvisar();
  const [enVuelo, setEnVuelo] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<Fijo | null>(null);
  const { datos, cargando, error, releer } = useCargar(async () => {
    const { data, error } = await supabase().rpc('canchas_fijas_panel', { p_company: companyId });
    if (error) throw new Error(error.message);
    return (data ?? []) as Fijo[];
  }, [companyId]);
  const pag = usePaginacion(datos ?? [], POR_PAGINA);

  async function renovar(f: Fijo) {
    setEnVuelo(f.id);
    const { data, error } = await supabase().rpc('canchas_fija_renovar', { p_company: companyId, p_id: f.id, p_semanas: RENOVAR });
    setEnVuelo(null);
    if (error) return avisar(error.message, 'error');
    const r = data as { creadas: string[]; saltadas: { slot_start: string }[] };
    avisar(`${r.creadas.length} semanas más para ${f.cliente}${r.saltadas.length ? `. Sin sitio: ${r.saltadas.map((s) => fecha(s.slot_start)).join(', ')}` : ''}.`);
    releer();
    alCambiar();
  }

  async function cancelar(f: Fijo) {
    setEnVuelo(f.id);
    const { data, error } = await supabase().rpc('canchas_fija_cancelar', { p_company: companyId, p_id: f.id });
    setEnVuelo(null);
    setCancelando(null);
    if (error) return avisar(error.message, 'error');
    avisar(`Turno fijo cancelado: ${data} ${data === 1 ? 'reserva' : 'reservas'} quedan libres.`);
    releer();
    alCambiar();
  }

  if (!cargando && !error && (datos ?? []).length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-head">
        <h3><Repeat size={16} style={{ verticalAlign: -3 }} /> Turnos fijos</h3>
        <small className="muted">{(datos ?? []).filter((f) => f.activa).length} activos</small>
      </div>
      {error && <p className="vacio">No se pudo cargar: {error.includes('canchas_fijas') ? 'falta aplicar la 0011 de Mi página.' : error}</p>}
      <div className="confirmar-lista">
        {pag.visibles.map((f) => (
          <div key={f.id} className="confirmar-fila">
            <div className="confirmar-quien">
              <b>{f.cliente}</b>
              <small className="muted">{f.cancha} · {DIAS[f.dia]} {f.hora} · {f.minutos} min · {comoTelefono(f.telefono)}</small>
              <small className="muted">
                {!f.activa ? 'Cancelado' : f.siguiente ? `Próxima: ${fecha(f.siguiente)} · quedan ${f.quedan} ${f.quedan === 1 ? 'semana' : 'semanas'} (hasta el ${fecha(f.hasta)})` : `Terminó el ${fecha(f.hasta)}`}
              </small>
            </div>
            {f.activa && (
              <div className="confirmar-acciones">
                <button className={`btn btn-sm ${f.quedan <= 1 ? 'btn-primary' : 'btn-ghost'}`} disabled={enVuelo === f.id} onClick={() => void renovar(f)}>
                  <Repeat size={14} /> {RENOVAR} semanas más
                </button>
                {f.quedan > 0 && (
                  <button className="btn btn-ghost btn-sm confirmar-no" disabled={enVuelo === f.id} onClick={() => setCancelando(f)}>
                    <CalendarOff size={14} /> Cancelar
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <Paginacion pagina={pag.pagina} paginas={pag.paginas} irA={pag.irA} />
      {cancelando && (
        <Confirmar
          titulo="¿Cancelar este turno fijo?"
          textoConfirmar="Sí, cancelarlo"
          peligro
          ocupado={enVuelo !== null}
          detalle={<>
            <p><b>{cancelando.cliente}</b> · {cancelando.cancha} · {DIAS[cancelando.dia]} {cancelando.hora}</p>
            <p className="muted">Se cancelan las {cancelando.quedan} semanas que faltan; las que ya pasaron se quedan como están. Al cliente no le llega nada solo.</p>
          </>}
          alCerrar={() => setCancelando(null)}
          alConfirmar={() => void cancelar(cancelando)}
        />
      )}
    </div>
  );
}
