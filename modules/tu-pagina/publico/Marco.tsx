/**
 * El envoltorio común de toda «Tu página»: el color del negocio y
 * el pie. Componente de servidor, sin JavaScript.
 */
import { BookOpen } from 'lucide-react';
import { colorValido, tintaSobre } from '@/modules/fideliza/dominio/estilo';
import type { PaginaPublica } from '@/modules/tu-pagina/servidor/pagina';
import { plantillaPorDefecto, plantillaValida, tipoPagina, type TipoPagina } from '@/modules/tu-pagina/dominio/plantillas';
import { colorO } from '@/modules/tu-pagina/dominio/apariencia';
import '@/modules/tu-pagina/estilos/publica.css';

export function estiloDe(p: Pick<PaginaPublica, 'color' | 'secciones'>): React.CSSProperties {
  const principal = colorValido(p.color);
  const a = p.secciones.apariencia ?? {};
  const tienda = colorO(a.colorTienda, '#111111');
  const fondoAgenda = colorO(a.fondoAgenda, '#F8F9FB');
  const fondoTienda = colorO(a.fondoTienda, '#FFFFFF');
  const portada = colorO(a.colorBanner, principal);
  return {
    ['--tp-color' as string]: principal,
    ['--tp-tinta' as string]: tintaSobre(principal),
    ['--tp-tienda' as string]: tienda,
    ['--tp-tinta-tienda' as string]: tintaSobre(tienda),
    ['--tp-fondo-agenda' as string]: fondoAgenda,
    ['--tp-fondo-tienda' as string]: fondoTienda,
    ['--tp-texto-agenda' as string]: tintaSobre(fondoAgenda) === '#FFFFFF' ? '#FFFFFF' : '#0B3558',
    ['--tp-texto-tienda' as string]: tintaSobre(fondoTienda),
    ['--tp-portada-color' as string]: portada,
    ['--tp-portada-tinta' as string]: tintaSobre(portada),
  };
}

/**
 * @param portada la página de inicio (/<negocio>). Los enlaces son relativos para valer
 *        igual en tienda.* y en /tu-pagina/; desde una subpágina se sube un nivel.
 */
export default function Marco({ pagina, children, vista, portada }: { pagina: PaginaPublica; children: React.ReactNode; vista?: TipoPagina; portada?: boolean }) {
  const tipo = vista ?? tipoPagina(pagina.secciones);
  const plantilla = pagina.secciones.apariencia?.plantillaActiva
    ? (plantillaValida(pagina.plantilla) ? pagina.plantilla : plantillaPorDefecto(tipo))
    : undefined;
  return (
    <div className="tp" data-diseno={tipo} data-plantilla={plantilla} style={estiloDe(pagina)}>
      {children}
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

export function Cabecera({ pagina }: { pagina: PaginaPublica }) {
  const inicial = pagina.titulo.trim().charAt(0).toUpperCase() || '·';
  const a = pagina.secciones.apariencia ?? {};
  const banner = a.mostrarBanner !== false;
  return (
    <>
      {banner && <div className="tp-portada" style={pagina.portada_url ? { backgroundImage: `url("${pagina.portada_url}")` } : undefined}>
        {a.tituloBanner && <span className="tp-portada__titulo">{a.tituloBanner}</span>}
      </div>}
      <div className="tp-hoja">
        <header className={`tp-cabeza${banner ? '' : ' tp-cabeza--sin-banner'}`}>
          <div
            className="tp-logo"
            style={pagina.logo_url ? { backgroundImage: `url("${pagina.logo_url}")` } : undefined}
            aria-hidden="true"
          >
            {pagina.logo_url ? null : inicial}
          </div>
          <h1 className="tp-titulo">{pagina.titulo}</h1>
          {pagina.frase && <p className="tp-frase">{pagina.frase}</p>}
        </header>
      </div>
    </>
  );
}
