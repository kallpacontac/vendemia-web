/**
 * POST /api/pide/panel/publicar · vacía la caché de la página de un negocio.
 *
 * El panel guarda con la RPC (pide_pagina_guardar, con su sesión) y luego
 * llama aquí. Solo se invalida la página de un negocio del que el usuario es
 * miembro: se comprueba leyendo pide_paginas con SU token (RLS), no con
 * ninguna clave nuestra.
 */
import { revalidateTag } from 'next/cache';
import { deUsuario } from '@/modules/fideliza/servidor/supabase';
import { jwtDe } from '@/modules/fideliza/servidor/http';

export async function POST(req: Request) {
  const jwt = jwtDe(req);
  if (!jwt) return new Response(null, { status: 401 });
  let company = '';
  try {
    company = String(((await req.json()) as { company_id?: string }).company_id ?? '');
  } catch {
    return new Response(null, { status: 400 });
  }
  const { data } = await deUsuario(jwt).from('pide_paginas').select('slug').eq('company_id', company).maybeSingle();
  if (!data?.slug) return new Response(null, { status: 404 });
  revalidateTag(`pide:${data.slug}`);
  return new Response(null, { status: 204 });
}
