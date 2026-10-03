/**
 * El manifest de la PWA, acotado a /m/. start_url es la tarjeta de esta
 * persona: «Añadir a pantalla de inicio» abre SU tarjeta, no una genérica.
 */
import { rpc, servidor } from '@/modules/fideliza/servidor/supabase';


export async function GET(_req: Request, { params }: { params: { token: string } }) {
  if (!/^[A-Za-z0-9_-]{30,64}$/.test(params.token)) return new Response('No encontrado', { status: 404 });
  let nombre = 'Mi tarjeta';
  let color = '#FF4900';
  let icono = '/wallet/logo-vendemia-1024.png';
  try {
    const d = await rpc<{ status: string; brand?: { display_name: string; bg_color: string; logo_url: string | null } }>(
      servidor(),
      'loyalty_srv_card',
      { p_card_token: params.token, p_log: false },
    );
    if (d.status === 'ok' && d.brand) {
      nombre = d.brand.display_name;
      color = d.brand.bg_color;
      if (d.brand.logo_url) icono = d.brand.logo_url;
    }
  } catch {
    /* manifest genérico: la tarjeta sigue funcionando */
  }
  return Response.json(
    {
      name: `${nombre} · Mi tarjeta`,
      short_name: nombre.slice(0, 12),
      start_url: `/m/${params.token}`,
      scope: '/m/',
      display: 'standalone',
      background_color: '#F9F9F6',
      theme_color: color,
      icons: [{ src: icono, sizes: '512x512', type: 'image/png', purpose: 'any' }],
    },
    { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'private, no-store' } },
  );
}
