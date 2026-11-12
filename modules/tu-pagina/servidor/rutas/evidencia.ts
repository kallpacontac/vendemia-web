/**
 * ══════════════════════════════════════════════════════════════════════════
 * FOTO DEL PAGO DESDE EL PANEL · el dueño fotografía el Yape y se lee solo
 * ══════════════════════════════════════════════════════════════════════════
 *
 * POST /api/cobros/foto (multipart: companyId, archivo) con la sesión del panel. La antigua
 * /api/canchas/evidencia sigue apuntando aquí.
 * Guarda la foto en Cloudinary, la lee con la misma IA y las mismas reglas que la página
 * (comprobanteExterno.ts + evaluarLectura) y devuelve lo leído para rellenar el cobro.
 * NO registra ningún pago: eso lo hace quien cobra al confirmar (agenda_registrar_pago,
 * agenda_marcar_pagado o cancha_validar_pago, datos 0010), que vuelve a comprobar foto y
 * operación repetidas con el candado puesto.
 *
 * Quién puede: solo el dueño y el administrador de ESE negocio. La sesión se valida contra
 * el servidor de auth (getUser) y el permiso lo decide Postgres (v2_autorizar_agenda, la
 * misma puerta de comprobantes_panel). Las claves de Gemini, Claude y Cloudinary no salen
 * de aquí: el navegador solo recibe la URL de la foto y lo leído.
 */
import 'server-only';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { MENSAJES, evaluarLectura, tipoDeImagen } from '@/modules/tu-pagina/dominio/comprobante';
import { log } from '@/modules/tu-pagina/servidor/supabase';
import { guardarComprobante, leerComprobante, puedeLeer } from '@/modules/tu-pagina/servidor/comprobanteExterno';

const MB = 1024 * 1024;
const MAX_BYTES = 4 * MB;
const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const fallo = (mensaje: string, status = 400) => responder({ status: 'error', mensaje }, status);

/** Los números de Yape y Plin del negocio, de Ajustes. */
function numerosDe(raw: unknown): string[] {
  try {
    const lista = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(lista)) return [];
    return lista
      .filter((m) => m && (m.type === 'yape' || m.type === 'plin') && typeof m.number === 'string' && m.number.trim())
      .map((m) => String(m.number));
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  try {
    if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES + MB) return fallo(MENSAJES.archivoGrande, 413);
    const jwt = req.headers.get('authorization')?.replace(/^Bearer /i, '');
    if (!jwt) return fallo('Tu sesión terminó. Vuelve a entrar al panel.', 401);

    const form = await req.formData().catch(() => null);
    const companyId = String(form?.get('companyId') ?? '');
    const archivo = form?.get('archivo');
    if (!ID_VALIDO.test(companyId)) return fallo('Falta el negocio. Recarga el panel.');
    if (!(archivo instanceof Blob) || archivo.size === 0) return fallo(MENSAJES.archivoInvalido);
    if (archivo.size > MAX_BYTES) return fallo(MENSAJES.archivoGrande, 413);

    // Con el token del usuario y la clave anon: el RLS y los permisos de Postgres mandan.
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return fallo('Tu sesión terminó. Vuelve a entrar al panel.', 401);
    // Solo dueño y administrador de este negocio, y con «Comprobante al cobrar» encendido en
    // Configuración (cobro_foto_permiso, datos 0010). Sin la 0010, la puerta de antes: la de
    // «Por revisar» de canchas.
    let puerta = await sb.rpc('cobro_foto_permiso', { p_company: companyId });
    if (puerta.error && (puerta.error.code === 'PGRST202' || /cobro_foto_permiso/.test(puerta.error.message))) {
      puerta = await sb.rpc('comprobantes_panel', { p_company: companyId });
    }
    if (puerta.error) {
      const apagada = /apagada en Configuraci/.test(puerta.error.message);
      return fallo(apagada ? puerta.error.message : 'Solo el dueño o el administrador pueden registrar pagos.', 403);
    }

    const imagen = Buffer.from(await archivo.arrayBuffer());
    const tipo = tipoDeImagen(imagen);
    if (!tipo) return fallo(MENSAJES.archivoInvalido);
    const hash = createHash('sha256').update(imagen).digest('hex');

    const empresa = await sb.from('companies').select('payment_methods').eq('id', companyId).maybeSingle();
    const numeros = numerosDe((empresa.data as { payment_methods?: unknown } | null)?.payment_methods);

    const [lectura, url] = await Promise.all([
      puedeLeer() ? leerComprobante(imagen, tipo) : Promise.resolve(null),
      guardarComprobante(imagen, tipo, companyId),
    ]);
    if (!url) return fallo('No pudimos guardar la foto. Inténtalo otra vez en unos segundos.', 503);
    const { decision, motivo } = evaluarLectura(lectura, numeros);

    return responder({
      status: 'ok',
      url,
      hash,
      leida: Boolean(lectura),
      decision,
      motivo,
      monto: lectura?.monto ?? null,
      metodo: lectura?.app === 'yape' || lectura?.app === 'plin' ? lectura.app : '',
      operacion: lectura?.operacion ?? '',
      destino: lectura?.destino ?? '',
      fecha: lectura?.fechaHora ?? '',
    });
  } catch {
    log('evidencia_error', {});
    return fallo('No pudimos leer la foto. Inténtalo otra vez o escribe el monto a mano.', 500);
  }
}
