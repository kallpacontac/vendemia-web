/**
 * El registro de proveedores. Para cambiar de proveedor NO se toca código: se
 * elige en Ajustes. Para añadir uno nuevo, una línea aquí (ver tipos.ts).
 */
import type { IdProveedor } from '../dominio/tipos';
import { apisperu } from './apisperu';
import { lucode } from './lucode';
import { simulado } from './simulado';
import type { Proveedor } from './tipos';

const REGISTRO: Record<IdProveedor, Proveedor> = { lucode, apisperu, simulado };

export function proveedor(id: string): Proveedor | null {
  return (REGISTRO as Record<string, Proveedor>)[id] ?? null;
}

export type { Proveedor, Credencial, PedidoBaja } from './tipos';
