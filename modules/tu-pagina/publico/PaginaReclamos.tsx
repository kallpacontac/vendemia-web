/**
 * tienda|agenda.vendemias.com/<negocio>/reclamaciones · Libro de Reclamaciones Virtual.
 *
 * Solo si el negocio lo encendió en Mi página con su razón social, RUC y
 * dirección (sql/0006). El enlace sale en el pie de toda su página, también en
 * la de inicio, como pide el reglamento.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import Marco from '@/modules/tu-pagina/publico/Marco';
import FormularioReclamo from '@/modules/tu-pagina/publico/FormularioReclamo';
import { paginaDe } from '@/modules/tu-pagina/servidor/pagina';
import { proveedorCompleto } from '@/modules/tu-pagina/dominio/reclamos';

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await paginaDe(params.slug).catch(() => null);
  return p?.secciones.reclamos ? { title: `Libro de Reclamaciones · ${p.titulo}`, robots: { index: false } } : { title: 'Vendemia', robots: { index: false } };
}

export default async function PaginaReclamos({ params }: Props) {
  const p = await paginaDe(params.slug);
  const prov = p?.secciones.proveedor;
  if (!p?.secciones.reclamos || !proveedorCompleto(prov)) notFound();

  return (
    <Marco pagina={p}>
      <div className="tp-hoja">
        <a className="tp-volver tp-no-imprimir" href={`../${p.slug}`}>
          <ChevronLeft size={18} aria-hidden="true" /> {p.titulo}
        </a>
        <div className="tp-no-imprimir">
          <h1 className="tp-h1">Libro de Reclamaciones</h1>
          <p className="tp-lead">
            {prov.razon_social} · RUC {prov.ruc}
            <br />
            {prov.direccion}
          </p>
          <p className="tp-legal">
            Conforme a lo establecido en el Código de Protección y Defensa del Consumidor, este establecimiento cuenta con un Libro de Reclamaciones a tu disposición.
          </p>
        </div>
        <FormularioReclamo slug={p.slug} whatsapp={p.whatsapp} titulo={p.titulo} proveedor={prov} />
      </div>
    </Marco>
  );
}
