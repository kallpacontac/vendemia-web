import { ArrowRight, CalendarDays, Gift, Heart, MapPin, MessageCircle, Palette, ShieldCheck, Sparkles } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { PaginaPublica } from '@/modules/tu-pagina/servidor/pagina';
import type { Escaparate as Datos } from '@/modules/tu-pagina/dominio/tienda';
import { soles } from '@/modules/tu-pagina/dominio/tienda';
import { fotoDePlantilla } from '@/modules/tu-pagina/dominio/fotos';
import { colorO } from '@/modules/tu-pagina/dominio/apariencia';
import { urlWhatsApp } from '@/modules/tu-pagina/dominio/envio';
import Escaparate from './Escaparate';
import UnasReservaDemo from './UnasReservaDemo';
import UnasPromocion from './UnasPromocion';
import BotonWhatsApp from './BotonWhatsApp';
import TarjetaPuntos from './TarjetaPuntos';
import type { TarjetaPublica } from '@/modules/tu-pagina/dominio/tarjeta';
import './unas.css';

export default function UnasPortada({ pagina, esc, reservarHref, demo = false, tarjeta = null }: {
  pagina: PaginaPublica;
  esc: Datos | null;
  reservarHref: string;
  demo?: boolean;
  /** La tarjeta de puntos de Fideliza, si el dueño la enseña (servidor/tarjeta.ts). */
  tarjeta?: TarjetaPublica | null;
}) {
  const apariencia = pagina.secciones.apariencia ?? {};
  const foto = pagina.portada_url || fotoDePlantilla(apariencia, 'agenda', 'unas');
  const detalle = apariencia.fotoDetalleUnas?.startsWith('https://')
    ? apariencia.fotoDetalleUnas : '/assets/unas-ejemplo/detalle.webp';
  const servicios = (esc?.items ?? []).filter((item) => item.tipo === 'cita');
  const productos = (esc?.items ?? []).filter((item) => item.tipo === 'producto');
  const escProductos = esc && productos.length ? { ...esc, items: productos } : null;
  const contacto = demo ? '#contacto' : urlWhatsApp(pagina.whatsapp, `Hola ${pagina.titulo}, quisiera consultar por una cita.`);
  const mostrarWhatsapp = apariencia.mostrarWhatsapp !== false;
  const promocion = apariencia.promocionTexto?.trim();
  const promocionImagen = apariencia.promocionImagenUnas?.startsWith('https://') ? apariencia.promocionImagenUnas : undefined;
  const heroStyle = {
    ['--un-rosa' as string]: colorO(apariencia.colorBanner, '#DCC1BA'),
    ['--un-fondo' as string]: colorO(apariencia.fondoAgenda, '#FBF9F7'),
    ...(foto ? { backgroundImage: `url("${foto}")` } : {}),
  } as CSSProperties;
  const frase = pagina.frase?.trim() || `Un espacio para cuidar tus manos y regalarte un momento especial en ${pagina.titulo}.`;
  const tituloSeccion = apariencia.tituloSeccionUnas?.trim() || 'Belleza en cada detalle';
  const textoSeccion = apariencia.textoSeccionUnas?.trim()
    || 'Cada servicio está pensado para que te sientas bien, desde el primer momento hasta el último toque de color.';

  return <div className="un">
    <header className="un-nav">
      <a className="un-marca" href={demo ? '#inicio' : `./${pagina.slug}`} aria-label={`Inicio de ${pagina.titulo}`}>
        {pagina.logo_url ? /* eslint-disable-next-line @next/next/no-img-element */
          <img src={pagina.logo_url} alt={pagina.titulo} /> : <span>{pagina.titulo}</span>}
      </a>
      <nav aria-label="Navegación principal">
        <a href="#inicio">Inicio</a><a href="#servicios">Servicios</a><a href="#reserva">Reservar</a>{tarjeta && <a href="#tarjeta">Mi tarjeta</a>}<a href="#nosotros">Nosotros</a>
      </nav>
      <div className="un-nav__acciones">
        {promocion
          ? <UnasPromocion negocio={pagina.titulo} slug={pagina.slug} texto={promocion} imagen={promocionImagen} tarjeta={tarjeta} demo={demo} />
          : tarjeta && <a className="un-promocion__acceso" href="#tarjeta" aria-label={`Tu tarjeta de puntos: ${tarjeta.nombre}`}><Gift size={19} aria-hidden="true" /></a>}
        <a href="#servicios" aria-label="Ver servicios"><Heart size={19} aria-hidden="true" /></a>
        {mostrarWhatsapp && <a href={contacto} aria-label="Contactar a la empresa"><MessageCircle size={19} aria-hidden="true" /></a>}
        <a className="un-nav__reserva" href="#reserva">Reservar cita <ArrowRight size={15} aria-hidden="true" /></a>
      </div>
    </header>

    <section id="inicio" className={`un-hero${foto ? ' un-hero--foto' : ''}`} style={heroStyle}>
      <div className="un-hero__contenido">
        <span className="un-etiqueta"><Sparkles size={15} aria-hidden="true" /> ESTUDIO DE UÑAS</span>
        <h1>{apariencia.tituloBanner?.trim() || 'Uñas que hablan de ti.'}</h1>
        <p>{frase}</p>
        <a className="un-boton" href="#reserva"><CalendarDays size={17} aria-hidden="true" /> Reservar mi cita <ArrowRight size={15} aria-hidden="true" /></a>
        {tarjeta && <a className="un-hero__club" href="#tarjeta"><Gift size={15} aria-hidden="true" /> {tarjeta.nombre}: junta sellos y gana {tarjeta.premio}</a>}
      </div>
      <div className="un-hero__beneficios" aria-label="Lo que ofrecemos">
        <span><Sparkles size={22} aria-hidden="true" /> Manicure</span>
        <span><Palette size={22} aria-hidden="true" /> Diseños</span>
        <span><Heart size={22} aria-hidden="true" /> Cuidado</span>
      </div>
    </section>

    <main>
      <section id="servicios" className="un-servicios">
        <div className="un-seccion-cabeza"><span>HECHO PARA TI</span><h2>Elige tu próximo servicio</h2><p>Explora las opciones de {pagina.titulo} y encuentra el estilo que quieres llevar.</p></div>
        {servicios.length ? <div className="un-servicios__lista">{servicios.slice(0, 4).map((item) =>
          <a key={item.id} href="#reserva" className="un-servicio"><span><Sparkles size={17} aria-hidden="true" /></span><div><b>{item.nombre}</b><small>{item.duracion} min{item.precio !== null ? ` · ${soles(item.precio)}` : ''}</small></div><ArrowRight size={17} aria-hidden="true" /></a>,
        )}</div> : <p className="un-vacio">Los servicios aparecerán aquí cuando el negocio los agregue a su catálogo.</p>}
      </section>

      <section id="reserva" className="un-reserva" aria-label="Reservar una cita">
        <div className="un-reserva__intro"><span className="un-sobretitulo">TU TIEMPO, TU ESTILO ♡</span><h2>Reserva tu momento</h2><p>Selecciona el servicio, el día y la hora que mejor te acomoden. Tu cita se confirma desde la agenda de {pagina.titulo}.</p></div>
        {demo ? <UnasReservaDemo servicios={servicios.map((item) => item.nombre)} hoy={esc?.hoy ?? ''} /> : esc && servicios.length ?
          <div className="un-reserva__widget"><Escaparate esc={esc} slug={pagina.slug} whatsapp={pagina.whatsapp} puedePedir={false} puedeReservar solo="reservas" disposicion="filas" agendaEstilo="agenda" agendaNombre={pagina.titulo} /></div> :
          <div className="un-reserva__vacio"><CalendarDays size={28} aria-hidden="true" /><h3>Pronto podrás reservar aquí</h3><p>Agrega servicios y horarios en tu catálogo para activar la reserva en línea.</p>{mostrarWhatsapp && <a href={contacto}>Consultar por WhatsApp <ArrowRight size={16} aria-hidden="true" /></a>}</div>}
        {!demo && servicios.length > 0 && <a className="un-reserva__enlace" href={reservarHref}>Abrir la agenda completa <ArrowRight size={16} aria-hidden="true" /></a>}
      </section>

      {tarjeta && <TarjetaPuntos tarjeta={tarjeta} negocio={pagina.titulo} demo={demo} />}

      <section id="nosotros" className="un-historia">
        <div className="un-historia__foto" style={{ backgroundImage: `url("${detalle}")` }} role="img" aria-label={`Trabajo de ${pagina.titulo}`} />
        <div className="un-historia__texto"><span className="un-sobretitulo">CUIDADO QUE SE NOTA ♡</span><h2>{tituloSeccion}</h2><p>{textoSeccion}</p>
          <div className="un-historia__puntos"><span><ShieldCheck size={19} aria-hidden="true" /> Atención dedicada</span><span><CalendarDays size={19} aria-hidden="true" /> Reserva a tu ritmo</span></div>
          <a href="#reserva">Encontrar mi horario <ArrowRight size={16} aria-hidden="true" /></a>
        </div>
      </section>

      {escProductos && <section className="un-productos" aria-label="Productos"><div className="un-seccion-cabeza"><span>PARA LLEVAR</span><h2>Productos para tu rutina</h2></div><Escaparate esc={escProductos} slug={pagina.slug} whatsapp={pagina.whatsapp} puedePedir puedeReservar={false} disposicion="cuadricula" nombreNegocio={pagina.titulo} apariencia={apariencia} /></section>}
    </main>

    <footer id="contacto" className="un-pie"><div><b>{pagina.titulo}</b><p>{frase}</p></div><div><span><MapPin size={16} aria-hidden="true" /> {esc?.direccion || 'Tu espacio de belleza'}</span>{demo ? <span>Plantilla de ejemplo · reserva simulada</span> : mostrarWhatsapp && <a href={contacto}><MessageCircle size={16} aria-hidden="true" /> Escríbenos por WhatsApp</a>}</div></footer>
    {mostrarWhatsapp && <BotonWhatsApp negocio={pagina.titulo} numero={pagina.whatsapp} demo={demo} />}
  </div>;
}
