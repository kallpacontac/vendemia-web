/**
 * POST /api/tu-pagina/publico/envio · el alta de un envío desde la página pública.
 *
 * El navegador no tiene ninguna clave: esta ruta añade la del servidor, limita
 * por IP y vuelve a validar todo. Postgres valida una tercera vez.
 */
import { z } from 'zod';
import { aGuardar, validarEnvio, type DatosEnvio } from '@/modules/tu-pagina/dominio/envio';
import { SLUG } from '@/modules/tu-pagina/dominio/config';
import { huellaIp, limitar, log, rpc, servidor } from '@/modules/tu-pagina/servidor/supabase';
import { paginaDe } from '@/modules/tu-pagina/servidor/pagina';

const Cuerpo = z.object({
  slug: z.string().regex(SLUG),
  idem: z.string().min(8).max(64),
  // El campo trampa: invisible para una persona, irresistible para un bot.
  web: z.string().max(0).optional(),
  datos: z.object({
    remitente_nombre: z.string().max(80),
    remitente_telefono: z.string().max(20),
    destinatario_nombre: z.string().max(80),
    destinatario_telefono: z.string().max(20),
    direccion: z.string().max(200),
    distrito: z.string().max(60),
    referencia: z.string().max(200),
    contenido: z.string().max(200),
    bultos: z.number().int(),
    peso_kg: z.string().max(10),
    contra_entrega: z.string().max(12),
    recojo_fecha: z.string().max(10),
    recojo_franja: z.enum(['manana', 'tarde']),
  }),
});

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function POST(req: Request) {
  const texto = await req.text();
  if (texto.length > 8_000) return responder({ status: 'datos_invalidos' }, 413);
  let parsed: z.infer<typeof Cuerpo>;
  try {
    parsed = Cuerpo.parse(JSON.parse(texto));
  } catch {
    return responder({ status: 'datos_invalidos' }, 400);
  }

  try {
    const ip = huellaIp(req);
    if (!(await limitar(`ip:${ip}:tu-pagina-envio`, 12, 3600))) return responder({ status: 'demasiados' }, 429);

    const pagina = await paginaDe(parsed.slug);
    if (!pagina?.secciones.envios) return responder({ status: 'not_found' }, 404);

    const datos = parsed.datos as DatosEnvio;
    const errores = validarEnvio(datos, { distritos: pagina.distritos });
    if (Object.keys(errores).length) return responder({ status: 'datos_invalidos', errores }, 400);

    const r = await rpc<{ status: string; codigo?: string }>(servidor(), 'envio_srv_crear', {
      p_slug: parsed.slug,
      p_datos: aGuardar(datos),
      p_idem: parsed.idem,
    });
    if (r.status !== 'ok') return responder(r, r.status === 'not_found' ? 404 : 400);
    return responder({ status: 'ok', codigo: r.codigo, whatsapp: pagina.whatsapp });
  } catch (e) {
    log('tu_pagina_envio_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
    return responder({ status: 'error' }, 503);
  }
}
