// La imagen que WhatsApp muestra al mandar el enlace de la nota. Ver modules/facturacion/servidor/imagenTicket.
import { imagenTicket, rpcPublica, TAMANO } from '@/modules/facturacion/servidor/imagenTicket';
import { notaDe, numeroNota } from '@/modules/facturacion/dominio/nota';

export const size = TAMANO;
export const contentType = 'image/png';
export const alt = 'Tu nota de venta';
export const revalidate = 3600;

export default async function Imagen({ params }: { params: { id: string } }) {
  const d = await rpcPublica('nota_publica', params.id);
  if (!d) return imagenTicket(null);
  const n = notaDe(d);
  return imagenTicket({
    negocio: n.negocio.nombre || n.negocio.razon_social,
    documento: 'NOTA DE VENTA',
    numero: numeroNota(n),
    fecha: new Date(n.emitida_at).toLocaleString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima',
    }),
    lineas: n.lineas.map((l) => ({ descripcion: l.descripcion, cantidad: l.cantidad, importe: l.cantidad * l.precio })),
    total: n.total,
  });
}
