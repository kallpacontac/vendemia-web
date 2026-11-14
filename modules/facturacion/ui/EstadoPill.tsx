'use client';
import type { EstadoComprobante } from '../dominio/tipos';

export const TEXTO_ESTADO: Record<EstadoComprobante, string> = {
  por_enviar: 'Sin enviar',
  pendiente: 'Esperando a SUNAT',
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
  error: 'No se envió',
  anulando: 'Anulando',
  anulado: 'Anulado',
};

export function EstadoPill({ estado }: { estado: EstadoComprobante }) {
  return <span className={`badge-pill fe-estado fe-estado--${estado}`}>{TEXTO_ESTADO[estado] ?? estado}</span>;
}
