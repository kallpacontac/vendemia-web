/**
 * tienda.vendemias.com/<negocio>/envio · agendar un envío (o agenda.*).
 *
 * El servidor pinta el marco (color, nombre) y el formulario es la única isla
 * con JavaScript.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import Marco from '@/modules/tu-pagina/publico/Marco';
import FormularioEnvio from '@/modules/tu-pagina/publico/FormularioEnvio';
import { paginaDe } from '@/modules/tu-pagina/servidor/pagina';
import { hoyLima } from '@/modules/tu-pagina/dominio/envio';

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await paginaDe(params.slug).catch(() => null);
  return p ? { title: `Agendar un envío · ${p.titulo}` } : { title: 'Vendemia', robots: { index: false } };
}

export default async function PaginaEnvio({ params }: Props) {
  const p = await paginaDe(params.slug);
  if (!p?.secciones.envios) notFound();

  return (
    <Marco pagina={p}>
      <div className="tp-hoja">
        <a className="tp-volver" href={`../${p.slug}`}>
          <ChevronLeft size={18} aria-hidden="true" /> {p.titulo}
        </a>
        <h1 className="tp-h1">Agendar un envío</h1>
        <p className="tp-lead">Lo recogemos donde nos digas. Al terminar, nos avisas por WhatsApp con todo ya escrito.</p>
        <FormularioEnvio slug={p.slug} whatsapp={p.whatsapp} distritos={p.distritos} hoy={hoyLima()} />
      </div>
    </Marco>
  );
}
