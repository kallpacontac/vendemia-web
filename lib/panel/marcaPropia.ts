/**
 * ══════════════════════════════════════════════════════════════════════════
 * MARCA PROPIA · la app del panel con el logo y el nombre del negocio
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Quien instala el panel en su celular ve, por defecto, «Vendemia» con nuestro
 * ícono. Con marca propia ve el nombre y el logo de SU negocio: en el ícono, en
 * la pantalla de carga, en los avisos y en el «Instalar» del panel.
 *
 * Se da A DEMANDA (planes de 6 meses o más), no a todos: por eso es una lista
 * aquí y no un ajuste del panel. Para dárselo a un negocio:
 *   1. node scripts/iconos-marca.mjs <logo.png> public/assets/<carpeta> [#fondo]
 *   2. una entrada abajo, con su companies.id.
 *   3. Quien ya tenía la app instalada la borra y la vuelve a instalar: es otra
 *      app (otro `id` en el manifest), la vieja se queda como «Vendemia».
 *
 * Lo lee el navegador (Instalable, BannerApp) y el servidor (el manifest de
 * app/panel-app y los avisos push). Solo datos: nada de consultas.
 */

export interface MarcaPropia {
  /** Nombre completo: el de la pantalla de carga y la lista de apps. */
  nombre: string;
  /** Lo que sale bajo el ícono. 12 letras o menos, o el celular lo corta. */
  corto: string;
  /** Fondo de la pantalla de carga: el mismo del logo. */
  fondo: string;
  /** Carpeta en public/ con los app-*.png de scripts/iconos-marca.mjs. */
  iconos: string;
}

const MARCAS: Record<string, MarcaPropia> = {
  // 19-nov-2026: lo pidieron sus barberos.
  the247barbershop: {
    nombre: 'The 24/7 Barber Shop',
    corto: 'The 24/7',
    fondo: '#000000',
    iconos: '/assets/the247',
  },
};

export function marcaDe(companyId: string | null | undefined): MarcaPropia | null {
  return companyId && Object.prototype.hasOwnProperty.call(MARCAS, companyId) ? MARCAS[companyId] : null;
}

/** El manifest que enlaza el panel para este negocio. */
export function manifestDe(companyId: string | null | undefined): string {
  return marcaDe(companyId) ? `/panel-app/${encodeURIComponent(companyId!)}/manifest.webmanifest` : '/panel.webmanifest';
}

/** Nombre de la app tal como se le dice a quien la instala. */
export const nombreApp = (companyId: string | null | undefined) => marcaDe(companyId)?.corto ?? 'Vendemia';

/** Ícono de 192 px: el del banner «Instalar» y el de los avisos. */
export const iconoApp = (companyId: string | null | undefined) => {
  const m = marcaDe(companyId);
  return m ? `${m.iconos}/app-192.png` : '/icons/panel-192.png';
};

/** El ícono de iPhone (apple-touch-icon), o null para dejar el de Vendemia. */
export const iconoIphone = (companyId: string | null | undefined) => {
  const m = marcaDe(companyId);
  return m ? `${m.iconos}/app-180.png` : null;
};

/** Ícono e iconito de la barra de estado para un aviso push de este negocio. */
export function iconosDeAviso(companyId: string | null | undefined): { icon: string; badge: string } | null {
  const m = marcaDe(companyId);
  return m ? { icon: `${m.iconos}/app-192.png`, badge: `${m.iconos}/app-badge-96.png` } : null;
}
