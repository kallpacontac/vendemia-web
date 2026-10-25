'use client';

/**
 * «Para que Mia te diga cuánto pedir», en la ficha de un producto con stock.
 *
 * Lo que sabe el dueño y no sale de ningún otro dato: cuánto tarda en llegarle,
 * cada cuánto compra, por cuántas viene la caja y cuánto le cuesta. Con eso el
 * bot calcula cuánto pedir y cuándo (docs/prompt-bot-mia-gerente-compras.md);
 * aquí no se calcula nada.
 *
 * Va en sus tablas (modules/datos/sql/0009) y con su propio botón, como lo de
 * mayorista. El costo solo lo ve y lo pone el dueño: al administrador ni se le
 * pinta el campo (y la base tampoco se lo devolvería).
 *
 * Si la 0009 no está aplicada, no se enseña.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAvisar } from './Avisos';
import { useSesion } from './Sesion';
import { demoActivo } from '@/lib/panel/demo';

interface Campos {
  dias_reposicion: string;
  cada_cuanto: string;
  por_caja: string;
  costo: string;
}

const VACIO: Campos = { dias_reposicion: '', cada_cuanto: '', por_caja: '', costo: '' };
const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export function DatosDeCompra({ catalogId, moneda }: { catalogId: string; moneda: string }) {
  const { companyId, rol } = useSesion();
  const avisar = useAvisar();
  const esDueno = rol === 'dueno';
  const puede = esDueno || rol === 'admin';
  const [hay, setHay] = useState(false);
  const [f, setF] = useState<Campos>(VACIO);
  const [guardado, setGuardado] = useState<Campos>(VACIO);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!companyId || !puede || demoActivo()) return;
    let vigente = true;
    void (async () => {
      const compras = await supabase()
        .from('catalogo_compras')
        .select('dias_reposicion, cada_cuanto, por_caja')
        .eq('catalog_id', catalogId)
        .maybeSingle();
      // Sin la tabla (0009 sin aplicar) no hay nada que enseñar.
      if (!vigente || compras.error) return;
      const costo = esDueno
        ? await supabase().from('catalogo_costos').select('costo').eq('catalog_id', catalogId).maybeSingle()
        : null;
      if (!vigente) return;
      const c: Campos = {
        dias_reposicion: txt(compras.data?.dias_reposicion),
        cada_cuanto: txt(compras.data?.cada_cuanto),
        por_caja: txt(compras.data?.por_caja),
        costo: txt(costo?.data?.costo),
      };
      setF(c);
      setGuardado(c);
      setHay(true);
    })();
    return () => {
      vigente = false;
    };
  }, [companyId, catalogId, puede, esDueno]);

  if (!hay || !companyId) return null;
  const set = (k: keyof Campos, v: string) => setF((x) => ({ ...x, [k]: v }));
  const cambiado = JSON.stringify(f) !== JSON.stringify(guardado);

  async function guardar() {
    const entero = (v: string) => (v.trim() === '' ? null : Number(v));
    const datos: Record<string, number | null> = {
      dias_reposicion: entero(f.dias_reposicion),
      cada_cuanto: entero(f.cada_cuanto),
      por_caja: entero(f.por_caja),
    };
    for (const [k, v] of Object.entries(datos)) {
      if (v !== null && (!Number.isInteger(v) || v < 0)) {
        return avisar(k === 'por_caja' ? 'La caja son unidades enteras.' : 'Los días son un número entero.', 'error');
      }
    }
    // Solo se manda el costo si es el dueño y lo tocó: así un cambio de días no lo reescribe.
    if (esDueno && f.costo !== guardado.costo) {
      const c = f.costo.trim() === '' ? null : Number(f.costo.replace(',', '.'));
      if (c !== null && (!Number.isFinite(c) || c < 0)) return avisar('Revisa el costo.', 'error');
      datos.costo = c;
    }
    setGuardando(true);
    const { error } = await supabase().rpc('compras_guardar', { p_company: companyId, p_catalog: catalogId, p_datos: datos });
    setGuardando(false);
    if (error) return avisar(error.message || 'No se pudo guardar. Intenta de nuevo.', 'error');
    setGuardado(f);
    avisar('Guardado. Mia ya lo usa para decirte cuánto pedir.');
  }

  return (
    <div className="full datos-compra">
      <label className="field-label">
        Para que Mia te diga cuánto pedir <small className="muted">(opcional)</small>
      </label>
      <div className="grid-form" style={{ marginTop: 4 }}>
        <div>
          <label className="field-label">Tarda en llegarte (días)</label>
          <input
            className="input"
            inputMode="numeric"
            value={f.dias_reposicion}
            placeholder="ej. 7"
            onChange={(e) => set('dias_reposicion', e.target.value)}
          />
          <small className="muted" style={{ fontSize: 11.5 }}>Desde que lo pides hasta que lo puedes vender.</small>
        </div>
        <div>
          <label className="field-label">Compras cada (días)</label>
          <input
            className="input"
            inputMode="numeric"
            value={f.cada_cuanto}
            placeholder="ej. 15"
            onChange={(e) => set('cada_cuanto', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Viene por caja de</label>
          <input
            className="input"
            inputMode="numeric"
            value={f.por_caja}
            placeholder="vacío = suelto"
            onChange={(e) => set('por_caja', e.target.value)}
          />
          <small className="muted" style={{ fontSize: 11.5 }}>Para redondear el pedido a cajas completas.</small>
        </div>
        {esDueno && (
          <div>
            <label className="field-label">Te cuesta ({moneda}, cada uno)</label>
            <input
              className="input"
              inputMode="decimal"
              value={f.costo}
              placeholder="ej. 18.50"
              onChange={(e) => set('costo', e.target.value)}
            />
            <small className="muted" style={{ fontSize: 11.5 }}>
              Solo lo ves tú. Con esto Mia te dice cuánto te deja cada venta y cuánta plata tienes parada.
            </small>
          </div>
        )}
      </div>
      {cambiado && (
        <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} disabled={guardando} onClick={() => void guardar()}>
          {guardando ? 'Guardando…' : 'Guardar datos de compra'}
        </button>
      )}
    </div>
  );
}
