'use client';

/**
 * Elegir del catálogo en la caja, con muchas cosas (The 24/7, 18-nov-2026: 9 servicios y 28
 * productos). «Que sea fácil, con botones o filtrando si son muchos; los más pedidos primero».
 *
 *   · useMasVendidos: veces vendido cada ítem en los últimos 60 días (datos 0013). Sin la 0013,
 *     o si falla, todo vale 0 y se queda el orden del catálogo.
 *   · ordenarPorVentas: lo más vendido primero; a igualdad, el orden del catálogo.
 *   · FiltroProductos: con más de 4, arriba un buscador por nombre; sin buscar, solo los 4 más
 *     vendidos y un «Ver todos» discreto. (18-nov: «hay demasiados productos, eso satura; que se
 *     filtren por nombre». Las familias como botones eran otra fila más: fuera.)
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
const TOPE = 4;

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
  const [todos, setTodos] = useState(false);
  const muchos = productos.length > TOPE;
  const lista = useMemo(() => {
    const t = sinTildes(q.trim());
    // También por familia escrita («cerveza», «gel»): sin botones, el buscador lo cubre.
    const filtrados = productos.filter((p) => !t || sinTildes(`${p.name} ${p.familia ?? ''}`).includes(t));
    return ordenarPorVentas(filtrados, ventas);
  }, [productos, ventas, q]);
  const recortar = muchos && !q && !todos;
  const visibles = recortar ? lista.slice(0, TOPE) : lista;

  return (
    <div className="pf">
      {muchos && (
        <div className="pf-barra">
          <label className="pf-buscar">
            <Search size={16} aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Escribe: inca, cera, gel…" aria-label="Buscar producto por nombre" />
            {q && (
              <button type="button" aria-label="Borrar búsqueda" onClick={() => setQ('')}><X size={15} /></button>
            )}
          </label>
        </div>
      )}
      {recortar && <small className="pf-nota">Los más pedidos</small>}
      {todos && !q && <button type="button" className="pf-todos" onClick={() => setTodos(false)}>Ver menos</button>}
      {visibles.length ? render(visibles) : <p className="pf-vacio">Nada con «{q}».</p>}
      {recortar && lista.length > TOPE && (
        <button type="button" className="pf-todos" onClick={() => setTodos(true)}>Ver todos ({lista.length})</button>
      )}
    </div>
  );
}
