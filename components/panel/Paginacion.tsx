'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * PAGINAR · toda lista que crece con el uso
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Regla del proyecto (11-sep-2026): **si una lista crece con el uso, se pagina
 * desde el primer día**. Citas, pedidos, leads, mensajes, seguimientos: lo que
 * hoy son tres filas, en un año son miles.
 *
 * ⚠️ `slice(0, 20)` a secas NO es paginar, es ocultar: quien mira no sabe que
 * falta algo y no tiene forma de llegar a ello. Si se corta, hay que decir
 * cuántas quedan fuera y dar el camino.
 *
 * Esto existe para no volver a copiar el mismo bloque de botones —ya había tres
 * copias, en Leads, Pedidos y Retargeting— y para que la ventana de páginas sea
 * la misma en todas partes.
 */
import { useMemo, useState } from 'react';

export interface Paginado<T> {
  /** Lo que toca pintar ahora. */
  visibles: T[];
  pagina: number;
  paginas: number;
  irA: (n: number) => void;
  /** Cuántos hay en total, para poder decirlo. */
  total: number;
}

/**
 * ⚠️ Llámalo SIEMPRE antes de cualquier `return` temprano del componente: es un
 * hook, y saltárselo cuando la lista está vacía cambia el orden de los hooks
 * entre renders y React lo rompe.
 */
export function usePaginacion<T>(items: T[], porPagina = 12): Paginado<T> {
  const [pagina, setPagina] = useState(1);

  return useMemo(() => {
    const paginas = Math.max(1, Math.ceil(items.length / porPagina));
    /* Si la lista encoge —un filtro, o algo que se resolvió— la página en la
       que estabas puede ya no existir: se cae a la última en vez de enseñar un
       hueco en blanco. */
    const actual = Math.min(pagina, paginas);
    return {
      visibles: items.slice((actual - 1) * porPagina, actual * porPagina),
      pagina: actual,
      paginas,
      irA: setPagina,
      total: items.length,
    };
  }, [items, pagina, porPagina]);
}

/**
 * Las páginas que se enseñan alrededor de la actual.
 *
 * Con 40 páginas, pintar los 40 botones es una tira ilegible que además empuja
 * el contenido. Se enseñan la primera, la última y las vecinas; los saltos van
 * con `…`, que no es pulsable.
 */
function ventana(pagina: number, paginas: number): (number | '…')[] {
  if (paginas <= 7) return Array.from({ length: paginas }, (_, i) => i + 1);

  const cerca = [pagina - 1, pagina, pagina + 1].filter((n) => n > 1 && n < paginas);
  const salida: (number | '…')[] = [1];
  if (cerca[0] > 2) salida.push('…');
  salida.push(...cerca);
  if (cerca[cerca.length - 1] < paginas - 1) salida.push('…');
  salida.push(paginas);
  return salida;
}

export default function Paginacion({
  pagina,
  paginas,
  irA,
}: {
  pagina: number;
  paginas: number;
  irA: (n: number) => void;
}) {
  // Con una sola página no hay nada que elegir: los botones solo serían ruido.
  if (paginas <= 1) return null;

  return (
    <div className="pagination">
      <button onClick={() => irA(pagina - 1)} disabled={pagina === 1} aria-label="Página anterior">
        ‹
      </button>
      {ventana(pagina, paginas).map((n, i) =>
        n === '…' ? (
          <span key={`s${i}`} className="pagination__salto">
            …
          </span>
        ) : (
          <button key={n} className={n === pagina ? 'active' : ''} onClick={() => irA(n)}>
            {n}
          </button>
        ),
      )}
      <button
        onClick={() => irA(pagina + 1)}
        disabled={pagina === paginas}
        aria-label="Página siguiente"
      >
        ›
      </button>
    </div>
  );
}
