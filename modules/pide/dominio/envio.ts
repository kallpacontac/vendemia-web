/**
 * ══════════════════════════════════════════════════════════════════════════
 * UN ENVÍO · los datos, sus reglas y el mensaje de WhatsApp
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Funciones puras: las usan el formulario público (para avisar antes de
 * enviar), la ruta del servidor (que no se fía del navegador) y el panel. La
 * última palabra la tiene Postgres (pide_srv_envio_crear y los CHECK de la
 * tabla); esto existe para que el cliente vea el error en su campo y no un
 * «algo falló» después de rellenar todo.
 */

export type Franja = 'manana' | 'tarde';
export type EstadoEnvio = 'por_recoger' | 'impreso' | 'recogido' | 'entregado' | 'cancelado';

export interface DatosEnvio {
  remitente_nombre: string;
  remitente_telefono: string;
  destinatario_nombre: string;
  destinatario_telefono: string;
  direccion: string;
  distrito: string;
  referencia: string;
  contenido: string;
  bultos: number;
  peso_kg: string;
  /** Vacío = no se cobra nada al entregar. */
  contra_entrega: string;
  recojo_fecha: string;
  recojo_franja: Franja;
}

export interface Envio extends Omit<DatosEnvio, 'peso_kg' | 'contra_entrega'> {
  id: string;
  company_id: string;
  codigo: string;
  peso_kg: number | null;
  contra_entrega: number | null;
  estado: EstadoEnvio;
  origen: 'web' | 'panel';
  impreso_at: string | null;
  creado_at: string;
}

export const FRANJAS: { id: Franja; nombre: string; horas: string }[] = [
  { id: 'manana', nombre: 'Por la mañana', horas: '9:00 – 13:00' },
  { id: 'tarde', nombre: 'Por la tarde', horas: '14:00 – 18:00' },
];

export const ESTADOS: { id: EstadoEnvio; nombre: string }[] = [
  { id: 'por_recoger', nombre: 'Por recoger' },
  { id: 'impreso', nombre: 'Etiqueta impresa' },
  { id: 'recogido', nombre: 'En camino' },
  { id: 'entregado', nombre: 'Entregado' },
  { id: 'cancelado', nombre: 'Cancelado' },
];

export const nombreEstado = (e: EstadoEnvio) => ESTADOS.find((x) => x.id === e)?.nombre ?? e;
export const nombreFranja = (f: Franja) => FRANJAS.find((x) => x.id === f)?.nombre ?? f;

/** Perú: 9 dígitos que empiezan por 9 → con el 51. Lo demás, tal cual (solo dígitos). */
export function telefonoNormal(v: string): string {
  const d = (v ?? '').replace(/\D/g, '');
  return d.length === 9 && d.startsWith('9') ? `51${d}` : d;
}

/** Para enseñar: 51987654321 → 987 654 321. */
export function telefonoBonito(v: string): string {
  const d = (v ?? '').replace(/\D/g, '');
  const local = d.length === 11 && d.startsWith('51') ? d.slice(2) : d;
  return local.length === 9 ? `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}` : local;
}

/** Hoy en Lima, 'YYYY-MM-DD'. */
export function hoyLima(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** «jue 16 oct». */
export function fechaCorta(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  return d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(/[.,]/g, '');
}

export type Errores = Partial<Record<keyof DatosEnvio, string>>;

/** Los errores por campo, en palabras del cliente. Vacío = se puede enviar. */
export function validarEnvio(d: DatosEnvio, o: { distritos?: string[]; hoy?: string } = {}): Errores {
  const e: Errores = {};
  const hoy = o.hoy ?? hoyLima();
  const largo = (v: string, min: number, max: number) => v.trim().length >= min && v.trim().length <= max;
  if (!largo(d.remitente_nombre, 2, 80)) e.remitente_nombre = 'Escribe tu nombre';
  if (!/^\d{8,15}$/.test(telefonoNormal(d.remitente_telefono))) e.remitente_telefono = 'Revisa tu número';
  if (!largo(d.destinatario_nombre, 2, 80)) e.destinatario_nombre = 'Escribe a quién va';
  if (!/^\d{8,15}$/.test(telefonoNormal(d.destinatario_telefono))) e.destinatario_telefono = 'Revisa el número';
  if (!largo(d.direccion, 5, 200)) e.direccion = 'Escribe la dirección completa';
  if (!largo(d.distrito, 2, 60)) e.distrito = 'Elige el distrito';
  else if (o.distritos?.length && !o.distritos.includes(d.distrito)) e.distrito = 'Ese distrito no lo atendemos';
  if (d.referencia.length > 200) e.referencia = 'Máximo 200 letras';
  if (d.contenido.length > 200) e.contenido = 'Máximo 200 letras';
  if (!Number.isInteger(d.bultos) || d.bultos < 1 || d.bultos > 50) e.bultos = 'De 1 a 50';
  if (d.peso_kg.trim() && !(Number(d.peso_kg.replace(',', '.')) > 0)) e.peso_kg = 'Pon un número';
  if (d.contra_entrega.trim() && !(Number(d.contra_entrega.replace(',', '.')) > 0)) e.contra_entrega = 'Pon el monto';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.recojo_fecha) || d.recojo_fecha < hoy || d.recojo_fecha > sumarDias(hoy, 60)) {
    e.recojo_fecha = 'Elige un día desde hoy';
  }
  if (d.recojo_franja !== 'manana' && d.recojo_franja !== 'tarde') e.recojo_franja = 'Elige mañana o tarde';
  return e;
}

/** Lo que viaja a la base: teléfonos normalizados, números con punto. */
export function aGuardar(d: DatosEnvio) {
  const num = (v: string) => (v.trim() ? Number(v.replace(',', '.')) : null);
  return {
    ...d,
    remitente_nombre: d.remitente_nombre.trim(),
    destinatario_nombre: d.destinatario_nombre.trim(),
    remitente_telefono: telefonoNormal(d.remitente_telefono),
    destinatario_telefono: telefonoNormal(d.destinatario_telefono),
    direccion: d.direccion.trim(),
    distrito: d.distrito.trim(),
    referencia: d.referencia.trim(),
    contenido: d.contenido.trim(),
    peso_kg: num(d.peso_kg),
    contra_entrega: num(d.contra_entrega),
  };
}

/**
 * El mensaje que el cliente manda al negocio. Lleva TODO: sin bot, es lo que
 * el dueño lee; con bot, es lo que Mia recibe. Y al cliente le queda de prueba.
 */
export function mensajeEnvio(codigo: string, d: DatosEnvio): string {
  const l = [
    `Hola, agendé un envío (${codigo}):`,
    `• Recojo: ${fechaCorta(d.recojo_fecha)}, ${nombreFranja(d.recojo_franja).toLowerCase()}`,
    `• Para: ${d.destinatario_nombre.trim()} · ${telefonoBonito(telefonoNormal(d.destinatario_telefono))}`,
    `• Dirección: ${d.direccion.trim()}, ${d.distrito.trim()}${d.referencia.trim() ? ` (${d.referencia.trim()})` : ''}`,
    `• ${d.bultos} ${d.bultos === 1 ? 'bulto' : 'bultos'}${d.contenido.trim() ? `: ${d.contenido.trim()}` : ''}`,
  ];
  if (d.contra_entrega.trim()) l.push(`• Cobrar al entregar: S/ ${Number(d.contra_entrega.replace(',', '.')).toFixed(2)}`);
  l.push(`Envía: ${d.remitente_nombre.trim()}`);
  return l.join('\n');
}

export const urlWhatsApp = (numero: string, texto: string) => `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
