/**
 * «Ya yapeé» en la página (lector 0002). Solo existe para negocios con el celular de cobros
 * conectado (Vendemia Caja): el pago lo confirma el aviso que llega a ese celular, sin captura ni IA.
 *
 *   GET  /api/tu-pagina/publico/ya-pague?slug=…   → {activo}: ¿enseñar «Ya yapeé» o la captura?
 *   POST /api/tu-pagina/publico/ya-pague {slug, codigo, telefono}
 *        → {estado: 'confirmada' | 'cobrada' | 'esperando' | 'sin_lector' | 'no_encontrada'}
 *        La página lo llama al tocar el botón y luego cada pocos segundos hasta 5 minutos.
 *
 * Como la captura: para tocar una reserva hay que saber su código Y el celular con que se hizo.
 */
import { SLUG } from '@/modules/tu-pagina/dominio/config';
import { huellaIp, limitar, log, rpc, servidor } from '@/modules/tu-pagina/servidor/supabase';

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? '';
  if (!SLUG.test(slug)) return responder({ activo: false });
  try {
    return responder({ activo: (await rpc<boolean>(servidor(), 'lector_srv_activo', { p_slug: slug })) === true });
  } catch {
    // Sin la SQL del lector, o la base no contesta: la página pide la captura como siempre.
    return responder({ activo: false });
  }
}

export async function POST(req: Request) {
  try {
    // 5 minutos preguntando cada 4 s son 75 llamadas: con 150 por 10 min caben dos reservas seguidas.
    if (!(await limitar(`ip:${huellaIp(req)}:tu-pagina-ya-pague`, 150, 600))) return responder({ estado: 'espera' }, 429);
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const slug = String(b.slug ?? '');
    const codigo = String(b.codigo ?? '').trim().toUpperCase();
    const telefono = String(b.telefono ?? '');
    if (!SLUG.test(slug) || !/^R-[0-9A-Z]{4}$/.test(codigo) || telefono.replace(/\D/g, '').length < 9) {
      return responder({ estado: 'no_encontrada' }, 400);
    }
    const r = await rpc<{ estado: string; pagado?: number; total?: number }>(servidor(), 'lector_srv_ya_pague', {
      p_slug: slug, p_codigo: codigo, p_telefono: telefono,
    });
    return responder(r);
  } catch (e) {
    log('ya_pague_error', { mensaje: e instanceof Error ? e.message : String(e) });
    return responder({ estado: 'error' }, 500);
  }
}
