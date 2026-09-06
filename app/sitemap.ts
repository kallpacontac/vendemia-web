import type { MetadataRoute } from 'next';
import { ACTUALIZADO_ISO } from '@/lib/legal';

/**
 * /sitemap.xml — el mapa que se le entrega a Google Search Console.
 *
 * Hoy tiene UNA entrada, y no es un olvido: la landing es una sola página. Las
 * secciones son anclas (#pricing, #faq), no rutas, y un sitemap lleno de
 * fragmentos de la misma URL no aporta nada — Google los ignora.
 *
 * El panel no va aquí a propósito: son pantallas privadas detrás de sesión.
 * Listarlas sería publicar el índice de lo que hay que atacar, y además Google
 * solo vería la pantalla de carga.
 *
 * Si algún día hay blog o páginas por rubro, se añaden aquí y Search Console
 * las recoge en la siguiente pasada sin tocar nada más.
 */
const SITIO = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://vendemias.com';

/**
 * ⚠️ FECHAS A MANO, NO `new Date()`.
 *
 * Con `new Date()` el `lastmod` era la hora del BUILD, así que cada despliegue
 * —aunque solo tocara el panel, que ni siquiera está en el sitemap— le decía a
 * Google que las cuatro páginas legales habían cambiado. Un `lastmod` que
 * miente unas cuantas veces deja de servir para lo único que sirve: Google lo
 * ignora y vuelve a rastrear cuando le parece.
 *
 * Es el mismo motivo por el que `ACTUALIZADO` está escrito a mano en
 * lib/legal.ts. Cuándo cambió el texto solo lo sabe quien lo cambia.
 *
 * Sube esta fecha cuando cambies la landing de verdad (secciones, copy, oferta),
 * no cuando toques el panel o un estilo.
 */
const LANDING_ACTUALIZADA = '2026-09-06';

/**
 * Las paginas legales SI van al sitemap, aunque no sean comerciales.
 *
 * Dos motivos. Uno, que existan indexadas es parte de parecer —y ser— un
 * negocio formal: quien duda antes de pagar S/89 al mes a una web que no
 * conoce, busca justamente esto. Y dos, el Libro de Reclamaciones tiene que
 * ser accesible de verdad, no solo estar enlazado en el pie.
 *
 * `changeFrequency: 'yearly'` y prioridad baja: cambian poco y no compiten con
 * la landing por la atencion del rastreador.
 */
const LEGALES = ['/terminos', '/privacidad', '/garantia', '/reclamaciones'];

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITIO,
      lastModified: LANDING_ACTUALIZADA,
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...LEGALES.map((ruta) => ({
      url: `${SITIO}${ruta}`,
      lastModified: ACTUALIZADO_ISO,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ];
}
