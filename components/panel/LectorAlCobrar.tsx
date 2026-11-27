'use client';

/**
 * «Cuando el barbero cobra con Yape» en Configuración › Cobros, debajo del celular conectado (lector
 * 0003). Alvaro, 26-nov: «todo configurable para ir ajustando».
 *   · Qué Yapes ve: los de N min antes y hasta M min después de abrir «Cobrar» (de serie 15 y 5).
 *   · La foto del Yape en el celular del cliente: obligatoria (de serie, cierra la puerta a tomar el
 *     Yape de otro corte) u opcional (el Cierre marca en ámbar los que se cobraron sin foto).
 *   · De qué sede es cada celular, si hay varias: el barbero solo ve los Yapes del de su sede.
 * Dueño y administrador. Solo sale con un celular conectado.
 */
import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';

interface Ajustes { antes: number; despues: number; foto: 'obligatoria' | 'opcional'; sedes: string[] }
const ANTES = [10, 15, 20, 30];
const DESPUES = [3, 5, 10];

export default function LectorAlCobrar({ companyId, dispositivos, alCambiar }: {
  companyId: string;
  dispositivos: { id: string; modelo: string; sede?: string }[];
  alCambiar: () => void;
}) {
  const avisar = useAvisar();
  const [guardando, setGuardando] = useState(false);
  const { datos, releer } = useCargar(async (): Promise<Ajustes | null> => {
    const { data, error } = await supabase().rpc('lector_ajustes_ver', { p_company: companyId });
    return error ? null : (data as Ajustes);
  }, [companyId]);
  // Sin la 0003 en la base: no sale.
  if (!datos) return null;

  async function guardar(cambio: Partial<Ajustes>) {
    if (!datos) return;
    const n = { ...datos, ...cambio };
    setGuardando(true);
    const { error } = await supabase().rpc('lector_ajustes_guardar', {
      p_company: companyId, p_antes: n.antes, p_despues: n.despues, p_foto: n.foto,
    });
    setGuardando(false);
    if (error) return avisar(error.message, 'error');
    releer();
  }

  async function sede(id: string, valor: string) {
    const { error } = await supabase().rpc('lector_dispositivo_sede', { p_company: companyId, p_dispositivo: id, p_sede: valor });
    if (error) return avisar(error.message, 'error');
    alCambiar();
  }

  return (
    <div className="ldp-cobrar">
      <b>Cuando el barbero cobra con Yape, Plin o transferencia</b>
      <small className="muted">
        En Mi agenda › Cobrar ve los pagos que llegaron a este celular y toca el de su cliente. Se cobra al momento.
      </small>
      <label>
        <span>Qué pagos ve</span>
        <span className="ldp-cobrar__fila">
          <select value={datos.antes} disabled={guardando} onChange={(e) => void guardar({ antes: Number(e.target.value) })} aria-label="Minutos antes">
            {ANTES.map((m) => <option key={m} value={m}>{m} min antes</option>)}
          </select>
          <select value={datos.despues} disabled={guardando} onChange={(e) => void guardar({ despues: Number(e.target.value) })} aria-label="Minutos esperando">
            {DESPUES.map((m) => <option key={m} value={m}>y espera {m} min</option>)}
          </select>
        </span>
      </label>
      <label>
        <span>Foto del comprobante del cliente</span>
        <select value={datos.foto} disabled={guardando} onChange={(e) => void guardar({ foto: e.target.value as Ajustes['foto'] })}>
          <option value="obligatoria">Obligatoria: comprueba que es el pago de su cliente</option>
          <option value="opcional">Opcional: los cobrados sin foto salen en ámbar en el Cierre</option>
        </select>
      </label>
      {datos.sedes.length > 1 && dispositivos.map((d) => (
        <label key={d.id}>
          <span>Sede de {d.modelo || 'este celular'}</span>
          <select value={d.sede ?? ''} onChange={(e) => void sede(d.id, e.target.value)}>
            <option value="">Todas las sedes</option>
            {datos.sedes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}
