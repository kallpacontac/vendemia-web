/**
 * POST /api/tu-pagina/publico/reserva · separar una cita o un cupo desde la página.
 *
 * El navegador manda qué y cuándo. Aquí se relee la agenda SIN caché, se
 * decide el aforo con la misma regla que pintó la página (dominio/agenda.ts) y
 * Postgres, con un candado por negocio, cuenta lo ocupado y guarda. Si dos
 * personas tocan el último hueco a la vez, entra una y la otra recibe «lleno».
 *
 * Con la tabla de canchas encendida (dominio/canchas.ts) lo que se reserva con
 * hora es una cancha: se ocupa por separado y admite varios turnos seguidos. El
 * precio (día/noche) lo pone Postgres (v2_precio_cancha), con la misma regla que
 * pinta la tabla.
 */
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { SLUG } from '@/modules/tu-pagina/dominio/config';
import { agendaDeSede, decidir, pasoDelDia, sumarMin } from '@/modules/tu-pagina/dominio/agenda';
import { armarEscaparate, validarCliente } from '@/modules/tu-pagina/dominio/tienda';
import { MAX_TURNOS, canchaLibre, conCanchas, plazoDe } from '@/modules/tu-pagina/dominio/canchas';
import { huellaIp, limitar, log, rpc, servidor } from '@/modules/tu-pagina/servidor/supabase';
import { paginaDe } from '@/modules/tu-pagina/servidor/pagina';
import { datosFrescos, DIAS_GOOGLE } from '@/modules/tu-pagina/servidor/escaparate';
import { crearEvento, ocupadoDe } from '@/modules/agenda-google/servidor/google';
import { sumarDias } from '@/modules/tu-pagina/dominio/agenda';

const Cuerpo = z.object({
  slug: z.string().regex(SLUG),
  idem: z.string().min(8).max(64),
  web: z.string().max(0).optional(),
  item: z.string().min(1).max(80),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/).optional(),
  grupo: z.string().max(80).optional(),
  profesional: z.string().max(80).optional(),
  /** Canchas: cuántos turnos seguidos. */
  turnos: z.number().int().min(1).max(MAX_TURNOS).optional(),
  nombre: z.string().max(80),
  telefono: z.string().max(20),
  beneficiario: z.string().max(80).optional(),
  /** Citas: el nombre de la sede elegida (secciones.citas.sedes). */
  sede: z.string().max(60).optional(),
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
    const esc = armarEscaparate(crudos, pagina.secciones);
    const item = esc.items.find((i) => i.id === c.item);
    if (!item || item.tipo === 'producto') return responder({ status: 'no_existe' }, 404);

    let datos: Record<string, unknown>;
    if (item.tipo === 'grupo') {
      const g = item.grupos.find((x) => x.id === c.grupo);
      if (!g) return responder({ status: 'no_existe' }, 404);
      if (g.libres !== null && g.libres <= 0) return responder({ status: 'lleno' }, 409);
      datos = { tipo: 'grupo', slot_start: g.clave, capacidad: g.cupo, grupo: `${g.etiqueta}${g.etiqueta === g.cuando ? '' : ` (${g.cuando})`}` };
    } else if (conCanchas(pagina.secciones)) {
      if (!c.inicio) return responder({ status: 'datos_invalidos' }, 400);
      if (c.inicio <= sumarMin(esc.ahora, 30)) return responder({ status: 'pasada' }, 409);
      const minutos = item.duracion * (c.turnos ?? 1);
      if (!canchaLibre(esc.agenda, item.id, c.inicio, minutos, plazoDe(pagina.secciones.canchas ?? {}))) return responder({ status: 'lleno' }, 409);
      datos = { tipo: 'cancha', slot_start: c.inicio, minutos };
    } else {
      if (!c.inicio) return responder({ status: 'datos_invalidos' }, 400);
      const profesional = esc.pideProfesional && c.profesional ? c.profesional : null;
      if (profesional && !esc.agenda.equipo.some((e) => e.id === profesional)) return responder({ status: 'datos_invalidos' }, 400);
      if (c.inicio <= sumarMin(esc.ahora, 30)) return responder({ status: 'pasada' }, 409);
      // Con 2 o más sedes hay que decir en cuál (la página no deja seguir sin elegirla).
      const sedes = esc.sedes ?? [];
      if (sedes.length > 1 && !sedes.some((x) => x.nombre === c.sede)) return responder({ status: 'datos_invalidos' }, 400);
      // Y de ESA sede (tu-pagina 0034): el que trabaja en otra no se reserva aquí.
      const sedeDeLaCita = sedes.find((x) => x.nombre === c.sede);
      if (profesional && sedeDeLaCita && !agendaDeSede(esc.agenda, sedeDeLaCita).equipo.some((e) => e.id === profesional)) {
        return responder({ status: 'datos_invalidos' }, 400);
      }
      // Lo ocupado en su Google Calendar, sin caché: es la última palabra antes de guardar.
      const google = await ocupadoDe(c.slug.toLowerCase(), esc.hoy, sumarDias(esc.hoy, DIAS_GOOGLE));
      if (google.length) esc.agenda = { ...esc.agenda, ocupados: [...esc.agenda.ocupados, ...google] };
      const paso = pasoDelDia(esc.agenda, c.inicio.slice(0, 10));
      // Con sedes, el hueco se mira en la de la cita: su aforo y sus citas (agendaDeSede).
      const r = decidir({ ...agendaDeSede(esc.agenda, sedes.find((x) => x.nombre === c.sede)), paso }, c.inicio, item.duracion, profesional);
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
    let r = await rpc<{ status: string; codigo?: string; estado?: string }>(servidor(), 'agenda_srv_reservar', args);
    // Las canchas necesitan la agenda en la nube: reservas_web no sabe ocuparlas por separado.
    if (r.status === 'no_es_nube' && datos.tipo === 'cancha') return responder({ status: 'not_found' }, 404);
    if (r.status === 'no_es_nube') r = await rpc<{ status: string; codigo?: string; estado?: string }>(servidor(), 'reserva_srv_crear', args);
    if (r.status !== 'ok') return responder(r, r.status === 'lleno' || r.status === 'pasada' ? 409 : 400);
    revalidateTag(`tu-pagina:${c.slug.toLowerCase()}`);
    // La sede va aparte (sql/0023): la cita ya existe, así que un fallo aquí no la tumba, solo
    // queda sin sede y el dueño la ve «sin sede» en la Agenda.
    // Y es la última palabra del aforo por sede (sql/0025): con el candado del negocio, si otra
    // reserva acaba de llenar esa sede a esa hora, la base cancela esta y aquí se dice «lleno».
    if (datos.tipo === 'cita' && c.sede && r.codigo) {
      const s = await rpc<{ status: string }>(servidor(), 'cita_srv_sede', { p_slug: c.slug, p_codigo: r.codigo, p_telefono: c.telefono, p_sede: c.sede })
        .catch((e) => { log('tu_pagina_sede_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' }); return null; });
      if (s?.status === 'lleno') return responder({ status: 'lleno' }, 409);
    }
    // «20 % si reservas por aquí», una vez por celular (sql/0038). Antes de apartar: el adelanto se
    // calcula sobre el precio ya rebajado. Un fallo no tumba la reserva: queda a precio de carta.
    let descuento: { pct: number; precio: number; antes: number } | { usado: true } | undefined;
    if (datos.tipo === 'cita' && r.codigo && esc.descuentoWeb) {
      const d = await rpc<{ status: string; pct?: number; precio?: number; precio_antes?: number }>(servidor(), 'cita_srv_descuento_web', { p_slug: c.slug, p_codigo: r.codigo, p_telefono: c.telefono })
        .catch((e) => { log('tu_pagina_descuento_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' }); return null; });
      if (d?.status === 'ok' && d.pct) descuento = { pct: d.pct, precio: Number(d.precio), antes: Number(d.precio_antes) };
      else if (d?.status === 'usado') descuento = { usado: true };
    }
    // Apartada: cuánto tiempo tiene para pagar (sql/0024; sin ella, las 24 h de siempre y la
    // página no enseña plazo) y a dónde pagar (sin la 0017 o sin métodos: por WhatsApp).
    let plazo: { minutos: number; venceMs: number; vence: string } | undefined;
    if (r.estado === 'pending_payment' && datos.tipo === 'cita' && r.codigo) {
      const a = await rpc<{ status: string; plazo?: number; vence_ms?: number; vence?: string }>(servidor(), 'cita_srv_apartar', { p_slug: c.slug, p_codigo: r.codigo, p_telefono: c.telefono })
        .catch((e) => { log('tu_pagina_plazo_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' }); return null; });
      if (a?.status === 'ok' && a.plazo && a.vence_ms) plazo = { minutos: a.plazo, venceMs: Number(a.vence_ms), vence: String(a.vence ?? '').slice(11, 16) };
    }
    let metodos: { tipo: string; numero: string; titular: string }[] = [];
    if (r.estado === 'pending_payment') {
      try {
        metodos = (await rpc<{ status: string; metodos?: typeof metodos }>(servidor(), 'tu_pagina_srv_pago', { p_slug: c.slug })).metodos ?? [];
      } catch {
        metodos = [];
      }
    }
    // Y la cita, en su Google Calendar (con Meet si lo encendió). Un fallo aquí no tumba la reserva.
    let meet: string | undefined;
    if (datos.tipo === 'cita' && r.codigo) {
      const ev = await crearEvento(c.slug.toLowerCase(), {
        codigo: r.codigo,
        inicio: String(datos.slot_start),
        fin: String(datos.slot_end),
        servicio: item.nombre,
        nombre: c.nombre.trim(),
        telefono: c.telefono,
        apartada: r.estado === 'pending_payment',
      });
      meet = ev?.meet;
    }
    return responder({ status: 'ok', codigo: r.codigo, estado: r.estado, metodos, plazo, meet, descuento });
  } catch (e) {
    log('tu_pagina_reserva_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
    return responder({ status: 'error' }, 503);
  }
}
