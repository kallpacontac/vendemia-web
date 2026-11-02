/**
 * El encuadre de la foto de perfil, como en Instagram o Facebook: un cuadrado
 * 1:1 que el dueño elige sobre su foto mirando el círculo donde va a salir.
 *
 * Todo se cuenta en píxeles de la foto original, no de la pantalla: `lado` es
 * cuánta foto cabe en el cuadrado y (`cx`, `cy`) dónde cae su centro. Así el
 * mismo encuadre vale para el visor, sea del tamaño que sea, y para exportar.
 */
export interface Medidas {
  ancho: number;
  alto: number;
}

export interface Encuadre {
  cx: number;
  cy: number;
  lado: number;
}

/** Por debajo se ve borrosa incluso en el círculo de la página. Es la medida que usa Instagram. */
export const LADO_MINIMO = 320;
/** Lo que se sube. Google Wallet pide al menos 660×660: ver servidor/logo.ts. */
export const LADO_SALIDA = 1000;
/** Cuánto se puede acercar desde «llenar el círculo». */
const ZOOM_MAXIMO = 5;
/** En una foto vertical la cara suele estar arriba: se empieza por ahí, no por el pecho. */
const SESGO_VERTICAL = 0.2;

export function problemaMedidas({ ancho, alto }: Medidas): string | null {
  if (Math.min(ancho, alto) >= LADO_MINIMO) return null;
  return `Esta imagen mide ${ancho}×${alto} px y se vería borrosa. Usa una de al menos ${LADO_MINIMO}×${LADO_MINIMO} px.`;
}

/** El lado con el que la foto llena el cuadrado sin dejar huecos. */
export const ladoLlenar = ({ ancho, alto }: Medidas) => Math.min(ancho, alto);
/** El lado con el que la foto se ve entera, con huecos si no es cuadrada. */
export const ladoEntera = ({ ancho, alto }: Medidas) => Math.max(ancho, alto);
const ladoCerca = (m: Medidas) => Math.max(LADO_MINIMO, ladoLlenar(m) / ZOOM_MAXIMO);

/** Lo que no pase de los bordes: si en un eje la foto no llena el cuadrado, va centrada en él. */
export function limitar(m: Medidas, e: Encuadre): Encuadre {
  const lado = Math.min(ladoEntera(m), Math.max(ladoCerca(m), e.lado));
  const eje = (centro: number, largo: number) =>
    lado >= largo ? largo / 2 : Math.min(largo - lado / 2, Math.max(lado / 2, centro));
  return { lado, cx: eje(e.cx, m.ancho), cy: eje(e.cy, m.alto) };
}

export function encuadreInicial(m: Medidas, entera = false): Encuadre {
  const lado = entera ? ladoEntera(m) : ladoLlenar(m);
  return limitar(m, { lado, cx: m.ancho / 2, cy: lado / 2 + (m.alto - lado) * SESGO_VERTICAL });
}

/**
 * La barra de zoom va de 0 (foto entera) a 1 (lo más cerca). En escala
 * logarítmica: cada tramo de la barra acerca lo mismo, también en fotos de 12 MP.
 */
export function ladoDeZoom(m: Medidas, zoom: number): number {
  return ladoEntera(m) * (ladoCerca(m) / ladoEntera(m)) ** zoom;
}

export function zoomDeLado(m: Medidas, lado: number): number {
  const recorrido = Math.log(ladoCerca(m) / ladoEntera(m));
  return recorrido === 0 ? 0 : Math.log(lado / ladoEntera(m)) / recorrido;
}

/** Dónde y de qué tamaño se dibuja la foto en el lienzo de salida. */
export function dibujoEnLienzo(m: Medidas, e: Encuadre, lienzo = LADO_SALIDA) {
  const k = lienzo / e.lado;
  return { x: (e.lado / 2 - e.cx) * k, y: (e.lado / 2 - e.cy) * k, ancho: m.ancho * k, alto: m.alto * k };
}
