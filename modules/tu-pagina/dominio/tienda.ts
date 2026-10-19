/**
 * ══════════════════════════════════════════════════════════════════════════
 * TU PÁGINA · el escaparate: lo que se vende, se reserva o se separa
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `armarEscaparate` convierte lo que devuelve tu_pagina_srv_datos (filas del
 * catálogo, fotos, opciones, equipo, horario y horas ocupadas) en algo que la
 * página pinta sin pensar. Se ejecuta en el servidor; al navegador solo llega
 * el resultado, sin un solo dato de otro cliente.
 *
 * Qué es cada ítem lo decide la PÁGINA, no el tipo de negocio (Alvaro, 19-oct-2026):
 * una página es Agenda, Tienda o Las dos, y eso se elige en Mi página.
 *   · Tienda (solo `catalogo`)  → todo es producto: al carrito.
 *   · Agenda (solo `reservar`)  → con grupos (schedule_slots) es grupo; si no, cita.
 *   · Las dos                   → lo que el dueño marcó en `tipos`; lo que no, la
 *     regla del modo (una tienda que da citas: lo que tiene duración es cita).
 * Ver `tipoDe`.
 *
 * Y los mensajes de WhatsApp que el cliente manda al terminar: llevan TODO,
 * porque sin bot es lo único que lee el dueño.
 */
import type { AppointmentStatus, BusinessMode, FranjaRecurrente, Horario } from '@/lib/supabase/types';
import { vigenteHoy } from '@/lib/panel/vigencia';
import { ocupa } from '@/lib/panel/inscripciones';
import { sumarMin, type DatosAgenda } from '@/modules/tu-pagina/dominio/agenda';
import { fechaCorta, telefonoBonito, telefonoNormal } from '@/modules/tu-pagina/dominio/envio';

/* ── Lo que llega de la base ─────────────────────────────────────────────── */

export interface DatosCrudos {
  negocio: {
    modo: BusinessMode | null;
    horario: string | null;
    slot_minutes: number | null;
    pide_profesional: number | null;
    entrega: 'delivery' | 'pickup' | 'both' | null;
    direccion: string | null;
  };
  catalogo: {
    id: string;
    nombre: string;
    descripcion: string | null;
    precio: number | null;
    duracion: number | null;
    stock: number | null;
    grupos: string | null;
    vigencia_meses: number | null;
    promo_vigencia: string | null;
    familia: string | null;
  }[];
  media: { catalog_id: string; url: string; tipo: 'image' | 'video'; principal: number | null }[];
  variantes: { id: string; catalog_id: string; etiqueta: string; atributos: string | null; stock: number | null }[];
  equipo: { id: string; nombre: string; horario: string | null }[];
  bloqueos: { employee_id: string; inicio: string; fin: string }[];
  citas: {
    slot_start: string;
    slot_end: string | null;
    slot_minutes: number | null;
    employee_id: string | null;
    status: AppointmentStatus | null;
    periodo_desde: string | null;
    periodo_hasta: string | null;
  }[];
  web: { slot_start: string; slot_end: string | null; employee_id: string | null }[];
  /** 'catalog_id|variante_id' → unidades apartadas por pedidos vivos. */
  apartado: Record<string, number>;
  hoy: string;
  ahora: string;
}

/* ── Lo que pinta la página ──────────────────────────────────────────────── */

export type TipoItem = 'producto' | 'cita' | 'grupo';

/** Lo que el dueño marcó en Mi página (solo en «Las dos»): id del catálogo → tipo. */
export type TiposDePagina = Record<string, TipoItem>;

/** Lo de la página que decide qué es cada ítem: sus secciones. */
export interface ComoSeOfrece {
  catalogo?: boolean;
  reservar?: boolean;
  tipos?: TiposDePagina;
}

/** Una cosa del catálogo, lo justo para decidir su tipo. */
interface Pieza {
  conGrupos: boolean;
  duracion: number | null;
}

/** El tipo en «Las dos» cuando el dueño no marcó nada. */
export function tipoPorDefecto(modo: BusinessMode | null | undefined, k: Pieza): TipoItem {
  if (k.conGrupos) return 'grupo';
  if (modo === 'ecommerce') return k.duracion && k.duracion > 0 ? 'cita' : 'producto';
  return 'cita';
}

/** El tipo de un ítem en una página. Sin secciones (página antigua), la regla del modo de siempre. */
export function tipoDe(modo: BusinessMode | null | undefined, k: Pieza, como?: ComoSeOfrece | null, id = ''): TipoItem {
  const vende = Boolean(como?.catalogo);
  const reserva = Boolean(como?.reservar);
  const deAgenda: TipoItem = k.conGrupos ? 'grupo' : 'cita';
  if (vende && !reserva) return 'producto';
  if (reserva && !vende) return deAgenda;
  if (vende && reserva) {
    const m = como?.tipos?.[id];
    if (m === 'producto') return 'producto';
    if (m === 'cita' || m === 'grupo') return deAgenda;
    return tipoPorDefecto(modo, k);
  }
  return modo === 'ecommerce' ? 'producto' : deAgenda;
}

/** El modo cuyo vocabulario corresponde a un tipo: «productos», «servicios», «clases». */
export const modoDelTipo = (t: TipoItem): BusinessMode =>
  t === 'producto' ? 'ecommerce' : t === 'grupo' ? 'recurring_appointment' : 'appointment';

export interface Opcion {
  id: string;
  etiqueta: string;
  /** null = sin control de stock. */
  quedan: number | null;
}

export interface Grupo {
  id: string;
  /** 'sched:<producto>:<grupo>': lo que se guarda en slot_start. */
  clave: string;
  etiqueta: string;
  cuando: string;
  /** -1 = sin límite. */
  cupo: number;
  libres: number | null;
}

export interface Item {
  id: string;
  nombre: string;
  descripcion: string;
  precio: number | null;
  familia: string;
  fotos: string[];
  tipo: TipoItem;
  /** Minutos que dura (citas). */
  duracion: number;
  /** Producto sin opciones: lo que queda. null = sin control. */
  quedan: number | null;
  opciones: Opcion[];
  grupos: Grupo[];
  vigenciaMeses: number;
}

export interface Escaparate {
  modo: BusinessMode | null;
  items: Item[];
  familias: string[];
  agenda: DatosAgenda;
  pideProfesional: boolean;
  entrega: 'delivery' | 'pickup' | 'both';
  direccion: string;
  hoy: string;
  ahora: string;
}

const json = <T>(raw: string | null | undefined, porDefecto: T): T => {
  if (!raw) return porDefecto;
  try {
    return (JSON.parse(raw) as T) ?? porDefecto;
  } catch {
    return porDefecto;
  }
};

/** Cloudinary a la medida del uso; las de otros sitios, tal cual. */
export function foto(url: string, ancho: number): string {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return '';
    const marca = '/image/upload/';
    const i = u.pathname.indexOf(marca);
    if (u.hostname !== 'res.cloudinary.com' || i < 0) return u.toString();
    u.pathname = `${u.pathname.slice(0, i + marca.length)}c_limit,w_${ancho}/f_auto,q_auto/${u.pathname.slice(i + marca.length)}`;
    return u.toString();
  } catch {
    return '';
  }
}

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** [1,3,5] y '16:00' → «lun, mié, vie · 16:00». */
export function cuandoGrupo(dias: number[], hora: string): string {
  const d = [...dias].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((x) => DIAS_CORTOS[x] ?? '');
  return `${d.filter(Boolean).join(', ')}${hora ? ` · ${hora}` : ''}`;
}

export function armarEscaparate(c: DatosCrudos, como?: ComoSeOfrece | null): Escaparate {
  const modo = c.negocio.modo;
  const paso = c.negocio.slot_minutes && c.negocio.slot_minutes > 0 ? c.negocio.slot_minutes : 60;

  const ocupados = [
    ...c.citas
      .filter((a) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(a.slot_start))
      .map((a) => ({
        inicio: a.slot_start,
        fin: a.slot_end && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(a.slot_end) ? a.slot_end : sumarMin(a.slot_start, a.slot_minutes || paso),
        empleado: a.employee_id ?? '',
      })),
    ...c.web
      .filter((r) => r.slot_end && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(r.slot_start))
      .map((r) => ({ inicio: r.slot_start, fin: r.slot_end as string, empleado: r.employee_id ?? '' })),
  ];

  const fotosDe = new Map<string, string[]>();
  for (const m of c.media) {
    if (m.tipo !== 'image') continue;
    const url = foto(m.url, 800);
    if (!url) continue;
    fotosDe.set(m.catalog_id, [...(fotosDe.get(m.catalog_id) ?? []), url]);
  }

  const items: Item[] = c.catalogo
    .filter((k) => vigenteHoy(k.promo_vigencia, c.hoy))
    .map((k) => {
      const franjas = json<FranjaRecurrente[]>(k.grupos, []);
      const tipo = tipoDe(modo, { conGrupos: franjas.length > 0, duracion: k.duracion }, como, k.id);
      const quedanDe = (stock: number | null, variante: string) =>
        stock === null || stock === undefined ? null : Math.max(0, stock - (c.apartado[`${k.id}|${variante}`] ?? 0));
      const opciones = c.variantes
        .filter((v) => v.catalog_id === k.id)
        .map((v) => ({ id: v.id, etiqueta: v.etiqueta, quedan: quedanDe(v.stock, v.id) }));
      const grupos: Grupo[] = franjas.map((f) => {
        const clave = `sched:${k.id}:${f.id}`;
        const tomados =
          c.citas.filter((a) => ocupa(a, clave, c.hoy)).length + c.web.filter((r) => r.slot_start === clave).length;
        const cupo = typeof f.capacity === 'number' ? f.capacity : -1;
        return {
          id: f.id,
          clave,
          etiqueta: f.label || cuandoGrupo(f.days ?? [], f.time ?? ''),
          cuando: cuandoGrupo(f.days ?? [], f.time ?? ''),
          cupo,
          libres: cupo < 0 ? null : Math.max(0, cupo - tomados),
        };
      });
      return {
        id: k.id,
        nombre: k.nombre,
        descripcion: (k.descripcion ?? '').trim(),
        precio: k.precio === null || k.precio === undefined ? null : Number(k.precio),
        familia: (k.familia ?? '').trim(),
        fotos: fotosDe.get(k.id) ?? [],
        tipo,
        duracion: k.duracion && k.duracion > 0 ? k.duracion : paso,
        quedan: opciones.length ? null : quedanDe(k.stock, ''),
        opciones,
        grupos,
        vigenciaMeses: k.vigencia_meses && k.vigencia_meses > 0 ? k.vigencia_meses : 1,
      };
    });

  const familias = [...new Set(items.map((i) => i.familia).filter(Boolean))];

  return {
    modo,
    items,
    familias,
    agenda: {
      horario: json<Horario>(c.negocio.horario, {}),
      paso,
      equipo: c.equipo.map((e) => ({ id: e.id, nombre: e.nombre, horario: json<Horario>(e.horario, {}) })),
      bloqueos: c.bloqueos.map((b) => ({ empleado: b.employee_id, inicio: b.inicio, fin: b.fin })),
      ocupados,
    },
    pideProfesional: Number(c.negocio.pide_profesional ?? 0) === 1 && c.equipo.length > 0,
    entrega: c.negocio.entrega ?? 'both',
    direccion: (c.negocio.direccion ?? '').trim(),
    hoy: c.hoy,
    ahora: c.ahora,
  };
}

/* ── Dinero y textos ─────────────────────────────────────────────────────── */

export const soles = (n: number | null | undefined): string => {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return 'A consultar';
  const v = Number(n);
  return `S/ ${Number.isInteger(v) ? v : v.toFixed(2)}`;
};

/** «jue 23 oct, 16:00». */
export const cuandoCita = (inicio: string) => `${fechaCorta(inicio.slice(0, 10))}, ${inicio.slice(11, 16)}`;

/* ── Lo que escribe el cliente ───────────────────────────────────────────── */

export interface DatosCliente {
  nombre: string;
  telefono: string;
}

export type ErroresCliente = Partial<Record<'nombre' | 'telefono' | 'direccion', string>>;

export function validarCliente(d: DatosCliente & { direccion?: string; conDelivery?: boolean }): ErroresCliente {
  const e: ErroresCliente = {};
  if (d.nombre.trim().length < 2 || d.nombre.trim().length > 80) e.nombre = 'Escribe tu nombre';
  if (!/^\d{8,15}$/.test(telefonoNormal(d.telefono))) e.telefono = 'Revisa tu número';
  if (d.conDelivery && (d.direccion ?? '').trim().length < 5) e.direccion = 'Escribe la dirección completa';
  return e;
}

/* ── Los mensajes de WhatsApp ────────────────────────────────────────────── */

export interface LineaPedido {
  nombre: string;
  opcion: string;
  precio: number;
  cantidad: number;
}

export function mensajePedido(
  codigo: string,
  p: { lineas: LineaPedido[]; total: number; entrega: 'recojo' | 'delivery'; direccion: string; referencia: string; nombre: string; telefono: string },
): string {
  const l = [`Hola, hice un pedido en tu página (${codigo}):`];
  for (const x of p.lineas) {
    l.push(`• ${x.cantidad} × ${x.nombre}${x.opcion ? ` · ${x.opcion}` : ''} — ${soles(x.precio * x.cantidad)}`);
  }
  l.push(`Total: ${soles(p.total)}`);
  l.push(
    p.entrega === 'delivery'
      ? `Entrega en: ${p.direccion.trim()}${p.referencia.trim() ? ` (${p.referencia.trim()})` : ''}`
      : 'Lo recojo en el local',
  );
  l.push(`A nombre de: ${p.nombre.trim()} · ${telefonoBonito(telefonoNormal(p.telefono))}`);
  return l.join('\n');
}

export function mensajeReserva(
  codigo: string,
  r: { servicio: string; precio: number | null; inicio?: string; grupo?: string; profesional?: string; beneficiario: string; nombre: string; esGrupo: boolean },
): string {
  const l = [r.esGrupo ? `Hola, separé mi cupo en tu página (${codigo}):` : `Hola, separé una cita en tu página (${codigo}):`];
  l.push(`• ${r.servicio}${r.precio !== null ? ` · ${soles(r.precio)}` : ''}`);
  if (r.esGrupo && r.grupo) l.push(`• Horario: ${r.grupo}`);
  if (!r.esGrupo && r.inicio) l.push(`• ${cuandoCita(r.inicio)}`);
  if (r.profesional) l.push(`• Con: ${r.profesional}`);
  if (r.beneficiario.trim()) l.push(`• ${r.esGrupo ? 'Alumno' : 'Para'}: ${r.beneficiario.trim()}`);
  l.push(`A nombre de: ${r.nombre.trim()}`);
  return l.join('\n');
}
