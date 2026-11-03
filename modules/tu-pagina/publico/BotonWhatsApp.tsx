'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { urlWhatsApp } from '@/modules/tu-pagina/dominio/envio';
import './whatsapp.css';

/** Acceso consistente en todas las plantillas. En ejemplos muestra el flujo sin enviar datos. */
export default function BotonWhatsApp({ negocio, numero, demo = false }: { negocio: string; numero?: string; demo?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const mensaje = `Hola ${negocio}, vengo de su página y quisiera hacer una consulta.`;
  useEffect(() => {
    if (!abierto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cerrarRef.current?.focus();
    const alPulsar = (evento: KeyboardEvent) => { if (evento.key === 'Escape') setAbierto(false); };
    document.addEventListener('keydown', alPulsar);
    return () => { document.body.style.overflow = anterior; document.removeEventListener('keydown', alPulsar); };
  }, [abierto]);
  if (!demo && !numero) return null;

  return <>
    {demo
      ? <button className="tp-whatsapp-flotante" type="button" aria-label="Consultar por WhatsApp (demostración)" onClick={() => setAbierto(true)}><MessageCircle size={27} aria-hidden="true" /><span>WhatsApp</span></button>
      : <a className="tp-whatsapp-flotante" href={urlWhatsApp(numero!, mensaje)} target="_blank" rel="noopener noreferrer" aria-label={`Consultar a ${negocio} por WhatsApp`}><MessageCircle size={27} aria-hidden="true" /><span>WhatsApp</span></a>}
    {abierto && <div className="tp-whatsapp-demo-fondo" role="presentation" onClick={() => setAbierto(false)}><div className="tp-whatsapp-demo" role="dialog" aria-modal="true" aria-labelledby="tp-whatsapp-demo-titulo" onClick={(event) => event.stopPropagation()}>
      <button ref={cerrarRef} className="tp-whatsapp-demo-cerrar" type="button" aria-label="Cerrar" onClick={() => setAbierto(false)}><X size={20} /></button>
      <MessageCircle size={30} aria-hidden="true" />
      <h2 id="tp-whatsapp-demo-titulo">Contacto por WhatsApp</h2>
      <p>En una página publicada, este botón abre el chat del negocio con un mensaje listo para enviar.</p>
      <blockquote>{mensaje}</blockquote>
      <small>Esta demostración no abre ningún chat ni envía datos.</small>
      <button type="button" onClick={() => setAbierto(false)}>Volver al ejemplo</button>
    </div></div>}
  </>;
}
