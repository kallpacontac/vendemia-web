/**
 * ══════════════════════════════════════════════════════════════════════════
 * BOLETAS Y FACTURAS · el idioma común
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Todo Vendemia habla de comprobantes con ESTOS tipos. Cada proveedor (Lucode,
 * APIsPerú…) traduce desde aquí a su propio JSON en modules/facturacion/proveedores.
 * Cambiar de proveedor no toca nada de este fichero.
 */

export type TipoComprobante = 'boleta' | 'factura';

/** Los proveedores conectados. Añadir uno: un fichero en proveedores/ y su línea en proveedores/index.ts. */
export const PROVEEDORES = ['lucode', 'apisperu', 'simulado'] as const;
export type IdProveedor = (typeof PROVEEDORES)[number];

export type Ambiente = 'pruebas' | 'produccion';

/**
 * SUNAT, catálogo 06. «sin_documento» es la boleta a «Clientes varios»: solo
 * vale por debajo de S/700 (ver validar.ts). Cada proveedor la escribe a su modo.
 */
export type TipoDocCliente = 'dni' | 'ruc' | 'ce' | 'sin_documento';

export interface Cliente {
  tipoDoc: TipoDocCliente;
  numDoc: string;
  nombre: string;
  direccion: string;
}

/** Lo que escribe quien cobra: el precio que paga el cliente, IGV incluido. */
export interface LineaEntrada {
  descripcion: string;
  cantidad: number;
  /** Precio unitario CON IGV, en soles. Es el número que el negocio conoce. */
  precio: number;
  /** NIU = unidad (bienes), ZZ = servicio. */
  unidad: 'NIU' | 'ZZ';
}

/** Una línea ya calculada, como va al comprobante. */
export interface Linea extends LineaEntrada {
  /** Sin IGV, con 6 decimales (lo que pide SUNAT para el unitario). */
  valorUnitario: number;
  /** Cantidad × valor unitario, 2 decimales. */
  valorVenta: number;
  igv: number;
  /** valorVenta + igv: SIEMPRE igual a precio × cantidad. */
  importe: number;
}

/**
 * Cómo trata el IGV este local. No va por ciudad: un restaurante MYPE de Lima
 * tiene tasa reducida, una tienda de Iquitos puede estar exonerada (Amazonía).
 * El porcentaje lo confirma el contador del local; nosotros no lo adivinamos.
 */
export interface RegimenIgv {
  tipo: 'gravado' | 'exonerado';
  /** 18, o la tasa reducida de restaurantes y hoteles MYPE. Ignorado si exonerado. */
  porcentaje: number;
  /**
   * Amazonía (Ley 27037): 2001 bienes, 2002 servicios. Solo con exonerado.
   * «ambas»: el local vende las dos cosas y cada comprobante lleva la de lo
   * que se vendió en él (sql/0002).
   */
  leyendaAmazonia: '2001' | '2002' | 'ambas' | null;
}

export interface Totales {
  opGravadas: number;
  opExoneradas: number;
  igv: number;
  total: number;
}

/** Los datos del negocio que emite, como salen en el comprobante. */
export interface Emisor {
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  direccion: string;
  /** Solo APIsPerú los pide; Lucode los toma de su panel. */
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
}

/** Un comprobante listo para mandarlo: número asignado y montos calculados. */
export interface ComprobanteListo {
  tipo: TipoComprobante;
  serie: string;
  numero: number;
  /** YYYY-MM-DD, hora de Lima. */
  fecha: string;
  /** HH:MM:SS, hora de Lima. */
  hora: string;
  moneda: 'PEN';
  cliente: Cliente;
  lineas: Linea[];
  totales: Totales;
  regimen: RegimenIgv;
  /** Catálogo 52: 2001/2002 si es Amazonía. La de «SON … SOLES» la añade quien la necesite. */
  leyendas: string[];
  emisor: Emisor;
}

/** Cómo quedó, en palabras de Vendemia. Lo devuelve cualquier proveedor. */
export type EstadoComprobante =
  | 'por_enviar' // Reservado el número; aún no salió.
  | 'pendiente' //  El proveedor lo tiene; SUNAT no contestó todavía.
  | 'aceptado' //   SUNAT lo aceptó (con o sin observaciones). Vale.
  | 'rechazado' //  SUNAT lo rechazó. No vale: hay que emitir otro.
  | 'error' //      No llegó a SUNAT (red, token, datos). Se puede reintentar con el mismo número.
  | 'anulando' //   Se pidió la baja; SUNAT aún no contesta.
  | 'anulado'; //   Dado de baja.

/**
 * Un comprobante tal como está guardado (tabla comprobantes_electronicos). Lleva
 * copia del emisor y del régimen del momento: reimprimir uno de hace un mes no
 * debe cambiar porque luego se tocaron los Ajustes.
 */
export interface ComprobanteGuardado extends ComprobanteListo {
  id: string;
  proveedor: IdProveedor;
  ambiente: Ambiente;
  estado: EstadoComprobante;
  mensaje: string;
  observaciones: string[];
  hash: string;
  xmlUrl: string;
  cdrUrl: string;
  pdfUrl: string;
  ticketBaja: string;
  motivoBaja: string;
  refTipo: string;
  refId: string;
  creadoAt: string;
}

export interface Respuesta {
  estado: EstadoComprobante;
  mensaje: string;
  observaciones?: string[];
  hash?: string;
  xmlUrl?: string;
  cdrUrl?: string;
  pdfUrl?: string;
  /** Algunos proveedores contestan la baja con un ticket que luego se consulta. */
  ticket?: string;
}
