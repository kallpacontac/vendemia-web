/**
 * agenda.vendemias.com/<negocio>/reservar · solo lo que se reserva (o tienda.*).
 *
 * El enlace que va en la bio de Instagram de un salón: entra directo a sus
 * servicios y grupos, sin el carrito ni los productos. Es el mismo escaparate
 * de la portada con `solo="reservas"`; la reserva la decide el mismo servidor.
 *
 * Con canchas (dominio/canchas.ts), en vez del escaparate va el selector de
 * modalidad, día y horarios por cancha, con el precio de cada turno.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import Marco from '@/modules/tu-pagina/publico/Marco';
import Escaparate from '@/modules/tu-pagina/publico/Escaparate';
import TablaCanchas from '@/modules/tu-pagina/publico/TablaCanchas';
import { conCanchas } from '@/modules/tu-pagina/dominio/canchas';
import { paginaDe } from '@/modules/tu-pagina/servidor/pagina';
import { escaparateDe } from '@/modules/tu-pagina/servidor/escaparate';
import { conVista, consultaVista } from '@/modules/tu-pagina/dominio/vista';
import './unas.css';

type Props = { params: { slug: string }; searchParams?: Record<string, string | undefined> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const guardada = await paginaDe(params.slug).catch(() => null);
  const p = guardada ? conVista(guardada, searchParams) : null;
  return p?.secciones.reservar ? { title: `${conCanchas(p.secciones) ? 'Reservar cancha' : 'Reservar'} · ${p.titulo}`, ...(searchParams?.vista === '1' ? { robots: { index: false, follow: false } } : {}) } : { title: 'Vendemia', robots: { index: false } };
}

export default async function PaginaReservar({ params, searchParams }: Props) {
  const guardada = await paginaDe(params.slug);
  const p = guardada ? conVista(guardada, searchParams) : null;
  if (!p?.secciones.reservar) notFound();
  const esc = await escaparateDe(p.slug, p.secciones);
  const reservables = (esc?.items ?? []).filter((i) => i.tipo !== 'producto');
  const soloGrupos = reservables.length > 0 && reservables.every((i) => i.tipo === 'grupo');
  const luxury = p.secciones.apariencia?.plantillaActiva && p.plantilla === 'luxury';
  const agendaDisenada = p.secciones.apariencia?.plantillaActiva && (p.plantilla === 'agenda' || p.plantilla === 'lista');
  const unas = p.secciones.apariencia?.plantillaActiva && p.plantilla === 'unas';

  if (conCanchas(p.secciones)) return (
    <Marco pagina={p} vista="agenda">
      <div className="tp-canchas-pagina">
        <header className="tp-canchas-pagina__hero">
          <a className="tp-canchas-pagina__volver" href={`../${p.slug}${consultaVista(searchParams)}`}><ChevronLeft size={18} aria-hidden="true" /> {p.titulo}</a>
          <span className="tp-canchas-pagina__etiqueta">RESERVA EN LÍNEA · FÚTBOL</span>
          <h1>Tu cancha, lista para jugar.</h1>
          <p>Elige modalidad, día y hora. Reserva en unos toques.</p>
        </header>
        {esc ? <TablaCanchas esc={esc} cfg={p.secciones.canchas ?? {}} slug={p.slug} whatsapp={p.whatsapp} negocio={p.titulo} />
          : <p className="tp-vacio">Por ahora no hay canchas para reservar aquí. Escríbenos por WhatsApp.</p>}
      </div>
    </Marco>
  );

  if (unas) return <Marco pagina={p} vista="agenda">
    <div className="un un--reserva-sola">
      <header className="un-nav"><a className="un-marca" href={`../${p.slug}${consultaVista(searchParams)}`}>{p.titulo}</a><a className="un-nav__reserva" href={`../${p.slug}${consultaVista(searchParams)}`}><ChevronLeft size={16} /> Volver al inicio</a></header>
      <section className="un-reserva" aria-label="Reservar una cita"><div className="un-reserva__intro"><span className="un-sobretitulo">TU TIEMPO, TU ESTILO ♡</span><h1>Elige tu momento</h1><p>Selecciona un servicio, un día y un horario disponible para separar tu cita.</p></div>
        {esc && reservables.length > 0 ? <div className="un-reserva__widget"><Escaparate esc={esc} slug={p.slug} whatsapp={p.whatsapp} disposicion="filas" puedePedir={false} puedeReservar solo="reservas" agendaEstilo="agenda" agendaNombre={p.titulo} servicioInicialId={searchParams?.servicio} /></div> : <div className="un-reserva__vacio"><h2>Pronto podrás reservar aquí</h2><p>El negocio aún no publicó servicios con horarios.</p></div>}
      </section>
    </div>
  </Marco>;

  if (agendaDisenada) return <Marco pagina={p} vista="agenda">
    <main className="tp-agenda-reserva-pagina">
      <a className="tp-volver" href={`../${p.slug}${consultaVista(searchParams)}`}><ChevronLeft size={18} aria-hidden="true" /> Volver a {p.titulo}</a>
      <div className="tp-agenda-seccion-titulo"><span>RESERVA EN LÍNEA</span><h1>Elige tu cita</h1><p>Servicio → día → hora → tus datos</p></div>
      {esc && reservables.length > 0 ? <Escaparate esc={esc} slug={p.slug} whatsapp={p.whatsapp} disposicion="filas" puedePedir={false} puedeReservar solo="reservas" agendaEstilo={p.plantilla as 'agenda' | 'lista'} agendaNombre={p.titulo} servicioInicialId={searchParams?.servicio} /> : <p className="tp-vacio">Por ahora no hay nada para reservar aquí. Escríbenos por WhatsApp.</p>}
    </main>
  </Marco>;

  return (
    <Marco pagina={p} vista="agenda">
      <div className="tp-hoja">
        <a className="tp-volver" href={`../${p.slug}`}>
          <ChevronLeft size={18} aria-hidden="true" /> {p.titulo}
        </a>
        {luxury && <span className="tp-reserva-eyebrow">AGENDA · {p.titulo}</span>}
        <h1 className="tp-h1">{luxury ? 'Elige tu momento' : soloGrupos ? 'Separar mi cupo' : 'Reservar una cita'}</h1>
        <p className="tp-lead">
          {luxury ? 'Escoge un servicio y encuentra una hora que te venga bien. ' : soloGrupos ? 'Elige tu horario y separa tu lugar. ' : 'Elige el servicio, el día y la hora. '}Al terminar, nos avisas por WhatsApp con todo ya escrito.
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
            plantillaLuxury={luxury}
            agendaNombre={p.titulo}
          />
        ) : (
          <p className="tp-vacio">Por ahora no hay nada para reservar aquí. Escríbenos por WhatsApp.</p>
        )}
      </div>
    </Marco>
  );
}
