import type { MetadataRoute } from 'next';

/**
 * /robots.txt — Next lo genera desde este fichero, por convención.
 *
 * Dice dos cosas: qué NO se rastrea, y dónde está el mapa del sitio. Lo segundo
 * es lo que más importa recién publicado: es la forma de que Google encuentre
 * la página sin esperar a que alguien la enlace.
 *
 * ⚠️ Lo que se bloquea aquí NO es una medida de seguridad. `robots.txt` es una
 * petición que los buscadores respetan por educación; cualquiera puede leerlo y
 * usarlo como índice de lo que existe. Lo que protege el panel es el RLS y la
 * cabecera `X-Robots-Tag: noindex` de next.config.mjs, que sí es una orden.
 * Esto solo evita que las pantallas de acceso salgan en las búsquedas.
 */
const SITIO = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://vendemias.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/panel',        // datos de clientes
        '/login',
        '/nueva-clave',
        '/callback',
        '/dev',          // inventario de assets, ya devuelve 404 en producción
      ],
    },
    sitemap: `${SITIO}/sitemap.xml`,
  };
}
