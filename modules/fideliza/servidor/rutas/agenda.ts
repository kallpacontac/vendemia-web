/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA AGENDA DENTRO DE LA PÁGINA DE ENLACES · /api/fideliza/publico/agenda
 * ══════════════════════════════════════════════════════════════════════════
 *
 * El botón «Reserva ahora» de la página de enlaces (fideliza.vendemias.com/n/…)
 * se abre en su sitio, como en Linktree + Calendly: ficha del servicio →
 * calendario → horas → datos → listo, sin salir de la página.
 *
 *   · GET ?slug=<agenda>  → lo que se puede reservar y las horas libres de los
 *     próximos días, con la MISMA regla que pinta Mi página (dominio/agenda.ts).
 *   · POST                → la reserva de Mi página tal cual
 *     (tu-pagina/servidor/rutas/reserva.ts): relee la agenda sin caché y la base
 *     decide con su candado. Aquí no hay una segunda regla que se desincronice.
 *
 * Vive bajo /api/fideliza/publico porque es lo único de /api que el host de
 * Fideliza deja pasar (servidor/hosts.ts).
 *
 * Cuando la reserva necesita algo que la tarjeta no pregunta (elegir sede entre
 * varias, pagar un adelanto con captura, canchas), responde `enLinea: false` y
 * la página abre la agenda completa como siempre.
 */
import 'server-only';
import { SLUG } from '@/modules/tu-pagina/dominio/config';
import { abreEl, agendaDeSede, horasLibres, sumarDias } from '@/modules/tu-pagina/dominio/agenda';
import { foto } from '@/modules/tu-pagina/dominio/tienda';
import { conCanchas } from '@/modules/tu-pagina/dominio/canchas';
import { montoAdelanto } from '@/modules/tu-pagina/dominio/adelantoCitas';
import { paginaDe } from '@/modules/tu-pagina/servidor/pagina';
import { escaparateDe } from '@/modules/tu-pagina/servidor/escaparate';
import { huellaIp, limitar, log, NO_CACHE } from '@/modules/fideliza/servidor/http';

/** Cuántos días hacia adelante se ofrecen (5 semanas: el mes que viene entero se ve). */
export const DIAS_AGENDA = 35;

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json', ...NO_CACHE } });

export async function GET(req: Request) {
  const slug = (new URL(req.url).searchParams.get('slug') ?? '').toLowerCase();
  if (!SLUG.test(slug)) return responder({ status: 'not_found' }, 404);
  try {
    if (!(await limitar(`ip:${huellaIp(req)}:agenda`, 60, 60))) return responder({ status: 'demasiados' }, 429);
    const pagina = await paginaDe(slug);
    if (!pagina?.secciones.reservar) return responder({ status: 'not_found' }, 404);
    const url = `https://agenda.vendemias.com/${slug}/reservar`;
    const esc = await escaparateDe(slug, pagina.secciones);
    const citas = (esc?.items ?? []).filter((i) => i.tipo === 'cita' && i.duracion > 0);
    const sedes = esc?.sedes ?? [];
    const conAdelanto = citas.some((i) => montoAdelanto(i.precio, esc?.adelantoCitas ?? 0) > 0);
    // Lo que la tarjeta no sabe preguntar: se abre la agenda completa.
    if (!esc || !citas.length || sedes.length > 1 || conAdelanto || conCanchas(pagina.secciones)) {
      return responder({ status: 'ok', enLinea: false, url });
    }
    const agenda = agendaDeSede(esc.agenda, sedes[0]);
    const dias = Array.from({ length: DIAS_AGENDA }, (_, i) => sumarDias(esc.hoy, i)).filter((f) => abreEl(agenda, f));
    // Las horas libres dependen solo de la duración: se calculan una vez por duración.
    const horas: Record<string, Record<string, string[]>> = {};
    for (const dur of new Set(citas.map((i) => i.duracion))) {
      const porDia: Record<string, string[]> = {};
      for (const f of dias) {
        const h = horasLibres(agenda, f, dur, null, esc.ahora).map((x) => x.inicio);
        if (h.length) porDia[f] = h;
      }
      horas[String(dur)] = porDia;
    }
    return responder({
      status: 'ok',
      enLinea: true,
      url,
      negocio: pagina.titulo,
      whatsapp: /^\d{8,15}$/.test(pagina.whatsapp ?? '') ? pagina.whatsapp : '',
      sede: sedes[0]?.nombre ?? '',
      hoy: esc.hoy,
      indicaciones: (esc.indicacionesCitas ?? []).slice(0, 4),
      items: citas.slice(0, 30).map((i) => ({
        id: i.id,
        nombre: i.nombre,
        descripcion: i.descripcion.slice(0, 280),
        precio: i.precio,
        duracion: i.duracion,
        foto: i.fotos[0] ? foto(i.fotos[0], 720) : '',
      })),
      horas,
    });
  } catch (e) {
    log('agenda_enlaces_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
    return responder({ status: 'error' }, 503);
  }
}

export { POST } from '@/modules/tu-pagina/servidor/rutas/reserva';
