/**
 * Lo que SUNAT rechazaría, dicho antes de mandarlo y en palabras del local.
 * Lo usan el formulario (para avisar mientras se escribe) y el servidor (que no
 * se fía del navegador).
 */
import type { Cliente, Emisor, LineaEntrada, TipoComprobante } from './tipos';

/** Por encima de esto la boleta necesita el documento del cliente (SUNAT). */
export const TOPE_BOLETA_SIN_DOCUMENTO = 700;
export const MAX_LINEAS = 100;

export const soloDigitos = (s: string) => (s ?? '').replace(/\D/g, '');

export const dniValido = (s: string) => /^\d{8}$/.test(s);

/** RUC: 11 dígitos, prefijo 10/15/16/17/20 y dígito verificador (módulo 11). */
export function rucValido(ruc: string): boolean {
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((s, p, i) => s + p * Number(ruc[i]), 0);
  const dv = (11 - (suma % 11)) % 10;
  return dv === Number(ruc[10]);
}

const ceValido = (s: string) => /^[A-Za-z0-9]{8,12}$/.test(s);

export function serieValida(tipo: TipoComprobante, serie: string): boolean {
  return (tipo === 'boleta' ? /^B[A-Z0-9]{3}$/ : /^F[A-Z0-9]{3}$/).test(serie);
}

/** Los problemas del cliente, o [] si está bien. */
export function erroresCliente(tipo: TipoComprobante, c: Cliente, total: number): string[] {
  const e: string[] = [];
  if (tipo === 'factura') {
    if (c.tipoDoc !== 'ruc') e.push('La factura es para empresas o personas con RUC. Si no tiene RUC, emite una boleta.');
    else if (!rucValido(c.numDoc)) e.push('Ese RUC no es válido. Revisa los 11 dígitos.');
    if (!c.nombre.trim()) e.push('Falta la razón social del cliente.');
    return e;
  }
  if (c.tipoDoc === 'sin_documento') {
    if (total > TOPE_BOLETA_SIN_DOCUMENTO) {
      e.push(`Por encima de S/${TOPE_BOLETA_SIN_DOCUMENTO} la boleta necesita el DNI del cliente.`);
    }
    return e;
  }
  if (c.tipoDoc === 'dni' && !dniValido(c.numDoc)) e.push('El DNI tiene 8 dígitos.');
  if (c.tipoDoc === 'ruc' && !rucValido(c.numDoc)) e.push('Ese RUC no es válido. Revisa los 11 dígitos.');
  if (c.tipoDoc === 'ce' && !ceValido(c.numDoc)) e.push('El carné de extranjería tiene de 8 a 12 caracteres.');
  if (!c.nombre.trim()) e.push('Falta el nombre del cliente.');
  return e;
}

export function erroresLineas(lineas: LineaEntrada[]): string[] {
  if (!lineas.length) return ['Agrega al menos una línea.'];
  if (lineas.length > MAX_LINEAS) return [`Como máximo ${MAX_LINEAS} líneas por comprobante.`];
  const e: string[] = [];
  lineas.forEach((l, i) => {
    const n = lineas.length > 1 ? ` (línea ${i + 1})` : '';
    if (!l.descripcion.trim()) e.push(`Falta la descripción${n}.`);
    if (!(l.cantidad > 0) || l.cantidad > 1_000_000) e.push(`La cantidad tiene que ser mayor que cero${n}.`);
    if (!(l.precio > 0) || l.precio > 1_000_000) e.push(`El precio tiene que ser mayor que cero${n}.`);
  });
  return e;
}

/** Lo que falta en Ajustes para poder emitir con este proveedor. */
export function erroresEmisor(e: Emisor, pideUbigeo: boolean): string[] {
  const r: string[] = [];
  if (!rucValido(e.ruc)) r.push('El RUC del negocio no es válido.');
  if (!e.razonSocial.trim()) r.push('Falta la razón social del negocio.');
  if (!e.direccion.trim()) r.push('Falta la dirección fiscal.');
  if (pideUbigeo) {
    if (!/^\d{6}$/.test(e.ubigeo)) r.push('El ubigeo son 6 dígitos (por ejemplo 150101 para Lima).');
    if (!e.departamento.trim() || !e.provincia.trim() || !e.distrito.trim()) {
      r.push('Faltan departamento, provincia o distrito.');
    }
  }
  return r;
}
