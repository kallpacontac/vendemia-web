/**
 * ══════════════════════════════════════════════════════════════════════════
 * EL ESTILO DE LA PÁGINA PÚBLICA · plantilla + color, y lo demás opcional
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Como Linktree: se elige una plantilla y un color, y ya se ve bien. Lo demás
 * —fondo con foto, botones, forma, dónde van las redes— es «avanzado» y por
 * defecto vale 'auto' (lo que diga la plantilla).
 *
 * Se guarda en loyalty_settings.page_style (jsonb, sql/0008). El color
 * principal sigue siendo loyalty_settings.bg_color, que es el que usa también
 * la tarjeta de Google Wallet.
 */
export type Plantilla = 'clasica' | 'oscura' | 'vidrio' | 'foto' | 'marco' | 'color';
export type EstiloBotones = 'auto' | 'relleno' | 'contorno' | 'vidrio';
export type Forma = 'auto' | 'pildora' | 'redondeado' | 'recto';
export type PosicionRedes = 'auto' | 'arriba' | 'abajo';

export interface Estilo {
  plantilla: Plantilla;
  /** Foto de portada o de fondo (https). Opcional. */
  fondo?: string;
  botones?: EstiloBotones;
  forma?: Forma;
  redes?: PosicionRedes;
  /** La línea bajo el nombre: «Barbería · Miraflores». */
  categoria?: string;
  /** El negocio elegido en Google (para reseñas y cómo llegar). */
  place_id?: string;
  place_nombre?: string;
}

export const PLANTILLAS: { id: Plantilla; nombre: string; describe: string }[] = [
  { id: 'clasica', nombre: 'Clásica', describe: 'Clara, con portada y botones con icono' },
  { id: 'oscura', nombre: 'Oscura', describe: 'Fondo oscuro, elegante, botones con icono' },
  { id: 'vidrio', nombre: 'Vidrio', describe: 'Botones translúcidos sobre tu foto' },
  { id: 'foto', nombre: 'Foto de fondo', describe: 'Tu foto a pantalla completa' },
  { id: 'marco', nombre: 'Marco', describe: 'Foto enmarcada y botones sólidos' },
  { id: 'color', nombre: 'Color', describe: 'Todo en tu color, simple' },
];

/** Lo que cada plantilla pone cuando el ajuste está en 'auto'. */
const BASE: Record<Plantilla, { botones: Exclude<EstiloBotones, 'auto'>; forma: Exclude<Forma, 'auto'>; redes: Exclude<PosicionRedes, 'auto'> }> = {
  clasica: { botones: 'relleno', forma: 'redondeado', redes: 'arriba' },
  oscura: { botones: 'relleno', forma: 'redondeado', redes: 'arriba' },
  vidrio: { botones: 'vidrio', forma: 'pildora', redes: 'arriba' },
  foto: { botones: 'relleno', forma: 'pildora', redes: 'abajo' },
  marco: { botones: 'relleno', forma: 'pildora', redes: 'abajo' },
  color: { botones: 'relleno', forma: 'pildora', redes: 'arriba' },
};

export const PLANTILLA_POR_DEFECTO: Plantilla = 'clasica';

/** Lee lo guardado (que puede venir vacío o de una versión anterior) y lo resuelve. */
export function resolverEstilo(e: Partial<Estilo> | null | undefined) {
  const plantilla = PLANTILLAS.some((p) => p.id === e?.plantilla) ? (e!.plantilla as Plantilla) : PLANTILLA_POR_DEFECTO;
  const b = BASE[plantilla];
  return {
    plantilla,
    fondo: e?.fondo && /^https:\/\/\S+$/.test(e.fondo) ? e.fondo : '',
    botones: e?.botones && e.botones !== 'auto' ? e.botones : b.botones,
    forma: e?.forma && e.forma !== 'auto' ? e.forma : b.forma,
    redes: e?.redes && e.redes !== 'auto' ? e.redes : b.redes,
    categoria: e?.categoria ?? '',
  };
}
export type EstiloResuelto = ReturnType<typeof resolverEstilo>;

/** Colores principales para elegir con un clic (como los de Linktree). */
export const COLORES = ['#FF4900', '#E5484D', '#D6336C', '#7C5CFF', '#2563EB', '#0E7C86', '#0FA968', '#4D7C0F', '#B26B00', '#8B5E3C', '#0A0A0A', '#64748B'];

// ── Utilidades de color (sin dependencias) ──────────────────────────────────

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const aHex = (c: number[]) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

export const colorValido = (c: string | undefined | null) => (/^#[0-9A-Fa-f]{6}$/.test(c ?? '') ? c! : '#FF4900');

/** Mezcla un color con otro: t=0 → el primero, t=1 → el segundo. */
export function mezcla(a: string, b: string, t: number) {
  const x = rgb(colorValido(a));
  const y = rgb(colorValido(b));
  return aHex(x.map((v, i) => v + (y[i] - v) * t));
}

function luminancia(hex: string) {
  return rgb(colorValido(hex))
    .map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    })
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
}

/** Texto legible encima de un color: blanco o casi negro, el que más contraste dé. */
export function tintaSobre(hex: string) {
  const l = luminancia(hex);
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.055 ? '#FFFFFF' : '#14110F';
}

export const esOscuro = (hex: string) => luminancia(hex) < 0.18;
