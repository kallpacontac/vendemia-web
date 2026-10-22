'use client';

/**
 * «Avísame al celular cuando queden N», en la ficha del producto.
 *
 * Los avisos de stock solo existen si alguien los pide (decisión de Alvaro,
 * 21-oct-2026) y son DE esa persona: le llegan solo a ella, como notificación
 * del panel instalado. Lo normal será pedírselo a Mia («avísame cuando queden
 * 5 del Polo negro»); esto es lo mismo sin tener que escribirle, y funciona
 * aunque el bot todavía no tenga esa herramienta.
 *
 * Se guarda aparte del formulario y al momento: no es un dato del producto
 * (no lo ve Mia de ventas ni el resto del equipo), es una preferencia tuya.
 * Si la tabla aún no existe (modules/datos/sql/0008 sin aplicar) no se pinta.
 */
import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { useSesion } from './Sesion';
import { useAvisar } from './Avisos';
import { supabase } from '@/lib/supabase/client';
import { demoActivo } from '@/lib/panel/demo';

export function AvisoStock({ catalogId, stock }: { catalogId: string; stock: number }) {
  const { companyId, rol } = useSesion();
  const avisar = useAvisar();
  /** undefined = cargando o no disponible; null = no hay aviso puesto. */
  const [aviso, setAviso] = useState<{ id: string; minimo: number } | null | undefined>(undefined);
  const [minimo, setMinimo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const puede = rol === 'dueno' || rol === 'admin';

  useEffect(() => {
    if (!companyId || !puede || demoActivo()) return;
    let vivo = true;
    void supabase()
      .from('avisos_stock')
      .select('id, minimo')
      .eq('company_id', companyId)
      .eq('catalog_id', catalogId)
      .is('variante_id', null)
      .eq('activo', true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vivo || error) return;
        setAviso((data as { id: string; minimo: number } | null) ?? null);
        if (data) setMinimo(String((data as { minimo: number }).minimo));
      });
    return () => {
      vivo = false;
    };
  }, [companyId, catalogId, puede]);

  if (!puede || aviso === undefined || !companyId) return null;

  async function guardar() {
    const n = Number(minimo);
    if (minimo.trim() === '' || !Number.isInteger(n) || n < 0) {
      avisar('Pon un número entero: cuántas unidades quedan cuando quieres el aviso.', 'error');
      return;
    }
    setOcupado(true);
    const { data, error } = await supabase().rpc('aviso_stock_poner', {
      p_company: companyId,
      p_catalog: catalogId,
      p_variante: null,
      p_minimo: n,
    });
    setOcupado(false);
    if (error) {
      avisar(error.message || 'No se pudo guardar el aviso.', 'error');
      return;
    }
    const r = data as { id: string; ya_por_debajo: boolean; stock: number };
    setAviso({ id: r.id, minimo: n });
    avisar(
      r.ya_por_debajo
        ? `Aviso puesto. Ya tienes ${r.stock}: te avisará la próxima vez que baje de ${n}, después de reponer.`
        : `Listo: te llegará un aviso al celular cuando queden ${n}.`,
      'ok',
    );
  }

  async function quitar() {
    if (!aviso) return;
    setOcupado(true);
    const { error } = await supabase().rpc('aviso_stock_quitar', { p_company: companyId, p_id: aviso.id });
    setOcupado(false);
    if (error) {
      avisar(error.message || 'No se pudo quitar el aviso.', 'error');
      return;
    }
    setAviso(null);
    setMinimo('');
    avisar('Aviso quitado.', 'ok');
  }

  return (
    <div className="aviso-stock">
      <label className="field-label">
        <Bell size={13} /> Avísame al celular cuando queden
      </label>
      <div className="aviso-stock__fila">
        <input
          className="input"
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="ej. 5"
          value={minimo}
          onChange={(e) => setMinimo(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={ocupado || (aviso !== null && String(aviso.minimo) === minimo)}
          onClick={() => void guardar()}
        >
          {aviso ? 'Cambiar' : 'Poner aviso'}
        </button>
        {aviso && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => void quitar()}>
            <BellOff size={13} /> Quitar
          </button>
        )}
      </div>
      <small className="muted" style={{ fontSize: 11.5 }}>
        {aviso
          ? `Puesto: te avisa cuando queden ${aviso.minimo} (ahora hay ${stock}). Solo te llega a ti.`
          : 'Solo te llega a ti, en los celulares donde activaste los avisos (Ajustes).'}
      </small>
    </div>
  );
}
