'use client';

/**
 * Lo del mayorista de un producto, dentro de su ficha del catálogo: código,
 * precio por mayor («desde 12 u.: S/ 18») y pedido mínimo. Sale en el catálogo
 * en PDF de Mi página. Va en su tabla (sql/0005_catalogo_mayorista.sql), no en
 * `catalog`, y se guarda con su propio botón: no pasa por la cola del bot.
 *
 * Si la 0005 no está aplicada, no se enseña.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAvisar } from '@/components/panel/Avisos';

interface Campos {
  codigo: string;
  precio_mayor: string;
  desde: string;
  pedido_minimo: string;
}

const VACIO: Campos = { codigo: '', precio_mayor: '', desde: '', pedido_minimo: '' };
const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export default function Mayorista({ companyId, catalogId, moneda }: { companyId: string; catalogId: string; moneda: string }) {
  const avisar = useAvisar();
  const [hay, setHay] = useState<boolean | null>(null);
  const [f, setF] = useState<Campos>(VACIO);
  const [guardado, setGuardado] = useState<Campos>(VACIO);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    void supabase()
      .from('catalogo_mayorista')
      .select('codigo, precio_mayor, desde, pedido_minimo')
      .eq('catalog_id', catalogId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vigente) return;
        // Sin la tabla (0005 sin aplicar) no hay nada que enseñar.
        if (error) return setHay(false);
        const c = data
          ? { codigo: txt(data.codigo), precio_mayor: txt(data.precio_mayor), desde: txt(data.desde), pedido_minimo: txt(data.pedido_minimo) }
          : VACIO;
        setF(c);
        setGuardado(c);
        setHay(true);
      });
    return () => {
      vigente = false;
    };
  }, [catalogId]);

  if (!hay) return null;
  const set = (k: keyof Campos, v: string) => setF((x) => ({ ...x, [k]: v }));
  const cambiado = JSON.stringify(f) !== JSON.stringify(guardado);
  const medioPar = (f.precio_mayor.trim() === '') !== (f.desde.trim() === '');

  async function guardar() {
    const n = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
    const precio = n(f.precio_mayor);
    const desde = n(f.desde);
    const minimo = n(f.pedido_minimo);
    if (medioPar) return avisar('El precio por mayor va con «desde cuántas unidades», y al revés.', 'error');
    if (precio !== null && (!Number.isFinite(precio) || precio < 0)) return avisar('Revisa el precio por mayor.', 'error');
    if (desde !== null && (!Number.isInteger(desde) || desde < 2)) return avisar('«Desde» son unidades enteras, de 2 en adelante.', 'error');
    if (minimo !== null && (!Number.isInteger(minimo) || minimo < 1)) return avisar('El pedido mínimo son unidades enteras.', 'error');
    setGuardando(true);
    const { error } = await supabase().rpc('catalogo_mayorista_guardar', {
      p_company: companyId,
      p_catalog: catalogId,
      p_datos: { codigo: f.codigo.trim(), precio_mayor: precio, desde, pedido_minimo: minimo },
    });
    setGuardando(false);
    if (error) return avisar(error.message.includes('42501') || error.code === '42501' ? 'Esto lo cambia el dueño o el administrador.' : 'No se pudo guardar. Intenta de nuevo.', 'error');
    setGuardado(f);
    avisar('Datos de mayorista guardados');
  }

  return (
    <div className="full">
      <label className="field-label">Para mayoristas <small className="muted">(salen en tu catálogo en PDF)</small></label>
      <div className="grid-form" style={{ marginTop: 4 }}>
        <div>
          <label className="field-label">Código</label>
          <input className="input" value={f.codigo} maxLength={30} placeholder="P-015" onChange={(e) => set('codigo', e.target.value)} />
        </div>
        <div>
          <label className="field-label">Precio por mayor ({moneda})</label>
          <input className="input" inputMode="decimal" value={f.precio_mayor} placeholder="18" onChange={(e) => set('precio_mayor', e.target.value)} />
        </div>
        <div>
          <label className="field-label">Desde (unidades)</label>
          <input className="input" inputMode="numeric" value={f.desde} placeholder="12" onChange={(e) => set('desde', e.target.value)} />
        </div>
        <div>
          <label className="field-label">Pedido mínimo (unidades)</label>
          <input className="input" inputMode="numeric" value={f.pedido_minimo} placeholder="vacío = sin mínimo" onChange={(e) => set('pedido_minimo', e.target.value)} />
        </div>
      </div>
      {medioPar && <small className="muted">El precio por mayor y «desde» van juntos: «desde 12 u.: {moneda} 18».</small>}
      {cambiado && (
        <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} disabled={guardando} onClick={() => void guardar()}>
          {guardando ? 'Guardando…' : 'Guardar lo de mayorista'}
        </button>
      )}
    </div>
  );
}
