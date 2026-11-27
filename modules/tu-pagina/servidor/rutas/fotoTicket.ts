/**
 * POST /api/agenda/foto-ticket (multipart: companyId, cita, archivo) con la sesión del panel.
 *
 * 25-nov-2026 (The 24/7): la foto opcional del voucher o del ticket que el barbero adjunta al
 * «Generar ticket» de Mi agenda. No es un cobro: no se lee con IA (no gasta consultas) ni
 * registra pago; solo se guarda en Cloudinary y se pega a la cita (tu-pagina 0037,
 * mi_agenda_ticket_foto), donde la ve quien cobra.
 *
 * Quién puede: cualquiera del equipo con acceso a la agenda (la misma puerta que «Llegó sin
 * cita»), y el barbero solo en SUS citas: eso lo decide Postgres con el token del usuario.
 */
import 'server-only';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { MENSAJES, tipoDeImagen } from '@/modules/tu-pagina/dominio/comprobante';
import { log } from '@/modules/tu-pagina/servidor/supabase';
import { guardarComprobante } from '@/modules/tu-pagina/servidor/comprobanteExterno';

const MB = 1024 * 1024;
const MAX_BYTES = 4 * MB;
const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const fallo = (mensaje: string, status = 400) => responder({ status: 'error', mensaje }, status);

export async function POST(req: Request) {
  try {
    if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES + MB) return fallo(MENSAJES.archivoGrande, 413);
    const jwt = req.headers.get('authorization')?.replace(/^Bearer /i, '');
    if (!jwt) return fallo('Tu sesión terminó. Vuelve a entrar al panel.', 401);

    const form = await req.formData().catch(() => null);
    const companyId = String(form?.get('companyId') ?? '');
    const cita = String(form?.get('cita') ?? '');
    const archivo = form?.get('archivo');
    // 26-nov-2026 (tu-pagina 0039): hasta dos fotos por ticket. Sin «orden», la primera.
    const orden = String(form?.get('orden') ?? '1') === '2' ? 2 : 1;
    if (!ID_VALIDO.test(companyId) || !ID_VALIDO.test(cita)) return fallo('Falta el ticket. Recarga el panel.');
    if (!(archivo instanceof Blob) || archivo.size === 0) return fallo(MENSAJES.archivoInvalido);
    if (archivo.size > MAX_BYTES) return fallo(MENSAJES.archivoGrande, 413);

    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return fallo('Tu sesión terminó. Vuelve a entrar al panel.', 401);
    // La puerta de «Llegó sin cita» (equipo incluido), antes de gastar una subida.
    const puerta = await sb.rpc('mi_agenda_sin_cita_datos', { p_company: companyId });
    if (puerta.error) return fallo('No tienes acceso a la agenda de este negocio.', 403);

    const imagen = Buffer.from(await archivo.arrayBuffer());
    const tipo = tipoDeImagen(imagen);
    if (!tipo) return fallo(MENSAJES.archivoInvalido);
    const hash = createHash('sha256').update(imagen).digest('hex');
    const url = await guardarComprobante(imagen, tipo, companyId);
    if (!url) return fallo('No pudimos guardar la foto. Inténtalo otra vez en unos segundos.', 503);

    // Pegarla a la cita, con el token del usuario: el barbero, solo a las suyas (0037).
    // La primera va por la de 4 argumentos (la 0037): funciona con y sin la 0039.
    const r = orden === 2
      ? await sb.rpc('mi_agenda_ticket_foto', { p_company: companyId, p_cita: cita, p_url: url, p_hash: hash, p_orden: 2 })
      : await sb.rpc('mi_agenda_ticket_foto', { p_company: companyId, p_cita: cita, p_url: url, p_hash: hash });
    if (r.error) {
      const sinMigracion = r.error.code === 'PGRST202' || /mi_agenda_ticket_foto/.test(r.error.message);
      const aviso = orden === 2 ? 'La segunda foto aún no está activada en este negocio.' : 'La foto del ticket aún no está activada en este negocio.';
      return fallo(sinMigracion ? aviso : r.error.message, sinMigracion ? 503 : 403);
    }
    return responder({ status: 'ok', url });
  } catch {
    log('foto_ticket_error', {});
    return fallo('No pudimos subir la foto. El ticket ya está hecho: inténtalo otra vez.', 500);
  }
}
