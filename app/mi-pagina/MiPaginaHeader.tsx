'use client';

import { useState } from 'react';
import { ChevronDown, Gift, Menu, Monitor, Palette, ShoppingBag, X } from 'lucide-react';

export function MiPaginaLogo() {
  return <span className="mp-logo">Vendem<span className="mp-logo__i">ı</span>a</span>;
}

export default function MiPaginaHeader({ planes = false }: { planes?: boolean }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const ancla = (id: string) => planes ? `/mi-pagina#${id}` : `#${id}`;
  const cerrar = () => setMenuAbierto(false);

  return <header className="mp-nav">
    <a className="mp-marca" href="/mi-pagina" aria-label="Vendemia Mi página, ir al inicio"><MiPaginaLogo /></a>
    <nav className={menuAbierto ? 'mp-nav__enlaces abierto' : 'mp-nav__enlaces'} aria-label="Mi página">
      <details className="mp-nav__soluciones"><summary>Soluciones <ChevronDown size={15} /></summary><div className="mp-nav__desplegable" onClick={(evento) => { if ((evento.target as Element).closest('a')) (evento.currentTarget.parentElement as HTMLDetailsElement).open = false; }}>
        <a href={ancla('soluciones')} onClick={cerrar}><span><ShoppingBag size={19} /></span><span><b>Cartas interactivas</b><small>Carta con carrito y pedidos por WhatsApp</small></span></a>
        <a href={ancla('ejemplos')} onClick={cerrar}><span><Palette size={19} /></span><span><b>Cartas con diseño</b><small>Tu carta con identidad, enlace y QR</small></span></a>
        <a href="/panel/fideliza" onClick={cerrar}><span><Gift size={19} /></span><span><b>Sistema de fidelización</b><small>Puntos, sellos y premios para tus clientes</small></span></a>
        <a href="/contacto" onClick={cerrar}><span><Monitor size={19} /></span><span><b>Páginas web a medida</b><small>Un sitio diseñado para tu negocio</small></span></a>
      </div></details>
      <a href="/mi-pagina/planes" className={planes ? 'mp-nav__activo' : undefined} onClick={cerrar}>Planes</a>
      <a href={ancla('ejemplos')} onClick={cerrar}>Rubros</a>
      <a href={ancla('como-funciona')} onClick={cerrar}>Cómo funciona</a>
      <a href={ancla('preguntas')} onClick={cerrar}>Preguntas</a>
      <a href="/contacto" onClick={cerrar}>Contacto</a>
    </nav>
    <div className="mp-nav__acciones"><a className="mp-nav__volver" href="/login">Ya soy cliente</a><a className="mp-boton mp-boton--chico" href="/mi-pagina/planes">Ver planes</a></div>
    <button className="mp-nav__menu" type="button" aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuAbierto} onClick={() => setMenuAbierto(!menuAbierto)}>{menuAbierto ? <X size={24} /> : <Menu size={24} />}</button>
  </header>;
}
