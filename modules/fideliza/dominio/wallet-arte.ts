/**
 * La imagen grande (hero) del pase de Google Wallet: 1032×336, la medida que
 * recomienda Google. Con sellos, pinta la cartilla con los LLENOS del cliente,
 * como una tarjeta de cartón; con puntos, una barra de avance.
 *
 * Lleva el avance (cuántos sellos van), nunca quién es: ni nombre, ni código,
 * ni id. La misma URL sirve a todos los clientes con el mismo avance, así que
 * hay como mucho meta+1 imágenes por programa y Google las puede cachear.
 */
import { colorValido, mezcla, resolverEstilo, tintaSobre, type Estilo, type Plantilla } from './estilo';
import type { TipoRegla } from './formato';
import { selloValido, trazoSello, type Sello } from './sellos';

export interface ArteWallet {
  color: string;
  plantilla: Plantilla;
  tipo: TipoRegla;
  umbral: number;
  /** Sellos o puntos que lleva el cliente (acotado a la meta). 0 en la clase. */
  llenos: number;
  sello: Sello;
}

export const ANCHO_ARTE = 1032;
export const ALTO_ARTE = 336;
/** Hasta cuántos sellos se dibujan como cartilla; más, como barra. */
export const MAX_SELLOS_DIBUJADOS = 12;

export function datosArteWallet(
  color: string,
  estilo: Partial<Estilo> | null | undefined,
  tipo: TipoRegla,
  umbral: number,
  llenos = 0,
): ArteWallet {
  const meta = Math.max(0, Math.min(1_000_000, Math.trunc(umbral) || 0));
  return {
    color: colorValido(color),
    plantilla: resolverEstilo(estilo).plantilla,
    tipo,
    umbral: meta,
    llenos: Math.max(0, Math.min(meta, Math.trunc(llenos) || 0)),
    sello: selloValido(estilo?.sello),
  };
}

/** ¿Se dibuja como cartilla de sellos? (si no, barra de avance) */
export const esCartilla = (tipo: TipoRegla, umbral: number) => tipo !== 'points' && umbral > 0 && umbral <= MAX_SELLOS_DIBUJADOS;

const PLANTILLAS = ['clasica', 'oscura', 'vidrio', 'foto', 'marco', 'color'];
const entero = (v: unknown, max: number) => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= max;

/**
 * Lee los datos de la URL firmada. Rechaza cualquier clave de más. Acepta la
 * forma anterior (sin `llenos` ni `sello`) de los pases ya emitidos.
 */
export function leerDatosArte(x: unknown): ArteWallet | null {
  if (!x || typeof x !== 'object') return null;
  const d = x as Record<string, unknown>;
  const claves = Object.keys(d).sort().join(',');
  const nueva = claves === 'color,llenos,plantilla,sello,tipo,umbral';
  if (!nueva && claves !== 'color,plantilla,tipo,umbral') return null;
  if (typeof d.color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(d.color)) return null;
  if (typeof d.plantilla !== 'string' || !PLANTILLAS.includes(d.plantilla)) return null;
  if (d.tipo !== 'stamps' && d.tipo !== 'points' && d.tipo !== 'visits') return null;
  if (!entero(d.umbral, 1_000_000)) return null;
  if (nueva && (!entero(d.llenos, Number(d.umbral)) || selloValido(d.sello) !== d.sello)) return null;
  return {
    color: d.color,
    plantilla: d.plantilla as Plantilla,
    tipo: d.tipo,
    umbral: Number(d.umbral),
    llenos: nueva ? Number(d.llenos) : 0,
    sello: nueva ? (d.sello as Sello) : 'check',
  };
}

export const validarArteWallet = (x: unknown): x is ArteWallet => leerDatosArte(x) !== null;

/** Un icono de 24×24 centrado en (cx, cy) con lado `lado`. */
const icono = (s: Sello, cx: number, cy: number, lado: number, color: string, opacidad: number) =>
  `<g transform="translate(${cx - lado / 2} ${cy - lado / 2}) scale(${lado / 24})" fill="none" stroke="${color}" stroke-opacity="${opacidad}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${trazoSello(s)}</g>`;

export function svgArteWallet(d: ArteWallet): string {
  const oscuro = d.plantilla === 'oscura' || d.plantilla === 'vidrio' || d.plantilla === 'foto';
  const arriba = mezcla(d.color, '#17171C', oscuro ? 0.72 : 0.08);
  const abajo = mezcla(d.color, '#111116', oscuro ? 0.88 : 0.3);
  // La tinta se elige contra el tono medio del fondo: blanco sobre oscuro, casi negro sobre claro.
  const tinta = tintaSobre(mezcla(arriba, abajo, 0.5));
  const sobreTinta = tinta === '#FFFFFF' ? mezcla(d.color, '#000000', oscuro ? 0 : 0.15) : '#FFFFFF';
  let centro: string;

  if (esCartilla(d.tipo, d.umbral)) {
    const n = d.umbral;
    const porFila = n <= 6 ? n : Math.ceil(n / 2);
    const filas = n <= 6 ? 1 : 2;
    const r = filas === 1 ? 60 : 50;
    const paso = filas === 1 ? 152 : 136;
    centro = Array.from({ length: n }, (_, i) => {
      const fila = Math.floor(i / porFila);
      const enFila = fila === 0 ? Math.min(porFila, n) : n - porFila;
      const x = ANCHO_ARTE / 2 - ((enFila - 1) * paso) / 2 + (i % porFila) * paso;
      const y = filas === 1 ? ALTO_ARTE / 2 : fila === 0 ? 108 : 228;
      const lleno = i < d.llenos;
      // La última casilla es la del premio: lleva un regalo.
      const s = i === n - 1 && d.sello !== 'regalo' ? 'regalo' : d.sello;
      return lleno
        ? `<circle class="lleno" cx="${x}" cy="${y}" r="${r}" fill="${tinta}"/>${icono(s, x, y, r * 1.05, sobreTinta, 1)}`
        : `<circle class="vacio" cx="${x}" cy="${y}" r="${r}" fill="${tinta}" fill-opacity=".1" stroke="${tinta}" stroke-opacity=".6" stroke-width="4" stroke-dasharray="${i === n - 1 ? '0' : '10 9'}"/>${icono(s, x, y, r * 0.95, tinta, 0.45)}`;
    }).join('');
  } else if (d.umbral > 0) {
    // Puntos (o muchas visitas): barra de avance hacia el premio.
    const x0 = 140;
    const x1 = ANCHO_ARTE - 230;
    const ancho = x1 - x0;
    const lleno = Math.round((ancho * Math.min(d.llenos, d.umbral)) / d.umbral);
    centro = `<rect x="${x0}" y="146" width="${ancho}" height="44" rx="22" fill="${tinta}" fill-opacity=".14" stroke="${tinta}" stroke-opacity=".45" stroke-width="3"/>
      ${lleno > 0 ? `<rect class="lleno" x="${x0}" y="146" width="${Math.max(44, lleno)}" height="44" rx="22" fill="${tinta}"/>` : ''}
      <circle cx="${x1 + 100}" cy="168" r="70" fill="${tinta}" fill-opacity="${d.llenos >= d.umbral ? 1 : 0.14}" stroke="${tinta}" stroke-opacity=".6" stroke-width="4"/>
      ${icono('regalo', x1 + 100, 168, 74, d.llenos >= d.umbral ? sobreTinta : tinta, d.llenos >= d.umbral ? 1 : 0.6)}`;
  } else {
    // Sin meta (clase de demostración): solo el motivo.
    centro = `<circle cx="${ANCHO_ARTE / 2}" cy="${ALTO_ARTE / 2}" r="96" fill="${tinta}" fill-opacity=".12" stroke="${tinta}" stroke-opacity=".5" stroke-width="4"/>
      ${icono('estrella', ANCHO_ARTE / 2, ALTO_ARTE / 2, 104, tinta, 0.9)}`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO_ARTE}" height="${ALTO_ARTE}" viewBox="0 0 ${ANCHO_ARTE} ${ALTO_ARTE}">
    <defs>
      <linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${arriba}"/><stop offset="1" stop-color="${abajo}"/></linearGradient>
      <radialGradient id="l"><stop stop-color="#FFFFFF" stop-opacity=".22"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="${ANCHO_ARTE}" height="${ALTO_ARTE}" fill="url(#f)"/>
    <circle cx="930" cy="20" r="260" fill="url(#l)"/>
    <circle cx="60" cy="330" r="220" fill="url(#l)" opacity=".5"/>
    ${d.plantilla === 'marco' ? `<rect x="22" y="22" width="${ANCHO_ARTE - 44}" height="${ALTO_ARTE - 44}" rx="34" fill="none" stroke="${tinta}" stroke-opacity=".55" stroke-width="5"/>` : ''}
    ${centro}
  </svg>`;
}
