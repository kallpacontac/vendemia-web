import type { MetadataRoute } from 'next';

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
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...LEGALES.map((ruta) => ({
      url: `${SITIO}${ruta}`,
      lastModified: new Date(),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ];
}
