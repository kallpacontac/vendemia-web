/**
 * El envoltorio común de toda «Tu página» (Pide por dentro): el color del negocio y
 * el pie. Componente de servidor, sin JavaScript.
 */
import { colorValido, tintaSobre } from '@/modules/fideliza/dominio/estilo';
import type { PaginaPublica } from '@/modules/pide/servidor/pagina';
import '@/modules/pide/estilos/pide.css';

export function estiloDe(p: Pick<PaginaPublica, 'color'>): React.CSSProperties {
  const color = colorValido(p.color);
  return { ['--pd-color' as string]: color, ['--pd-tinta' as string]: tintaSobre(color) };
}

export default function Marco({ pagina, children }: { pagina: PaginaPublica; children: React.ReactNode }) {
  return (
    <div className="pd" style={estiloDe(pagina)}>
      {children}
      <p className="pd-pie">
        Hecho con <a href="https://vendemias.com/?utm_source=tu-pagina" rel="noopener">Vendemia</a>
      </p>
    </div>
  );
}

export function Cabecera({ pagina }: { pagina: PaginaPublica }) {
  const inicial = pagina.titulo.trim().charAt(0).toUpperCase() || '·';
  return (
    <>
      <div className="pd-portada" style={pagina.portada_url ? { backgroundImage: `url("${pagina.portada_url}")` } : undefined} />
      <div className="pd-hoja">
        <header className="pd-cabeza">
          <div
            className="pd-logo"
            style={pagina.logo_url ? { backgroundImage: `url("${pagina.logo_url}")` } : undefined}
            aria-hidden="true"
          >
            {pagina.logo_url ? null : inicial}
          </div>
          <h1 className="pd-titulo">{pagina.titulo}</h1>
          {pagina.frase && <p className="pd-frase">{pagina.frase}</p>}
        </header>
      </div>
    </>
  );
}
