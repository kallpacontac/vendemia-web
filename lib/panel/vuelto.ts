/**
 * El vuelto en la Caja (19-nov-2026, The 24/7: «dar vuelto cuando pagan con más efectivo; y si
 * yapean de más, algo como Dar vuelto»). Como un cajero de siempre: total, con cuánto paga,
 * vuelto. Lo pinta components/panel/BotonCobrar.
 *
 * Efectivo: el vuelto es solo una cuenta para el cajero. Lo que se apunta es el precio, y el
 * cajón queda igual (entra 50, sale 15 = 35).
 *
 * Yape o Plin de más: entró por la app MÁS que el precio y el vuelto salió del cajón. Se apunta
 * un gasto con la categoría «Vuelto · Yape» y la Caja lo vuelve a sumar a Yape (caja/page.tsx):
 * así Yape cuadra con la app (50), el cajón con el gasto (−15) y el neto sigue siendo 35.
 */
import { METODO_LABEL, type MetodoPago } from '@/lib/panel/metodosPago';

const redondear = (n: number) => Math.round(n * 100) / 100;

export const vueltoDe = (total: number, recibido: number) => redondear(Math.max(0, recibido - total));

/**
 * Los billetes con los que es normal pagar ese total: el siguiente múltiplo de 10 y los billetes
 * de 20, 50, 100 y 200 que lo cubren (y las centenas si es más). Cuatro como mucho, de menor a
 * mayor. S/35 → 40, 50, 100, 200 · S/50 → 100, 200 · S/250 → 300, 400.
 */
export function billetesPara(total: number): number[] {
  if (!(total > 0)) return [];
  const cien = Math.ceil(total / 100) * 100;
  const candidatos = [Math.ceil(total / 10) * 10, 20, 50, 100, 200, Math.ceil(total / 50) * 50, cien, cien + 100];
  return [...new Set(candidatos)]
    .filter((b) => b > total)
    .sort((a, b) => a - b)
    .slice(0, 4);
}

/** Los métodos con los que se puede pagar de más y recibir vuelto en efectivo. */
export const METODOS_CON_VUELTO: MetodoPago[] = ['cash', 'yape', 'plin'];

const PREFIJO = 'Vuelto · ';

/** La categoría del gasto que deja un Yape o Plin de más: «Vuelto · Yape». */
export const categoriaVuelto = (m: MetodoPago) => `${PREFIJO}${METODO_LABEL[m]}`;

/** «Vuelto · Yape» → la etiqueta del método («Yape») al que hay que devolverle ese importe. */
export function metodoDeVuelto(categoria: string | null | undefined): string | null {
  if (!categoria || !categoria.startsWith(PREFIJO)) return null;
  const etiqueta = categoria.slice(PREFIJO.length);
  return Object.values(METODO_LABEL).includes(etiqueta) && etiqueta !== METODO_LABEL.cash ? etiqueta : null;
}
