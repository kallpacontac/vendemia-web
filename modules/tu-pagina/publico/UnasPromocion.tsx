'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Gift, Stamp, X } from 'lucide-react';
import type { TarjetaPublica } from '@/modules/tu-pagina/dominio/tarjeta';

export default function UnasPromocion({ negocio, slug, texto, imagen, tarjeta = null, demo = false }: {
  negocio: string;
  slug: string;
  texto: string;
  imagen?: string;
  /** Si el negocio enseña su tarjeta de puntos, el regalo de la cabecera también lleva a ella. */
  tarjeta?: TarjetaPublica | null;
  demo?: boolean;
}) {
  const [abierta, setAbierta] = useState(false);
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const abrirRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      const clave = `unas-promocion:${slug}:${texto}`;
      if (sessionStorage.getItem(clave) !== 'vista') {
        sessionStorage.setItem(clave, 'vista');
        setAbierta(true);
      }
    } catch { /* El botón permite abrir la promoción igualmente. */ }
  }, [slug, texto]);

  useEffect(() => {
    if (!abierta) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cerrarRef.current?.focus();
    const cerrarConEscape = (evento: KeyboardEvent) => { if (evento.key === 'Escape') setAbierta(false); };
    window.addEventListener('keydown', cerrarConEscape);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener('keydown', cerrarConEscape);
      abrirRef.current?.focus();
    };
  }, [abierta]);

  return <>
    <button ref={abrirRef} className="un-promocion__acceso" type="button" aria-label={tarjeta ? `Promociones y tarjeta de puntos (${tarjeta.nombre})` : 'Ver promociones'} onClick={() => setAbierta(true)}><Gift size={19} aria-hidden="true" /></button>
    {abierta && <div className="un-promocion__fondo" role="presentation" onClick={() => setAbierta(false)}>
      <div className="un-promocion__dialogo" role="dialog" aria-modal="true" aria-labelledby="un-promocion-titulo" onClick={(evento) => evento.stopPropagation()}>
        <button ref={cerrarRef} className="un-promocion__cerrar" type="button" aria-label="Cerrar promoción" onClick={() => setAbierta(false)}><X size={20} /></button>
        {imagen && /* eslint-disable-next-line @next/next/no-img-element */ <img className="un-promocion__imagen" src={imagen} alt="" />}
        <div className="un-promocion__contenido"><span>OFERTA ESPECIAL · {negocio}</span><h2 id="un-promocion-titulo">{texto}</h2><p>Explora nuestros servicios de uñas y encuentra un momento para ti.</p><a href="#reserva" onClick={() => setAbierta(false)}>Ver horarios <ArrowRight size={17} aria-hidden="true" /></a></div>
        {tarjeta && <div className="un-promocion__club">
          <Stamp size={22} aria-hidden="true" />
          <div><b>{tarjeta.nombre}</b><span>{tarjeta.regla}</span></div>
          <a href={demo ? '#tarjeta' : tarjeta.url} rel="noopener" onClick={() => setAbierta(false)}>Crear mi tarjeta <ArrowRight size={15} aria-hidden="true" /></a>
        </div>}
      </div>
    </div>}
  </>;
}
