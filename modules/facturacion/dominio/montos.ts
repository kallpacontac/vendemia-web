/**
 * El IGV de cada línea, calculado desde el precio que paga el cliente.
 *
 * El negocio piensa en «el corte cuesta S/35», no en «S/29,66 + IGV». Por eso se
 * parte del importe con IGV y se separa hacia atrás, y el redondeo se carga al
 * IGV: así valor de venta + IGV da SIEMPRE el importe exacto que se cobró. El
 * IGV puede diferir en un céntimo de valor × tasa, dentro de la tolerancia de
 * SUNAT (±1 sol por línea y total).
 *
 * Todo se cuenta en céntimos enteros para no arrastrar errores de coma flotante.
 */
import type { Linea, LineaEntrada, RegimenIgv, Totales } from './tipos';

const aCentimos = (soles: number) => Math.round(soles * 100 + Number.EPSILON * Math.sign(soles));
const aSoles = (centimos: number) => centimos / 100;
export const redondear = (n: number, decimales: number) => {
  const f = 10 ** decimales;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/** La tasa que se aplica de verdad: 0 si el local está exonerado. */
export const tasaDe = (r: RegimenIgv) => (r.tipo === 'exonerado' ? 0 : r.porcentaje);

export function calcularLinea(l: LineaEntrada, r: RegimenIgv): Linea {
  const tasa = tasaDe(r) / 100;
  const importeC = aCentimos(l.precio * l.cantidad);
  const valorVentaC = Math.round(importeC / (1 + tasa));
  return {
    ...l,
    valorUnitario: redondear(l.precio / (1 + tasa), 6),
    valorVenta: aSoles(valorVentaC),
    igv: aSoles(importeC - valorVentaC),
    importe: aSoles(importeC),
  };
}

export function calcular(lineas: LineaEntrada[], r: RegimenIgv): { lineas: Linea[]; totales: Totales } {
  const calculadas = lineas.map((l) => calcularLinea(l, r));
  const suma = (f: (l: Linea) => number) => aSoles(calculadas.reduce((s, l) => s + aCentimos(f(l)), 0));
  const valor = suma((l) => l.valorVenta);
  return {
    lineas: calculadas,
    totales: {
      opGravadas: r.tipo === 'gravado' ? valor : 0,
      opExoneradas: r.tipo === 'exonerado' ? valor : 0,
      igv: suma((l) => l.igv),
      total: suma((l) => l.importe),
    },
  };
}

/** Las leyendas del catálogo 52 que exige el régimen (hoy, solo la de Amazonía). */
export const leyendasDe = (r: RegimenIgv): string[] =>
  r.tipo === 'exonerado' && r.leyendaAmazonia ? [r.leyendaAmazonia] : [];

/** Mismo dinero, al céntimo. Para comprobar que nadie tocó los montos guardados. */
export const mismoMonto = (a: number, b: number) => aCentimos(a) === aCentimos(b);
