/**
 * tienda.vendemias.com/<negocio> · la portada (o agenda.*: es la misma).
 *
 * Cabecera, los atajos (envío, WhatsApp) y el escaparate: lo que el negocio
 * vende, reserva o inscribe, sacado de su catálogo del panel. El escaparate es
 * la única isla con JavaScript; lo demás llega en HTML.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MessageCircle, Package } from 'lucide-react';
import Marco, { Cabecera } from '@/modules/tu-pagina/publico/Marco';
import Escaparate from '@/modules/tu-pagina/publico/Escaparate';
import { paginaDe } from '@/modules/tu-pagina/servidor/pagina';
import { escaparateDe } from '@/modules/tu-pagina/servidor/escaparate';
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
  const conEscaparate = Boolean(p.secciones.catalogo || p.secciones.reservar);
  const esc = conEscaparate ? await escaparateDe(p.slug) : null;
  const hayItems = Boolean(esc && esc.items.length > 0);

  return (
    <Marco pagina={p}>
      <Cabecera pagina={p} />
      <div className="tp-hoja">
        <nav className={`tp-acciones${hayItems ? ' tp-acciones--fila' : ''}`} aria-label="Qué quieres hacer">
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
        {esc && hayItems && (
          <Escaparate
            esc={esc}
            slug={p.slug}
            whatsapp={p.whatsapp}
            puedePedir={Boolean(p.secciones.catalogo)}
            puedeReservar={Boolean(p.secciones.reservar)}
          />
        )}
      </div>
    </Marco>
  );
}
