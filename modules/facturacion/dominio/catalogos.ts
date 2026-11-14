/** Los códigos de SUNAT que todos los proveedores comparten. */
import type { TipoComprobante, TipoDocCliente } from './tipos';

/** Catálogo 01. */
export const CODIGO_COMPROBANTE: Record<TipoComprobante, '01' | '03'> = { factura: '01', boleta: '03' };

/** Catálogo 06. «sin_documento» lo escribe cada proveedor a su modo; aquí, el código de SUNAT. */
export const CODIGO_DOC_CLIENTE: Record<TipoDocCliente, string> = { dni: '1', ruc: '6', ce: '4', sin_documento: '0' };

export const NOMBRE_DOC_CLIENTE: Record<TipoDocCliente, string> = {
  dni: 'DNI', ruc: 'RUC', ce: 'C.E.', sin_documento: '',
};

export const NOMBRE_COMPROBANTE: Record<TipoComprobante, string> = {
  boleta: 'Boleta de venta electrónica',
  factura: 'Factura electrónica',
};

/** Catálogo 52. */
export const LEYENDAS: Record<string, string> = {
  '2001': 'Bienes transferidos en la Amazonía región selva para ser consumidos en la misma',
  '2002': 'Servicios prestados en la Amazonía región selva para ser consumidos en la misma',
};
