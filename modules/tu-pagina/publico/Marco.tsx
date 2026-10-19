/**
 * El envoltorio común de toda «Tu página»: el color del negocio y
 * el pie. Componente de servidor, sin JavaScript.
 */
import { colorValido, tintaSobre } from '@/modules/fideliza/dominio/estilo';
import type { PaginaPublica } from '@/modules/tu-pagina/servidor/pagina';
import { defPlantilla } from '@/modules/tu-pagina/dominio/plantillas';
import '@/modules/tu-pagina/estilos/publica.css';

export function estiloDe(p: Pick<PaginaPublica, 'color'>): React.CSSProperties {
  const color = colorValido(p.color);
  return { ['--tp-color' as string]: color, ['--tp-tinta' as string]: tintaSobre(color) };
}

export default function Marco({ pagina, children }: { pagina: PaginaPublica; children: React.ReactNode }) {
  return (
    <div className="tp" data-plantilla={defPlantilla(pagina.plantilla).id} style={estiloDe(pagina)}>
      {children}
      <p className="tp-pie">
        Hecho con <a href="https://vendemias.com/?utm_source=tu-pagina" rel="noopener">Vendemia</a>
      </p>
    </div>
  );
}

export function Cabecera({ pagina }: { pagina: PaginaPublica }) {
  const inicial = pagina.titulo.trim().charAt(0).toUpperCase() || '·';
  return (
    <>
      <div className="tp-portada" style={pagina.portada_url ? { backgroundImage: `url("${pagina.portada_url}")` } : undefined} />
      <div className="tp-hoja">
        <header className="tp-cabeza">
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
