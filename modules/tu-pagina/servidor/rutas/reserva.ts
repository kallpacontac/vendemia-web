/**
 * POST /api/tu-pagina/publico/reserva · separar una cita o un cupo desde la página.
 *
 * El navegador manda qué y cuándo. Aquí se relee la agenda SIN caché, se
 * decide el aforo con la misma regla que pintó la página (dominio/agenda.ts) y
 * Postgres, con un candado por negocio, cuenta lo ocupado y guarda. Si dos
 * personas tocan el último hueco a la vez, entra una y la otra recibe «lleno».
 */
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { SLUG } from '@/modules/tu-pagina/dominio/config';
import { decidir, pasoDelDia, sumarMin } from '@/modules/tu-pagina/dominio/agenda';
import { armarEscaparate, validarCliente } from '@/modules/tu-pagina/dominio/tienda';
import { huellaIp, limitar, log, rpc, servidor } from '@/modules/tu-pagina/servidor/supabase';
import { paginaDe } from '@/modules/tu-pagina/servidor/pagina';
import { datosFrescos } from '@/modules/tu-pagina/servidor/escaparate';

const Cuerpo = z.object({
  slug: z.string().regex(SLUG),
  idem: z.string().min(8).max(64),
  web: z.string().max(0).optional(),
  item: z.string().min(1).max(80),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/).optional(),
  grupo: z.string().max(80).optional(),
  profesional: z.string().max(80).optional(),
  nombre: z.string().max(80),
  telefono: z.string().max(20),
  beneficiario: z.string().max(80).optional(),
});

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function POST(req: Request) {
  const texto = await req.text();
  if (texto.length > 4_000) return responder({ status: 'datos_invalidos' }, 413);
  let c: z.infer<typeof Cuerpo>;
  try {
    c = Cuerpo.parse(JSON.parse(texto));
  } catch {
    return responder({ status: 'datos_invalidos' }, 400);
  }
  const errores = validarCliente({ nombre: c.nombre, telefono: c.telefono });
  if (Object.keys(errores).length) return responder({ status: 'datos_invalidos', errores }, 400);

  try {
    const ip = huellaIp(req);
    if (!(await limitar(`ip:${ip}:tu-pagina-reserva`, 10, 3600))) return responder({ status: 'demasiados' }, 429);

    const pagina = await paginaDe(c.slug);
    if (!pagina?.secciones.reservar) return responder({ status: 'not_found' }, 404);
    const crudos = await datosFrescos(c.slug);
    if (!crudos) return responder({ status: 'not_found' }, 404);
    const esc = armarEscaparate(crudos);
    const item = esc.items.find((i) => i.id === c.item);
    if (!item || item.tipo === 'producto') return responder({ status: 'no_existe' }, 404);

    let datos: Record<string, unknown>;
    if (item.tipo === 'grupo') {
      const g = item.grupos.find((x) => x.id === c.grupo);
      if (!g) return responder({ status: 'no_existe' }, 404);
      if (g.libres !== null && g.libres <= 0) return responder({ status: 'lleno' }, 409);
      datos = { tipo: 'grupo', slot_start: g.clave, capacidad: g.cupo, grupo: `${g.etiqueta}${g.etiqueta === g.cuando ? '' : ` (${g.cuando})`}` };
    } else {
      if (!c.inicio) return responder({ status: 'datos_invalidos' }, 400);
      const profesional = esc.pideProfesional && c.profesional ? c.profesional : null;
      if (profesional && !esc.agenda.equipo.some((e) => e.id === profesional)) return responder({ status: 'datos_invalidos' }, 400);
      if (c.inicio <= sumarMin(esc.ahora, 30)) return responder({ status: 'pasada' }, 409);
      const paso = pasoDelDia(esc.agenda, c.inicio.slice(0, 10));
      const r = decidir({ ...esc.agenda, paso }, c.inicio, item.duracion, profesional);
      if (!r.ok) return responder({ status: 'lleno' }, 409);
      datos = {
        tipo: 'cita',
        slot_start: c.inicio,
        slot_end: sumarMin(c.inicio, item.duracion),
        paso,
        capacidad: r.capacidad,
        employee_id: profesional ?? '',
      };
    }

    const args = {
      p_slug: c.slug,
      p_idem: c.idem,
      p_datos: {
        ...datos,
        catalog_id: item.id,
        nombre: c.nombre.trim(),
        telefono: c.telefono,
        beneficiario: (c.beneficiario ?? '').trim(),
      },
    };
    // Con la agenda en la nube (0004) la reserva entra directo en la agenda real; si no, en reservas_web.
    let r = await rpc<{ status: string; codigo?: string }>(servidor(), 'agenda_srv_reservar', args);
    if (r.status === 'no_es_nube') r = await rpc<{ status: string; codigo?: string }>(servidor(), 'reserva_srv_crear', args);
    if (r.status !== 'ok') return responder(r, r.status === 'lleno' || r.status === 'pasada' ? 409 : 400);
    revalidateTag(`tu-pagina:${c.slug.toLowerCase()}`);
    return responder({ status: 'ok', codigo: r.codigo });
  } catch (e) {
    log('tu_pagina_reserva_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
    return responder({ status: 'error' }, 503);
  }
}
