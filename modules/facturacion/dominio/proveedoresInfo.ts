/**
 * Lo que el panel necesita saber de cada proveedor para pintar Ajustes. Sin
 * código de servidor: se puede importar desde el navegador. La conexión de
 * verdad está en modules/facturacion/proveedores.
 */
import type { IdProveedor } from './tipos';

export interface InfoProveedor {
  nombre: string;
  /** Pide ubigeo, departamento, provincia y distrito del emisor en cada comprobante. */
  pideUbigeo: boolean;
  /** Si emite de verdad. El simulado solo sirve en pruebas. */
  real: boolean;
  /** Dónde sacar el token, en palabras del dueño. */
  comoConectar: string;
}

export const INFO_PROVEEDOR: Record<IdProveedor, InfoProveedor> = {
  lucode: {
    nombre: 'Lucode (APISUNAT)',
    pideUbigeo: false,
    real: true,
    comoConectar:
      'Crea la empresa en lucode.pe › Organizaciones y copia su token. En tu clave SOL, autoriza a Lucode como tu proveedor (PSE).',
  },
  apisperu: {
    nombre: 'APIsPerú',
    pideUbigeo: true,
    real: true,
    comoConectar:
      'Da de alta la empresa en facturacion.apisperu.com con su certificado digital y un usuario SOL secundario, elige beta o producción allí, y copia el token de la empresa.',
  },
  simulado: {
    nombre: 'Prueba local (no envía a SUNAT)',
    pideUbigeo: false,
    real: false,
    comoConectar: 'No necesita token. Sirve para ver cómo sale el ticket; nada llega a SUNAT.',
  },
};
