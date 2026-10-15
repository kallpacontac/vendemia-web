/**
 * pide.vendemias.com/<negocio>/envio · agendar un envío.
 *
 * El servidor pinta el marco (color, nombre) y el formulario es la única isla
 * con JavaScript.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import Marco from '@/modules/pide/publico/Marco';
import FormularioEnvio from '@/modules/pide/publico/FormularioEnvio';
import { paginaDe } from '@/modules/pide/servidor/pagina';
import { hoyLima } from '@/modules/pide/dominio/envio';

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await paginaDe(params.slug).catch(() => null);
  return p ? { title: `Agendar un envío · ${p.titulo}` } : { title: 'Pide', robots: { index: false } };
}

export default async function PaginaEnvio({ params }: Props) {
  const p = await paginaDe(params.slug);
  if (!p?.secciones.envios) notFound();

  return (
    <Marco pagina={p}>
      <div className="pd-hoja">
        <a className="pd-volver" href={`../${p.slug}`}>
          <ChevronLeft size={18} aria-hidden="true" /> {p.titulo}
        </a>
        <h1 className="pd-h1">Agendar un envío</h1>
        <p className="pd-lead">Lo recogemos donde nos digas. Al terminar, nos avisas por WhatsApp con todo ya escrito.</p>
        <FormularioEnvio slug={p.slug} whatsapp={p.whatsapp} distritos={p.distritos} hoy={hoyLima()} />
      </div>
    </Marco>
  );
}
