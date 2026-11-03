/**
 * POST /api/tu-pagina/publico/mesa · lo que se pide desde el QR de una mesa (sql/0015).
 *
 * El token del QR es la prueba de que están sentados ahí, y Postgres lo comprueba en
 * cada llamada. Los límites van por mesa y no solo por IP: una mesa de seis comparte
 * el wifi del local, y un QR fotografiado no debe poder llenar de avisos al salón.
 */
import { z } from 'zod';
import { TOKEN_MESA, documentoValido } from '@/modules/tu-pagina/dominio/mesa';
import { huellaIp, limitar, log, rpc, servidor } from '@/modules/tu-pagina/servidor/supabase';

const Token = z.string().regex(TOKEN_MESA);
const Disp = z.string().regex(/^[a-z0-9]{8,40}$/);

const Cuerpo = z.discriminatedUnion('accion', [
  z.object({
    accion: z.literal('llamar'),
    token: Token,
    tipo: z.enum(['mozo', 'cuenta', 'requerimiento', 'sugerencia', 'felicitacion']),
    detalle: z.string().max(1000).optional(),
    comprobante: z.enum(['boleta', 'factura']).optional(),
    documento: z.string().max(11).optional(),
    dividir: z.boolean().optional(),
    nombre: z.string().max(120).optional(),
    telefono: z.string().max(30).optional(),
    employeeId: z.string().max(80).optional(),
  }),
  z.object({ accion: z.literal('leer'), token: Token, disp: Disp }),
  z.object({
    accion: z.literal('agregar'),
    token: Token,
    disp: Disp,
    item: z.string().min(1).max(80),
    opcion: z.string().max(80),
    cantidad: z.number().int().min(1).max(20),
  }),
  z.object({ accion: z.literal('cantidad'), token: Token, disp: Disp, id: z.string().uuid(), cantidad: z.number().int().min(0).max(20) }),
  z.object({ accion: z.literal('pedir'), token: Token, nota: z.string().max(1000).optional() }),
]);

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const codigo = (status: string) =>
  status === 'ok' ? 200 : status === 'not_found' || status === 'no_existe' ? 404 : status === 'demasiados' ? 429 : status === 'vacio' ? 409 : 400;

export async function POST(req: Request) {
  const texto = await req.text();
  if (texto.length > 4_000) return responder({ status: 'datos_invalidos' }, 413);
  let c: z.infer<typeof Cuerpo>;
  try {
    c = Cuerpo.parse(JSON.parse(texto));
  } catch {
    return responder({ status: 'datos_invalidos' }, 400);
  }
  if (c.accion === 'llamar' && c.tipo === 'cuenta' && !c.dividir && !(c.comprobante && documentoValido(c.comprobante, c.documento ?? ''))) {
    return responder({ status: 'datos_invalidos' }, 400);
  }

  try {
    // Mirar el carrito es lo más frecuente (cada celular, cada 12 s): solo el límite por IP.
    const ip = huellaIp(req);
    if (!(await limitar(`ip:${ip}:tu-pagina-mesa`, 6000, 3600))) return responder({ status: 'demasiados' }, 429);
    if (c.accion === 'llamar' || c.accion === 'pedir') {
      if (!(await limitar(`mesa:${c.token}:llamar`, 40, 3600))) return responder({ status: 'demasiados' }, 429);
    } else if (c.accion !== 'leer') {
      if (!(await limitar(`mesa:${c.token}:carrito`, 400, 3600))) return responder({ status: 'demasiados' }, 429);
    }

    let r: { status: string };
    if (c.accion === 'llamar') {
      r = await rpc(servidor(), 'mesa_srv_llamar', {
        p_token: c.token,
        p_datos: {
          tipo: c.tipo, detalle: c.detalle ?? '', comprobante: c.comprobante ?? '', documento: c.documento ?? '',
          dividir: c.dividir ?? false, nombre: c.nombre ?? '', telefono: c.telefono ?? '', employee_id: c.employeeId ?? '',
        },
      });
    } else if (c.accion === 'pedir') {
      r = await rpc(servidor(), 'mesa_srv_pedir', { p_token: c.token, p_nota: c.nota ?? '' });
    } else {
      r = await rpc(servidor(), 'mesa_srv_carrito', {
        p_token: c.token,
        p_disp: c.disp,
        p_accion: c.accion,
        p_datos: c.accion === 'agregar'
          ? { catalog_id: c.item, variante_id: c.opcion, cantidad: c.cantidad }
          : c.accion === 'cantidad' ? { id: c.id, cantidad: c.cantidad } : {},
      });
    }
    return responder(r, codigo(r.status));
  } catch (e) {
    log('tu_pagina_mesa_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
    return responder({ status: 'error' }, 503);
  }
}
