// La imagen que WhatsApp muestra al mandar el enlace de la boleta. Ver modules/facturacion/servidor/imagenTicket.
import { imagenTicket, rpcPublica, TAMANO } from '@/modules/facturacion/servidor/imagenTicket';
import { comprobanteDe } from '@/modules/facturacion/dominio/fila';

export const size = TAMANO;
export const contentType = 'image/png';
export const alt = 'Tu comprobante';
export const revalidate = 3600;

export default async function Imagen({ params }: { params: { id: string } }) {
  const d = await rpcPublica('factura_publica', params.id);
  if (!d) return imagenTicket(null);
  const c = comprobanteDe(d as Parameters<typeof comprobanteDe>[0]);
  const [a, m, dd] = c.fecha.split('-');
  return imagenTicket({
    negocio: c.emisor.nombreComercial || c.emisor.razonSocial,
    documento: c.tipo === 'factura' ? 'FACTURA ELECTRÓNICA' : 'BOLETA ELECTRÓNICA',
    numero: `${c.serie}-${c.numero}`,
    fecha: `${dd}/${m}/${a} ${c.hora.slice(0, 5)}`,
    lineas: c.lineas.map((l) => ({ descripcion: l.descripcion, cantidad: l.cantidad, importe: l.importe ?? l.cantidad * l.precio })),
    total: c.totales.total,
  });
}
