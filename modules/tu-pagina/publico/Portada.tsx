/**
 * tienda.vendemias.com/<negocio> · la portada (o agenda.*: es la misma).
 *
 * Cabecera, los atajos (envío, WhatsApp) y el escaparate: lo que el negocio
 * vende, reserva o inscribe, sacado de su catálogo del panel. El escaparate es
 * la única isla con JavaScript; lo demás llega en HTML.
 *
 * Cómo se ve lo decide la plantilla (dominio/plantillas.ts). Con `?vista=1` el
 * panel la pinta con otra plantilla o color SIN guardar nada: es su vista previa
 * (se sirve en el dominio principal para poder ir en un iframe; no se indexa).
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MessageCircle, Package } from 'lucide-react';
import Marco, { Cabecera } from '@/modules/tu-pagina/publico/Marco';
import Escaparate from '@/modules/tu-pagina/publico/Escaparate';
import { paginaDe, type PaginaPublica } from '@/modules/tu-pagina/servidor/pagina';
import { escaparateDe } from '@/modules/tu-pagina/servidor/escaparate';
import { urlWhatsApp } from '@/modules/tu-pagina/dominio/envio';
import { defPlantilla, esPlantilla } from '@/modules/tu-pagina/dominio/plantillas';

type Props = { params: { slug: string }; searchParams?: { vista?: string; plantilla?: string; color?: string } };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const p = await paginaDe(params.slug).catch(() => null);
  if (!p) return { title: 'Vendemia', robots: { index: false } };
  return {
    title: p.titulo,
    description: p.frase || `Pide, reserva o escribe a ${p.titulo}`,
    openGraph: { title: p.titulo, description: p.frase || undefined, images: p.portada_url ? [p.portada_url] : undefined },
    ...(searchParams?.vista ? { robots: { index: false, follow: false } } : {}),
  };
}

/** La vista previa del panel: otra plantilla u otro color, sin tocar lo guardado. */
function conVista(p: PaginaPublica, q: Props['searchParams']): PaginaPublica {
  if (!q?.vista) return p;
  return {
    ...p,
    plantilla: esPlantilla(q.plantilla) ? q.plantilla : p.plantilla,
    color: q.color && /^#[0-9A-Fa-f]{6}$/.test(q.color) ? q.color : p.color,
  };
}

export default async function Portada({ params, searchParams }: Props) {
  const guardada = await paginaDe(params.slug);
  if (!guardada) notFound();
  const p = conVista(guardada, searchParams);
  const plantilla = defPlantilla(p.plantilla);
  const conEscaparate = Boolean(p.secciones.catalogo || p.secciones.reservar);
  const esc = conEscaparate ? await escaparateDe(p.slug) : null;
  const hayItems = Boolean(esc && esc.items.length > 0);
  const envioPrimero = plantilla.primero === 'envio' && p.secciones.envios;

  const envio = p.secciones.envios && (
    <a className={`tp-accion${envioPrimero ? ' tp-accion--grande' : ''}`} href={`./${p.slug}/envio`}>
      <span className="tp-accion__icono"><Package size={22} aria-hidden="true" /></span>
      <span className="tp-accion__texto">
        <b>Agendar un envío</b>
        <span>Dinos qué, a dónde y cuándo lo recogemos</span>
      </span>
    </a>
  );

  return (
    <Marco pagina={p}>
      <Cabecera pagina={p} />
      <div className="tp-hoja">
        {/* Enlaces relativos a propósito: valen igual en tienda o agenda (host/<negocio>) y en /tu-pagina/<negocio>. */}
        {envioPrimero && <div className="tp-acciones">{envio}</div>}
        <nav className={`tp-acciones${hayItems || envioPrimero ? ' tp-acciones--fila' : ''}`} aria-label="Qué quieres hacer">
          {!envioPrimero && envio}
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
            disposicion={plantilla.disposicion}
            puedePedir={Boolean(p.secciones.catalogo)}
            puedeReservar={Boolean(p.secciones.reservar)}
          />
        )}
      </div>
    </Marco>
  );
}
