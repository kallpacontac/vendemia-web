/**
 * «Nuestras sedes»: los locales del negocio (secciones.citas.sedes) con su dirección y «Cómo
 * llegar». Pedido por Alvaro el 14-nov-2026: «en la página, si tiene sedes, no se aprecia».
 * Solo sale con 2 o más; con una, la dirección ya va en el resumen de la cita.
 */
import { ArrowUpRight, MapPin } from 'lucide-react';
import { urlMapa, type Sede } from '@/modules/tu-pagina/dominio/adelantoCitas';

export default function SedesNegocio({ sedes, reservarHref, club }: { sedes: Sede[]; reservarHref?: string; club?: string }) {
  if (sedes.length < 2) return null;
  return (
    <section className="tp-sedes" aria-labelledby="tp-sedes-t">
      <span className="tp-sedes__etiqueta">{sedes.length} sedes</span>
      <h2 id="tp-sedes-t">Nuestras sedes</h2>
      <div className="tp-sedes__lista">
        {sedes.map((s) => (
          <article key={s.nombre} className={`tp-sede${s.foto ? ' tp-sede--foto' : ''}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {s.foto ? <img src={s.foto} alt={`Fachada de ${s.nombre}`} loading="lazy" /> : <div className="tp-sede__sinfoto" aria-hidden="true"><MapPin size={34} /></div>}
            <div className="tp-sede__texto">
              <h3><MapPin size={18} aria-hidden="true" /> {s.nombre}</h3>
              <p>{s.direccion}</p>
              <div className="tp-sede__acciones">
                <a href={urlMapa(s)} target="_blank" rel="noopener">Cómo llegar <ArrowUpRight size={16} aria-hidden="true" /></a>
                {reservarHref && <a href={`${reservarHref}${reservarHref.includes('?') ? '&' : '?'}sede=${encodeURIComponent(s.nombre)}`}>Reservar aquí</a>}
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="tp-sedes__nota">Al reservar eliges en cuál te atendemos.{club ? <> Tu tarjeta del <b>{club}</b> es una sola y vale en {sedes.length === 2 ? 'las dos' : `las ${sedes.length}`}.</> : null}</p>
    </section>
  );
}
