/**
 * Los gráficos del panel se dibujan con SVG a mano, sin librería.
 *
 * Es el mismo par de funciones que usaba public/assets/data.js: convertir una
 * serie en puntos dentro del viewBox y suavizar la línea que los une. Con dos
 * líneas, un donut y un heatmap no compensa meter 40 kB de dependencia.
 */

export interface Punto {
  x: number;
  y: number;
}

/** Serie de números → puntos dentro de un viewBox de W×H. */
export function seriesPts(valores: number[], W: number, H: number, pad = 6): Punto[] {
  if (!valores.length) return [];
  if (valores.length === 1) return [{ x: 0, y: H / 2 }, { x: W, y: H / 2 }];

  const max = Math.max(...valores) || 1;
  const min = Math.min(...valores, 0);
  const n = valores.length;

  return valores.map((v, i) => ({
    x: +(i * (W / (n - 1))).toFixed(1),
    y: +(H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2)).toFixed(1),
  }));
}

/** Puntos → path suavizado (Catmull-Rom convertido a Bézier). */
export function smoothPath(pts: Punto[]): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x},${p2.y}`;
  }
  return d;
}

/** El mismo path, cerrado contra la base, para el relleno degradado. */
export const areaPath = (pts: Punto[], W: number, H: number): string =>
  pts.length < 2 ? '' : `${smoothPath(pts)} L${W},${H} L0,${H} Z`;
