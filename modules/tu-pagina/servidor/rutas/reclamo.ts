/**
 * POST /api/tu-pagina/publico/reclamo · una hoja del Libro de Reclamaciones.
 *
 * Igual que los envíos: el navegador no tiene clave, aquí se limita por IP y
 * se valida, y Postgres (reclamo_srv_crear) vuelve a validar, numera la hoja
 * con su correlativo y calcula hasta cuándo hay para responder.
 */
import { z } from 'zod';
import { SLUG } from '@/modules/tu-pagina/dominio/config';
import { proveedorCompleto, validarHoja, type HojaNueva } from '@/modules/tu-pagina/dominio/reclamos';
import { huellaIp, limitar, log, rpc, servidor } from '@/modules/tu-pagina/servidor/supabase';
import { paginaDe } from '@/modules/tu-pagina/servidor/pagina';

const Cuerpo = z.object({
  slug: z.string().regex(SLUG),
  idem: z.string().min(8).max(64),
  // El campo trampa: invisible para una persona, irresistible para un bot.
  web: z.string().max(0).optional(),
  hoja: z.object({
    tipo: z.enum(['reclamo', 'queja']),
    consumidor: z.object({
      nombre: z.string().max(120),
      tipo_doc: z.enum(['DNI', 'CE', 'Pasaporte', 'RUC']),
      num_doc: z.string().max(20),
      domicilio: z.string().max(200),
      telefono: z.string().max(20),
      email: z.string().max(120),
      menor: z.boolean(),
      apoderado: z.string().max(120),
    }),
    bien: z.object({ tipo: z.enum(['producto', 'servicio']), descripcion: z.string().max(300), monto: z.string().max(12) }),
    detalle: z.string().max(3000),
    pedido: z.string().max(1500),
  }),
});

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function POST(req: Request) {
  const texto = await req.text();
  if (texto.length > 12_000) return responder({ status: 'datos_invalidos' }, 413);
  let c: z.infer<typeof Cuerpo>;
  try {
    c = Cuerpo.parse(JSON.parse(texto));
  } catch {
    return responder({ status: 'datos_invalidos' }, 400);
  }
  const hoja = c.hoja as HojaNueva;
  const errores = validarHoja(hoja);
  if (Object.keys(errores).length) return responder({ status: 'datos_invalidos', errores }, 400);

  try {
    if (!(await limitar(`ip:${huellaIp(req)}:tu-pagina-reclamo`, 6, 3600))) return responder({ status: 'demasiados' }, 429);
    const pagina = await paginaDe(c.slug);
    if (!pagina?.secciones.reclamos || !proveedorCompleto(pagina.secciones.proveedor)) return responder({ status: 'not_found' }, 404);

    const r = await rpc<{ status: string; numero?: number; fecha?: string; vence?: string }>(servidor(), 'reclamo_srv_crear', {
      p_slug: c.slug,
      p_idem: c.idem,
      p_datos: {
        ...hoja,
        consumidor: { ...hoja.consumidor, apoderado: hoja.consumidor.menor ? hoja.consumidor.apoderado : '' },
        bien: { ...hoja.bien, monto: hoja.bien.monto.trim().replace(',', '.') },
      },
    });
    if (r.status !== 'ok') return responder(r, r.status === 'not_found' ? 404 : r.status === 'demasiados' ? 429 : 400);
    return responder({ status: 'ok', numero: r.numero, fecha: r.fecha, vence: r.vence });
  } catch (e) {
    log('tu_pagina_reclamo_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
    return responder({ status: 'error' }, 503);
  }
}
