/**
 * agenda.vendemias.com/<negocio>/reservar · solo lo que se reserva (o tienda.*).
 *
 * El enlace que va en la bio de Instagram de un salón: entra directo a sus
 * servicios y grupos, sin el carrito ni los productos. Es el mismo escaparate
 * de la portada con `solo="reservas"`; la reserva la decide el mismo servidor.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import Marco from '@/modules/tu-pagina/publico/Marco';
import Escaparate from '@/modules/tu-pagina/publico/Escaparate';
import { paginaDe } from '@/modules/tu-pagina/servidor/pagina';
import { escaparateDe } from '@/modules/tu-pagina/servidor/escaparate';

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await paginaDe(params.slug).catch(() => null);
  return p?.secciones.reservar ? { title: `Reservar · ${p.titulo}` } : { title: 'Vendemia', robots: { index: false } };
}

export default async function PaginaReservar({ params }: Props) {
  const p = await paginaDe(params.slug);
  if (!p?.secciones.reservar) notFound();
  const esc = await escaparateDe(p.slug, p.secciones);
  const reservables = (esc?.items ?? []).filter((i) => i.tipo !== 'producto');
  const soloGrupos = reservables.length > 0 && reservables.every((i) => i.tipo === 'grupo');

  return (
    <Marco pagina={p} vista="agenda">
      <div className="tp-hoja">
        <a className="tp-volver" href={`../${p.slug}`}>
          <ChevronLeft size={18} aria-hidden="true" /> {p.titulo}
        </a>
        <h1 className="tp-h1">{soloGrupos ? 'Separar mi cupo' : 'Reservar una cita'}</h1>
        <p className="tp-lead">
          {soloGrupos ? 'Elige tu horario y separa tu lugar.' : 'Elige el servicio, el día y la hora.'} Al terminar, nos avisas por WhatsApp con todo ya escrito.
        </p>
        {esc && reservables.length > 0 ? (
          <Escaparate
            esc={esc}
            slug={p.slug}
            whatsapp={p.whatsapp}
            disposicion="filas"
            puedePedir={false}
            puedeReservar
            solo="reservas"
          />
        ) : (
          <p className="tp-vacio">Por ahora no hay nada para reservar aquí. Escríbenos por WhatsApp.</p>
        )}
      </div>
    </Marco>
  );
}
