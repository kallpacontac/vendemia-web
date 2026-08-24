/**
 * ══════════════════════════════════════════════════════════════════════════
 * LECTURA · todo lo que el panel enseña sale de aquí
 * ══════════════════════════════════════════════════════════════════════════
 *
 * PostgREST normal sobre las tablas espejadas y las vistas ya calculadas. El
 * RLS filtra por membresía, así que un company_id ajeno no devuelve filas: la
 * consulta sale VACÍA, no da error. No hace falta comprobar permisos aquí.
 *
 * Cada función devuelve el dato ya masticado (JSON parseado, 0/1 a boolean,
 * fechas como Date) para que las pantallas no repitan esa faena.
 */
import { supabase } from './client';
import { bool, json, fecha } from './parse';
import type {
  AppointmentRow,
  CatalogRow,
  CompanyRow,
  DailyMetricRow,
  EmployeeBlockRow,
  EmployeeRow,
  EscalationRow,
  Horario,
  InstanceHealthRow,
  ItemPedido,
  LeadRow,
  MembershipRow,
  MessageRow,
  MetodoPago,
  OrderRow,
  ProductoIngreso,
  PuntoDia,
  PuntoIntencion,
  PuntoPedidos,
  Rol,
} from './types';

/* ── Compañías del usuario ──────────────────────────────────────────────── */

export interface CompaniaAccesible {
  id: string;
  nombre: string;
  rol: Rol;
}

/**
 * Las compañías del usuario. Sale de `memberships`, que por RLS solo devuelve
 * las suyas — un usuario puede pertenecer a varias.
 */
export async function misCompanias(): Promise<CompaniaAccesible[]> {
  const { data, error } = await supabase()
    .from('memberships')
    .select('company_id, role, companies(name)');
  if (error) throw error;

  return ((data ?? []) as MembershipRow[]).map((m) => {
    const c = Array.isArray(m.companies) ? m.companies[0] : m.companies;
    return { id: m.company_id, nombre: c?.name ?? 'Mi negocio', rol: m.role };
  });
}

/* ── La compañía ────────────────────────────────────────────────────────── */

export interface Compania extends CompanyRow {
  horario: Horario;
  pagos: MetodoPago[];
}

export async function getCompania(companyId: string): Promise<Compania | null> {
  const { data, error } = await supabase()
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as CompanyRow;
  return {
    ...row,
    horario: json<Horario>(row.schedule, {}),
    pagos: json<MetodoPago[]>(row.payment_methods, []),
  };
}

/* ── Leads ──────────────────────────────────────────────────────────────── */

export interface Lead extends LeadRow {
  botActivo: boolean;
  enManual: boolean;
  creado: Date | null;
}

export async function getLeads(companyId: string, limite = 500): Promise<Lead[]> {
  const { data, error } = await supabase()
    .from('leads')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw error;

  return ((data ?? []) as LeadRow[]).map((l) => ({
    ...l,
    // Por defecto true: un lead recién espejado sin el campo lo atiende el bot.
    botActivo: bool(l.bot_active, true),
    enManual: !bool(l.bot_active, true),
    creado: fecha(l.created_ts),
  }));
}

/* ── Mensajes ───────────────────────────────────────────────────────────── */

export interface Mensaje extends MessageRow {
  cuando: Date | null;
}

/**
 * El chat de un lead.
 *
 * ⚠️ `messages` NO tiene company_id: su política resuelve el permiso a través
 * de `leads`. Se puede leer igual, pero no se puede filtrar por compañía
 * directamente — hay que ir siempre por el lead.
 */
export async function getMensajes(leadId: string): Promise<Mensaje[]> {
  const { data, error } = await supabase()
    .from('messages')
    .select('id, lead_id, role, content, created_at, created_ts')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  return ((data ?? []) as MessageRow[]).map((m) => ({ ...m, cuando: fecha(m.created_ts) }));
}

/** Mensajes nuevos en vivo. Devuelve la función para darse de baja. */
export function escucharMensajes(leadId: string, alLlegar: (m: Mensaje) => void): () => void {
  const sb = supabase();
  const canal = sb
    .channel(`chat-${leadId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `lead_id=eq.${leadId}` },
      ({ new: fila }: { new: Record<string, unknown> }) => {
        const m = fila as unknown as MessageRow;
        alLlegar({ ...m, cuando: fecha(m.created_ts) });
      },
    )
    .subscribe();

  return () => {
    void sb.removeChannel(canal);
  };
}

/* ── Catálogo ───────────────────────────────────────────────────────────── */

export interface ItemCatalogo extends CatalogRow {
  activo: boolean;
  paquete: string[];
}

export async function getCatalogo(companyId: string): Promise<ItemCatalogo[]> {
  const { data, error } = await supabase()
    .from('catalog')
    .select('*')
    .eq('company_id', companyId)
    .order('sort_order', { ascending: true });
  if (error) throw error;

  return ((data ?? []) as CatalogRow[]).map((c) => ({
    ...c,
    activo: bool(c.is_active, true),
    paquete: json<string[]>(c.package_services, []),
  }));
}

/* ── Citas ──────────────────────────────────────────────────────────────── */

export interface Cita extends AppointmentRow {
  /** `slot_start` parseado. null en recurrentes ("sched:manana") o si viene raro. */
  inicio: Date | null;
  /** true si es una plaza de un grupo semanal, no una hora concreta. */
  recurrente: boolean;
}

/**
 * `slot_start` NO es un timestamp: es texto local "2026-08-20 16:00", y en los
 * negocios recurrentes es "sched:<id>". Se parsea a mano y en hora local — con
 * `new Date("2026-08-20 16:00")` algunos navegadores lo leen como UTC y la cita
 * de las 4 de la tarde aparece a las 11 de la mañana.
 */
export function parseSlot(slot: string | null | undefined): Date | null {
  if (!slot || slot.startsWith('sched:')) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(slot);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

export async function getCitas(companyId: string, limite = 500): Promise<Cita[]> {
  const { data, error } = await supabase()
    .from('appointments')
    .select('*')
    .eq('company_id', companyId)
    .order('slot_start', { ascending: true })
    .limit(limite);
  if (error) throw error;

  return ((data ?? []) as AppointmentRow[]).map((a) => ({
    ...a,
    inicio: parseSlot(a.slot_start),
    recurrente: Boolean(a.slot_start?.startsWith('sched:')),
  }));
}

/* ── Pedidos ────────────────────────────────────────────────────────────── */

export interface Pedido extends OrderRow {
  articulos: ItemPedido[];
  creado: Date | null;
}

export async function getPedidos(companyId: string, limite = 500): Promise<Pedido[]> {
  const { data, error } = await supabase()
    .from('orders')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw error;

  return ((data ?? []) as OrderRow[]).map((o) => ({
    ...o,
    articulos: json<ItemPedido[]>(o.items, []),
    creado: fecha(o.created_ts),
  }));
}

/* ── Escalaciones ───────────────────────────────────────────────────────── */

export interface Escalacion extends EscalationRow {
  detalle: Record<string, unknown>;
  creada: Date | null;
}

export async function getEscalaciones(companyId: string): Promise<Escalacion[]> {
  const { data, error } = await supabase()
    .from('escalations')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return ((data ?? []) as EscalationRow[]).map((e) => ({
    ...e,
    detalle: json<Record<string, unknown>>(e.detail, {}),
    creada: fecha(e.created_ts),
  }));
}

/* ── Trabajadores ───────────────────────────────────────────────────────── */

export interface Trabajador extends EmployeeRow {
  activo: boolean;
  horario: Horario;
}

export async function getTrabajadores(companyId: string): Promise<Trabajador[]> {
  const { data, error } = await supabase()
    .from('employees')
    .select('*')
    .eq('company_id', companyId)
    .order('name', { ascending: true });
  if (error) throw error;

  return ((data ?? []) as EmployeeRow[]).map((e) => ({
    ...e,
    activo: bool(e.is_active, true),
    horario: json<Horario>(e.schedule, {}),
  }));
}

export async function getBloqueos(companyId: string): Promise<EmployeeBlockRow[]> {
  const { data, error } = await supabase()
    .from('employee_blocks')
    .select('*')
    .eq('company_id', companyId);
  if (error) throw error;
  return (data ?? []) as EmployeeBlockRow[];
}

/* ── Estado de la instancia ─────────────────────────────────────────────── */

/**
 * ¿Está funcionando el bot de este cliente? El diagnóstico viene ya masticado.
 *
 * `vivo` y `wa_connected` son cosas DISTINTAS: el proceso puede estar
 * perfectamente vivo con la sesión de WhatsApp caída.
 *
 * ⚠️ `null` significa DESCONOCIDO, no "caído". Se devuelve cuando la compañía
 * todavía no tiene instancia registrada — y ahí lo correcto es no enseñar
 * nada, no encender una alarma que se quedaría puesta para siempre. Quien
 * llama tiene que distinguir los dos casos; ver components/panel/Salud.tsx.
 *
 * Por eso `maybeSingle()` y no `single()`: sin fila, `single()` devuelve error
 * PGRST116 y el caso normal de una compañía recién dada de alta se leería como
 * un fallo.
 */
export async function getSalud(companyId: string): Promise<InstanceHealthRow | null> {
  const { data, error } = await supabase()
    .from('v_instance_health')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) return null;
  return (data as InstanceHealthRow) ?? null;
}

/* ── Métricas · vistas ya calculadas ────────────────────────────────────── */

/**
 * ⚠️ Todo esto se agrupa en HORA DE LIMA, no UTC. Es deliberado: una venta de
 * las 19:00 caía en el día siguiente. Las cifras no cuadran al dedillo con las
 * del bot en la franja 19:00–23:59.
 */
export async function getMetricasDiarias(
  companyId: string,
  desde: string,
  hasta: string,
): Promise<DailyMetricRow[]> {
  const { data, error } = await supabase()
    .from('v_daily_metrics')
    .select('*')
    .eq('company_id', companyId)
    .gte('date', desde)
    .lte('date', hasta)
    .order('date');
  if (error) throw error;
  return (data ?? []) as DailyMetricRow[];
}

export async function getLeadsPorDia(companyId: string, desde: string): Promise<PuntoDia[]> {
  const { data, error } = await supabase()
    .from('v_leads_by_day')
    .select('*')
    .eq('company_id', companyId)
    .gte('date', desde)
    .order('date');
  if (error) throw error;
  return (data ?? []) as PuntoDia[];
}

export async function getPedidosPorDia(companyId: string, desde: string): Promise<PuntoPedidos[]> {
  const { data, error } = await supabase()
    .from('v_orders_by_day')
    .select('*')
    .eq('company_id', companyId)
    .gte('date', desde)
    .order('date');
  if (error) throw error;
  return (data ?? []) as PuntoPedidos[];
}

export async function getIntencionPorDia(companyId: string, desde: string): Promise<PuntoIntencion[]> {
  const { data, error } = await supabase()
    .from('v_intent_by_day')
    .select('*')
    .eq('company_id', companyId)
    .gte('date', desde);
  if (error) throw error;
  return (data ?? []) as PuntoIntencion[];
}

/** Ingresos por producto. Es una RPC, no una vista. */
export async function getIngresosPorProducto(
  companyId: string,
  desde: string,
  hasta: string,
): Promise<ProductoIngreso[]> {
  const { data, error } = await supabase().rpc('analytics_products', {
    p_company: companyId,
    p_from: desde,
    p_to: hasta,
  });
  if (error) throw error;
  return (data ?? []) as ProductoIngreso[];
}

/* ── Actividad por hora y día ───────────────────────────────────────────── */

/**
 * El mapa de calor del panel: 7 días × 24 horas de mensajes.
 *
 * No hay vista para esto, así que se cuenta a mano sobre `messages`. Como esa
 * tabla no tiene company_id (ver getMensajes), hay que ir por los leads, y la
 * consulta se acota a los últimos `dias` con un tope de filas: en una cuenta
 * con mucho tráfico, traerse el historial entero para pintar un heatmap sería
 * descargar megas para nada.
 */
export async function getActividad(companyId: string, dias = 7): Promise<number[][]> {
  const rejilla: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));

  const { data: leads, error: e1 } = await supabase()
    .from('leads')
    .select('id')
    .eq('company_id', companyId)
    .limit(1000);
  if (e1 || !leads?.length) return rejilla;

  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  const { data, error } = await supabase()
    .from('messages')
    .select('created_ts')
    .in(
      'lead_id',
      (leads as { id: string }[]).map((l) => l.id),
    )
    .gte('created_ts', desde.toISOString())
    .limit(5000);
  if (error) return rejilla;

  for (const m of (data ?? []) as { created_ts: string | null }[]) {
    const d = fecha(m.created_ts);
    if (!d) continue;
    // Lunes primero, como en la cabecera del heatmap.
    const dia = (d.getDay() + 6) % 7;
    rejilla[dia][d.getHours()] += 1;
  }
  return rejilla;
}
