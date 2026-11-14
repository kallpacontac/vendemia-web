'use client';
/**
 * Lo que el panel le pide a Boletas y facturas. Leer va directo a Postgres con la
 * sesión (las RPC comprueban dueño/administrador); emitir, anular y guardar el
 * token pasan por /api/facturacion, que es quien tiene los tokens.
 */
import QRCode from 'qrcode';
import { supabase } from '@/lib/supabase/client';
import { comprobanteDe } from '../dominio/fila';
import { textoQr, ticketHtml } from '../dominio/impreso';
import type { ComprobanteGuardado, IdProveedor, LineaEntrada, Cliente, TipoComprobante } from '../dominio/tipos';

export interface Ajustes {
  company_id: string;
  activo: boolean;
  proveedor: IdProveedor;
  ambiente: 'pruebas' | 'produccion';
  ruc: string;
  razon_social: string;
  nombre_comercial: string;
  direccion: string;
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
  serie_boleta: string;
  serie_factura: string;
  /** mype = restaurante u hotel MYPE: la tasa la pone la fecha (sql/0001, factura_tasa_mype). */
  igv_tipo: 'gravado' | 'mype' | 'exonerado';
  /** Solo cuenta con «gravado». */
  igv_porcentaje: number;
  /** La tasa con la que saldría un comprobante emitido ahora (0 si exonerado). Con esta se calcula. */
  igv_tasa_hoy: number;
  /** Solo «mype»: el próximo cambio de tasa. */
  igv_tasa_cambio: { desde: string; tasa: number } | null;
  leyenda_amazonia: '2001' | '2002' | null;
  ticket_ancho: 58 | 80;
  rol: 'dueno' | 'admin';
  configurado: boolean;
  /** proveedor → últimos 4 caracteres del token guardado. */
  tokens: Record<string, string>;
  ultimo_boleta: number;
  ultimo_factura: number;
}

/** La base aún sin la SQL 0001 de facturación. */
export class SinTablas extends Error {}

const faltaFuncion = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST202' || e.code === '42883' || /Could not find the function/i.test(e.message ?? '');

export async function leerAjustes(companyId: string): Promise<Ajustes> {
  const { data, error } = await supabase().rpc('factura_ajustes_leer', { p_company: companyId });
  if (error) throw faltaFuncion(error) ? new SinTablas() : new Error(error.message);
  return normalizar(data as Ajustes);
}

/** Postgres devuelve los numeric como texto. */
function normalizar(a: Ajustes): Ajustes {
  const c = a.igv_tasa_cambio;
  return {
    ...a,
    igv_porcentaje: Number(a.igv_porcentaje),
    igv_tasa_hoy: Number(a.igv_tasa_hoy),
    igv_tasa_cambio: c ? { desde: String(c.desde), tasa: Number(c.tasa) } : null,
    ticket_ancho: Number(a.ticket_ancho) === 58 ? 58 : 80,
  };
}

/** 10.5 → «10,5». */
export const tasaTexto = (n: number) => n.toLocaleString('es-PE', { maximumFractionDigits: 2 });

export async function leerComprobantes(companyId: string, desde: string, hasta: string): Promise<ComprobanteGuardado[]> {
  const { data, error } = await supabase().rpc('factura_lista', { p_company: companyId, p_desde: desde, p_hasta: hasta });
  if (error) throw faltaFuncion(error) ? new SinTablas() : new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(comprobanteDe);
}

async function llamar<T>(cuerpo: Record<string, unknown>): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Tu sesión terminó. Vuelve a entrar al panel.');
  const r = await fetch('/api/facturacion', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(cuerpo),
  });
  const j = (await r.json().catch(() => null)) as ({ status: string; mensaje?: string } & T) | null;
  if (!j || j.status !== 'ok') throw new Error(j?.mensaje || 'No pudimos completar la operación. Inténtalo otra vez.');
  return j;
}

export async function guardarAjustes(companyId: string, datos: Record<string, unknown>, token: string | null) {
  const r = await llamar<{ ajustes: Ajustes }>({ accion: 'guardar_ajustes', companyId, datos, token });
  return normalizar(r.ajustes);
}

export async function emitir(p: {
  companyId: string;
  clave: string;
  tipo: TipoComprobante;
  cliente: Cliente;
  lineas: LineaEntrada[];
  ref?: { tipo: string; id: string };
}): Promise<ComprobanteGuardado> {
  const r = await llamar<{ comprobante: Record<string, unknown> }>({ accion: 'emitir', ...p });
  return comprobanteDe(r.comprobante);
}

export async function actuar(
  accion: 'consultar' | 'reintentar' | 'anular',
  companyId: string,
  id: string,
  motivo?: string,
): Promise<ComprobanteGuardado> {
  const r = await llamar<{ comprobante: Record<string, unknown> }>({ accion, companyId, id, ...(motivo ? { motivo } : {}) });
  return comprobanteDe(r.comprobante);
}

/** Abre el ticket en una ventana aparte y lanza la impresión (o «Guardar como PDF»). */
export async function imprimir(c: ComprobanteGuardado, ancho: 58 | 80) {
  // La ventana se abre YA, dentro del clic: si se abre después del await, el navegador la bloquea.
  const w = window.open('', '_blank', 'width=420,height=720');
  if (!w) throw new Error('El navegador bloqueó la ventana del ticket. Permite las ventanas emergentes de Vendemia.');
  const qrDataUrl = c.hash ? await QRCode.toDataURL(textoQr(c), { margin: 0, width: 240, errorCorrectionLevel: 'M' }) : '';
  w.document.open();
  w.document.write(ticketHtml(c, { ancho, qrDataUrl }));
  w.document.close();
  w.focus();
  // Dar tiempo a que pinte el QR antes de abrir el diálogo de impresión.
  setTimeout(() => w.print(), 350);
}

/** Texto para mandar por WhatsApp. */
export function textoWhatsApp(c: ComprobanteGuardado): string {
  const nombre = c.tipo === 'factura' ? 'Factura electrónica' : 'Boleta electrónica';
  const lineas = [
    `${nombre} ${c.serie}-${c.numero}`,
    `${c.emisor.nombreComercial || c.emisor.razonSocial} · RUC ${c.emisor.ruc}`,
    `Total: S/ ${c.totales.total.toFixed(2)}`,
  ];
  if (c.pdfUrl) lineas.push(c.pdfUrl);
  return lineas.join('\n');
}

/** Soles con céntimos: en un comprobante S/ 34,90 no es S/ 35 (lib/panel/format redondea). */
export const soles2 = (n: number) =>
  `S/ ${Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const nuevaClave = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
