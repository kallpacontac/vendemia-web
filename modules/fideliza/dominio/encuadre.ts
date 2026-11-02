/**
 * La foto de perfil, como en Instagram: cualquier imagen vale y siempre llena el
 * círculo. Se adapta en dos sitios:
 *
 *  · Al subirla, en el navegador (ui/EncuadrarFoto.tsx): sale un cuadrado 1:1 que
 *    el dueño puede mover y acercar, pero nunca alejar hasta dejar huecos.
 *  · Al mostrarla (`fotoEnCirculo`): lo que ya estaba subido se adapta sin volver
 *    a subirlo, y lo que llega sin pasar por el editor también.
 *
 * El encuadre se cuenta en píxeles de la foto original, no de la pantalla: `lado`
 * es cuánta foto cabe en el cuadrado y (`cx`, `cy`) dónde cae su centro. Así el
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

/** No se deja acercar por debajo de esto, salvo que la foto entera sea más pequeña. */
const LADO_MINIMO = 320;
/** Lo que se sube. Google Wallet pide al menos 660×660: ver servidor/logo.ts. */
export const LADO_SALIDA = 1000;
/** Cuánto se puede acercar desde «llenar el círculo». */
const ZOOM_MAXIMO = 5;
/** En una foto vertical la cara suele estar arriba: se empieza por ahí, no por el pecho. */
const SESGO_VERTICAL = 0.2;
/**
 * Hasta el 2-nov-2026 la subida rellenaba con franjas transparentes (`c_pad`) y
 * las imágenes de `brand/` las llevan grabadas. Las posteriores no tienen nada
 * que quitar, y recortarles el margen a sus logos sería cambiar lo que se encuadró.
 */
const SIN_FRANJAS_DESDE = 1793602912;

/** El lado con el que la foto llena el cuadrado. Nunca es mayor: dejaría huecos. */
export const ladoLlenar = ({ ancho, alto }: Medidas) => Math.min(ancho, alto);
const ladoCerca = (m: Medidas) => Math.min(ladoLlenar(m), Math.max(LADO_MINIMO, ladoLlenar(m) / ZOOM_MAXIMO));

/** Dentro de los límites: la foto siempre cubre el cuadrado entero. */
export function limitar(m: Medidas, e: Encuadre): Encuadre {
  const lado = Math.min(ladoLlenar(m), Math.max(ladoCerca(m), e.lado));
  const eje = (centro: number, largo: number) => Math.min(largo - lado / 2, Math.max(lado / 2, centro));
  return { lado, cx: eje(e.cx, m.ancho), cy: eje(e.cy, m.alto) };
}

export function encuadreInicial(m: Medidas): Encuadre {
  const lado = ladoLlenar(m);
  return limitar(m, { lado, cx: m.ancho / 2, cy: lado / 2 + (m.alto - lado) * SESGO_VERTICAL });
}

/**
 * La barra de zoom va de 0 (llena justo el círculo) a 1 (lo más cerca). En escala
 * logarítmica: cada tramo de la barra acerca lo mismo, también en fotos de 12 MP.
 */
export function ladoDeZoom(m: Medidas, zoom: number): number {
  return ladoLlenar(m) * (ladoCerca(m) / ladoLlenar(m)) ** zoom;
}

export function zoomDeLado(m: Medidas, lado: number): number {
  const recorrido = Math.log(ladoCerca(m) / ladoLlenar(m));
  return recorrido === 0 ? 0 : Math.log(lado / ladoLlenar(m)) / recorrido;
}

/** Dónde y de qué tamaño se dibuja la foto en el lienzo de salida. */
export function dibujoEnLienzo(m: Medidas, e: Encuadre, lienzo = LADO_SALIDA) {
  const k = lienzo / e.lado;
  return { x: (e.lado / 2 - e.cx) * k, y: (e.lado / 2 - e.cy) * k, ancho: m.ancho * k, alto: m.alto * k };
}

/**
 * La dirección de la foto de perfil o el logo, lista para un círculo: cuadrada,
 * llena y sin franjas. `g_auto` deja dentro lo importante, normalmente la cara.
 * `png` es para quien no entiende de `f_auto`: Wallet, avisos, icono de la app.
 * Las de otros sitios, o las que ya traen transformación, se dejan como están.
 */
export function fotoEnCirculo(url: string | null | undefined, lado = 384, formato: 'auto' | 'png' = 'auto'): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^(.*\/image\/upload\/)(v(\d+)\/.+)$/);
    if (u.hostname !== 'res.cloudinary.com' || !m) return url;
    const conFranjas = /^v\d+\/brand\/.+\.png$/i.test(m[2]) && Number(m[3]) < SIN_FRANJAS_DESDE;
    const entrega = formato === 'png' ? 'f_png' : 'f_auto,q_auto:good';
    u.pathname = `${m[1]}${conFranjas ? 'e_trim/' : ''}c_fill,g_auto,h_${lado},w_${lado}/${entrega}/${m[2]}`;
    return u.toString();
  } catch {
    return url;
  }
}
