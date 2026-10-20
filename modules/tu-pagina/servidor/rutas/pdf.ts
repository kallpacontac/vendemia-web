/**
 * GET /<negocio>/catalogo.pdf · el catálogo en PDF, siempre con los precios de hoy.
 *
 * Es el enlace fijo que se comparte: no circulan PDFs viejos. Lo genera
 * servidor/pdf.tsx; aquí solo se decide si hay página y qué se manda.
 * La CDN lo guarda 10 minutos: generarlo cuesta, y un precio cambiado llega
 * como mucho 10 minutos tarde. `?descargar=1` (el botón del panel) lo baja
 * como archivo en vez de abrirlo.
 */
import { SLUG, urlPagina } from '@/modules/tu-pagina/dominio/config';
import { huellaIp, limitar, log, rpc, servidor } from '@/modules/tu-pagina/servidor/supabase';
import { paginaDe } from '@/modules/tu-pagina/servidor/pagina';
import { escaparateDe } from '@/modules/tu-pagina/servidor/escaparate';
import { catalogoPdf, type Mayor } from '@/modules/tu-pagina/servidor/pdf';

const noHay = () => new Response('No encontrado', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });

/** Lo del mayorista. Sin la 0005 aplicada, nada: el PDF sale igual. */
async function mayoristaDe(slug: string): Promise<Map<string, Mayor>> {
  try {
    const r = await rpc<{ status: string; filas?: (Mayor & { catalog_id: string })[] }>(servidor(), 'catalogo_mayorista_srv', { p_slug: slug });
    return new Map((r.filas ?? []).map((f) => [f.catalog_id, f]));
  } catch {
    return new Map();
  }
}

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug.toLowerCase();
  if (!SLUG.test(slug)) return noHay();
  try {
    const p = await paginaDe(slug);
    if (!p || !(p.secciones.catalogo || p.secciones.reservar)) return noHay();
    if (!(await limitar(`ip:${huellaIp(req)}:tu-pagina-pdf`, 30, 3600))) {
      return new Response('Demasiadas descargas. Prueba en un rato.', { status: 429 });
    }
    const [esc, mayor] = await Promise.all([escaparateDe(slug, p.secciones), mayoristaDe(slug)]);
    if (!esc) return noHay();
    const pdf = await catalogoPdf(p, esc, mayor, urlPagina(slug, esc.modo));
    const descargar = new URL(req.url).searchParams.has('descargar');
    return new Response(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `${descargar ? 'attachment' : 'inline'}; filename="catalogo-${slug}.pdf"`,
        'cache-control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600',
      },
    });
  } catch (e) {
    log('tu_pagina_pdf_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
    return new Response('No se pudo generar el catálogo. Prueba en un rato.', { status: 503 });
  }
}
