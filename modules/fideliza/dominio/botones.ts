/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOS BOTONES DE LA PÁGINA · el dueño escribe el dato, no la URL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Como Linktree: para WhatsApp se pide el número, para Instagram el @. La URL
 * se arma aquí. En la base solo se guarda la URL final (loyalty_links.url), así
 * que al volver a editar se RECONOCE el tipo a partir de la URL (deTipo). No
 * hace falta ninguna columna nueva.
 *
 * Funciones puras: las usan el editor del panel y las pruebas.
 */
export type TipoBoton =
  | 'whatsapp'
  | 'instagram'
  | 'tiktok'
  | 'facebook'
  | 'youtube'
  | 'x'
  | 'telegram'
  | 'spotify'
  | 'resenas'
  | 'maps'
  | 'carta'
  | 'web'
  | 'enlace'
  | 'tarjeta';

export interface DefBoton {
  tipo: TipoBoton;
  nombre: string;
  /** Texto del botón que se propone al añadirlo. */
  label: string;
  /** Qué se le pide al dueño. */
  pide: string;
  placeholder: string;
  ayuda?: string;
}

export const BOTONES: DefBoton[] = [
  { tipo: 'whatsapp', nombre: 'WhatsApp', label: 'Escríbenos por WhatsApp', pide: 'Tu número de WhatsApp', placeholder: '987 654 321' },
  {
    tipo: 'resenas',
    nombre: 'Reseñas en Google',
    label: 'Déjanos tu reseña',
    pide: 'Tu enlace para pedir reseñas',
    placeholder: 'https://g.page/r/…/review',
    ayuda: 'En Google: tu Perfil de Empresa → «Pedir reseñas» → copiar enlace.',
  },
  { tipo: 'instagram', nombre: 'Instagram', label: 'Síguenos en Instagram', pide: 'Tu usuario de Instagram', placeholder: '@tunegocio' },
  { tipo: 'tiktok', nombre: 'TikTok', label: 'Míranos en TikTok', pide: 'Tu usuario de TikTok', placeholder: '@tunegocio' },
  { tipo: 'facebook', nombre: 'Facebook', label: 'Facebook', pide: 'Tu página de Facebook', placeholder: 'tunegocio o https://facebook.com/…' },
  {
    tipo: 'maps',
    nombre: 'Cómo llegar',
    label: 'Cómo llegar',
    pide: 'Tu ubicación en Google Maps',
    placeholder: 'https://maps.app.goo.gl/…',
    ayuda: 'En Google Maps: busca tu negocio → Compartir → copiar enlace.',
  },
  { tipo: 'carta', nombre: 'Carta o menú', label: 'Ver la carta', pide: 'Enlace a tu carta o catálogo', placeholder: 'https://…' },
  { tipo: 'web', nombre: 'Tu web', label: 'Nuestra web', pide: 'Tu página web', placeholder: 'tunegocio.com' },
  { tipo: 'enlace', nombre: 'Otro enlace', label: 'Más información', pide: 'El enlace', placeholder: 'https://…' },
];

/**
 * Las redes que van como fila de iconos (con su logo oficial). El dueño marca
 * las que usa y escribe solo su @, su número o su enlace.
 */
export const REDES: DefBoton[] = [
  { tipo: 'instagram', nombre: 'Instagram', label: 'Instagram', pide: 'Tu usuario', placeholder: '@tunegocio' },
  { tipo: 'tiktok', nombre: 'TikTok', label: 'TikTok', pide: 'Tu usuario', placeholder: '@tunegocio' },
  { tipo: 'facebook', nombre: 'Facebook', label: 'Facebook', pide: 'Tu página', placeholder: 'tunegocio' },
  { tipo: 'whatsapp', nombre: 'WhatsApp', label: 'WhatsApp', pide: 'Tu número', placeholder: '987 654 321' },
  { tipo: 'youtube', nombre: 'YouTube', label: 'YouTube', pide: 'Tu canal', placeholder: '@tucanal' },
  { tipo: 'x', nombre: 'X', label: 'X', pide: 'Tu usuario', placeholder: '@tunegocio' },
  { tipo: 'telegram', nombre: 'Telegram', label: 'Telegram', pide: 'Tu usuario', placeholder: '@tunegocio' },
  { tipo: 'spotify', nombre: 'Spotify', label: 'Spotify', pide: 'Enlace a tu perfil o lista', placeholder: 'https://open.spotify.com/…' },
];

/** El alta en la tarjeta de puntos: no pide nada, va a /n/<slug>/unirse. */
export const BOTON_TARJETA: DefBoton = {
  tipo: 'tarjeta',
  nombre: 'Mi tarjeta de puntos',
  label: 'Mi tarjeta y beneficios',
  pide: '',
  placeholder: '',
};

export const defDe = (t: TipoBoton) =>
  t === 'tarjeta' ? BOTON_TARJETA : BOTONES.find((b) => b.tipo === t) ?? REDES.find((b) => b.tipo === t) ?? BOTONES[BOTONES.length - 1];

/** Con el negocio elegido en Google: la ventana de «escribir reseña», directa. */
export const urlResenas = (placeId: string) => `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
/** Y «cómo llegar» a ese mismo lugar (formato oficial de enlaces de Maps). */
export const urlMapa = (placeId: string, nombre: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nombre || 'negocio')}&query_place_id=${encodeURIComponent(placeId)}`;

const sinArroba = (v: string) => v.trim().replace(/^@+/, '').replace(/\s+/g, '');

/** Una URL «a mano»: sin esquema se le pone https; http se sube a https. */
function urlSuelta(v: string): string {
  const t = v.trim();
  if (!t) return '';
  if (/^https:\/\//i.test(t)) return t;
  if (/^http:\/\//i.test(t)) return 'https://' + t.slice(7);
  return 'https://' + t.replace(/^\/+/, '');
}

/** Número de Perú: 9 dígitos que empiezan por 9 → se le pone el 51. */
export function numeroWhatsApp(v: string): string {
  const d = v.replace(/\D/g, '');
  return d.length === 9 && d.startsWith('9') ? `51${d}` : d;
}

/** Del dato que escribe el dueño a la URL que se guarda. '' si no hay forma. */
export function aUrl(tipo: TipoBoton, valor: string): string {
  const v = valor.trim();
  if (!v || tipo === 'tarjeta') return '';
  switch (tipo) {
    case 'whatsapp': {
      if (/wa\.me|whatsapp\.com/i.test(v)) return urlSuelta(v);
      const n = numeroWhatsApp(v);
      return n.length >= 8 ? `https://wa.me/${n}` : '';
    }
    case 'instagram':
      return /instagram\.com/i.test(v) ? urlSuelta(v) : sinArroba(v) ? `https://instagram.com/${sinArroba(v)}` : '';
    case 'tiktok':
      return /tiktok\.com/i.test(v) ? urlSuelta(v) : sinArroba(v) ? `https://www.tiktok.com/@${sinArroba(v)}` : '';
    case 'facebook':
      return /facebook\.com|fb\.com/i.test(v) ? urlSuelta(v) : sinArroba(v) ? `https://facebook.com/${sinArroba(v)}` : '';
    case 'youtube':
      return /youtube\.com|youtu\.be/i.test(v) ? urlSuelta(v) : sinArroba(v) ? `https://www.youtube.com/@${sinArroba(v)}` : '';
    case 'x':
      return /(^|\/\/)(www\.)?(x|twitter)\.com/i.test(v) ? urlSuelta(v) : sinArroba(v) ? `https://x.com/${sinArroba(v)}` : '';
    case 'telegram':
      return /t\.me\//i.test(v) ? urlSuelta(v) : sinArroba(v) ? `https://t.me/${sinArroba(v)}` : '';
    default:
      return urlSuelta(v);
  }
}

/**
 * El campo «Web o ayuda» acepta tanto una web como un teléfono. Si parece un
 * número, se convierte en el enlace de WhatsApp que espera Google Wallet.
 */
export function urlAyuda(valor: string): string {
  const v = valor.trim();
  if (!v) return '';
  if (/^\+?[\d\s().-]+$/.test(v)) return aUrl('whatsapp', v);
  return aUrl('web', v);
}

/** Al revés: de la URL guardada al tipo y al dato que se enseña al editar. */
export function deUrl(url: string | null, kind: 'url' | 'join'): { tipo: TipoBoton; valor: string } {
  if (kind === 'join') return { tipo: 'tarjeta', valor: '' };
  const u = url ?? '';
  let m: RegExpMatchArray | null;
  if ((m = u.match(/^https:\/\/wa\.me\/(\d+)/i))) {
    const d = m[1];
    return { tipo: 'whatsapp', valor: d.startsWith('51') && d.length === 11 ? d.slice(2) : d };
  }
  if ((m = u.match(/^https:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)\/?$/i))) return { tipo: 'instagram', valor: '@' + m[1] };
  if ((m = u.match(/^https:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9._]+)\/?$/i))) return { tipo: 'tiktok', valor: '@' + m[1] };
  if (/^https:\/\/(?:www\.|m\.)?(facebook\.com|fb\.com)\//i.test(u)) return { tipo: 'facebook', valor: u };
  if ((m = u.match(/^https:\/\/(?:www\.)?youtube\.com\/@([A-Za-z0-9._-]+)\/?$/i))) return { tipo: 'youtube', valor: '@' + m[1] };
  if (/youtube\.com|youtu\.be/i.test(u)) return { tipo: 'youtube', valor: u };
  if ((m = u.match(/^https:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]+)\/?$/i))) return { tipo: 'x', valor: '@' + m[1] };
  if ((m = u.match(/^https:\/\/t\.me\/([A-Za-z0-9_]+)\/?$/i))) return { tipo: 'telegram', valor: '@' + m[1] };
  if (/open\.spotify\.com/i.test(u)) return { tipo: 'spotify', valor: u };
  if (/g\.page\/r\/|search\.google\.com\/local\/writereview|\/review\b/i.test(u)) return { tipo: 'resenas', valor: u };
  if (/maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps/i.test(u)) return { tipo: 'maps', valor: u };
  return { tipo: 'enlace', valor: u };
}

/** Sugerencia de dirección a partir del nombre: «Barbería El Centro» → barberia-el-centro. */
export function slugDe(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

/** Colores de partida, como las plantillas de Linktree. */
export const PALETAS = ['#FF4900', '#0A0A0A', '#0E7C86', '#7C5CFF', '#E5484D', '#0FA968', '#B26B00', '#2563EB'];
