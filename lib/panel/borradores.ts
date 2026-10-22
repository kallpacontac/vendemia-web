/**
 * ══════════════════════════════════════════════════════════════════════════
 * BORRADORES · los mensajes a clientes que Mia redacta y alguien aprueba
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Los crea el bot (Mia Gerente) en `borradores`, y el panel los pinta como una
 * tarjeta al final del chat de ese cliente (components/panel/TarjetaBorrador).
 * Diseño: docs/prompt-bot-mia-gerente-contactar.md, parte 10.
 *
 * Aprobar NO envía desde aquí: `borrador_aprobar` (modules/datos/sql/0008)
 * comprueba el rol, que no se apruebe dos veces y que el texto corregido no
 * baje del tope, y apunta `enviar_borrador` en la cola con quien aprueba como
 * autor. El bot manda lo guardado y cambia el estado a 'enviado' o 'rechazado'.
 *
 * Solo dueño y administrador leen la tabla (RLS): a un empleado la consulta le
 * devuelve vacío, sin tener que comprobar el rol aquí.
 */
import { supabase } from '@/lib/supabase/client';
import { demoActivo } from './demo';

export type EstadoBorrador = 'por_aprobar' | 'aprobado' | 'enviado' | 'descartado' | 'caducado' | 'rechazado';

export interface Encargo {
  producto: string;
  precio_lista: number;
  /** Lo que se rebaja (S/), no el precio: entrada ≤ escalón ≤ tope. */
  entrada: number;
  escalon?: number;
  tope: number;
  regalo?: string | null;
  /** YYYY-MM-DD */
  vence: string;
}

export interface Borrador {
  id: string;
  company_id: string;
  lead_id: string;
  objetivo: 'ofrecer' | 'recuperar' | 'avisar' | 'cobrar' | 'coordinar_entrega';
  texto: string;
  adjunto: { url: string; type: 'image' | 'video' | 'document'; name?: string } | null;
  audio: { guion: string; segundos: number; url?: string } | null;
  encargo: Encargo | null;
  /** null = lo propuso Mia sola. */
  creado_por: string | null;
  estado: EstadoBorrador;
  motivo: string;
  texto_final: string | null;
  programado_para: string | null;
  created_at: string;
}

/** Lo que el panel enseña: por aprobar, saliendo o con un problema que contar. */
const VISIBLES: EstadoBorrador[] = ['por_aprobar', 'aprobado', 'rechazado'];

/**
 * Los borradores vivos del negocio, el más nuevo primero. Si la tabla aún no
 * existe (0008 sin aplicar) o el usuario es empleado, vuelve vacío: el chat
 * se ve como siempre.
 */
export async function getBorradores(companyId: string): Promise<Borrador[]> {
  if (demoActivo()) return [];
  const { data, error } = await supabase()
    .from('borradores')
    .select('id, company_id, lead_id, objetivo, texto, adjunto, audio, encargo, creado_por, estado, motivo, texto_final, programado_para, created_at')
    .eq('company_id', companyId)
    .in('estado', VISIBLES)
    // Un rechazado se cuenta un día; después ya no es noticia.
    .gte('created_at', new Date(Date.now() - 2 * 86_400_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return [];
  return (data ?? []) as Borrador[];
}

/** El borrador que se enseña en el chat de cada cliente: el más reciente. */
export function porCliente(borradores: Borrador[]): Map<string, Borrador> {
  const m = new Map<string, Borrador>();
  for (const b of borradores) if (!m.has(b.lead_id)) m.set(b.lead_id, b);
  return m;
}

export class NoSePudo extends Error {}

/** El texto de los errores de la base, tal cual: ya están escritos para el dueño. */
function motivoDe(error: { message?: string; code?: string } | null): string {
  if (!error) return '';
  if (error.code === 'PGRST202' || error.code === '42883') {
    return 'La aprobación de mensajes aún no está activada en tu negocio.';
  }
  return error.message || 'No se pudo completar. Inténtalo otra vez.';
}

/**
 * Aprobar. `texto`: el corregido, o null para enviar el de Mia. Devuelve la
 * hora a la que saldrá si es de noche (null = sale ya).
 */
export async function aprobarBorrador(id: string, texto: string | null): Promise<{ programado_para: string | null }> {
  if (demoActivo()) throw new NoSePudo('Estás en modo demo: no se envía nada. Sal del modo demo para aprobar mensajes.');
  const { data, error } = await supabase().rpc('borrador_aprobar', { p_id: id, p_texto: texto });
  if (error) throw new NoSePudo(motivoDe(error));
  return { programado_para: (data as { programado_para?: string | null } | null)?.programado_para ?? null };
}

export async function descartarBorrador(id: string): Promise<void> {
  if (demoActivo()) throw new NoSePudo('Estás en modo demo: no se cambia nada.');
  const { error } = await supabase().rpc('borrador_descartar', { p_id: id });
  if (error) throw new NoSePudo(motivoDe(error));
}

/**
 * «{firma}» es el hueco para el nombre de quien aprueba: la base lo cambia al
 * aprobar. En la tarjeta se enseña como «[tu nombre]» para que se entienda.
 */
export const FIRMA = '{firma}';
export const conFirmaVisible = (t: string) => t.split(FIRMA).join('[tu nombre]');
export const conFirmaGuardable = (t: string) => t.split('[tu nombre]').join(FIRMA);

const soles = (n: number) => `S/ ${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** «Si responde, Mia empieza ofreciendo S/ 270 · como mínimo S/ 255 · hasta el dom. 26» */
export function lineaDelEncargo(e: Encargo): string {
  const partes = [
    `empieza ofreciendo ${soles(e.precio_lista - e.entrada)}`,
    `como mínimo ${soles(e.precio_lista - e.tope)}`,
  ];
  if (e.regalo) partes.push(`antes ofrece: ${e.regalo}`);
  const d = new Date(`${e.vence}T12:00:00-05:00`);
  if (!Number.isNaN(d.getTime())) {
    partes.push(`hasta el ${d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', timeZone: 'America/Lima' })}`);
  }
  return `Si responde, Mia ${partes.join(' · ')}`;
}

/** «hoy a las 9:00» / «mañana a las 9:00» para lo aprobado de noche. */
export function cuandoSale(iso: string): string {
  const d = new Date(iso);
  const dia = (x: Date) => x.toLocaleDateString('es-PE', { timeZone: 'America/Lima' });
  const hoy = new Date();
  const manana = new Date(Date.now() + 86_400_000);
  const h = d.toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Lima' });
  if (dia(d) === dia(hoy)) return `hoy a las ${h}`;
  if (dia(d) === dia(manana)) return `mañana a las ${h}`;
  return `el ${d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', timeZone: 'America/Lima' })} a las ${h}`;
}
