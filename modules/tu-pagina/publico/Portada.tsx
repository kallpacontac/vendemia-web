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
import LlamarMesero from '@/modules/tu-pagina/publico/LlamarMesero';
import { paginaDe } from '@/modules/tu-pagina/servidor/pagina';
import { escaparateDe } from '@/modules/tu-pagina/servidor/escaparate';
import { urlWhatsApp } from '@/modules/tu-pagina/dominio/envio';
import { disposicionDe, plantillaPorDefecto, plantillaValida, tipoPagina } from '@/modules/tu-pagina/dominio/plantillas';
import { esPlantillaEjemplo } from '@/modules/tu-pagina/dominio/ejemplo';
import { fotoDePlantilla } from '@/modules/tu-pagina/dominio/fotos';
import { conVista, consultaVista } from '@/modules/tu-pagina/dominio/vista';
import { FOTOS_SERVICIOS_LUXURY } from '@/modules/tu-pagina/dominio/fotos';
import { soles } from '@/modules/tu-pagina/dominio/tienda';
import AgendaPortada from '@/modules/tu-pagina/publico/AgendaPortada';

type Props = { params: { slug: string }; searchParams?: Record<string, string | undefined> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const p = await paginaDe(params.slug).catch(() => null);
  if (!p) return { title: 'Vendemia', robots: { index: false } };
  const foto = p.portada_url || fotoDePlantilla(p.secciones.apariencia ?? {}, tipoPagina(p.secciones), plantillaValida(p.plantilla) ? p.plantilla : undefined);
  return {
    title: p.titulo,
    description: p.frase || `Pide, reserva o escribe a ${p.titulo}`,
    openGraph: { title: p.titulo, description: p.frase || undefined, images: foto ? [foto] : undefined },
    ...(searchParams?.vista ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function Portada({ params, searchParams }: Props) {
  const guardada = await paginaDe(params.slug);
  if (!guardada) notFound();
  const p = conVista(guardada, searchParams);
  const tipo = tipoPagina(p.secciones);
  const plantilla = plantillaValida(p.plantilla) ? p.plantilla : plantillaPorDefecto(tipo);
  const esLuxury = plantilla === 'luxury' && p.secciones.apariencia?.plantillaActiva && p.secciones.reservar;
  const conEscaparate = Boolean(p.secciones.catalogo || p.secciones.reservar);
  const esc = conEscaparate ? await escaparateDe(p.slug, p.secciones) : null;
  const hayItems = Boolean(esc && esc.items.length > 0);
  const hayProductos = Boolean(esc?.items.some((item) => item.tipo === 'producto'));
  const catalogoLuxuryDestacado = Boolean(esLuxury && p.secciones.catalogo && p.secciones.apariencia?.catalogoLuxuryDestacado && hayProductos);
  const fotoDestacada = esc?.items.find((item) => item.tipo === 'producto' && item.fotos[0])?.fotos[0];
  const primerServicio = esc?.items.find((item) => item.tipo !== 'producto');
  const servicioDestacado = primerServicio ? {
    nombre: primerServicio.nombre,
    descripcion: primerServicio.descripcion,
    precio: primerServicio.precio == null ? undefined : soles(primerServicio.precio),
    foto: primerServicio.fotos[0] || FOTOS_SERVICIOS_LUXURY.corte,
  } : { nombre: p.titulo, descripcion: p.frase, foto: FOTOS_SERVICIOS_LUXURY.corte };
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
  const reservaGrande = !envioPrimero && tipo !== 'tienda' && !esLuxury;

  // Las demos de agenda y la página del negocio comparten ahora la misma
  // composición: portada, servicios y el selector de horarios real.
  const agendaDisenada = p.secciones.apariencia?.plantillaActiva && tipo === 'agenda' && (plantilla === 'agenda' || plantilla === 'lista');
  if (agendaDisenada) {
    const reservarHref = `./${p.slug}/reservar${consultaVista(searchParams)}`;
    return <Marco pagina={p} portada>
      <AgendaPortada pagina={p} editorial={plantilla === 'lista'} reservarHref={reservarHref} />
      <main className="tp-agenda-contenido">
        {esc && hayItems && <section className="tp-agenda-servicios" aria-label="Servicios disponibles">
          <div className="tp-agenda-seccion-titulo"><span>QUÉ OFRECEMOS</span><h2>Servicios para ti</h2><p>Conoce los detalles y elige el que necesitas.</p></div>
          <Escaparate esc={esc} slug={p.slug} whatsapp={p.whatsapp} puedePedir={false} puedeReservar disposicion="cuadricula" agendaEstilo={plantilla} agendaNombre={p.titulo} />
        </section>}
        {p.secciones.apariencia?.mostrarWhatsapp !== false && <a className="tp-agenda-contacto" href={urlWhatsApp(p.whatsapp, `Hola ${p.titulo}`)} rel="noopener"><MessageCircle size={20} aria-hidden="true" /><span><b>Escríbenos por WhatsApp</b><small>Te respondemos ahí</small></span><span aria-hidden="true">→</span></a>}
      </main>
    </Marco>;
  }

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

  const catalogo = esc && hayItems && (
    <Escaparate
      esc={esc}
      slug={p.slug}
      whatsapp={p.whatsapp}
      disposicion={p.secciones.apariencia?.plantillaActiva ? disposicionDe(plantilla, tipo) : tipo === 'agenda' ? 'filas' : 'cuadricula'}
      puedePedir={Boolean(p.secciones.catalogo)}
      puedeReservar={Boolean(p.secciones.reservar)}
      plantillaLuxury={Boolean(esLuxury)}
      agendaNombre={p.titulo}
      catalogoLuxuryDestacado={catalogoLuxuryDestacado}
      vistaServiciosLuxury={p.secciones.apariencia?.vistaServiciosLuxury}
    />
  );

  return (
    <Marco pagina={p} portada>
      <Cabecera pagina={p} fotoDestacada={fotoDestacada} servicioDestacado={servicioDestacado} catalogoDisponible={hayItems} catalogoProductosDisponible={catalogoLuxuryDestacado} />
      <div className="tp-hoja">
        {/* Enlaces relativos a propósito: valen igual en tienda o agenda (host/<negocio>) y en /tu-pagina/<negocio>. */}
        {envioPrimero && <div className="tp-acciones">{envio}</div>}
        {esLuxury && catalogo}
        {reservaGrande && reservar && <div className="tp-acciones">{reservar}</div>}
        <nav className={`tp-acciones${hayItems || envioPrimero ? ' tp-acciones--fila' : ''}`} aria-label="Qué quieres hacer">
          {!reservaGrande && !esLuxury && reservar}
          {!envioPrimero && envio}
          {p.secciones.catalogo && p.secciones.apariencia?.mostrarMesero === true && <LlamarMesero negocio={p.titulo} whatsapp={p.whatsapp} />}
          {p.secciones.apariencia?.mostrarWhatsapp !== false && <a className="tp-accion" href={urlWhatsApp(p.whatsapp, `Hola ${p.titulo}`)} rel="noopener">
            <span className="tp-accion__icono"><MessageCircle size={22} aria-hidden="true" /></span>
            <span className="tp-accion__texto">
              <b>Escríbenos por WhatsApp</b>
              <span>Te respondemos ahí</span>
            </span>
          </a>}
        </nav>
        {!esLuxury && catalogo}
      </div>
    </Marco>
  );
}
