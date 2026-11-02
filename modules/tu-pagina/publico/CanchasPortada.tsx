import { ArrowRight, Clock3, MapPin, MessageCircle } from 'lucide-react';
import type { PaginaPublica } from '@/modules/tu-pagina/servidor/pagina';
import type { Escaparate } from '@/modules/tu-pagina/dominio/tienda';
import { canchasDe } from '@/modules/tu-pagina/dominio/canchas';
import { fotoDePlantilla } from '@/modules/tu-pagina/dominio/fotos';
import { urlWhatsApp } from '@/modules/tu-pagina/dominio/envio';
import TablaCanchas from '@/modules/tu-pagina/publico/TablaCanchas';

/** La portada y reserva de la plantilla Fútbol / canchas, con datos reales o de ejemplo. */
export default function CanchasPortada({ pagina, esc, ejemplo = false, children }: {
  pagina: PaginaPublica; esc: Escaparate | null; ejemplo?: boolean; children?: React.ReactNode;
}) {
  const modalidades = esc ? [...new Set(canchasDe(esc).map((c) => c.familia).filter(Boolean))] : [];
  const foto = pagina.portada_url || fotoDePlantilla(pagina.secciones.apariencia ?? {}, 'agenda', 'canchas');
  const reservar = '#reservar';
  return <div className="tp-futbol">
    <header className="tp-futbol__nav">
      <a className="tp-futbol__marca" href={reservar} aria-label={`${pagina.titulo}, ir a reservar`}><span aria-hidden="true">⚽</span><strong>{pagina.titulo}</strong></a>
      <nav aria-label="Navegación principal"><a href={reservar}>Canchas y horarios</a><a className="tp-futbol__nav-cta" href={reservar}>Reservar ahora <ArrowRight size={16} aria-hidden="true" /></a></nav>
    </header>
    <main>
      <section className="tp-futbol__hero" aria-label={`Reserva de canchas en ${pagina.titulo}`} style={foto ? { backgroundImage: `linear-gradient(90deg, rgba(8,28,18,.86) 0%, rgba(8,28,18,.44) 48%, rgba(8,28,18,.06) 100%), url("${foto}")` } : undefined}>
        <div className="tp-futbol__hero-texto">
          <span>{ejemplo ? 'FÚTBOL · VISTA DE EJEMPLO' : 'FÚTBOL · RESERVAS EN LÍNEA'}</span>
          <h1>{pagina.secciones.apariencia?.tituloBanner?.trim() || 'Arma tu equipo. La cancha ya está lista.'}</h1>
          <p>{pagina.frase?.trim() || 'Elige tu cancha, encuentra una hora libre y reserva en unos toques.'}</p>
          <a href={reservar}>Ver horarios disponibles <ArrowRight size={19} aria-hidden="true" /></a>
        </div>
        {modalidades.length > 0 && <div className="tp-futbol__modalidades" aria-label="Modalidades disponibles">{modalidades.map((m) => <span key={m}>{m}</span>)}</div>}
      </section>
      <section id="reservar" className="tp-futbol__reserva" aria-label="Reserva tu cancha">
        <div className="tp-futbol__reserva-cabeza"><div><span>JUEGA ESTA SEMANA</span><h2>Reserva tu cancha</h2><p>Elige modalidad, día y horario. Las horas libres se muestran al instante.</p></div><span className="tp-futbol__rapido"><Clock3 size={16} aria-hidden="true" /> En pocos pasos</span></div>
        {esc ? <TablaCanchas esc={esc} cfg={pagina.secciones.canchas ?? {}} slug={pagina.slug} whatsapp={pagina.whatsapp} negocio={pagina.titulo} ejemplo={ejemplo} /> : <p className="tp-vacio">Por ahora no hay canchas para reservar. Escríbenos por WhatsApp.</p>}
        {ejemplo && <p className="tp-futbol__demo">Vista de ejemplo · Horarios y precios ilustrativos. Ninguna acción guarda o envía datos.</p>}
      </section>
      <div className="tp-futbol__pie">
        {esc?.direccion && <span><MapPin size={16} aria-hidden="true" /> {esc.direccion}</span>}
        {!ejemplo && pagina.secciones.apariencia?.mostrarWhatsapp !== false && <a href={urlWhatsApp(pagina.whatsapp, `Hola ${pagina.titulo}, quisiera consultar sobre las canchas.`)} rel="noopener"><MessageCircle size={16} aria-hidden="true" /> ¿Tienes una consulta? Escríbenos</a>}
      </div>
      {children}
    </main>
  </div>;
}
