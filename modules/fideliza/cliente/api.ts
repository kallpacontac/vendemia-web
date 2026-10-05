/**
 * ══════════════════════════════════════════════════════════════════════════
 * FIDELIZA EN EL PANEL · leer y escribir
 * ══════════════════════════════════════════════════════════════════════════
 *
 * LEER: directo a Supabase con la sesión, como el resto del panel. El RLS de
 * las tablas loyalty_* decide (modules/fideliza/sql/0002).
 *
 * ESCRIBIR: POST a /api/fideliza/panel/<acción> con el JWT. A diferencia del
 * resto del panel, aquí NO hay cola de `commands` ni bot por medio: Postgres es
 * la fuente de verdad de Fideliza, y la respuesta ya es el resultado
 * confirmado. Por eso la caja puede enseñar el saldo nuevo en cuanto vuelve.
 */
import { supabase } from '@/lib/supabase/client';
import { codigoDe, mensajeDe } from '../dominio/errores';
import { demoActivo } from '@/lib/panel/demo';

export class ErrorFideliza extends Error {
  constructor(
    public codigo: string,
    mensaje: string,
    public status: number,
  ) {
    super(mensaje);
  }
}

export async function accion<T = unknown>(nombre: string, datos: Record<string, unknown>): Promise<T> {
  if (demoActivo() && !['config.estado', 'metricas', 'miembro.buscar', 'miembro.ficha', 'caja.buscar', 'equipo.listar', 'campana.audiencia', 'logo.comprobar'].includes(nombre)) {
    throw new ErrorFideliza('demo', 'Estás en modo demo: no se guarda nada. Sal del modo demo para cambiar algo de verdad.', 0);
  }
  const { data } = await supabase().auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) throw new ErrorFideliza('unauthenticated', mensajeDe('unauthenticated'), 401);
  let r: Response;
  try {
    r = await fetch(`/api/fideliza/panel/${nombre}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify(datos),
    });
  } catch {
    throw new ErrorFideliza('offline', 'Sin conexión: no se envió. Revisa la red y vuelve a intentarlo.', 0);
  }
  const j = (await r.json().catch(() => ({}))) as { datos?: T; codigo?: string; error?: string };
  if (!r.ok) throw new ErrorFideliza(j.codigo ?? 'internal', j.error ?? mensajeDe(j.codigo), r.status);
  return j.datos as T;
}

/** Tras una operación: que Wallet se ponga al día ya, sin esperar al cron. No bloquea ni avisa. */
export function sincronizarEnSegundoPlano(companyId: string) {
  void accion('sincronizar', { companyId }).catch(() => undefined);
}

/** Una clave por intento de usuario. Se REUTILIZA si el mismo intento se reenvía. */
export const nuevaClave = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replace(
    /[^A-Za-z0-9_-]/g,
    '',
  );

export const mensaje = (e: unknown) => (e instanceof Error ? e.message : mensajeDe(codigoDe(String(e))));

// ── Lecturas por RLS ─────────────────────────────────────────────────────

export interface Ajustes {
  company_id: string;
  slug: string;
  display_name: string;
  tagline: string;
  logo_url: string | null;
  logo_checked: { ok?: boolean; errores?: string[]; avisos?: string[]; ancho?: number; alto?: number } | null;
  bg_color: string;
  support_url: string | null;
  default_profile_id: string | null;
  /** sql/0008. Puede no venir si la migración aún no se aplicó. */
  page_style?: Record<string, unknown> | null;
  require_external_ref: boolean;
  wallet_use_demo_class: boolean;
}

export interface Sucursal {
  id: string;
  name: string;
  is_active: boolean;
}

export interface Version {
  id: string;
  version: number;
  rule_type: 'stamps' | 'points' | 'visits';
  stamps_per_purchase: number;
  points_per_unit: number;
  unit_cents: number;
  rounding: 'floor' | 'round' | 'ceil';
  min_purchase_cents: number;
  reward_threshold: number;
  reward_description: string;
  reward_valid_days: number | null;
  valid_from: string;
  valid_to: string | null;
  location_ids: string[] | null;
}

export interface Programa {
  id: string;
  name: string;
  short_description: string;
  objective: string | null;
  status: 'draft' | 'active' | 'paused' | 'error';
  draft: Partial<Version> & { valid_to?: string | null };
  current_version_id: string | null;
  published_at: string | null;
  last_error: string | null;
}

export interface ClaseWallet {
  program_id: string;
  class_id: string | null;
  state: 'pending' | 'synced' | 'error';
  review_status: string | null;
  last_error: string | null;
  last_synced_at: string | null;
  is_demo: boolean;
}

export interface Perfil {
  id: string;
  name: string;
  title: string;
  tagline: string;
  published_version_id: string | null;
  updated_at: string;
}

export interface Enlace {
  id?: string;
  profile_id?: string;
  label: string;
  kind: 'url' | 'join';
  url: string | null;
  position?: number;
  is_active: boolean;
  is_primary: boolean;
  icon?: string | null;
  subtitle?: string | null;
  placement?: 'button' | 'social';
  starts_at: string | null;
  ends_at: string | null;
}

export interface VersionPublicada {
  id: string;
  profile_id: string;
  version: number;
  links: Enlace[];
  published_at: string;
}

export interface Placa {
  id: string;
  label: string;
  kind: 'nfc_qr' | 'qr';
  status: string;
  public_token: string;
  location_id: string | null;
  profile_id: string | null;
  created_at: string;
  activated_at: string | null;
  batch: string | null;
}

export interface Campana {
  id: string;
  template: 'welcome' | 'reward_available' | 'return_reminder' | 'winback';
  status: 'draft' | 'active' | 'paused';
  title: string;
  body: string;
  config: { inactive_days?: number; cycle_days?: number; max_per_30d?: number };
}

export interface TrabajoCola {
  id: number;
  kind: string;
  status: string;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

const sb = () => supabase();

async function lista<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

export const lecturas = {
  rol: async (companyId: string) => {
    const { data, error } = await sb().rpc('loyalty_role', { p_company: companyId });
    if (error) throw new Error(error.message);
    return (data as string | null) ?? null;
  },
  ajustes: async (companyId: string) => {
    const { data, error } = await sb().from('loyalty_settings').select('*').eq('company_id', companyId).maybeSingle();
    if (error) throw new Error(error.message);
    return data as Ajustes | null;
  },
  sucursales: (companyId: string) =>
    lista<Sucursal>(sb().from('loyalty_locations').select('id, name, is_active').eq('company_id', companyId).order('name')),
  programas: (companyId: string) =>
    lista<Programa>(sb().from('loyalty_programs').select('*').eq('company_id', companyId).order('created_at', { ascending: false })),
  versiones: (companyId: string, programId: string) =>
    lista<Version>(
      sb()
        .from('loyalty_program_versions')
        .select('*')
        .eq('company_id', companyId)
        .eq('program_id', programId)
        .order('version', { ascending: false }),
    ),
  clases: (companyId: string) => lista<ClaseWallet>(sb().from('loyalty_wallet_classes').select('*').eq('company_id', companyId)),
  perfiles: (companyId: string) =>
    lista<Perfil>(sb().from('loyalty_link_profiles').select('*').eq('company_id', companyId).order('created_at')),
  enlaces: (companyId: string) =>
    lista<Enlace>(sb().from('loyalty_links').select('*').eq('company_id', companyId).order('position')),
  publicadas: (companyId: string, ids: string[]) =>
    ids.length
      ? lista<VersionPublicada>(sb().from('loyalty_published_link_versions').select('*').eq('company_id', companyId).in('id', ids))
      : Promise.resolve([] as VersionPublicada[]),
  placas: (companyId: string) =>
    lista<Placa>(sb().from('loyalty_devices').select('*').eq('company_id', companyId).order('created_at', { ascending: false })),
  placa: async (companyId: string, id: string) => {
    const { data, error } = await sb().from('loyalty_devices').select('*').eq('company_id', companyId).eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data as Placa | null;
  },
  aperturasPlaca: (companyId: string, deviceId: string) =>
    lista<{ kind: string; source: string | null; created_at: string }>(
      sb()
        .from('loyalty_public_events')
        .select('kind, source, created_at')
        .eq('company_id', companyId)
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false })
        .limit(200),
    ),
  historialPlaca: (companyId: string, deviceId: string) =>
    lista<{ action: string; actor_kind: string; context: Record<string, unknown> | null; created_at: string }>(
      sb()
        .from('loyalty_audit_log')
        .select('action, actor_kind, context, created_at')
        .eq('company_id', companyId)
        .eq('entity_id', deviceId)
        .order('created_at', { ascending: false })
        .limit(50),
    ),
  /** Cuántos eventos públicos de un tipo desde una fecha. Solo cuenta: no trae filas. */
  contarEventos: async (companyId: string, kinds: string[], desde: string) => {
    const { count, error } = await sb()
      .from('loyalty_public_events')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('kind', kinds)
      .gte('created_at', desde);
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
  campanas: (companyId: string) => lista<Campana>(sb().from('loyalty_campaigns').select('*').eq('company_id', companyId)),
  cola: (companyId: string) =>
    lista<TrabajoCola>(
      sb()
        .from('loyalty_outbox')
        .select('id, kind, status, attempts, max_attempts, next_attempt_at, last_error, created_at, updated_at')
        .eq('company_id', companyId)
        .in('status', ['pending', 'retry', 'processing', 'dead'])
        .order('created_at', { ascending: false })
        .limit(50),
    ),
};
