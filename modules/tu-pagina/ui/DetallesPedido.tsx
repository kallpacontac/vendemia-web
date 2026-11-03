/**
 * Lo que el cliente dejó para el negocio al pedir (0014_detalles_del_pedido.sql). Sale
 * en las dos pestañas de /panel/pedidos. Sin la migración esos campos no llegan y aquí
 * simplemente no se pinta nada.
 */
import { MapPin, MessageSquare, Wallet } from 'lucide-react';
import { esEnlaceMaps } from '@/modules/tu-pagina/dominio/tienda';

export default function DetallesPedido({ direccion, nota, ubicacion, pagaraCon }: {
  direccion?: string | null;
  nota?: string | null;
  ubicacion?: string | null;
  pagaraCon?: string | null;
}) {
  const enlace = ubicacion?.trim() ?? '';
  if (!direccion && !nota?.trim() && !enlace && !pagaraCon) return null;
  return (
    <div className="tp-panel-detalles">
      {direccion && <span><MapPin size={13} aria-hidden="true" /> {direccion}</span>}
      {/* El enlace lo escribió el cliente: solo se abre si de verdad es de Google Maps. */}
      {esEnlaceMaps(enlace) && <a href={enlace} target="_blank" rel="noopener noreferrer"><MapPin size={13} aria-hidden="true" /> Ver ubicación en Maps</a>}
      {pagaraCon && <span><Wallet size={13} aria-hidden="true" /> Pagará con {pagaraCon}</span>}
      {nota?.trim() && <span className="tp-panel-detalles__nota"><MessageSquare size={13} aria-hidden="true" /> {nota.trim()}</span>}
    </div>
  );
}
