import type { MetadataRoute } from 'next';
import { ACTUALIZADO_ISO } from '@/lib/legal';
import { GUIAS_ACTUALIZADAS_ISO } from '@/lib/guias';
import { RUBROS } from '@/lib/rubros';

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
 * Las GUÍAS sí son rutas propias y sí van aquí: existen precisamente para que
 * Google las encuentre, y son las únicas páginas del sitio cuyo trabajo es
 * traer gente que todavía no sabe que existimos.
 *
 * Si algún día hay blog o páginas por rubro, se añaden a GUIAS y Search Console
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

/**
 * Las guías. Prioridad 0.8 —por debajo de la landing, muy por encima de las
 * legales— y 'monthly': cambian cuando se revisan los precios de mercado, que
 * es como mucho un par de veces al año, pero decirle a Google que las mire de
 * vez en cuando es barato y es lo que queremos.
 */
const GUIAS = [
  '/precios-chatbot-whatsapp-peru',
  '/responder-whatsapp-automatico-peru',
  '/whatsapp-business-api-peru',
  /**
   * Las de rubro salen de RUBROS y no escritas a mano: añadir un rubro nuevo
   * en lib/rubros.ts crea la página Y la mete en el sitemap. Una página que
   * existe y no está en el sitemap es una página que Google tarda semanas en
   * encontrar, y es el olvido más fácil de cometer.
   */
  ...RUBROS.map((r) => `/${r.slug}`),
];

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITIO,
      lastModified: LANDING_ACTUALIZADA,
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...GUIAS.map((ruta) => ({
      url: `${SITIO}${ruta}`,
      lastModified: GUIAS_ACTUALIZADAS_ISO,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    ...LEGALES.map((ruta) => ({
      url: `${SITIO}${ruta}`,
      lastModified: ACTUALIZADO_ISO,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ];
}
