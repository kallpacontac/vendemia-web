'use client';

/**
 * El aviso que sale al abrir Mi página (25-nov-2026, The 24/7: «una promo popup configurable al
 * abrir mi página»). Lo escribe el dueño en el panel (secciones.popup, dominio/promos.ts).
 *
 *   · Una vez al día por teléfono; si el dueño cambia el texto, vuelve a salir.
 *   · Medio segundo después de abrir, para no tapar la página antes de que se vea.
 *   · Se cierra con la X, tocando fuera o con Escape. Sin almacenamiento (modo privado), sale
 *     en cada visita: no rompe nada.
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { clavePopup } from '@/modules/tu-pagina/dominio/promos';

export default function PromoPopup({ slug, titulo, texto, imagen, accion }: {
  slug: string;
  titulo: string;
  texto: string;
  imagen: string;
  /** El botón: a dónde lleva y qué dice. Sin él, solo se cierra. */
  accion: { href: string; etiqueta: string } | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const clave = clavePopup(slug, { titulo, texto });
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

  useEffect(() => {
    let visto = false;
    try {
      visto = localStorage.getItem(clave) === hoy;
    } catch {
      /* sin almacenamiento: sale igual */
    }
    if (visto) return;
    const t = window.setTimeout(() => setAbierto(true), 600);
    return () => window.clearTimeout(t);
  }, [clave, hoy]);

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  function cerrar() {
    setAbierto(false);
    try {
      localStorage.setItem(clave, hoy);
    } catch {
      /* nada */
    }
  }

  if (!abierto) return null;
  return (
    <div className="tp-popup" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) cerrar(); }}>
      <div className="tp-popup__caja" role="dialog" aria-modal="true" aria-labelledby={titulo ? 'tp-popup-t' : undefined} aria-label={titulo ? undefined : 'Promoción'}>
        <button type="button" className="tp-popup__cerrar" onClick={cerrar} aria-label="Cerrar"><X size={18} aria-hidden="true" /></button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {imagen && <img className="tp-popup__foto" src={imagen} alt="" />}
        <div className="tp-popup__cuerpo">
          {titulo && <h2 id="tp-popup-t">{titulo}</h2>}
          {texto && <p>{texto}</p>}
          {accion ? (
            <a className="tp-boton tp-popup__boton" href={accion.href} onClick={cerrar} rel={accion.href.startsWith('http') ? 'noopener' : undefined}>{accion.etiqueta}</a>
          ) : (
            <button type="button" className="tp-boton tp-popup__boton" onClick={cerrar}>Entendido</button>
          )}
        </div>
      </div>
    </div>
  );
}
