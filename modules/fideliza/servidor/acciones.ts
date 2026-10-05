import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { estadoConfiguracion } from './entorno';
import { rpc, servidor } from './supabase';
import { comprobarLogo } from './logo';
import { buscarLugares } from './lugares';
import { drenar } from './worker';
import { urlAyuda } from '../dominio/botones';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LAS ACCIONES DEL PANEL · /api/fideliza/panel/<acción>
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Cada una: esquema de entrada → RPC con la sesión del usuario. La RPC decide
 * si puede; aquí solo se valida la forma y se pone un límite. Nada de lo que
 * pasa por aquí tiene más poder que el usuario desde su navegador.
 */
const compania = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const uuid = z.string().uuid();
const idem = z.string().min(8).max(80).regex(/^[A-Za-z0-9_-]+$/);
const textoCorto = (max: number) => z.string().trim().max(max);
const urlHttps = z.string().trim().max(600).regex(/^https:\/\/\S+$/, 'https');

const borrador = z
  .object({
    rule_type: z.enum(['stamps', 'points', 'visits']).optional(),
    stamps_per_purchase: z.number().int().min(1).max(100).optional(),
    points_per_unit: z.number().int().min(1).max(10000).optional(),
    unit_cents: z.number().int().min(1).max(10_000_000).optional(),
    rounding: z.enum(['floor', 'round', 'ceil']).optional(),
    min_purchase_cents: z.number().int().min(0).max(10_000_000_000).optional(),
    reward_threshold: z.number().int().min(1).max(1_000_000).optional(),
    reward_description: textoCorto(80).optional(),
    reward_valid_days: z.number().int().min(1).max(3650).nullable().optional(),
    valid_to: z.string().datetime({ offset: true }).nullable().optional(),
    location_ids: z.array(uuid).max(50).nullable().optional(),
  })
  .strict();

const enlace = z
  .object({
    label: textoCorto(40).min(1),
    kind: z.enum(['url', 'join']),
    url: urlHttps.nullable().optional(),
    is_active: z.boolean().default(true),
    is_primary: z.boolean().default(false),
    icon: z.string().regex(/^[a-z_]{1,20}$/).nullable().optional(),
    subtitle: textoCorto(60).nullable().optional(),
    placement: z.enum(['button', 'social']).default('button'),
    starts_at: z.string().datetime({ offset: true }).nullable().optional(),
    ends_at: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .refine((l) => l.kind !== 'url' || Boolean(l.url), 'url');

type Ctx = { sb: SupabaseClient };
interface Accion<S extends z.ZodTypeAny> {
  esquema: S;
  /** Cubo de límite por usuario y máximo por minuto. */
  limite?: [string, number];
  ejecutar: (d: z.infer<S>, c: Ctx) => Promise<unknown>;
}
const accion = <S extends z.ZodTypeAny>(a: Accion<S>) => a;

export const ACCIONES = {
  // ── Configuración ──────────────────────────────────────────────────────
  'config.estado': accion({
    esquema: z.object({}).passthrough(),
    ejecutar: async () => estadoConfiguracion(),
  }),
  'logo.comprobar': accion({
    esquema: z.object({ url: urlHttps }),
    limite: ['logo', 10],
    ejecutar: async (d) => comprobarLogo(d.url),
  }),
  'ajustes.guardar': accion({
    esquema: z.object({
      companyId: compania,
      datos: z
        .object({
          slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/).optional(),
          display_name: textoCorto(60).min(1).optional(),
          tagline: textoCorto(120).optional(),
          logo_url: urlHttps.or(z.literal('')).optional(),
          bg_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
          support_url: z
            .preprocess((v) => {
              if (typeof v !== 'string' || !v.trim()) return v;
              return urlAyuda(v) || v.trim();
            }, urlHttps.or(z.literal('')))
            .optional(),
          require_external_ref: z.boolean().optional(),
          wallet_use_demo_class: z.boolean().optional(),
        })
        .strict(),
    }),
    ejecutar: async (d, { sb }) => {
      const guardado = await rpc<{ logo_url: string | null }>(sb, 'loyalty_settings_save', {
        p_company: d.companyId,
        p_data: d.datos,
      });
      let logo = null;
      if (d.datos.logo_url) {
        logo = await comprobarLogo(d.datos.logo_url);
        await rpc(servidor(), 'loyalty_srv_logo_checked', {
          p_company: d.companyId,
          p_url: d.datos.logo_url,
          p_result: logo,
        }).catch(() => undefined);
      }
      return { ajustes: guardado, logo };
    },
  }),
  /** Plantilla, foto de fondo, botones… de la página pública (sql/0008). */
  'estilo.guardar': accion({
    esquema: z.object({
      companyId: compania,
      estilo: z
        .object({
          plantilla: z.enum(['clasica', 'oscura', 'vidrio', 'foto', 'marco', 'color']),
          fondo: urlHttps.or(z.literal('')).optional(),
          botones: z.enum(['auto', 'relleno', 'contorno', 'vidrio']).optional(),
          forma: z.enum(['auto', 'pildora', 'redondeado', 'recto']).optional(),
          redes: z.enum(['auto', 'arriba', 'abajo']).optional(),
          categoria: textoCorto(60).optional(),
          place_id: z.string().max(200).regex(/^[A-Za-z0-9_-]*$/).optional(),
          place_nombre: textoCorto(120).optional(),
          historia: z.enum(['instagram', 'tiktok', '']).optional(),
        })
        .strict(),
    }),
    ejecutar: (d, { sb }) => rpc(sb, 'loyalty_page_style_save', { p_company: d.companyId, p_style: d.estilo }),
  }),
  /** Buscar el negocio en Google para armar solos los enlaces de reseñas y mapa. */
  'lugar.buscar': accion({
    esquema: z.object({ q: textoCorto(120).min(3) }),
    limite: ['lugar', 20],
    ejecutar: (d) => buscarLugares(d.q),
  }),
  'sucursal.guardar': accion({
    esquema: z.object({ companyId: compania, id: uuid.nullable(), name: textoCorto(60).min(1), active: z.boolean() }),
    ejecutar: (d, { sb }) =>
      rpc(sb, 'loyalty_location_save', { p_company: d.companyId, p_id: d.id, p_name: d.name, p_active: d.active }),
  }),
  'equipo.listar': accion({
    esquema: z.object({ companyId: compania }),
    ejecutar: (d, { sb }) => rpc(sb, 'loyalty_team_list', { p_company: d.companyId }),
  }),
  'equipo.rol': accion({
    esquema: z.object({
      companyId: compania,
      userId: z.string().min(1).max(64),
      role: z.enum(['manager', 'cashier', 'analyst']).nullable(),
      locations: z.array(uuid).max(50).nullable(),
    }),
    ejecutar: (d, { sb }) =>
      rpc(sb, 'loyalty_staff_set', { p_company: d.companyId, p_user: d.userId, p_role: d.role, p_locations: d.locations }),
  }),

  // ── Programa ───────────────────────────────────────────────────────────
  'programa.guardar': accion({
    esquema: z.object({
      companyId: compania,
      programId: uuid.nullable(),
      name: textoCorto(40).min(1),
      description: textoCorto(120),
      objective: z.enum(['repeat', 'frequency', 'ticket', 'winback']).nullable(),
      draft: borrador,
    }),
    ejecutar: (d, { sb }) =>
      rpc(sb, 'loyalty_program_save', {
        p_company: d.companyId,
        p_program: d.programId,
        p_name: d.name,
        p_description: d.description,
        p_objective: d.objective,
        p_draft: d.draft,
      }),
  }),
  'programa.publicar': accion({
    esquema: z.object({ companyId: compania, programId: uuid }),
    ejecutar: (d, { sb }) => rpc(sb, 'loyalty_program_publish', { p_company: d.companyId, p_program: d.programId }),
  }),
  'programa.estado': accion({
    esquema: z.object({ companyId: compania, programId: uuid, status: z.enum(['active', 'paused']) }),
    ejecutar: (d, { sb }) =>
      rpc(sb, 'loyalty_program_set_status', { p_company: d.companyId, p_program: d.programId, p_status: d.status }),
  }),

  // ── Miembros ───────────────────────────────────────────────────────────
  'miembro.crear': accion({
    esquema: z.object({
      companyId: compania,
      alias: textoCorto(40).optional(),
      phone: textoCorto(20).optional(),
      email: textoCorto(120).optional(),
      verified: z.boolean().default(false),
      creationKey: idem,
      via: z.enum(['panel', 'caja']),
    }),
    limite: ['alta', 30],
    ejecutar: (d, { sb }) =>
      rpc(sb, 'loyalty_member_create', {
        p_company: d.companyId,
        p_alias: d.alias ?? null,
        p_phone: d.phone || null,
        p_email: d.email || null,
        p_verified_in_person: d.verified,
        p_creation_key: d.creationKey,
        p_via: d.via,
      }),
  }),
  'miembro.buscar': accion({
    esquema: z.object({
      companyId: compania,
      q: textoCorto(120).default(''),
      status: z.enum(['active', 'suspended', 'deleted']).nullable().default(null),
      filter: z.enum(['all', 'reward', 'wallet', 'wallet_error', 'inactive30', 'active30', 'never']).default('all'),
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().min(0).max(1_000_000).default(0),
    }),
    ejecutar: (d, { sb }) =>
      rpc(sb, 'loyalty_member_search', {
        p_company: d.companyId,
        p_q: d.q,
        p_status: d.status,
        p_filter: d.filter,
        p_limit: d.limit,
        p_offset: d.offset,
      }),
  }),
  'miembro.ficha': accion({
    esquema: z.object({ companyId: compania, memberId: uuid }),
    ejecutar: (d, { sb }) => rpc(sb, 'loyalty_member_detail', { p_company: d.companyId, p_member: d.memberId }),
  }),
  'miembro.editar': accion({
    esquema: z.object({
      companyId: compania,
      memberId: uuid,
      alias: textoCorto(40),
      phone: textoCorto(20),
      email: textoCorto(120),
    }),
    ejecutar: (d, { sb }) =>
      rpc(sb, 'loyalty_member_update', {
        p_company: d.companyId,
        p_member: d.memberId,
        p_alias: d.alias,
        p_phone: d.phone || null,
        p_email: d.email || null,
      }),
  }),
  'miembro.verificar': accion({
    esquema: z.object({ companyId: compania, memberId: uuid, kind: z.enum(['phone', 'email']) }),
    ejecutar: (d, { sb }) =>
      rpc(sb, 'loyalty_member_verify', { p_company: d.companyId, p_member: d.memberId, p_kind: d.kind }),
  }),
  'miembro.estado': accion({
    esquema: z.object({
      companyId: compania,
      memberId: uuid,
      status: z.enum(['active', 'suspended']),
      reason: textoCorto(200),
    }),
    ejecutar: (d, { sb }) =>
      rpc(sb, 'loyalty_member_set_status', {
        p_company: d.companyId,
        p_member: d.memberId,
        p_status: d.status,
        p_reason: d.reason,
      }),
  }),
  'miembro.rotar': accion({
    esquema: z.object({ companyId: compania, memberId: uuid }),
    limite: ['rotar', 10],
    ejecutar: (d, { sb }) => rpc(sb, 'loyalty_member_rotate_card', { p_company: d.companyId, p_member: d.memberId }),
  }),
  'miembro.consentimiento': accion({
    esquema: z.object({
      companyId: compania,
      memberId: uuid,
      channel: z.enum(['push', 'whatsapp', 'email', 'sms']),
      granted: z.boolean(),
      source: z.enum(['panel', 'caja']),
    }),
    ejecutar: (d, { sb }) =>
      rpc(sb, 'loyalty_consent_set', {
        p_company: d.companyId,
        p_member: d.memberId,
        p_channel: d.channel,
        p_granted: d.granted,
        p_source: d.source,
      }),
  }),
  'miembro.exportar': accion({
    esquema: z.object({ companyId: compania, memberId: uuid }),
    limite: ['exportar', 10],
    ejecutar: (d, { sb }) => rpc(sb, 'loyalty_member_export', { p_company: d.companyId, p_member: d.memberId }),
  }),
  'miembro.borrar': accion({
    esquema: z.object({ companyId: compania, memberId: uuid, reason: textoCorto(200).min(3) }),
    ejecutar: (d, { sb }) =>
      rpc(sb, 'loyalty_member_erase', { p_company: d.companyId, p_member: d.memberId, p_reason: d.reason }),
  }),

  // ── Caja ───────────────────────────────────────────────────────────────
  'caja.buscar': accion({
    esquema: z.object({ companyId: compania, q: textoCorto(120).min(1) }),
    limite: ['buscar', 120],
    ejecutar: (d, { sb }) => rpc(sb, 'loyalty_lookup', { p_company: d.companyId, p_query: d.q }),
  }),
  'caja.registrar': accion({
    esquema: z.object({
      companyId: compania,
      memberId: uuid,
      kind: z.enum(['purchase', 'visit']),
      amountCents: z.number().int().min(0).max(10_000_000_000),
      locationId: uuid.nullable(),
      externalRef: textoCorto(64).nullable(),
      idempotencyKey: idem,
    }),
    limite: ['caja', 60],
    ejecutar: (d, { sb }) =>
      rpc(sb, 'loyalty_record', {
        p_company: d.companyId,
        p_member: d.memberId,
        p_kind: d.kind,
        p_amount_cents: d.amountCents,
        p_location: d.locationId,
        p_external_ref: d.externalRef || null,
        p_idempotency_key: d.idempotencyKey,
        p_source: 'caja',
      }),
  }),
  'caja.canjear': accion({
    esquema: z.object({
      companyId: compania,
      memberId: uuid,
      rewardId: uuid.nullable(),
      locationId: uuid.nullable(),
      idempotencyKey: idem,
    }),
    limite: ['caja', 60],
    ejecutar: (d, { sb }) =>
      rpc(sb, 'loyalty_redeem', {
        p_company: d.companyId,
        p_member: d.memberId,
        p_reward: d.rewardId,
        p_location: d.locationId,
        p_idempotency_key: d.idempotencyKey,
      }),
  }),
  'caja.devolver': accion({
    esquema: z.object({
      companyId: compania,
      transactionId: uuid,
      amountCents: z.number().int().min(1).max(10_000_000_000).nullable(),
      reason: textoCorto(200).min(3),
      idempotencyKey: idem,
    }),
    limite: ['caja', 60],
    ejecutar: (d, { sb }) =>
      rpc(sb, 'loyalty_refund', {
        p_company: d.companyId,
        p_transaction: d.transactionId,
        p_amount_cents: d.amountCents,
        p_reason: d.reason,
        p_idempotency_key: d.idempotencyKey,
      }),
  }),
  'caja.ajustar': accion({
    esquema: z.object({
      companyId: compania,
      memberId: uuid,
      units: z.number().int().min(-100000).max(100000),
      reason: textoCorto(200).min(3),
      idempotencyKey: idem,
    }),
    limite: ['caja', 60],
    ejecutar: (d, { sb }) =>
      rpc(sb, 'loyalty_adjust', {
        p_company: d.companyId,
        p_member: d.memberId,
        p_units: d.units,
        p_reason: d.reason,
        p_idempotency_key: d.idempotencyKey,
      }),
  }),
  conciliar: accion({
    esquema: z.object({ companyId: compania, fix: z.boolean() }),
    ejecutar: (d, { sb }) => rpc(sb, 'loyalty_reconcile', { p_company: d.companyId, p_fix: d.fix }),
  }),

  // ── Enlaces y placas ───────────────────────────────────────────────────
  'perfil.guardar': accion({
    esquema: z.object({
      companyId: compania,
      profileId: uuid.nullable(),
      name: textoCorto(60).min(1),
      title: textoCorto(60),
      tagline: textoCorto(120),
      links: z.array(enlace).max(40),
      makeDefault: z.boolean(),
    }),
    ejecutar: (d, { sb }) =>
      rpc(sb, 'loyalty_profile_save', {
        p_company: d.companyId,
        p_profile: d.profileId,
        p_name: d.name,
        p_title: d.title,
        p_tagline: d.tagline,
        p_links: d.links,
        p_make_default: d.makeDefault,
      }),
  }),
  'perfil.publicar': accion({
    esquema: z.object({ companyId: compania, profileId: uuid, allowEmpty: z.boolean() }),
    ejecutar: (d, { sb }) =>
      rpc(sb, 'loyalty_profile_publish', {
        p_company: d.companyId,
        p_profile: d.profileId,
        p_allow_empty: d.allowEmpty,
      }),
  }),
  'placa.crear': accion({
    esquema: z.object({
      companyId: compania,
      label: textoCorto(60),
      kind: z.enum(['nfc_qr', 'qr']),
      locationId: uuid.nullable(),
      profileId: uuid.nullable(),
    }),
    limite: ['placa', 30],
    ejecutar: (d, { sb }) =>
      rpc(sb, 'loyalty_device_create', {
        p_company: d.companyId,
        p_label: d.label,
        p_kind: d.kind,
        p_location: d.locationId,
        p_profile: d.profileId,
      }),
  }),
  'placa.reclamar': accion({
    esquema: z.object({ companyId: compania, code: textoCorto(20).min(6) }),
    // Bajo a propósito: es un código secreto y esto es lo que frena adivinarlo.
    limite: ['reclamar', 5],
    ejecutar: (d, { sb }) => rpc(sb, 'loyalty_device_claim', { p_company: d.companyId, p_code: d.code }),
  }),
  'placa.editar': accion({
    esquema: z.object({
      companyId: compania,
      deviceId: uuid,
      label: textoCorto(60),
      locationId: uuid.nullable(),
      profileId: uuid.nullable(),
    }),
    ejecutar: (d, { sb }) =>
      rpc(sb, 'loyalty_device_update', {
        p_company: d.companyId,
        p_device: d.deviceId,
        p_label: d.label,
        p_location: d.locationId,
        p_profile: d.profileId,
      }),
  }),
  'placa.estado': accion({
    esquema: z.object({
      companyId: compania,
      deviceId: uuid,
      status: z.enum(['active', 'suspended', 'retired', 'assigned']),
    }),
    ejecutar: (d, { sb }) =>
      rpc(sb, 'loyalty_device_set_status', { p_company: d.companyId, p_device: d.deviceId, p_status: d.status }),
  }),
  'placa.lote': accion({
    esquema: z.object({ count: z.number().int().min(1).max(500), batch: textoCorto(40).min(1), kind: z.enum(['nfc_qr', 'qr']) }),
    limite: ['lote', 5],
    ejecutar: (d, { sb }) =>
      rpc(sb, 'loyalty_admin_device_batch', { p_count: d.count, p_batch: d.batch, p_kind: d.kind }),
  }),

  // ── Campañas ───────────────────────────────────────────────────────────
  'campana.guardar': accion({
    esquema: z.object({
      companyId: compania,
      template: z.enum(['welcome', 'reward_available', 'return_reminder', 'winback']),
      status: z.enum(['draft', 'active', 'paused']),
      title: textoCorto(60).min(1),
      body: textoCorto(160).min(1),
      config: z.object({
        inactive_days: z.number().int().min(14).max(365).optional(),
        cycle_days: z.number().int().min(7).max(180).optional(),
        max_per_30d: z.number().int().min(1).max(4).optional(),
      }),
    }),
    ejecutar: (d, { sb }) =>
      rpc(sb, 'loyalty_campaign_save', {
        p_company: d.companyId,
        p_template: d.template,
        p_status: d.status,
        p_title: d.title,
        p_body: d.body,
        p_config: d.config,
      }),
  }),
  'campana.audiencia': accion({
    esquema: z.object({
      companyId: compania,
      template: z.enum(['welcome', 'reward_available', 'return_reminder', 'winback']),
      config: z.record(z.number().int()),
    }),
    ejecutar: (d, { sb }) =>
      rpc(sb, 'loyalty_campaign_audience', { p_company: d.companyId, p_template: d.template, p_config: d.config }),
  }),

  // ── Wallet, cola y métricas ────────────────────────────────────────────
  'wallet.resincronizar': accion({
    esquema: z.object({ companyId: compania, memberId: uuid.nullable() }),
    ejecutar: (d, { sb }) => rpc(sb, 'loyalty_wallet_resync', { p_company: d.companyId, p_member: d.memberId }),
  }),
  'outbox.reintentar': accion({
    esquema: z.object({ companyId: compania, id: z.number().int().positive() }),
    ejecutar: (d, { sb }) => rpc(sb, 'loyalty_outbox_retry', { p_company: d.companyId, p_id: d.id }),
  }),
  metricas: accion({
    esquema: z.object({
      companyId: compania,
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
    ejecutar: (d, { sb }) => rpc(sb, 'loyalty_metrics', { p_company: d.companyId, p_from: d.from, p_to: d.to }),
  }),
  /**
   * Drena la cola de ESTA compañía ahora, sin esperar al cron. Primero se
   * pregunta a Postgres, con la sesión del usuario, si es de su compañía: la
   * clave del servidor no se usa para nada que el usuario no pudiera pedir.
   */
  sincronizar: accion({
    esquema: z.object({ companyId: compania }),
    limite: ['sincronizar', 20],
    ejecutar: async (d, { sb }) => {
      const puede = await rpc<boolean>(sb, 'loyalty_can', { p_company: d.companyId, p_perm: 'members.read' });
      if (!puede) throw new Error('loyalty:forbidden');
      return drenar({ compania: d.companyId, lote: 10, tiempoMaxMs: 8000 });
    },
  }),
} as const;

export type NombreAccion = keyof typeof ACCIONES;
