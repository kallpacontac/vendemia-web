/**
 * El envoltorio común de toda «Tu página»: el color del negocio y
 * el pie. Componente de servidor, sin JavaScript.
 */
import { fotoEnCirculo } from '@/modules/fideliza/dominio/encuadre';
import { ArrowRight, BookOpen } from 'lucide-react';
import { colorValido, tintaSobre } from '@/modules/fideliza/dominio/estilo';
import type { PaginaPublica } from '@/modules/tu-pagina/servidor/pagina';
import { plantillaPorDefecto, plantillaValida, tipoPagina, type TipoPagina } from '@/modules/tu-pagina/dominio/plantillas';
import { colorO } from '@/modules/tu-pagina/dominio/apariencia';
import { fotoDePlantilla } from '@/modules/tu-pagina/dominio/fotos';
import LuxuryPortada from '@/modules/tu-pagina/publico/LuxuryPortada';
import AnimacionesPlantilla from '@/modules/tu-pagina/publico/AnimacionesPlantilla';
import TarjetaPuntos from '@/modules/tu-pagina/publico/TarjetaPuntos';
import type { TarjetaPublica } from '@/modules/tu-pagina/dominio/tarjeta';
import '@/modules/tu-pagina/estilos/publica.css';

export function estiloDe(p: Pick<PaginaPublica, 'color' | 'secciones'>): React.CSSProperties {
  const principal = colorValido(p.color);
  const a = p.secciones.apariencia ?? {};
  const tienda = colorO(a.colorTienda, principal);
  const fondoAgenda = colorO(a.fondoAgenda, '#F8F9FB');
  const fondoTienda = colorO(a.fondoTienda, '#FFFFFF');
  const portada = colorO(a.colorBanner, principal);
  return {
    ['--tp-color' as string]: principal,
    ['--tp-tinta' as string]: tintaSobre(principal),
    ['--tp-ink' as string]: `color-mix(in srgb, ${principal} 24%, #191919)`,
    ['--tp-muted' as string]: `color-mix(in srgb, ${principal} 20%, #666666)`,
    ['--tp-line' as string]: `color-mix(in srgb, ${principal} 14%, #e4e4e4)`,
    ['--tp-tint' as string]: `color-mix(in srgb, ${principal} 10%, #ffffff)`,
    ['--tp-shadow' as string]: `color-mix(in srgb, ${principal} 11%, transparent)`,
    ['--tp-acento-negocio' as string]: principal,
    ['--tp-tinta-acento-negocio' as string]: tintaSobre(principal),
    ['--tp-tienda' as string]: tienda,
    ['--tp-tinta-tienda' as string]: tintaSobre(tienda),
    ['--tp-fondo-agenda' as string]: fondoAgenda,
    ['--tp-fondo-tienda' as string]: fondoTienda,
    ['--tp-texto-agenda' as string]: tintaSobre(fondoAgenda) === '#FFFFFF' ? '#FFFFFF' : `color-mix(in srgb, ${principal} 24%, #191919)`,
    ['--tp-texto-tienda' as string]: tintaSobre(fondoTienda),
    ['--tp-portada-color' as string]: portada,
    ['--tp-portada-tinta' as string]: tintaSobre(portada),
  };
}

/**
 * @param portada la página de inicio (/<negocio>). Los enlaces son relativos para valer
 *        igual en tienda.* y en /tu-pagina/; desde una subpágina se sube un nivel.
 */
/**
 * @param tarjeta la tarjeta de puntos de Fideliza (servidor/tarjeta.ts). Sale al final del
 *        contenido en cualquier plantilla; la de uñas la pinta ella misma, en su sitio.
 */
export default function Marco({ pagina, children, vista, portada, tarjeta }: { pagina: PaginaPublica; children: React.ReactNode; vista?: TipoPagina; portada?: boolean; tarjeta?: TarjetaPublica | null }) {
  const tipo = vista ?? tipoPagina(pagina.secciones);
  const plantilla = pagina.secciones.apariencia?.plantillaActiva
    ? (plantillaValida(pagina.plantilla) ? pagina.plantilla : plantillaPorDefecto(tipo))
    : undefined;
  const promocion = pagina.secciones.apariencia?.promocionTexto?.trim();
  return (
    // «Atención en mesa» se viste como «Carta visual»: lo suyo es lo que hace, no el aspecto de la portada.
    <div className="tp" data-diseno={tipo} data-plantilla={plantilla === 'mesa' ? 'restaurante' : plantilla} data-portada={portada ? 'si' : 'no'} style={estiloDe(pagina)}>
      <AnimacionesPlantilla />
      {promocion && !(plantilla === 'restaurante' && portada) && <CintaPromocion texto={promocion} />}
      {children}
      {tarjeta && <TarjetaPuntos tarjeta={tarjeta} negocio={pagina.titulo} />}
      {/* El Libro de Reclamaciones va en el pie de TODA la página, también la de inicio (sql/0006). */}
      {pagina.secciones.reclamos && pagina.secciones.proveedor?.ruc && (
        <p className="tp-pie tp-no-imprimir">
          <a className="tp-libro" href={`${portada ? './' : '../'}${pagina.slug}/reclamaciones`}>
            <BookOpen size={16} aria-hidden="true" /> Libro de Reclamaciones
          </a>
        </p>
      )}
      <p className="tp-pie tp-no-imprimir">
        Hecho con <a href="https://vendemias.com/?utm_source=tu-pagina" rel="noopener">Vendemia</a>
      </p>
    </div>
  );
}

export function Cabecera({ pagina, fotoDestacada, servicioDestacado, catalogoDisponible = false, catalogoProductosDisponible = false }: { pagina: PaginaPublica; fotoDestacada?: string; servicioDestacado?: { nombre: string; descripcion?: string; precio?: string; foto?: string }; catalogoDisponible?: boolean; catalogoProductosDisponible?: boolean }) {
  const inicial = pagina.titulo.trim().charAt(0).toUpperCase() || '·';
  const a = pagina.secciones.apariencia ?? {};
  const tipo = tipoPagina(pagina.secciones);
  const plantilla = a.plantillaActiva && plantillaValida(pagina.plantilla) ? pagina.plantilla : plantillaPorDefecto(tipo);
  // Sin foto propia, la del ejemplo de la plantilla (dominio/fotos.ts).
  const deLaPlantilla = fotoDePlantilla(a, tipo, plantilla);
  const fotoPortada = pagina.portada_url || deLaPlantilla;
  if (plantilla === 'luxury' && a.plantillaActiva && pagina.secciones.reservar) {
    return <LuxuryPortada
      titulo={pagina.titulo}
      frase={pagina.frase}
      etiqueta={a.tituloBanner}
      logo={fotoEnCirculo(pagina.logo_url) || undefined}
      portada={fotoPortada || undefined}
      portadaSecundaria={a.portadaLuxurySecundaria}
      servicio={servicioDestacado}
      inicioHref={`./${pagina.slug}`}
      reservarHref={`./${pagina.slug}/reservar`}
      catalogoDisponible={catalogoDisponible}
      catalogoProductosDisponible={catalogoProductosDisponible}
    />;
  }
  const promoRestaurante = plantilla === 'restaurante' && a.plantillaActiva && a.mostrarBanner !== false && a.promocionTexto?.trim();
  const heroCatalogo = catalogoDisponible && tipo === 'tienda' && a.plantillaActiva && a.mostrarBanner !== false && !promoRestaurante;
  const banner = !heroCatalogo && !promoRestaurante && a.mostrarBanner !== false && (!a.plantillaActiva || Boolean(fotoPortada || a.tituloBanner));
  // Una foto de plantilla elegida a propósito manda sobre la del primer producto; la sugerida, no.
  const fotoHero = pagina.portada_url || (a.fotoPlantilla ? deLaPlantilla : fotoDestacada || deLaPlantilla);
  return (
    <>
      {banner && <div className="tp-portada" style={fotoPortada ? { backgroundImage: `url("${fotoPortada}")`, ...(pagina.portada_url ? {} : { backgroundPosition: 'center 25%' }) } : undefined}>
        {a.tituloBanner && <span className="tp-portada__titulo">{a.tituloBanner}</span>}
      </div>}
      <div className="tp-hoja">
        <header className={`tp-cabeza${banner ? '' : ' tp-cabeza--sin-banner'}`}>
          <div
            className="tp-logo"
            style={pagina.logo_url ? { backgroundImage: `url("${fotoEnCirculo(pagina.logo_url)}")` } : undefined}
            aria-hidden="true"
          >
            {pagina.logo_url ? null : inicial}
          </div>
          <h1 className="tp-titulo">{pagina.titulo}</h1>
          {pagina.frase && <p className="tp-frase">{pagina.frase}</p>}
        </header>
      </div>
      {promoRestaurante && <section className="tp-promocion-visual" style={fotoHero ? { backgroundImage: `linear-gradient(90deg, rgba(35,16,10,.92), rgba(35,16,10,.14)), url("${fotoHero}")` } : undefined} aria-label="Promoción destacada">
        <div><span>OFERTA ESPECIAL · {pagina.titulo}</span><h2>{promoRestaurante}</h2><p>Descubre la carta y elige lo que más se te antoja.</p>{catalogoDisponible && <a href="#catalogo">Ver la carta <ArrowRight size={17} aria-hidden="true" /></a>}</div>
      </section>}
      {heroCatalogo && <section className={`tp-hero tp-hoja${plantilla === 'restaurante' || plantilla === 'mesa' ? ' tp-hero--restaurante' : ''}`} aria-label={`Bienvenidos a ${pagina.titulo}`}>
        <div className="tp-hero__contenido">
          <span className="tp-hero__etiqueta">{plantilla === 'restaurante' || plantilla === 'mesa' ? 'CARTA DIGITAL · RECIÉN HECHO' : pagina.titulo}</span>
          <h2>{a.tituloBanner || pagina.frase || `Descubre ${pagina.titulo}`}</h2>
          <p>{a.tituloBanner && pagina.frase ? pagina.frase : plantilla === 'restaurante' || plantilla === 'mesa' ? 'Recién hecho, listo para ti.' : 'Explora nuestro catálogo y encuentra algo para ti.'}</p>
          <a href="#catalogo">{plantilla === 'restaurante' || plantilla === 'mesa' ? 'Ver la carta' : 'Explorar catálogo'} <ArrowRight size={17} aria-hidden="true" /></a>
        </div>
        <div className="tp-hero__arte" style={fotoHero ? { backgroundImage: `url("${fotoHero}")` } : undefined} aria-hidden="true" />
      </section>}
    </>
  );
}

/** La franja de «OFERTA ESPECIAL» corre de lado: dos tramos iguales que se relevan sin salto. */
function CintaPromocion({ texto }: { texto: string }) {
  const tramo = (oculto: boolean) => (
    <div className="tp-promocion__tramo" aria-hidden={oculto || undefined}>
      {Array.from({ length: 8 }, (_, i) => (
        <span key={i} className="tp-promocion__item" aria-hidden={i > 0 || undefined}><span>OFERTA ESPECIAL</span><strong>{texto}</strong></span>
      ))}
    </div>
  );
  return <div className="tp-promocion" role="note"><div className="tp-promocion__pista">{tramo(false)}{tramo(true)}</div></div>;
}
