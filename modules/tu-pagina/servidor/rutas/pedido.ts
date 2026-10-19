/**
 * POST /api/tu-pagina/publico/pedido · el carrito, confirmado desde la página.
 *
 * El navegador manda qué y cuántos; el precio, el nombre y el stock los pone
 * Postgres desde el catálogo (pedido_srv_crear), con un candado por negocio
 * para que dos personas no se lleven la última unidad.
 */
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { SLUG } from '@/modules/tu-pagina/dominio/config';
import { validarCliente } from '@/modules/tu-pagina/dominio/tienda';
import { huellaIp, limitar, log, rpc, servidor } from '@/modules/tu-pagina/servidor/supabase';
import { paginaDe } from '@/modules/tu-pagina/servidor/pagina';

const Cuerpo = z.object({
  slug: z.string().regex(SLUG),
  idem: z.string().min(8).max(64),
  web: z.string().max(0).optional(),
  nombre: z.string().max(80),
  telefono: z.string().max(20),
  entrega: z.enum(['recojo', 'delivery']),
  direccion: z.string().max(200),
  referencia: z.string().max(200),
  lineas: z
    .array(z.object({ item: z.string().min(1).max(80), opcion: z.string().max(80), cantidad: z.number().int().min(1).max(99) }))
    .min(1)
    .max(30),
});

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function POST(req: Request) {
  const texto = await req.text();
  if (texto.length > 8_000) return responder({ status: 'datos_invalidos' }, 413);
  let c: z.infer<typeof Cuerpo>;
  try {
    c = Cuerpo.parse(JSON.parse(texto));
  } catch {
    return responder({ status: 'datos_invalidos' }, 400);
  }
  const errores = validarCliente({ nombre: c.nombre, telefono: c.telefono, direccion: c.direccion, conDelivery: c.entrega === 'delivery' });
  if (Object.keys(errores).length) return responder({ status: 'datos_invalidos', errores }, 400);

  try {
    const ip = huellaIp(req);
    if (!(await limitar(`ip:${ip}:tu-pagina-pedido`, 10, 3600))) return responder({ status: 'demasiados' }, 429);
    const pagina = await paginaDe(c.slug);
    if (!pagina?.secciones.catalogo) return responder({ status: 'not_found' }, 404);

    const r = await rpc<{ status: string; codigo?: string; total?: number; lineas?: unknown; producto?: string; quedan?: number }>(
      servidor(),
      'pedido_srv_crear',
      {
        p_slug: c.slug,
        p_idem: c.idem,
        p_datos: {
          nombre: c.nombre.trim(),
          telefono: c.telefono,
          entrega: c.entrega,
          direccion: c.entrega === 'delivery' ? c.direccion.trim() : '',
          referencia: c.entrega === 'delivery' ? c.referencia.trim() : '',
          lineas: c.lineas.map((l) => ({ catalog_id: l.item, variante_id: l.opcion, cantidad: l.cantidad })),
        },
      },
    );
    if (r.status !== 'ok') return responder(r, r.status === 'sin_stock' ? 409 : 400);
    revalidateTag(`tu-pagina:${c.slug.toLowerCase()}`);
    return responder({ status: 'ok', codigo: r.codigo, total: r.total, lineas: r.lineas });
  } catch (e) {
    log('tu_pagina_pedido_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
    return responder({ status: 'error' }, 503);
  }
}
