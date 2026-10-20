/** Arte del programa, sin saldo ni datos del titular, para Google Wallet. */
import { colorValido, mezcla, resolverEstilo, type Estilo, type Plantilla } from './estilo';
import type { TipoRegla } from './formato';

export interface ArteWallet {
  color: string;
  plantilla: Plantilla;
  tipo: TipoRegla;
  umbral: number;
}

export function datosArteWallet(color: string, estilo: Partial<Estilo> | null | undefined, tipo: TipoRegla, umbral: number): ArteWallet {
  return {
    color: colorValido(color),
    plantilla: resolverEstilo(estilo).plantilla,
    tipo,
    umbral: Math.max(0, Math.min(1_000_000, Math.trunc(umbral) || 0)),
  };
}

/** Rechaza parámetros externos antes de usarlos dentro del SVG. */
export function validarArteWallet(x: unknown): x is ArteWallet {
  if (!x || typeof x !== 'object') return false;
  const d = x as Record<string, unknown>;
  return Object.keys(d).sort().join(',') === 'color,plantilla,tipo,umbral'
    && typeof d.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(d.color)
    && typeof d.plantilla === 'string' && ['clasica', 'oscura', 'vidrio', 'foto', 'marco', 'color'].includes(d.plantilla)
    && (d.tipo === 'stamps' || d.tipo === 'points' || d.tipo === 'visits')
    && Number.isInteger(d.umbral) && Number(d.umbral) >= 0 && Number(d.umbral) <= 1_000_000;
}

export function svgArteWallet(d: ArteWallet): string {
  const oscuro = d.plantilla === 'oscura' || d.plantilla === 'vidrio' || d.plantilla === 'foto';
  const arriba = mezcla(d.color, '#17171C', oscuro ? .72 : .17);
  const abajo = mezcla(d.color, '#111116', oscuro ? .88 : .43);
  const patron = d.tipo !== 'points' && d.umbral > 0 && d.umbral <= 12;
  let centro: string;

  if (patron) {
    const filas = Math.ceil(d.umbral / 6);
    centro = Array.from({ length: d.umbral }, (_, i) => {
      const fila = Math.floor(i / 6);
      const enFila = Math.min(6, d.umbral - fila * 6);
      const x = 516 - (enFila - 1) * 70 + (i % 6) * 140;
      const y = filas === 1 ? 406 : fila === 0 ? 300 : 512;
      return `<circle cx="${x}" cy="${y}" r="58" fill="#FFFFFF" fill-opacity=".08" stroke="#FFFFFF" stroke-opacity=".75" stroke-width="5"/><path d="M${x} ${y - 19}v38m-19-19h38" stroke="#FFFFFF" stroke-opacity=".7" stroke-width="5" stroke-linecap="round"/>`;
    }).join('');
  } else {
    const circunferencia = Math.round(2 * Math.PI * 225);
    centro = `<circle cx="516" cy="406" r="225" fill="none" stroke="#FFFFFF" stroke-opacity=".22" stroke-width="52"/>
      <circle cx="516" cy="406" r="225" fill="none" stroke="#FFFFFF" stroke-opacity=".74" stroke-width="23" stroke-linecap="round" stroke-dasharray="${Math.round(circunferencia / 12)} ${Math.round(circunferencia / 12)}" transform="rotate(-90 516 406)"/>
      <circle cx="516" cy="406" r="119" fill="#FFFFFF" fill-opacity=".1"/>
      <path d="M516 323l21 53 57 5-44 37 15 55-49-30-49 30 15-55-44-37 57-5z" fill="#FFFFFF" fill-opacity=".94"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1032" height="812" viewBox="0 0 1032 812">
    <defs>
      <linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${arriba}"/><stop offset="1" stop-color="${abajo}"/></linearGradient>
      <radialGradient id="l"><stop stop-color="#FFFFFF" stop-opacity=".26"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="1032" height="812" fill="url(#f)"/>
    <circle cx="908" cy="74" r="340" fill="url(#l)"/>
    <circle cx="34" cy="790" r="300" fill="url(#l)" opacity=".55"/>
    ${d.plantilla === 'marco' ? '<rect x="43" y="43" width="946" height="726" rx="66" fill="none" stroke="#FFFFFF" stroke-opacity=".65" stroke-width="8"/>' : ''}
    ${d.plantilla === 'vidrio' || d.plantilla === 'foto' ? '<rect x="72" y="76" width="888" height="660" rx="66" fill="#FFFFFF" fill-opacity=".09" stroke="#FFFFFF" stroke-opacity=".28" stroke-width="3"/>' : ''}
    ${centro}
    <path d="M100 106h100m-100 600h100m632-600h100m-100 600h100" stroke="#FFFFFF" stroke-opacity=".32" stroke-width="6" stroke-linecap="round"/>
  </svg>`;
}
