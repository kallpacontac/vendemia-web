/**
 * ══════════════════════════════════════════════════════════════════════════
 * TABLERO DE CLIENTES · el embudo como un CRM, sacado de HECHOS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Cada contacto cae en UNA columna, y la columna se deduce de lo que consta en
 * las tablas, nunca de lo que «parece» la conversación:
 *
 *   Cliente         leads.status = 'customer' (cerró al menos una vez)
 *   Demo agendada   tiene una cita que no está cancelada
 *   Atiende un bot  escalación pendiente `parece_bot` (bot: services/parece-bot)
 *   Te toca a ti    escalación pendiente `por_contestar`, o Mia en pausa y el
 *                   último mensaje es del cliente: nadie le ha contestado
 *   Interesado      el bot lo marcó evaluando / listo, o con intención de compra
 *   Respondió       escribió al menos una vez
 *   Contactado      solo le hemos escrito nosotros
 *
 * Un contacto sin ningún mensaje no sale: no hay conversación que seguir.
 *
 * El orden de arriba es la prioridad: quien tiene la demo agendada está en
 * «Demo agendada» aunque también esté interesado.
 *
 * Solo se LEE. No se arrastra porque no hay a dónde escribir: las columnas son
 * hechos, y para cambiar una hay que cambiar el hecho (agendar, contestar,
 * reactivar a Mia). Ver la cabecera de app/(panel)/panel/leads/page.tsx.
 */
import { supabase } from '@/lib/supabase/client';
import { demoActivo } from './demo';
import type { LeadIntent, LeadStatus } from '@/lib/supabase/types';

export type Etapa = 'te_toca' | 'contactado' | 'respondio' | 'interesado' | 'demo' | 'cliente' | 'bot';

export const ETAPAS: { id: Etapa; titulo: string; ayuda: string }[] = [
  { id: 'te_toca', titulo: 'Te toca a ti', ayuda: 'Te escribió y nadie le ha contestado' },
  { id: 'contactado', titulo: 'Contactado', ayuda: 'Le escribimos y aún no contesta' },
  { id: 'respondio', titulo: 'Respondió', ayuda: 'Contestó; Mia sigue la conversación' },
  { id: 'interesado', titulo: 'Interesado', ayuda: 'Mia lo ve con ganas de avanzar' },
  { id: 'demo', titulo: 'Demo agendada', ayuda: 'Tiene la llamada o la cita reservada' },
  { id: 'cliente', titulo: 'Cliente', ayuda: 'Ya compró o contrató' },
  { id: 'bot', titulo: 'Atiende un bot', ayuda: 'Contesta un bot del negocio, no una persona' },
];

export interface Prospecto {
  id: string;
  nombre: string;
  telefono: string;
  etapa: Etapa;
  miaEnPausa: boolean;
  ultimoMensaje: string;
  ultimoDeQuien: 'cliente' | 'nosotros' | '';
  ultimoAt: Date | null;
}

interface Hechos {
  status: LeadStatus | null;
  intent: LeadIntent | null;
  botActivo: boolean;
  escribio: boolean;
  ultimoDelCliente: boolean;
  tieneCita: boolean;
  escalaciones: Set<string>;
}

/** La regla, sola y sin red: es lo que prueba el test. */
export function etapaDe(h: Hechos): Etapa {
  if (h.status === 'customer') return 'cliente';
  if (h.tieneCita) return 'demo';
  if (h.escalaciones.has('parece_bot')) return 'bot';
  if (h.escalaciones.has('por_contestar') || (!h.botActivo && h.ultimoDelCliente)) return 'te_toca';
  if (h.status === 'evaluating' || h.status === 'ready' || h.intent === 'purchase_ready') return 'interesado';
  if (h.escribio) return 'respondio';
  return 'contactado';
}

/** El nombre de la tarjeta: el de la persona, si no la primera línea de las notas del negocio, si no el teléfono. */
export function nombreDe(name: string | null, notas: string | null | undefined, phone: string): string {
  if (name?.trim()) return name.trim();
  const primera = (notas ?? '').split('\n')[0].replace(/^Negocio:\s*/i, '').trim();
  return primera || `+${phone}`;
}

interface FilaLead {
  id: string;
  phone: string;
  name: string | null;
  notas_salon?: string | null;
  status: LeadStatus | null;
  intent: LeadIntent | null;
  bot_active: number | null;
  ultimo?: { role: string; content: string; created_ts: string | null; media_type?: string | null }[];
  suyo?: { id: string }[];
}

export async function getProspectos(companyId: string): Promise<Prospecto[]> {
  if (demoActivo()) return [];
  const sb = supabase();
  const [leads, escal, citas] = await Promise.all([
    sb.from('leads')
      .select('id, phone, name, notas_salon, status, intent, bot_active, ultimo:messages(role, content, created_ts, media_type), suyo:messages(id)')
      .eq('company_id', companyId)
      .eq('suyo.role', 'user')
      .order('created_at', { referencedTable: 'ultimo', ascending: false })
      .limit(1, { referencedTable: 'ultimo' })
      .limit(1, { referencedTable: 'suyo' })
      .limit(500),
    sb.from('escalations').select('lead_id, kind').eq('company_id', companyId).eq('status', 'pending'),
    sb.from('appointments').select('lead_id').eq('company_id', companyId).neq('status', 'cancelled'),
  ]);
  if (leads.error) throw leads.error;

  const escPorLead = new Map<string, Set<string>>();
  for (const e of (escal.data ?? []) as { lead_id: string | null; kind: string }[]) {
    if (!e.lead_id) continue;
    const s = escPorLead.get(e.lead_id) ?? new Set<string>();
    s.add(e.kind);
    escPorLead.set(e.lead_id, s);
  }
  const conCita = new Set(((citas.data ?? []) as { lead_id: string }[]).map((c) => c.lead_id));

  return ((leads.data ?? []) as unknown as FilaLead[])
    // Sin un solo mensaje no hay conversación que seguir: son altas de prueba o
    // contactos creados a mano a los que nadie escribió. Siguen en Clientes.
    .filter((l) => (l.ultimo?.length ?? 0) > 0)
    .map((l) => {
      const ultimo = l.ultimo?.[0];
      const delCliente = ultimo?.role === 'user';
      const etapa = etapaDe({
        status: l.status,
        intent: l.intent,
        botActivo: l.bot_active !== 0,
        escribio: (l.suyo?.length ?? 0) > 0,
        ultimoDelCliente: delCliente,
        tieneCita: conCita.has(l.id),
        escalaciones: escPorLead.get(l.id) ?? new Set(),
      });
      return {
        id: l.id,
        nombre: nombreDe(l.name, l.notas_salon, l.phone),
        telefono: l.phone,
        etapa,
        miaEnPausa: l.bot_active === 0,
        ultimoMensaje: ultimo?.content?.trim() || (ultimo?.media_type ? '[adjunto]' : ''),
        ultimoDeQuien: ultimo ? (delCliente ? 'cliente' : 'nosotros') : '',
        ultimoAt: ultimo?.created_ts ? new Date(ultimo.created_ts) : null,
      } satisfies Prospecto;
    })
    .sort((a, b) => (b.ultimoAt?.getTime() ?? 0) - (a.ultimoAt?.getTime() ?? 0));
}
