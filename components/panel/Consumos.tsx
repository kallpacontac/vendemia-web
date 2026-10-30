'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * CONSUMOS CARGADOS A UNA RESERVA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Las gaseosas, la pelota alquilada, los chalecos: lo que se consume en la
 * cancha y se paga junto con ella. Cada consumo es una línea más de la reserva
 * (appointment_services), así que suma a su total, a lo que falta cobrar y a
 * la caja sin tocar nada más. Descuenta stock al cargarlo y lo devuelve al
 * quitarlo (agenda_consumo, modules/tu-pagina/sql/0011).
 *
 * Solo lo del catálogo marcado como producto: un servicio o una cancha no es
 * un consumo. Con opciones (sabor, talla) todavía no se puede: se vende en Pedidos.
 */
import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useAvisar } from './Avisos';
import { useCargar } from './useCargar';
import { soles } from '@/lib/panel/format';
import { supabase } from '@/lib/supabase/client';
import type { ItemCatalogo } from '@/lib/supabase/queries';

interface Linea {
  id: string;
  nombre: string;
  precio: number;
  consumo: boolean;
}

export default function Consumos({ companyId, citaId, catalogo, alCambiar }: {
  companyId: string;
  citaId: string;
  catalogo: ItemCatalogo[];
  alCambiar: () => void;
}) {
  const avisar = useAvisar();
  const productos = useMemo(() => catalogo.filter((c) => c.activo && c.tipo === 'producto'), [catalogo]);
  const [item, setItem] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [enVuelo, setEnVuelo] = useState(false);
  const [lineas, setLineas] = useState<{ lineas: Linea[]; total: number } | null>(null);

  const llamar = async (datos: Record<string, unknown>) => {
    const { data, error } = await supabase().rpc('agenda_consumo', { p_company: companyId, p_datos: { id: citaId, ...datos } });
    if (error) throw new Error(error.message);
    return data as { lineas: Linea[]; total: number };
  };
  const { cargando, error } = useCargar(async () => {
    const r = await llamar({ accion: 'ver' });
    setLineas(r);
    return r;
  }, [companyId, citaId]);

  async function cambiar(datos: Record<string, unknown>, ok: string) {
    setEnVuelo(true);
    try {
      setLineas(await llamar(datos));
      avisar(ok);
      alCambiar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo guardar.', 'error');
    } finally {
      setEnVuelo(false);
    }
  }

  return (
    <div className="consumos">
      {error && <small className="muted">No se pudo cargar: {error.includes('agenda_consumo') ? 'falta aplicar la 0011 de Mi página.' : error}</small>}
      {cargando && !lineas && <small className="muted">Cargando…</small>}
      {lineas && (
        <ul className="consumos-lista">
          {lineas.lineas.map((l) => (
            <li key={l.id}>
              <span>{l.nombre}</span>
              <b>{soles(l.precio)}</b>
              {l.consumo ? (
                <button type="button" className="q-icon" aria-label={`Quitar ${l.nombre}`} disabled={enVuelo}
                  onClick={() => void cambiar({ accion: 'quitar', linea: l.id }, `Quitaste ${l.nombre}.`)}>
                  <X size={14} />
                </button>
              ) : <span aria-hidden="true" />}
            </li>
          ))}
          <li className="consumos-total"><span>Total</span><b>{soles(lineas.total)}</b><span aria-hidden="true" /></li>
        </ul>
      )}
      {productos.length === 0 ? (
        <small className="muted">Para cargar gaseosas o alquiler de pelota, agrégalos en Catálogo como producto.</small>
      ) : (
        <div className="form-cita">
          <div>
            <label className="field-label" htmlFor={`consumo-${citaId}`}>Agregar</label>
            <select id={`consumo-${citaId}`} className="select" value={item} onChange={(e) => setItem(e.target.value)}>
              <option value="">Elige un producto</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.price != null ? ` · ${soles(p.price)}` : ''}{p.stock != null ? ` · quedan ${p.stock}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor={`consumo-n-${citaId}`}>Cantidad</label>
            <input id={`consumo-n-${citaId}`} className="input" type="number" min={1} max={99} value={cantidad} style={{ width: 80 }}
              onChange={(e) => setCantidad(Math.min(99, Math.max(1, Number(e.target.value) || 1)))} />
          </div>
          <button type="button" className="btn btn-primary btn-sm" disabled={!item || enVuelo}
            onClick={() => void cambiar({ accion: 'agregar', catalog_item_id: item, cantidad }, 'Consumo cargado a la reserva.')}>
            <Plus size={14} /> {enVuelo ? 'Guardando…' : 'Cargar'}
          </button>
        </div>
      )}
    </div>
  );
}
