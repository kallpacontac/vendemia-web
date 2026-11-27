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
 * Quién puede: el dueño y el administrador de ESE negocio, y el empleado solo si el negocio
 * tiene encendido «los empleados cobran» (datos 0012). La sesión se valida contra
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
import { rpc, servidor } from '@/modules/fideliza/servidor/supabase';
import { leerSinIA } from '@/modules/lector/servidor/ocr';
import { decisionSinIA } from '@/modules/lector/dominio/leerVoucher';

/** Lo que ve quien subió la foto, leída sin IA: lo que manda es el Yape que llegó al celular de cobros. */
function motivoSinIA(decision: 'aprobar' | 'revisar' | 'rechazar') {
  const motivo = decision === 'aprobar' ? 'Se compara con el Yape que llegó al celular de cobros.'
    : decision === 'rechazar' ? 'El pago no figura como completado.'
    : 'No se leyó bien: la caja la revisa.';
  return { decision, motivo };
}

/** ¿Tiene este negocio el celular de cobros conectado? Ante cualquier duda (sin la 0004, sin clave): no. */
async function conCelularDeCobros(companyId: string): Promise<boolean> {
  try {
    return (await rpc<boolean>(servidor(), 'lector_srv_conectado', { p_company: companyId })) === true;
  } catch {
    return false;
  }
}

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
      // Los motivos que escribe la base para que se lean tal cual (0010 y 0012).
      const dicible = /apagada en Configuraci|empleados no cobran|lleva su bot/.test(puerta.error.message);
      return fallo(dicible ? puerta.error.message : 'Solo el dueño o el administrador pueden registrar pagos.', 403);
    }

    const imagen = Buffer.from(await archivo.arrayBuffer());
    const tipo = tipoDeImagen(imagen);
    if (!tipo) return fallo(MENSAJES.archivoInvalido);
    const hash = createHash('sha256').update(imagen).digest('hex');

    const empresa = await sb.from('companies').select('payment_methods').eq('id', companyId).maybeSingle();
    const numeros = numerosDe((empresa.data as { payment_methods?: unknown } | null)?.payment_methods);

    // Con el celular de cobros conectado (lector 0004, Alvaro 26-nov: «si podemos no usar IA, para que
    // salga gratis»): la foto se lee SIN IA (Tesseract, aquí mismo). Lo que decide es que cuadre con el
    // Yape que llegó al celular, no la foto sola. Sin celular (The 24/7), como siempre.
    const sinIA = await conCelularDeCobros(companyId);
    const [lectura, url] = await Promise.all([
      sinIA ? leerSinIA(imagen) : puedeLeer() ? leerComprobante(imagen, tipo) : Promise.resolve(null),
      guardarComprobante(imagen, tipo, companyId),
    ]);
    if (!url) return fallo('No pudimos guardar la foto. Inténtalo otra vez en unos segundos.', 503);
    const { decision, motivo } = sinIA ? motivoSinIA(decisionSinIA(lectura)) : evaluarLectura(lectura, numeros);
    // Vendemia Caja (lector 0003): lo leído se guarda del lado del servidor, por la huella de la foto,
    // para comprobar que el Yape que elige el barbero es el de la foto. El navegador no lo puede escribir.
    // Sin celular de cobros la base no guarda nada; sin la 0003 falla y no pasa nada.
    if (lectura) {
      try {
        await rpc(servidor(), 'lector_srv_lectura', {
          p_company: companyId,
          p_hash: hash,
          p_monto: lectura.monto,
          p_fecha: lectura.fechaHora ?? '',
          p_codigo: lectura.codigoSeguridad ?? '',
          p_decision: decision,
        });
      } catch {
        // La foto sigue sirviendo para cobrar como siempre.
      }
    }

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
