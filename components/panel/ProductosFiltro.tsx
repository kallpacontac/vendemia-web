'use client';

/**
 * Elegir del catálogo en la caja, con muchas cosas (The 24/7, 18-nov-2026: 9 servicios y 28
 * productos). «Que sea fácil, con botones o filtrando si son muchos; los más pedidos primero».
 *
 *   · useMasVendidos: veces vendido cada ítem en los últimos 60 días (datos 0013). Sin la 0013,
 *     o si falla, todo vale 0 y se queda el orden del catálogo.
 *   · ordenarPorVentas: lo más vendido primero; a igualdad, el orden del catálogo.
 *   · FiltroProductos: con más de 8, arriba un buscador y las familias («Bebidas», «Productos de
 *     barbería») como botones; sin buscar, solo los 8 más vendidos y «Ver todos».
 */
import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useCargar } from '@/components/panel/useCargar';
import { supabase } from '@/lib/supabase/client';
import type { ItemCatalogo } from '@/lib/supabase/queries';

export function useMasVendidos(companyId: string | null | undefined): Record<string, number> {
  const { datos } = useCargar(async () => {
    if (!companyId) return {};
    const { data, error } = await supabase().rpc('caja_mas_vendidos', { p_company: companyId });
    if (error || !data) return {};
    return data as Record<string, number>;
  }, [companyId]);
  return datos ?? {};
}

export function ordenarPorVentas(items: ItemCatalogo[], ventas: Record<string, number>): ItemCatalogo[] {
  return [...items].sort(
    (a, b) => (ventas[b.id] ?? 0) - (ventas[a.id] ?? 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name),
  );
}

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const TOPE = 8;

export default function FiltroProductos({
  productos,
  ventas,
  render,
}: {
  productos: ItemCatalogo[];
  ventas: Record<string, number>;
  /** Pinta los botones de la lista ya filtrada y ordenada. */
  render: (lista: ItemCatalogo[]) => React.ReactNode;
}) {
  const [q, setQ] = useState('');
  const [familia, setFamilia] = useState('');
  const [todos, setTodos] = useState(false);
  const familias = useMemo(
    () => [...new Set(productos.map((p) => (p.familia ?? '').trim()).filter(Boolean))].sort(),
    [productos],
  );
  const muchos = productos.length > TOPE;
  const lista = useMemo(() => {
    const t = sinTildes(q.trim());
    const filtrados = productos.filter((p) => (!familia || (p.familia ?? '').trim() === familia) && (!t || sinTildes(p.name).includes(t)));
    return ordenarPorVentas(filtrados, ventas);
  }, [productos, ventas, q, familia]);
  const recortar = muchos && !q && !familia && !todos;
  const visibles = recortar ? lista.slice(0, TOPE) : lista;

  return (
    <div className="pf">
      {muchos && (
        <div className="pf-barra">
          <label className="pf-buscar">
            <Search size={16} aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto…" aria-label="Buscar producto" />
            {q && (
              <button type="button" aria-label="Borrar búsqueda" onClick={() => setQ('')}><X size={15} /></button>
            )}
          </label>
          {familias.length > 1 && (
            <div className="pf-familias" role="group" aria-label="Familia">
              <button type="button" className={!familia ? 'on' : ''} aria-pressed={!familia} onClick={() => setFamilia('')}>Todos</button>
              {familias.map((f) => (
                <button key={f} type="button" className={familia === f ? 'on' : ''} aria-pressed={familia === f} onClick={() => setFamilia(familia === f ? '' : f)}>
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {recortar && <small className="pf-nota">Los más vendidos primero</small>}
      {visibles.length ? render(visibles) : <p className="pf-vacio">Nada con «{q}».</p>}
      {recortar && lista.length > TOPE && (
        <button type="button" className="pf-todos" onClick={() => setTodos(true)}>Ver todos ({lista.length})</button>
      )}
    </div>
  );
}
