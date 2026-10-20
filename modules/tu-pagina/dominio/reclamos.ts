/**
 * ══════════════════════════════════════════════════════════════════════════
 * MI PÁGINA · Libro de Reclamaciones Virtual
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Apartado opcional (sql/0006_libro_reclamaciones.sql). Aquí lo que comparten
 * la página, la API y el panel: la hoja, cómo se valida, los textos legales y
 * cómo se enseña el número.
 *
 * Ley 29571 (mod. Ley 31435) y D.S. 011-2011-PCM (mod. D.S. 101-2022-PCM):
 * respuesta en 15 días hábiles improrrogables; ninguna casilla de aceptación
 * obligatoria en la hoja.
 */

export type TipoReclamo = 'reclamo' | 'queja';
export type TipoDoc = 'DNI' | 'CE' | 'Pasaporte' | 'RUC';

export interface Proveedor {
  razon_social: string;
  ruc: string;
  direccion: string;
}

export interface HojaNueva {
  tipo: TipoReclamo;
  consumidor: {
    nombre: string;
    tipo_doc: TipoDoc;
    num_doc: string;
    domicilio: string;
    telefono: string;
    email: string;
    menor: boolean;
    apoderado: string;
  };
  bien: { tipo: 'producto' | 'servicio'; descripcion: string; monto: string };
  detalle: string;
  pedido: string;
}

export interface Reclamo {
  id: string;
  numero: number;
  creado_at: string;
  tipo: TipoReclamo;
  proveedor: Proveedor & { nombre_comercial?: string };
  consumidor: HojaNueva['consumidor'];
  bien: { tipo: 'producto' | 'servicio'; descripcion: string; monto: number | null };
  detalle: string;
  pedido: string;
  vence: string;
  estado: 'pendiente' | 'respondido';
  respuesta: string | null;
  respondido_at: string | null;
  /** Cuándo salieron por correo (sql/0006): la constancia. */
  copia_enviada_at?: string | null;
  respuesta_enviada_at?: string | null;
}

export const TIPOS_DOC: TipoDoc[] = ['DNI', 'CE', 'Pasaporte', 'RUC'];

export const DEFINICION: Record<TipoReclamo, string> = {
  reclamo: 'Disconformidad relacionada a los productos o servicios.',
  queja: 'Disconformidad no relacionada a los productos o servicios; o malestar o descontento respecto a la atención al público.',
};

export const AVISOS_LEGALES = [
  'La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.',
  'El proveedor deberá dar respuesta al reclamo o queja en un plazo no mayor a quince (15) días hábiles improrrogables.',
];

/** «N.º 000012-2026». */
export const numeroHoja = (numero: number, fecha: string) => `N.º ${String(numero).padStart(6, '0')}-${fecha.slice(0, 4)}`;

/** RUC peruano: 11 cifras que empiezan por 10, 15, 16, 17 o 20. */
export const rucValido = (v: string) => /^(10|15|16|17|20)\d{9}$/.test(v.replace(/\D/g, ''));

export const proveedorCompleto = (p: Partial<Proveedor> | null | undefined): p is Proveedor =>
  Boolean(p && (p.razon_social ?? '').trim().length >= 2 && rucValido(p.ruc ?? '') && (p.direccion ?? '').trim().length >= 5);

export type ErroresHoja = Partial<Record<'nombre' | 'num_doc' | 'domicilio' | 'telefono' | 'email' | 'apoderado' | 'descripcion' | 'monto' | 'detalle' | 'pedido', string>>;

export function validarHoja(h: HojaNueva): ErroresHoja {
  const e: ErroresHoja = {};
  const c = h.consumidor;
  if (c.nombre.trim().length < 3) e.nombre = 'Escribe tu nombre completo';
  const doc = c.num_doc.replace(/\s/g, '');
  if (c.tipo_doc === 'DNI' ? !/^\d{8}$/.test(doc) : c.tipo_doc === 'RUC' ? !rucValido(doc) : doc.length < 8 || doc.length > 15) {
    e.num_doc = c.tipo_doc === 'DNI' ? 'El DNI tiene 8 cifras' : 'Revisa el número';
  }
  if (c.domicilio.trim().length < 5) e.domicilio = 'Escribe tu dirección';
  if (!/^\d{8,15}$/.test(c.telefono.replace(/\D/g, ''))) e.telefono = 'Revisa tu número';
  if (c.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email.trim())) e.email = 'Revisa tu correo';
  if (c.menor && c.apoderado.trim().length < 3) e.apoderado = 'Nombre del padre, madre o apoderado';
  if (h.bien.descripcion.trim().length < 2) e.descripcion = 'Qué compraste o qué servicio tomaste';
  if (h.bien.monto.trim() && !(Number(h.bien.monto.replace(',', '.')) >= 0)) e.monto = 'Solo el número, ej. 45.50';
  if (h.detalle.trim().length < 10) e.detalle = 'Cuéntanos qué pasó (al menos una frase)';
  if (h.pedido.trim().length < 3) e.pedido = 'Qué solución pides';
  return e;
}

/** Días que faltan hasta `vence` (negativo = vencido), con la fecha de Lima. */
export function diasParaVencer(vence: string, hoy: string): number {
  return Math.round((Date.parse(`${vence}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);
}
