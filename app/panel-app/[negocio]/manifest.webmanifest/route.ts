/**
 * El manifest del panel para un negocio con MARCA PROPIA (lib/panel/marcaPropia.ts):
 * su nombre y su logo en vez de los de Vendemia. Los demás usan public/panel.webmanifest.
 *
 * Público y sin sesión a propósito: el navegador pide el manifest sin cookies,
 * y lo único que dice (nombre y logo) ya está en la página del negocio.
 *
 * `id` distinto por negocio: para el celular es otra app, así que quien trabaja
 * en dos negocios puede tener las dos.
 */
import { marcaDe } from '@/lib/panel/marcaPropia';

export function GET(_req: Request, { params }: { params: { negocio: string } }) {
  const negocio = decodeURIComponent(params.negocio);
  const m = marcaDe(negocio);
  if (!m) return new Response('No encontrado', { status: 404 });
  return Response.json(
    {
      name: m.nombre,
      short_name: m.corto,
      description: `El panel de ${m.nombre}: agenda, caja y avisos.`,
      id: `/panel?negocio=${encodeURIComponent(negocio)}`,
      start_url: '/panel',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: m.fondo,
      // La barra de arriba sigue el fondo del panel (claro), como en Vendemia.
      theme_color: '#EAEAE8',
      lang: 'es-PE',
      icons: [
        { src: `${m.iconos}/app-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: `${m.iconos}/app-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: `${m.iconos}/app-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=300' } },
  );
}
