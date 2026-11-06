/**
 * «Tu tarjeta de puntos»: la Fideliza del negocio dentro de su página.
 *
 * Una sola pieza para todas las plantillas: toma el color del negocio
 * (--tp-color) y, dentro de la de uñas, su tipografía y sus tonos (tarjeta.css).
 * Componente de servidor, sin JavaScript: el botón lleva al alta de Fideliza,
 * que crea la tarjeta sin contraseña y la deja instalar o guardar en Wallet.
 */
import { ArrowRight, Gift, Smartphone, Sparkles, Stamp } from 'lucide-react';
import type { TarjetaPublica } from '@/modules/tu-pagina/dominio/tarjeta';
import './tarjeta.css';

export default function TarjetaPuntos({ tarjeta, negocio, demo = false }: { tarjeta: TarjetaPublica; negocio: string; demo?: boolean }) {
  const casillas = tarjeta.meta;
  // En la tarjeta de muestra, un par de sellos puestos: así se entiende de un vistazo.
  const llenos = casillas > 2 ? Math.min(3, casillas - 2) : 0;
  const icono = (trazo: string) => <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: trazo }} />;

  return (
    <section id="tarjeta" className="tpt" aria-labelledby="tpt-titulo">
      <div className="tpt__texto">
        <span className="tpt__sobre"><Sparkles size={14} aria-hidden="true" /> PREMIAMOS TU VISITA</span>
        <h2 id="tpt-titulo">{tarjeta.nombre}</h2>
        <p className="tpt__regla">{tarjeta.regla}</p>
        <ol className="tpt__pasos">
          <li><Smartphone size={18} aria-hidden="true" /><span><b>Crea tu tarjeta</b> en segundos, sin app ni contraseña.</span></li>
          <li><Stamp size={18} aria-hidden="true" /><span><b>Te sellamos</b> en cada visita, desde tu celular.</span></li>
          <li><Gift size={18} aria-hidden="true" /><span><b>Canjea tu premio</b>: {tarjeta.premio}.</span></li>
        </ol>
        {demo
          ? <span className="tpt__boton" aria-disabled="true">Crear mi tarjeta gratis <ArrowRight size={16} aria-hidden="true" /></span>
          : <a className="tpt__boton" href={tarjeta.url} rel="noopener">Crear mi tarjeta gratis <ArrowRight size={16} aria-hidden="true" /></a>}
        <small className="tpt__nota">Queda en tu celular: la instalas en tu pantalla de inicio o la guardas en Google Wallet.</small>
      </div>

      <div className="tpt__muestra" aria-hidden="true">
        <div className="tpt__tarjeta">
          <div className="tpt__cabeza"><b>{negocio}</b><span>{tarjeta.nombre}</span></div>
          {casillas > 0 ? (
            <div className={`tpt__sellos${casillas > 8 ? ' tpt__sellos--muchos' : casillas <= 6 ? ' tpt__sellos--pocos' : ''}`}>
              {Array.from({ length: casillas }, (_, i) => {
                const ultimo = i === casillas - 1;
                return <span key={i} className={`tpt__sello${i < llenos ? ' tpt__sello--lleno' : ''}${ultimo ? ' tpt__sello--premio' : ''}`}>
                  {ultimo ? <Gift size={18} /> : i < llenos ? icono(tarjeta.trazo) : null}
                </span>;
              })}
            </div>
          ) : (
            <div className="tpt__barra"><i style={{ width: '40%' }} /></div>
          )}
          <div className="tpt__pie"><span>{casillas > 0 ? `${llenos} de ${casillas}` : 'Tus puntos'}</span><span><Gift size={14} /> {tarjeta.premio}</span></div>
        </div>
      </div>
    </section>
  );
}
