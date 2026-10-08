/**
 * Activar los avisos de ESTE celular para un negocio, en un solo paso.
 *
 * Lo usan el aviso de abajo (BannerApp) y la tarjeta de Ajustes
 * (AvisosCelular): la misma suscripción, con las mismas preferencias por
 * defecto, venga de donde venga. Solo cliente.
 *
 * ⚠️ Hay que llamarlo desde un toque del usuario: el navegador solo deja pedir
 * el permiso de notificaciones en respuesta a un gesto.
 */
import { supabase } from '@/lib/supabase/client';

export interface FilaAvisos {
  id: string;
  prefs: Record<string, boolean>;
  silencio_desde: string | null;
  silencio_hasta: string | null;
}

/** ¿Este navegador puede recibir avisos? (En iPhone, solo desde la app instalada.) */
export const soportaAvisos = (): boolean =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const b64 = (s: string) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export async function registroPanel(): Promise<ServiceWorkerRegistration> {
  return (
    (await navigator.serviceWorker.getRegistration('/panel')) ??
    (await navigator.serviceWorker.register('/panel-sw.js', { scope: '/panel' }))
  );
}

/** La suscripción de este celular para ese negocio, si ya está activa. */
export async function suscripcionActual(companyId: string): Promise<{ endpoint: string; fila: FilaAvisos | null } | null> {
  if (!soportaAvisos()) return null;
  const sub = await (await registroPanel()).pushManager.getSubscription();
  if (!sub) return null;
  const { data } = await supabase()
    .from('panel_push_subscriptions')
    .select('id, prefs, silencio_desde, silencio_hasta')
    .eq('endpoint', sub.endpoint)
    .eq('company_id', companyId)
    .is('revoked_at', null)
    .maybeSingle();
  return { endpoint: sub.endpoint, fila: (data as FilaAvisos | null) ?? null };
}

export type ResultadoActivar =
  | { ok: true; endpoint: string; fila: FilaAvisos }
  | { ok: false; motivo: 'denegado' | 'error'; mensaje?: string };

/** Pide permiso, se suscribe y guarda. Termina mandando el aviso de prueba. */
export async function activarAvisos(companyId: string): Promise<ResultadoActivar> {
  try {
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') return { ok: false, motivo: 'denegado' };
    const r = await fetch('/api/avisos/clave');
    const { vapid } = (await r.json()) as { vapid?: string };
    if (!vapid) return { ok: false, motivo: 'error', mensaje: 'Los avisos no están configurados en el servidor.' };
    const reg = await registroPanel();
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(vapid) }));
    const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const { data, error } = await supabase()
      .from('panel_push_subscriptions')
      .upsert(
        {
          company_id: companyId,
          endpoint: j.endpoint,
          p256dh: j.keys.p256dh,
          auth: j.keys.auth,
          user_agent: navigator.userAgent.slice(0, 300),
          revoked_at: null,
        },
        { onConflict: 'endpoint,company_id' },
      )
      .select('id, prefs, silencio_desde, silencio_hasta')
      .single();
    if (error) throw error;
    void enviarPrueba(j.endpoint);
    return { ok: true, endpoint: j.endpoint, fila: data as FilaAvisos };
  } catch (e) {
    return { ok: false, motivo: 'error', mensaje: e instanceof Error ? e.message : undefined };
  }
}

export async function enviarPrueba(endpoint: string): Promise<boolean> {
  const { data } = await supabase().auth.getSession();
  const r = await fetch('/api/avisos/prueba', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify({ endpoint }),
  });
  return r.ok;
}
