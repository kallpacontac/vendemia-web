/**
 * POST /api/tu-pagina/panel/reclamo-respuesta · manda por correo la respuesta
 * de una hoja del Libro de Reclamaciones.
 *
 * La hoja se lee con el token de quien llama (RLS: solo un miembro del negocio
 * la ve) y, si el correo sale, la constancia la anota reclamos_respuesta_enviada. Sin RESEND_API_KEY responde 'sin_correo' y el panel abre el
 * correo del dueño con el texto puesto.
 */
import { correoActivo, enviarCorreo } from '@/lib/correo';
import { deUsuario } from '@/modules/fideliza/servidor/supabase';
import { jwtDe, subDe } from '@/modules/fideliza/servidor/http';
import { limitar, log } from '@/modules/tu-pagina/servidor/supabase';
import { correoRespuesta } from '@/modules/tu-pagina/servidor/correosReclamo';
import type { Reclamo } from '@/modules/tu-pagina/dominio/reclamos';

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function POST(req: Request) {
  const jwt = jwtDe(req);
  if (!jwt) return responder({ status: 'sin_sesion' }, 401);
  let company = '';
  let id = '';
  try {
    const b = (await req.json()) as { company_id?: string; id?: string };
    company = String(b.company_id ?? '');
    id = String(b.id ?? '');
  } catch {
    return responder({ status: 'datos_invalidos' }, 400);
  }
  if (!company || !/^[0-9a-f-]{36}$/i.test(id)) return responder({ status: 'datos_invalidos' }, 400);
  if (!correoActivo()) return responder({ status: 'sin_correo' });

  try {
    if (!(await limitar(`u:${subDe(jwt)}:tu-pagina-reclamo-respuesta`, 30, 3600))) return responder({ status: 'demasiados' }, 429);
    const sb = deUsuario(jwt);
    const { data } = await sb.from('reclamos').select('*').eq('company_id', company).eq('id', id).maybeSingle();
    const r = data as Reclamo | null;
    if (!r) return responder({ status: 'no_existe' }, 404);
    if (r.estado !== 'respondido' || !r.respuesta) return responder({ status: 'sin_respuesta' }, 409);
    if (!r.consumidor.email) return responder({ status: 'sin_email' }, 409);

    // Primero sale el correo y después se anota: la constancia solo dice lo que de verdad salió.
    // La respuesta ya la escribió un dueño o admin (reclamos_responder); aquí solo se reenvía.
    const ok = await enviarCorreo(correoRespuesta(r));
    if (!ok) return responder({ status: 'error' }, 503);
    const { error } = await sb.rpc('reclamos_respuesta_enviada', { p_company: company, p_id: id });
    if (error) log('tu_pagina_reclamo_constancia_error', { code: error.code ?? 'x' });
    return responder({ status: 'ok' });
  } catch (e) {
    log('tu_pagina_reclamo_respuesta_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
    return responder({ status: 'error' }, 503);
  }
}
