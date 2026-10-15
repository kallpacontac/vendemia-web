/**
 * tienda.vendemias.com/<negocio> · la portada (o agenda.*: es la misma).
 *
 * Lo que el negocio encendió, como botones grandes, y siempre «Escríbenos por
 * WhatsApp». El catálogo y las reservas entran en sus fases (docs/PLAN-TU-PAGINA.md);
 * hasta entonces la portada solo enseña lo que ya funciona.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MessageCircle, Package } from 'lucide-react';
import Marco, { Cabecera } from '@/modules/tu-pagina/publico/Marco';
import { paginaDe } from '@/modules/tu-pagina/servidor/pagina';
import { urlWhatsApp } from '@/modules/tu-pagina/dominio/envio';

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await paginaDe(params.slug).catch(() => null);
  if (!p) return { title: 'Vendemia', robots: { index: false } };
  return {
    title: p.titulo,
    description: p.frase || `Pide, reserva o escribe a ${p.titulo}`,
    openGraph: { title: p.titulo, description: p.frase || undefined, images: p.portada_url ? [p.portada_url] : undefined },
  };
}

export default async function Portada({ params }: Props) {
  const p = await paginaDe(params.slug);
  if (!p) notFound();

  return (
    <Marco pagina={p}>
      <Cabecera pagina={p} />
      <div className="tp-hoja">
        <nav className="tp-acciones" aria-label="Qué quieres hacer">
          {/* Enlace relativo a propósito: vale igual en tienda o agenda (host/<negocio>) y en /tu-pagina/<negocio>. */}
          {p.secciones.envios && (
            <a className="tp-accion" href={`./${p.slug}/envio`}>
              <span className="tp-accion__icono"><Package size={22} aria-hidden="true" /></span>
              <span className="tp-accion__texto">
                <b>Agendar un envío</b>
                <span>Dinos qué, a dónde y cuándo lo recogemos</span>
              </span>
            </a>
          )}
          <a className="tp-accion" href={urlWhatsApp(p.whatsapp, `Hola ${p.titulo}`)} rel="noopener">
            <span className="tp-accion__icono"><MessageCircle size={22} aria-hidden="true" /></span>
            <span className="tp-accion__texto">
              <b>Escríbenos por WhatsApp</b>
              <span>Te respondemos ahí</span>
            </span>
          </a>
        </nav>
      </div>
    </Marco>
  );
}
