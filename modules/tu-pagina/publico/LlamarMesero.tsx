'use client';

import { useEffect, useRef, useState } from 'react';
import { BellRing, Check, MessageCircle, X } from 'lucide-react';
import { urlWhatsApp } from '@/modules/tu-pagina/dominio/envio';
import './mesero.css';

export default function LlamarMesero({ negocio, whatsapp, demo = false }: { negocio: string; whatsapp?: string; demo?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [mesa, setMesa] = useState('');
  const [simulado, setSimulado] = useState(false);
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const mesaLista = mesa.trim();
  const mensaje = `Hola ${negocio}, estoy en la mesa ${mesaLista} y necesito atención de un mesero.`;

  useEffect(() => {
    if (!abierto) return;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cerrarRef.current?.focus();
    const alPulsar = (evento: KeyboardEvent) => { if (evento.key === 'Escape') setAbierto(false); };
    document.addEventListener('keydown', alPulsar);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener('keydown', alPulsar);
    };
  }, [abierto]);

  return <>
    <button className={demo ? 'ne-cafe-mesero' : 'tp-accion'} type="button" aria-label="Llamar al mesero" onClick={() => { setMesa(''); setSimulado(false); setAbierto(true); }}>
      {demo ? <><BellRing size={18} /> Llamar al mesero</> : <><span className="tp-accion__icono"><BellRing size={22} aria-hidden="true" /></span><span className="tp-accion__texto"><b>Llamar al mesero</b><span>Indica tu mesa y avísanos</span></span></>}
    </button>
    {abierto && <div className="tp-mesero-fondo" role="presentation" onClick={() => setAbierto(false)}><div className="tp-mesero-dialogo" role="dialog" aria-modal="true" aria-label="Llamar al mesero" onClick={(evento) => evento.stopPropagation()}>
      <button ref={cerrarRef} className="tp-mesero-cerrar" type="button" aria-label="Cerrar" onClick={() => setAbierto(false)}><X size={20} /></button>
      <span className="tp-mesero-icono">{simulado ? <Check size={27} /> : <BellRing size={27} />}</span>
      {simulado ? <><h2>Así vería el aviso el negocio</h2><p>“{mensaje}”</p><p className="tp-mesero-nota">Esta es una demostración. No se avisó a ningún mesero.</p><button className="tp-mesero-primario" type="button" onClick={() => setAbierto(false)}>Volver a la carta</button></> : <><h2>Llamar al mesero</h2><p>Indica tu número de mesa. {demo ? 'Verás cómo quedaría el aviso.' : 'Se abrirá WhatsApp con el aviso listo para enviar.'}</p><label htmlFor="tp-mesero-mesa">Tu mesa</label><input id="tp-mesero-mesa" value={mesa} maxLength={20} placeholder="Ej. 4 o Terraza 2" onChange={(evento) => setMesa(evento.target.value)} /><small>El mesero sabrá dónde encontrarte.</small>{demo ? <button className="tp-mesero-primario" type="button" disabled={!mesaLista} onClick={() => setSimulado(true)}><BellRing size={18} /> Ver aviso de ejemplo</button> : <a className={`tp-mesero-primario${!mesaLista ? ' tp-mesero-inactivo' : ''}`} href={mesaLista && whatsapp ? urlWhatsApp(whatsapp, mensaje) : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!mesaLista || !whatsapp} onClick={(evento) => { if (!mesaLista || !whatsapp) evento.preventDefault(); }}><MessageCircle size={18} /> Abrir WhatsApp para avisar</a>}{!demo && <p className="tp-mesero-nota">La solicitud se envía cuando pulses “Enviar” en WhatsApp.</p>}</>}
    </div></div>}
  </>;
}
