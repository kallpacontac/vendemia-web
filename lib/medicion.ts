/**
 * ══════════════════════════════════════════════════════════════════════════
 * MEDICIÓN Y ATRIBUCIÓN — lo que hace que el dinero de Meta no se tire
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sin esto, una campaña de Meta solo puede optimizar por CLIC: le dices a Meta
 * "tráeme gente" y Meta te trae la más barata de traer, que es justamente la
 * que menos compra. Con un evento de conversión, le dices "tráeme gente COMO
 * LA QUE ME ESCRIBIÓ" y el algoritmo empieza a trabajar a tu favor en vez de
 * en tu contra. Es la diferencia entre gastar y comprar.
 *
 * ── TODO ESTO ES OPCIONAL POR DISEÑO ─────────────────────────────────────
 * Si `NEXT_PUBLIC_META_PIXEL_ID` no está definida, no se carga el pixel y cada
 * función de aquí es un no-op silencioso. Así `npm run dev` sigue funcionando
 * sin configurar nada, y sobre todo: NO se mide en desarrollo. Contaminar el
 * pixel con tus propias recargas mientras programas es la forma más rápida de
 * enseñarle a Meta a buscar gente que se parece a ti.
 */

/** El ID del pixel, o cadena vacía si no está configurado. */
export const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '';

/* ── Atribución ───────────────────────────────────────────── */

/**
 * Los parámetros que se guardan al entrar.
 *
 * Los `utm_` los pones tú en la plantilla de URL del anuncio. Los `*clid` los
 * pone la plataforma sola al hacer clic: `fbclid` Meta, `gclid` Google,
 * `ttclid` TikTok, `msclkid` Microsoft.
 */
const PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'gclid',
  'ttclid',
  'msclkid',
] as const;

const CLAVE = 'vendemia:atribucion';

export type Atribucion = Partial<Record<(typeof PARAMS)[number], string>>;

/**
 * Guarda la atribución de esta visita.
 *
 * ⚠️ VA EN `sessionStorage`, NO EN `localStorage`, Y NO ES INDIFERENTE.
 *
 * La atribución tiene que durar lo que dura la visita: entra por un anuncio,
 * baja la página, pulsa WhatsApp. Con `localStorage` sobreviviría semanas, así
 * que alguien que llegó por un anuncio en marzo y vuelve solo en junio te
 * seguiría marcando esa conversación como venida del anuncio. Eso no es
 * atribuir: es inflar la campaña con ventas que se habrían dado igual, y encima
 * te haría subir el presupuesto del anuncio equivocado.
 *
 * ⚠️ SOLO ESCRIBE SI HAY ALGO NUEVO. Si el visitante navega dentro de la
 * página, el segundo paso no debe borrar la atribución del primero.
 */
export function capturarAtribucion(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URLSearchParams(window.location.search);
    const nueva: Atribucion = {};
    for (const p of PARAMS) {
      const v = url.get(p);
      if (v) nueva[p] = v.slice(0, 120);
    }
    if (Object.keys(nueva).length === 0) return;
    window.sessionStorage.setItem(CLAVE, JSON.stringify(nueva));
  } catch {
    // Navegación privada, almacenamiento lleno o bloqueado. Se pierde la
    // atribución de esa visita y ya está: nunca debe romper la página.
  }
}

export function leerAtribucion(): Atribucion {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.sessionStorage.getItem(CLAVE) ?? '{}') as Atribucion;
  } catch {
    return {};
  }
}

/**
 * La coletilla que se añade al mensaje de WhatsApp.
 *
 * ⚠️ ESTO LO VA A LEER EL CLIENTE, no solo tú. Por eso no es un volcado de
 * parámetros: es una línea corta, separada del mensaje, que se lee como una
 * referencia administrativa y no como un código de seguimiento. Un mensaje que
 * empieza con "Hola, quiero probar Mia" y sigue con
 * `utm_source=meta&utm_campaign=...&fbclid=IwAR0x9f...` le dice al cliente que
 * lo estás rastreando antes de que hayáis hablado.
 *
 * Se quedan fuera los `*clid`: son cadenas larguísimas, no te dicen nada a
 * simple vista y son justo las que dan mal aspecto. Para atribuir te basta con
 * de dónde vino, qué campaña y qué anuncio.
 */
export function sufijoAtribucion(): string {
  const a = leerAtribucion();
  const partes = [a.utm_source, a.utm_campaign, a.utm_content].filter(Boolean) as string[];
  if (partes.length === 0) return '';
  const ref = partes
    .join(' · ')
    .replace(/[\n\r]/g, ' ')
    .slice(0, 80);
  return `\n\n— ref: ${ref}`;
}

/* ── Eventos ──────────────────────────────────────────────── */

type Fbq = (accion: string, evento: string, params?: Record<string, unknown>) => void;

declare global {
  interface Window {
    fbq?: Fbq & { callMethod?: (...args: unknown[]) => void; queue?: unknown[] };
    _fbq?: unknown;
  }
}

/**
 * Manda un evento al pixel. Si no hay pixel, no pasa nada.
 *
 * ⚠️ NUNCA metas aquí datos personales. El pixel viaja al navegador y de ahí a
 * Meta: un correo, un teléfono o el texto de una conversación en estos
 * parámetros es una cesión de datos personales a un tercero que ni el cliente
 * ha consentido ni la política de privacidad declara. Aquí solo van etiquetas
 * de la propia página: qué botón, de qué sección, de qué plan.
 */
export function evento(nombre: string, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || !window.fbq) return;
  try {
    window.fbq('track', nombre, params);
  } catch {
    // Un bloqueador de anuncios puede dejar `fbq` a medias. Que falle la
    // medición es aceptable; que falle el clic al botón de venta, no.
  }
}
