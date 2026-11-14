/**
 * Un proveedor de mentira, para probar el panel sin cuenta en ningún lado. No
 * sale nada a internet ni a SUNAT. La ruta solo lo deja usar en «pruebas», y el
 * ticket impreso lleva «DOCUMENTO DE PRUEBA · SIN VALOR TRIBUTARIO».
 */
import { createHash } from 'crypto';
import type { Proveedor } from './tipos';

const hashDe = (s: string) => createHash('sha256').update(s).digest('base64').slice(0, 28);

export const simulado: Proveedor = {
  id: 'simulado',
  nombre: 'Prueba local (no envía a SUNAT)',
  pideUbigeo: false,
  real: false,
  diasParaAnular: { factura: 7, boleta: 7 },

  async emitir(d) {
    return { estado: 'aceptado', mensaje: 'Simulado: no se envió a SUNAT.', hash: hashDe(`${d.emisor.ruc}-${d.serie}-${d.numero}`) };
  },
  async consultar(d) {
    return { estado: 'aceptado', mensaje: 'Simulado.', hash: hashDe(`${d.emisor.ruc}-${d.serie}-${d.numero}`) };
  },
  async anular() {
    return { estado: 'anulado', mensaje: 'Simulado: anulado sin enviar nada.' };
  },
  async consultarBaja() {
    return { estado: 'anulado', mensaje: 'Simulado.' };
  },
};
