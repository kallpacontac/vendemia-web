/**
 * tienda.vendemias.com/<negocio> · la portada (o agenda.*: es la misma).
 *
 * Cabecera, los atajos (reservar, envío, WhatsApp) y el escaparate: lo que el negocio
 * vende, reserva o inscribe, sacado de su catálogo del panel. El escaparate es
 * la única isla con JavaScript; lo demás llega en HTML.
 *
 * Cómo se ve lo decide la plantilla (dominio/plantillas.ts). Con `?vista=1` el
 * panel la pinta con otra plantilla o color SIN guardar nada: es su vista previa
 * (se sirve en el dominio principal para poder ir en un iframe; no se indexa).
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CalendarDays, MessageCircle, Package } from 'lucide-react';
import Marco, { Cabecera } from '@/modules/tu-pagina/publico/Marco';
import Escaparate from '@/modules/tu-pagina/publico/Escaparate';
import CatalogoEjemplo from '@/modules/tu-pagina/publico/CatalogoEjemplo';
import { paginaDe, type PaginaPublica } from '@/modules/tu-pagina/servidor/pagina';
import { escaparateDe } from '@/modules/tu-pagina/servidor/escaparate';
import { urlWhatsApp } from '@/modules/tu-pagina/dominio/envio';
import { disposicionDe, plantillaPorDefecto, plantillaValida, tipoPagina, type TipoPagina } from '@/modules/tu-pagina/dominio/plantillas';
import { esHex } from '@/modules/tu-pagina/dominio/apariencia';
import { esPlantillaEjemplo } from '@/modules/tu-pagina/dominio/ejemplo';

type Props = { params: { slug: string }; searchParams?: Record<string, string | undefined> };

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

/** La vista previa cambia contenido y diseño solo en esta respuesta. */
function conVista(p: PaginaPublica, q: Props['searchParams']): PaginaPublica {
  if (q?.vista !== '1') return p;
  const tipo: TipoPagina = q.tipo === 'agenda' || q.tipo === 'tienda' || q.tipo === 'ambos' ? q.tipo : tipoPagina(p.secciones);
  const anterior = p.secciones.apariencia ?? {};
  return {
    ...p,
    color: esHex(q.color) ? q.color : p.color,
    plantilla: plantillaValida(q.plantilla) ? q.plantilla : p.plantilla,
    secciones: {
      ...p.secciones, catalogo: tipo !== 'agenda', reservar: tipo !== 'tienda',
      apariencia: {
        ...anterior,
        plantillaActiva: q.pa === '1',
        colorTienda: esHex(q.ct) ? q.ct : anterior.colorTienda,
        fondoAgenda: esHex(q.fa) ? q.fa : anterior.fondoAgenda,
        fondoTienda: esHex(q.ft) ? q.ft : anterior.fondoTienda,
        colorBanner: esHex(q.cb) ? q.cb : anterior.colorBanner,
        mostrarBanner: q.mb === '0' ? false : q.mb === '1' ? true : anterior.mostrarBanner,
        mostrarWhatsapp: q.mw === '0' ? false : q.mw === '1' ? true : anterior.mostrarWhatsapp,
      },
    },
  };
}

export default async function Portada({ params, searchParams }: Props) {
  const guardada = await paginaDe(params.slug);
  if (!guardada) notFound();
  const p = conVista(guardada, searchParams);
  const tipo = tipoPagina(p.secciones);
  const plantilla = plantillaValida(p.plantilla) ? p.plantilla : plantillaPorDefecto(tipo);
  const conEscaparate = Boolean(p.secciones.catalogo || p.secciones.reservar);
  const esc = conEscaparate ? await escaparateDe(p.slug, p.secciones) : null;
  const hayItems = Boolean(esc && esc.items.length > 0);
  const fotoDestacada = esc?.items.find((item) => item.tipo === 'producto' && item.fotos[0])?.fotos[0];
  // La página propia de Vendemia enseña un catálogo completo mientras su catálogo real
  // esté vacío. Está rotulado como demo y no ofrece pedidos ni cobros reales.
  if (p.slug === 'vendemia' && !hayItems) {
    const ejemplo = esPlantillaEjemplo(searchParams?.plantilla) ? searchParams.plantilla : esPlantillaEjemplo(plantilla) ? plantilla : 'vitrina';
    return <CatalogoEjemplo plantilla={ejemplo} incrustado reclamosHref={p.secciones.reclamos && p.secciones.proveedor?.ruc ? `./${p.slug}/reclamaciones` : undefined} />;
  }
  const envioPrimero = !conEscaparate && Boolean(p.secciones.envios);
  // Lo que se reserva tiene su atajo arriba y su enlace propio (/reservar): en un
  // salón es lo primero que se busca, no algo a lo que se llega bajando.
  const reservables = p.secciones.reservar ? (esc?.items ?? []).filter((i) => i.tipo !== 'producto') : [];
  const soloGrupos = reservables.length > 0 && reservables.every((i) => i.tipo === 'grupo');
  const reservaGrande = !envioPrimero && tipo !== 'tienda';

  const reservar = reservables.length > 0 && (
    <a className={`tp-accion${reservaGrande ? ' tp-accion--grande' : ''}`} href={`./${p.slug}/reservar`}>
      <span className="tp-accion__icono"><CalendarDays size={22} aria-hidden="true" /></span>
      <span className="tp-accion__texto">
        <b>{soloGrupos ? 'Separar mi cupo' : 'Reservar una cita'}</b>
        <span>{soloGrupos ? 'Elige tu horario y separa tu lugar' : 'Elige el servicio, el día y la hora'}</span>
      </span>
    </a>
  );

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
    <Marco pagina={p} portada>
      <Cabecera pagina={p} fotoDestacada={fotoDestacada} catalogoDisponible={hayItems} />
      <div className="tp-hoja">
        {/* Enlaces relativos a propósito: valen igual en tienda o agenda (host/<negocio>) y en /tu-pagina/<negocio>. */}
        {envioPrimero && <div className="tp-acciones">{envio}</div>}
        {reservaGrande && reservar && <div className="tp-acciones">{reservar}</div>}
        <nav className={`tp-acciones${hayItems || envioPrimero ? ' tp-acciones--fila' : ''}`} aria-label="Qué quieres hacer">
          {!reservaGrande && reservar}
          {!envioPrimero && envio}
          {p.secciones.apariencia?.mostrarWhatsapp !== false && <a className="tp-accion" href={urlWhatsApp(p.whatsapp, `Hola ${p.titulo}`)} rel="noopener">
            <span className="tp-accion__icono"><MessageCircle size={22} aria-hidden="true" /></span>
            <span className="tp-accion__texto">
              <b>Escríbenos por WhatsApp</b>
              <span>Te respondemos ahí</span>
            </span>
          </a>}
        </nav>
        {esc && hayItems && (
          <Escaparate
            esc={esc}
            slug={p.slug}
            whatsapp={p.whatsapp}
            disposicion={p.secciones.apariencia?.plantillaActiva ? disposicionDe(plantilla, tipo) : tipo === 'agenda' ? 'filas' : 'cuadricula'}
            puedePedir={Boolean(p.secciones.catalogo)}
            puedeReservar={Boolean(p.secciones.reservar)}
          />
        )}
      </div>
    </Marco>
  );
}
