/**
 * Los iconos de la página pública, como SVG en texto (sirven igual en el HTML
 * del servidor que en la vista previa del panel).
 *
 * Las marcas salen de simple-icons (logos oficiales, licencia CC0): Instagram
 * tiene que verse como Instagram. Los genéricos (web, carta, ubicación…) son
 * trazos sencillos de 24×24 en el mismo estilo que el resto del panel.
 */
import {
  siFacebook,
  siGoogle,
  siInstagram,
  siSpotify,
  siTelegram,
  siTiktok,
  siWhatsapp,
  siX,
  siYoutube,
} from 'simple-icons';

const marca = (path: string) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${path}"/></svg>`;
const trazo = (d: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICONOS: Record<string, string> = {
  instagram: marca(siInstagram.path),
  tiktok: marca(siTiktok.path),
  facebook: marca(siFacebook.path),
  youtube: marca(siYoutube.path),
  x: marca(siX.path),
  whatsapp: marca(siWhatsapp.path),
  telegram: marca(siTelegram.path),
  spotify: marca(siSpotify.path),
  resenas: marca(siGoogle.path),
  maps: trazo('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'),
  carta: trazo('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>'),
  web: trazo('<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'),
  enlace: trazo('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
  tarjeta: trazo('<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>'),
  flecha: trazo('<polyline points="9 18 15 12 9 6"/>'),
};

export const icono = (tipo: string) => ICONOS[tipo] ?? ICONOS.enlace;
