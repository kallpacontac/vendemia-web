/**
 * Formato y etiquetas del panel.
 *
 * Los colores y las etiquetas de intención/estado vienen tal cual del panel
 * anterior (public/assets/data.js): el diseño ya estaba decidido, esto solo lo
 * mueve a un sitio donde TypeScript lo puede comprobar.
 */
import type { LeadIntent, LeadStatus, AppointmentStatus } from '@/lib/supabase/types';

export const INTENT: Record<LeadIntent, { label: string; cls: string; color: string; short: string }> = {
  purchase_ready: { label: 'Listo p/ comprar', cls: 'b-hot', color: '#FF4757', short: 'Caliente' },
  quote: { label: 'Cotizando', cls: 'b-warm', color: '#FFA502', short: 'Tibio' },
  inquiry: { label: 'Consulta', cls: 'b-info', color: '#3B82F6', short: 'Consulta' },
  support: { label: 'Soporte', cls: 'b-mute', color: '#8B93A7', short: 'Soporte' },
  other: { label: 'Otro', cls: 'b-mute', color: '#A0AEC0', short: 'Otro' },
};

export const STATUS: Record<LeadStatus, { label: string; color: string }> = {
  new: { label: 'Nuevo', color: '#3B82F6' },
  contacted: { label: 'Contactado', color: '#FFA502' },
  paid: { label: 'Pagado', color: '#2ED573' },
  closed: { label: 'Cerrado', color: '#A0AEC0' },
};

export const ESTADO_CITA: Record<AppointmentStatus, { label: string; color: string }> = {
  pending_payment: { label: 'Esperando pago', color: '#FFA502' },
  confirmed: { label: 'Confirmada', color: '#3D5AF1' },
  cancelled: { label: 'Cancelada', color: '#A0AEC0' },
  completed: { label: 'Completada', color: '#0FA968' },
  no_show: { label: 'No vino', color: '#FF5B79' },
};

/** Intención segura: el espejo puede traer null o algo que no está en el enum. */
export const intent = (v: string | null | undefined) => INTENT[(v as LeadIntent) ?? 'other'] ?? INTENT.other;
export const status = (v: string | null | undefined) => STATUS[(v as LeadStatus) ?? 'new'] ?? STATUS.new;

export const soles = (n: number | null | undefined) =>
  'S/ ' + Number(n || 0).toLocaleString('es-PE', { maximumFractionDigits: 0 });

const PALETA = ['#F58220', '#FF4757', '#00C48C', '#3B82F6', '#A78BFA', '#FFA502', '#2DD4BF', '#EC4899'];

/** Color estable por id: el mismo lead sale siempre del mismo color, sin guardarlo. */
export function colorDe(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETA[h % PALETA.length];
}

export function iniciales(nombre: string | null | undefined, telefono = ''): string {
  const n = (nombre || '').trim();
  if (!n) return telefono.slice(-2) || '··';
  return n
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Teléfono del espejo (51987654321) → "+51 987 654 321". */
export function telefono(raw: string | null | undefined): string {
  const d = (raw || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('51')) return `+51 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  return raw || '—';
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const diaMes = (d: Date) => `${d.getDate()} ${MESES[d.getMonth()]}`;

export const hora = (d: Date) =>
  d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });

/** "hace 5 min", "14:20", "12 ago" — lo justo para una lista de conversaciones. */
export function cuando(d: Date | null): string {
  if (!d) return '—';
  const min = (Date.now() - d.getTime()) / 60000;
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${Math.floor(min)} min`;
  if (min < 60 * 24 && d.getDate() === new Date().getDate()) return hora(d);
  if (min < 60 * 48) return 'ayer';
  return diaMes(d);
}

/** Fecha local en formato YYYY-MM-DD (NO toISOString: eso pasa a UTC y se va un día). */
export function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function hace(dias: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d;
}
