/**
 * POST /api/tu-pagina/publico/avisame · «Avísame si se libera» desde la tabla de canchas.
 *
 * El cliente encuentra una cancha ocupada y deja nombre y celular para esa
 * cancha, ese día y esa hora. Se guarda en pagina_avisame (sql/0011) y el dueño
 * lo ve en Mi página → «Avísame»; él le escribe por WhatsApp si se libera.
 * Aquí no se manda nada a nadie.
 */
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { SLUG } from '@/modules/tu-pagina/dominio/config';
import { sumarDias } from '@/modules/tu-pagina/dominio/agenda';
import { armarEscaparate, validarCliente } from '@/modules/tu-pagina/dominio/tienda';
import { canchasDe, conCanchas, estadoCasilla, filasDelDia, plazoDe } from '@/modules/tu-pagina/dominio/canchas';
import { huellaIp, limitar, log, rpc, servidor } from '@/modules/tu-pagina/servidor/supabase';
import { paginaDe } from '@/modules/tu-pagina/servidor/pagina';
import { datosFrescos } from '@/modules/tu-pagina/servidor/escaparate';

const Cuerpo = z.object({
  slug: z.string().regex(SLUG),
  web: z.string().max(0).optional(),
  item: z.string().min(1).max(80),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
  nombre: z.string().max(80),
  telefono: z.string().max(20),
  /** La casilla «acepto que me escriban»: sin ella no se guarda nada. */
  acepta: z.literal(true),
});

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function POST(req: Request) {
  const texto = await req.text();
  if (texto.length > 2_000) return responder({ status: 'datos_invalidos' }, 413);
  let c: z.infer<typeof Cuerpo>;
  try {
    c = Cuerpo.parse(JSON.parse(texto));
  } catch {
    return responder({ status: 'datos_invalidos' }, 400);
  }
  const errores = validarCliente({ nombre: c.nombre, telefono: c.telefono });
  if (Object.keys(errores).length) return responder({ status: 'datos_invalidos', errores }, 400);

  try {
    if (!(await limitar(`ip:${huellaIp(req)}:tu-pagina-avisame`, 20, 3600))) return responder({ status: 'demasiados' }, 429);
    const pagina = await paginaDe(c.slug);
    if (!pagina || !conCanchas(pagina.secciones)) return responder({ status: 'not_found' }, 404);
    const crudos = await datosFrescos(c.slug);
    if (!crudos) return responder({ status: 'not_found' }, 404);
    const esc = armarEscaparate(crudos, pagina.secciones);
    const item = canchasDe(esc).find((cancha) => cancha.id === c.item);
    if (!item) return responder({ status: 'no_existe' }, 404);
    const fecha = c.inicio.slice(0, 10);
    if (![fecha, sumarDias(fecha, -1)].some((dia) => filasDelDia(esc.agenda, dia).includes(c.inicio))) {
      return responder({ status: 'datos_invalidos' }, 400);
    }
    const estado = estadoCasilla(esc.agenda, item, c.inicio, esc.ahora, plazoDe(pagina.secciones.canchas ?? {}));
    if (estado === 'libre') {
      revalidateTag(`tu-pagina:${c.slug.toLowerCase()}`);
      return responder({ status: 'libre' }, 409);
    }
    if (estado !== 'ocupada') return responder({ status: 'pasada' }, 409);
    const r = await rpc<{ status: string }>(servidor(), 'avisame_srv_crear', {
      p_slug: c.slug,
      p_datos: { catalog_id: c.item, slot_start: c.inicio, nombre: c.nombre.trim(), telefono: c.telefono },
    });
    return responder(r, r.status === 'ok' ? 200 : r.status === 'demasiados' ? 429 : 400);
  } catch (e) {
    log('tu_pagina_avisame_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
    return responder({ status: 'error' }, 503);
  }
}
