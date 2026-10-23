import { ArrowRight, CalendarDays, Clock3, ShieldCheck } from 'lucide-react';
import type { PaginaPublica } from '@/modules/tu-pagina/servidor/pagina';
import { fotoDePlantilla, FOTOS_PLANTILLA } from '@/modules/tu-pagina/dominio/fotos';
import { plantillaValida } from '@/modules/tu-pagina/dominio/plantillas';

export function contextoAgenda(pagina: PaginaPublica) {
  const barberia = /barber|peluquer|sal[oó]n|estil|cabello|corte/i.test(pagina.titulo);
  const fotoElegida = fotoDePlantilla(pagina.secciones.apariencia ?? {}, 'agenda', plantillaValida(pagina.plantilla) ? pagina.plantilla : undefined);
  const foto = pagina.portada_url || (pagina.secciones.apariencia?.fotoPlantilla
    ? fotoElegida
    : barberia ? FOTOS_PLANTILLA.find((f) => f.id === 'barberia')?.url : fotoElegida);
  return { barberia, foto };
}

export default function AgendaPortada({ pagina, editorial, reservarHref }: { pagina: PaginaPublica; editorial: boolean; reservarHref: string }) {
  const { barberia, foto } = contextoAgenda(pagina);
  const frase = pagina.frase?.trim();
  const tituloHero = pagina.secciones.apariencia?.tituloBanner?.trim()
    || (barberia ? 'Tu próximo corte, sin complicaciones.' : 'Tu próxima cita, sin complicaciones.');
  const descripcion = frase || (barberia
    ? `Elige tu servicio en ${pagina.titulo} y encuentra un horario a tu medida.`
    : `Elige tu servicio en ${pagina.titulo} y encuentra un horario a tu medida.`);
  const inicial = pagina.titulo.trim().charAt(0).toUpperCase() || '·';
  return <>
    <header className="tp-agenda-nav">
      <a className="tp-agenda-brand" href={`./${pagina.slug}`} aria-label={`Inicio de ${pagina.titulo}`}>
        <span className="tp-agenda-brand__logo" style={pagina.logo_url ? { backgroundImage: `url("${pagina.logo_url}")` } : undefined}>{pagina.logo_url ? null : inicial}</span>
        <span><strong>{pagina.titulo}</strong><small>{barberia ? 'Barbería y salón' : 'Agenda de servicios'}</small></span>
      </a>
      <nav aria-label="Navegación principal">
        <a href="#catalogo">Servicios</a>
        <a className="tp-agenda-nav__cta" href={reservarHref}>Reservar cita <ArrowRight size={17} aria-hidden="true" /></a>
      </nav>
    </header>
    <section className={`tp-agenda-hero${editorial ? ' tp-agenda-hero--editorial' : ''}`} aria-label={`Bienvenido a ${pagina.titulo}`}>
      {editorial && foto && <div className="tp-agenda-hero__fondo" style={{ backgroundImage: `url("${foto}")` }} aria-hidden="true" />}
      <div className="tp-agenda-hero__texto">
        <span className="tp-agenda-hero__etiqueta">✦ {pagina.titulo.toUpperCase()}</span>
        <h1>{tituloHero}</h1>
        <p>{descripcion}</p>
        <a className="tp-agenda-hero__cta" href={reservarHref}>Elegir mi cita <ArrowRight size={20} aria-hidden="true" /></a>
        {!editorial && <div className="tp-agenda-hero__puntos"><span><ShieldCheck size={18} aria-hidden="true" /> Atención profesional</span><span><Clock3 size={18} aria-hidden="true" /> Horarios claros</span></div>}
      </div>
      {!editorial && <div className="tp-agenda-hero__foto" style={foto ? { backgroundImage: `url("${foto}")` } : undefined} role="img" aria-label={`Imagen de ${pagina.titulo}`} />}
    </section>
    {editorial && <div className="tp-agenda-confianza"><span><ShieldCheck size={18} aria-hidden="true" /> Atención profesional</span><span><Clock3 size={18} aria-hidden="true" /> Horarios claros</span><span><CalendarDays size={18} aria-hidden="true" /> Reserva en línea</span></div>}
  </>;
}
