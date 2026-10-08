import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { entorno } from '@/modules/fideliza/servidor/entorno';
import { cuerpo, desdeError, fallo, jwtDe, log, ok } from '@/modules/fideliza/servidor/http';
import { enviarPush, pushConfigurado } from '@/modules/fideliza/servidor/push';
import { deUsuario, rpc, servidor } from '@/modules/fideliza/servidor/supabase';
import { planificar, type EventoPendiente, type Resumen } from '../dominio/redactar';

/**
 * Las tres rutas de los avisos al dueño.
 *
 *   · POST /api/avisos/despachar — la llama la BASE (pg_cron + pg_net, cada
 *     minuto y solo si hay algo) con `Authorization: Bearer <CRON_SECRET>`.
 *     Pide lo pendiente, lo agrupa y lo envía.
 *   · GET  /api/avisos/clave — la clave VAPID pública, para suscribirse. No es
 *     secreta; se sirve así para no añadir otra variable NEXT_PUBLIC_.
 *   · POST /api/avisos/prueba — «Enviar aviso de prueba» al celular propio.
 *
 * Reutiliza la infraestructura de Fideliza (web-push, VAPID, la clave del
 * servidor que abre las RPC srv): un solo juego de secretos.
 */

function autorizadoCron(req: Request): boolean {
  const secreto = entorno.cronSecret();
  const dado = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (secreto.length < 16 || dado.length !== secreto.length) return false;
  return timingSafeEqual(Buffer.from(dado), Buffer.from(secreto));
}

export async function despachar(req: Request) {
  if (!autorizadoCron(req)) return fallo('forbidden', 401);
  if (!pushConfigurado()) return fallo('push_no_configurado', 503);
  try {
    const sb = servidor();
    const p = await rpc<{ eventos: EventoPendiente[]; resumenes: Resumen[] }>(sb, 'panel_push_srv_pendientes', {});
    const envios = planificar(p.eventos ?? [], p.resumenes ?? []);

    const enviados = new Set<string>();
    const caducados = new Set<string>();
    // Uno a uno por celular: cada aviso lleva su propio texto.
    await Promise.all(
      envios.map(async ({ destino, mensaje }) => {
        const r = await enviarPush([destino], mensaje as unknown as Record<string, unknown>);
        if (r.aceptados) enviados.add(destino.id);
        r.caducados.forEach((c) => caducados.add(c));
      }),
    );
    if (enviados.size || caducados.size) {
      await rpc(sb, 'panel_push_srv_resultado', { p_enviados: [...enviados], p_caducados: [...caducados] });
    }
    const balance = { eventos: p.eventos?.length ?? 0, resumenes: p.resumenes?.length ?? 0, envios: envios.length, aceptados: enviados.size, caducados: caducados.size };
    log('avisos.despachar', balance);
    return ok(balance);
  } catch (e) {
    return desdeError(e, 'avisos.despachar');
  }
}

export async function clave() {
  const v = entorno.vapidPublica();
  return v ? ok({ vapid: v }) : fallo('push_no_configurado', 503);
}

/**
 * Aviso de prueba al celular desde el que se pide. Lee SU suscripción con su
 * propio token (RLS: solo ve las suyas), así que no puede mandarle nada a otro.
 */
export async function prueba(req: Request) {
  const jwt = jwtDe(req);
  if (!jwt) return fallo('no_autorizado', 401);
  try {
    const { endpoint } = ((await cuerpo(req, 4000)) ?? {}) as { endpoint?: string };
    if (!endpoint || typeof endpoint !== 'string') return fallo('falta_endpoint');
    const { data, error } = await deUsuario(jwt)
      .from('panel_push_subscriptions')
      .select('endpoint, p256dh, auth, companies(name)')
      .eq('endpoint', endpoint)
      .is('revoked_at', null)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return fallo('sin_suscripcion', 404);
    const negocio = (data as { companies?: { name?: string } | null }).companies?.name;
    const r = await enviarPush([data as { endpoint: string; p256dh: string; auth: string }], {
      title: `${negocio ? `${negocio} · ` : ''}Avisos activados`,
      body: 'Así te llegará cuando haya un pago por revisar o una reserva nueva.',
      url: '/panel/configuracion?avisos=1',
      tag: 'prueba',
    });
    return r.aceptados ? ok({ enviado: true }) : fallo('no_aceptado', 502, { detalle: r.error, caducado: r.caducados.length > 0 });
  } catch (e) {
    return desdeError(e, 'avisos.prueba');
  }
}
