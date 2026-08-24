/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOS TIPOS DEL CONTRATO · docs/contrato-backend.md
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Estas tablas son un ESPEJO del SQLite del bot, no un esquema diseñado para
 * Postgres. De ahí las tres rarezas que hay que tener en la cabeza siempre:
 *
 *   1 · Los booleanos son `number` (0/1). SQLite no tiene tipo booleano.
 *   2 · Toda fecha viene dos veces: `x_at` (epoch, bigint) y `x_ts`
 *       (timestamptz). Para mostrar y comparar, SIEMPRE `x_ts`; `x_at` solo
 *       para ordenar.
 *   3 · Los campos "JSON" son `text`, no `jsonb`. Hay que JSON.parse() al leer
 *       y JSON.stringify() al mandarlos en un patch. Ver parse.ts.
 *
 * Los tipos describen la fila CRUDA tal y como llega de PostgREST. Lo que las
 * pantallas consumen son los tipos ya masticados de queries.ts.
 */

/** 0 | 1 — un booleano de SQLite. Ver bool() en parse.ts. */
export type Bool01 = number;

export type BusinessMode = 'appointment' | 'recurring_appointment' | 'ecommerce';
export type LeadStatus = 'new' | 'contacted' | 'paid' | 'closed';
export type LeadIntent = 'purchase_ready' | 'quote' | 'inquiry' | 'support' | 'other';
export type AppointmentStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show';
export type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'delivered';
export type Rol = 'owner' | 'member';

export type ClaveDia =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

/** Un día del horario semanal. Un día AUSENTE del objeto = cerrado. */
export interface DiaHorario {
  open?: string;
  close?: string;
  closed?: boolean;
  slot_minutes?: number;
  capacity?: number;
}

export type Horario = Partial<Record<ClaveDia, DiaHorario>>;

export type TipoPago = 'yape' | 'plin' | 'bank_transfer' | 'cash' | 'cod';

export interface MetodoPago {
  type: TipoPago;
  number?: string;
  name?: string;
  qr_url?: string;
}

export interface CompanyRow {
  id: string;
  name: string;
  bot_name: string | null;
  bot_tone: string | null;
  business_mode: BusinessMode | null;
  /** JSON en text */
  schedule: string | null;
  /** JSON en text */
  payment_methods: string | null;
  custom_rules: string | null;
  return_policy: string | null;
  business_description: string | null;
  welcome_note: string | null;
  closing_note: string | null;
  hook_question: string | null;
  delivery_type: 'delivery' | 'pickup' | 'both' | null;
  location: string | null;
  slot_minutes: number | null;
  require_payment_to_confirm: Bool01 | null;
  request_location: Bool01 | null;
  owner_phone: string | null;
  admin_phone: string | null;
  whatsapp_phone: string | null;
  is_active: Bool01 | null;
  created_ts: string | null;
}

export interface LeadRow {
  id: string;
  company_id: string;
  phone: string;
  name: string | null;
  customer_email: string | null;
  customer_address: string | null;
  status: LeadStatus | null;
  intent: LeadIntent | null;
  bot_active: Bool01 | null;
  handoff_at: number | null;
  /** JSON en text: {clave: valor} */
  custom_data: string | null;
  customer_notes: string | null;
  last_message: string | null;
  created_at: number | null;
  created_ts: string | null;
}

export interface MessageRow {
  id: string;
  lead_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: number | null;
  created_ts: string | null;
}

export interface CatalogRow {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  duration_minutes: number | null;
  is_active: Bool01 | null;
  sort_order: number | null;
  stock: number | null;
  capacity: number | null;
  /** JSON en text: array de nombres */
  package_services: string | null;
  /** JSON en text: solo en negocios `recurring` */
  schedule_slots: string | null;
  image_url: string | null;
}

/** Un grupo semanal de un negocio recurrente (dentro de catalog.schedule_slots). */
export interface FranjaRecurrente {
  id: string;
  label: string;
  /** 0 = domingo … 6 = sábado */
  days: number[];
  time: string;
  /** -1 = sin límite */
  capacity: number;
}

export interface AppointmentRow {
  id: string;
  company_id: string;
  lead_id: string;
  /** ⚠️ NO es timestamp: texto local "2026-08-20 16:00". En recurrentes, "sched:<id>". */
  slot_start: string;
  slot_end: string | null;
  status: AppointmentStatus | null;
  slot_minutes: number | null;
  employee_id: string | null;
  service: string | null;
  created_at: number | null;
  created_ts: string | null;
}

export interface AppointmentServiceRow {
  id: string;
  appointment_id: string;
  name: string;
  price: number | null;
  duration_minutes: number | null;
}

export interface OrderRow {
  id: string;
  company_id: string;
  lead_id: string;
  status: OrderStatus | null;
  /** JSON en text: [{ name, price, quantity, catalog_item_id }] */
  items: string | null;
  total: number | null;
  discount: number | null;
  payment_method: string | null;
  voucher_url: string | null;
  delivery_address: string | null;
  delivery_option: string | null;
  delivery_time: string | null;
  created_at: number | null;
  created_ts: string | null;
}

export interface ItemPedido {
  name: string;
  price: number;
  quantity: number;
  catalog_item_id?: string;
}

export interface EmployeeRow {
  id: string;
  company_id: string;
  name: string;
  is_active: Bool01 | null;
  /** JSON en text, mismo formato que companies.schedule. Vacío = hereda el de la empresa. */
  schedule: string | null;
}

export interface EmployeeBlockRow {
  id: string;
  company_id: string;
  employee_id: string;
  start: string;
  /** ⚠️ `end` es palabra reservada en Postgres. supabase-js la entrecomilla solo. */
  end: string;
  reason: string | null;
}

export interface EscalationRow {
  id: string;
  company_id: string;
  lead_id: string | null;
  status: 'pending' | 'resolved';
  /** Texto abierto (hoy `paid_removal`, `paid_reschedule`). NO es un enum cerrado. */
  kind: string;
  /** JSON en text */
  detail: string | null;
  created_at: number | null;
  created_ts: string | null;
}

export interface MembershipRow {
  company_id: string;
  auth_user_id: string;
  role: Rol;
  companies?: { name: string } | { name: string }[] | null;
}

export interface DailyMetricRow {
  company_id: string;
  date: string;
  leads: number;
  paid_orders: number;
  revenue: number;
  appointments: number;
  escalations_pending: number;
}

export interface PuntoDia {
  date: string;
  count: number;
}

export interface PuntoPedidos {
  date: string;
  count: number;
  revenue: number;
}

export interface PuntoIntencion {
  date: string;
  intent: LeadIntent;
  count: number;
}

export interface ProductoIngreso {
  name: string;
  revenue: number;
  units: number;
}

export type EstadoInstancia =
  | 'pending_approval'
  | 'approved'
  | 'starting'
  | 'running'
  | 'needs_qr'
  | 'stopped'
  | 'error';

/**
 * `v_instance_health` — "¿está funcionando el bot de este cliente?", con el
 * diagnóstico ya masticado. Columnas verificadas contra el proyecto real.
 *
 * Es también la señal de si los datos están al día: el latido y el volcado del
 * espejo salen del mismo proceso, con el mismo cliente y por la misma conexión,
 * así que si uno falla el otro ya falló — y esta vista además dice por qué.
 * (La tabla `sync_state`, que antes se usaba para eso, se eliminó.)
 */
export interface InstanceHealthRow {
  company_id: string;
  company_name: string | null;
  status: EstadoInstancia;
  /** Hubo latido en los últimos 90 s. */
  vivo: boolean;
  /** WhatsApp vinculado. DISTINTO de `vivo`: el proceso puede estar vivo con la sesión caída. */
  wa_connected: boolean;
  heartbeat: string | null;
  /** Texto ya redactado para enseñar tal cual: «Hay que ir a re-emparejar el WhatsApp». */
  diagnostico: string | null;
  reconnects: number | null;
  last_disconnect_code: number | null;
  last_disconnect_reason: string | null;
  last_disconnect_at: number | null;
}

export interface CommandRow {
  id: string;
  company_id: string;
  type: string;
  payload: unknown;
  status: 'pending' | 'processing' | 'done' | 'error';
  result: unknown;
  error: string | null;
}
