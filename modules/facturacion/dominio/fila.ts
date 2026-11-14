/**
 * De la fila de Postgres (comprobantes_electronicos) al tipo de Vendemia, y de
 * Ajustes (factura_ajustes) al emisor y al régimen. Un solo sitio para los
 * nombres de columna.
 */
import type {
  Ambiente, Cliente, ComprobanteGuardado, Emisor, EstadoComprobante, IdProveedor, Linea, RegimenIgv,
} from './tipos';

type Fila = Record<string, unknown>;

const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const arr = <T>(v: unknown): T[] => {
  if (Array.isArray(v)) return v as T[];
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? (p as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
};
const obj = <T>(v: unknown, def: T): T => {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as T;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T;
    } catch {
      return def;
    }
  }
  return def;
};

export function emisorDe(a: Fila): Emisor {
  return {
    ruc: txt(a.ruc),
    razonSocial: txt(a.razon_social),
    nombreComercial: txt(a.nombre_comercial) || txt(a.razon_social),
    direccion: txt(a.direccion),
    ubigeo: txt(a.ubigeo),
    departamento: txt(a.departamento),
    provincia: txt(a.provincia),
    distrito: txt(a.distrito),
  };
}

/**
 * Sirve para las dos filas. De Ajustes viene `igv_tasa_hoy`, que calcula Postgres
 * (para «mype» depende de la fecha: sql/0001, factura_tasa_mype); de un comprobante
 * guardado vale su `igv_porcentaje`, la tasa con la que salió.
 */
export function regimenDe(a: Fila): RegimenIgv {
  const exonerado = txt(a.igv_tipo) === 'exonerado';
  const ley = txt(a.leyenda_amazonia);
  const tasa = a.igv_tasa_hoy !== undefined ? num(a.igv_tasa_hoy) : num(a.igv_porcentaje);
  return {
    tipo: exonerado ? 'exonerado' : 'gravado',
    porcentaje: exonerado ? 0 : tasa || 18,
    leyendaAmazonia: exonerado && (ley === '2001' || ley === '2002') ? ley : null,
  };
}

export function comprobanteDe(f: Fila): ComprobanteGuardado {
  const vacio: Cliente = { tipoDoc: 'sin_documento', numDoc: '', nombre: '', direccion: '' };
  return {
    id: txt(f.id),
    tipo: txt(f.tipo) === 'factura' ? 'factura' : 'boleta',
    serie: txt(f.serie),
    numero: num(f.numero),
    fecha: txt(f.fecha).slice(0, 10),
    hora: txt(f.hora),
    moneda: 'PEN',
    cliente: { ...vacio, ...obj<Partial<Cliente>>(f.cliente, {}) },
    lineas: arr<Linea>(f.lineas),
    totales: {
      opGravadas: num(f.op_gravadas),
      opExoneradas: num(f.op_exoneradas),
      igv: num(f.igv),
      total: num(f.total),
    },
    regimen: regimenDe(f),
    leyendas: arr<string>(f.leyendas),
    emisor: emisorDe(obj<Fila>(f.emisor, {})),
    proveedor: txt(f.proveedor) as IdProveedor,
    ambiente: (txt(f.ambiente) === 'produccion' ? 'produccion' : 'pruebas') as Ambiente,
    estado: txt(f.estado) as EstadoComprobante,
    mensaje: txt(f.mensaje),
    observaciones: arr<string>(f.observaciones),
    hash: txt(f.hash),
    xmlUrl: txt(f.xml_url),
    cdrUrl: txt(f.cdr_url),
    pdfUrl: txt(f.pdf_url),
    ticketBaja: txt(f.ticket_baja),
    motivoBaja: txt(f.motivo_baja),
    refTipo: txt(f.ref_tipo),
    refId: txt(f.ref_id),
    creadoAt: txt(f.creado_at),
  };
}

export const numeroCompleto = (c: { serie: string; numero: number }) => `${c.serie}-${c.numero}`;
