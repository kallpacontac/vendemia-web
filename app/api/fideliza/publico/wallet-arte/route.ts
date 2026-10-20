import sharp from 'sharp';
import { svgArteWallet } from '@/modules/fideliza/dominio/wallet-arte';
import { leerArteWallet } from '@/modules/fideliza/servidor/wallet/arte';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const datos = leerArteWallet(u.searchParams.get('d'), u.searchParams.get('s'));
  if (!datos) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const png = await sharp(Buffer.from(svgArteWallet(datos))).png({ compressionLevel: 9 }).toBuffer();
  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
