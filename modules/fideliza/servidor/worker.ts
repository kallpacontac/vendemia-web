import 'server-only';
import { randomUUID } from 'crypto';
import { FaltaConfiguracion } from './entorno';
import { log } from './http';
import { enviarPush, type Suscripcion } from './push';
import { rpc, servidor } from './supabase';
import { esPermanente, sanear, sincronizarClase, sincronizarObjeto } from './wallet/sincronizar';

/**
 * EL WORKER DEL OUTBOX.
 *
 * Reclama un lote pequeño (SKIP LOCKED en la base: dos workers a la vez no
 * cogen lo mismo), lo procesa y apunta el resultado. Lo llaman:
 *
 *   · el cron de Vercel (/api/fideliza/cron), para todas las compañías;
 *   · el panel después de una operación o con «Sincronizar ahora», para la
 *     compañía del usuario — así Wallet se actualiza en segundos sin esperar
 *     al cron, y si esa llamada se pierde, el trabajo sigue en la cola.
 *
 * Nada se queda «en memoria después de responder»: si el proceso muere a
 * mitad, el trabajo vuelve a la cola a los 10 minutos (loyalty_srv_outbox_claim).
 */
interface Trabajo {
  id: number;
  company_id: string | null;
  kind: 'wallet.class.sync' | 'wallet.object.sync' | 'push.send';
  payload: Record<string, string>;
  attempts: number;
}

export interface Balance {
  procesados: number;
  ok: number;
  fallidos: number;
}

export async function drenar(opciones: { compania?: string; lote?: number; tiempoMaxMs?: number } = {}): Promise<Balance> {
  const sb = servidor();
  const worker = `w-${randomUUID().slice(0, 8)}`;
  const fin = Date.now() + (opciones.tiempoMaxMs ?? 20_000);
  const b: Balance = { procesados: 0, ok: 0, fallidos: 0 };

  while (Date.now() < fin) {
    const lote = await rpc<Trabajo[]>(sb, 'loyalty_srv_outbox_claim', {
      p_worker: worker,
      p_limit: opciones.lote ?? 10,
      p_company: opciones.compania ?? null,
    });
    if (!lote?.length) break;
    for (const t of lote) {
      b.procesados++;
      const r = await procesar(t);
      await rpc(sb, 'loyalty_srv_outbox_finish', {
        p_id: t.id,
        p_ok: r.ok,
        p_error: r.error ?? null,
        p_permanent: r.permanente ?? false,
        p_retry_at: r.reprogramar ?? null,
        p_result: r.resultado ?? null,
      });
      if (r.ok) b.ok++;
      else b.fallidos++;
    }
  }
  if (b.procesados) log('outbox_drain', { worker, compania: opciones.compania ?? '*', ...b });
  return b;
}

interface Resultado {
  ok: boolean;
  error?: string;
  permanente?: boolean;
  reprogramar?: string;
  resultado?: Record<string, unknown>;
}

async function procesar(t: Trabajo): Promise<Resultado> {
  try {
    switch (t.kind) {
      case 'wallet.class.sync': {
        const r = await sincronizarClase(t.payload.program_id);
        return { ok: true, resultado: { cambiado: r.cambiado } };
      }
      case 'wallet.object.sync': {
        const hay = await sincronizarObjeto(t.payload.member_id);
        return { ok: true, resultado: { sin_pase: !hay } };
      }
      case 'push.send':
        return await procesarPush(t);
    }
  } catch (e) {
    if (e instanceof FaltaConfiguracion) {
      return { ok: false, error: `No configurado: ${e.variable}`, permanente: true };
    }
    log('outbox_job_failed', { id: t.id, kind: t.kind, intento: t.attempts });
    return { ok: false, error: sanear(e), permanente: esPermanente(e) };
  }
}

interface Preparado {
  send: boolean;
  reason?: string;
  reschedule_at?: string;
  campaign_id?: string;
  member_id?: string;
  title?: string;
  body?: string;
  brand?: { display_name: string; logo_url: string | null };
  subscriptions?: Suscripcion[];
}

async function procesarPush(t: Trabajo): Promise<Resultado> {
  const sb = servidor();
  const p = await rpc<Preparado>(sb, 'loyalty_srv_push_prepare', { p_outbox: t.id });
  if (p.reschedule_at) return { ok: false, reprogramar: p.reschedule_at, error: 'fuera de horario (09:00–20:00)' };
  if (!p.send) return { ok: true, resultado: { omitido: p.reason } };
  const r = await enviarPush(p.subscriptions ?? [], {
    title: p.title,
    body: p.body,
    icon: p.brand?.logo_url ?? undefined,
    campaign_id: p.campaign_id,
  });
  await rpc(sb, 'loyalty_srv_push_result', {
    p_member: p.member_id,
    p_campaign: p.campaign_id,
    p_accepted: r.aceptados,
    p_gone: r.caducados.length ? r.caducados : null,
    p_error: r.error,
  });
  // Aceptado por el servicio de push del navegador ≠ entregado ni leído.
  return r.aceptados > 0 || !r.error
    ? { ok: true, resultado: { aceptados: r.aceptados, caducados: r.caducados.length } }
    : { ok: false, error: r.error ?? 'sin aceptar' };
}
