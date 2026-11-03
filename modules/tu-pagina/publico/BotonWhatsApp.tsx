'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { urlWhatsApp } from '@/modules/tu-pagina/dominio/envio';
import './whatsapp.css';

function IconoWhatsApp() {
  return <svg className="tp-whatsapp-flotante__icono" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M17.5 14.4c-.3-.2-1.8-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-1.6-.8-2.7-1.5-3.8-3.4-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5 0-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5 1.9.8 2.6.9 3.6.7.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.2-.3-.2-.6-.3z" />
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2z" />
  </svg>;
}

function ContenidoBoton() {
  return <>
    <span className="tp-whatsapp-flotante__onda" aria-hidden="true" />
    <IconoWhatsApp />
    <span className="tp-whatsapp-flotante__aviso" aria-hidden="true">1</span>
  </>;
}

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
      ? <button className="tp-whatsapp-flotante" type="button" aria-label="Consultar por WhatsApp (demostración)" onClick={() => setAbierto(true)}><ContenidoBoton /></button>
      : <a className="tp-whatsapp-flotante" href={urlWhatsApp(numero!, mensaje)} target="_blank" rel="noopener noreferrer" aria-label={`Consultar a ${negocio} por WhatsApp`}><ContenidoBoton /></a>}
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
