'use client';

import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';

export default function ImagenAmpliada({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [escala, setEscala] = useState(1);
  const cerrarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cerrarRef.current?.focus();
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        evento.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', alPulsar);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener('keydown', alPulsar);
    };
  }, [onClose]);

  return <div className="ne-zoom" role="presentation" onClick={onClose}>
    <div className="ne-zoom-dialogo" role="dialog" aria-modal="true" aria-label={`Imagen ampliada de ${alt}`} onClick={(evento) => evento.stopPropagation()}>
      <div className="ne-zoom-barra"><span>{alt}</span><button ref={cerrarRef} type="button" aria-label="Cerrar imagen ampliada" onClick={onClose}><X size={21} /></button></div>
      <div className="ne-zoom-lienzo"><img src={src} alt={alt} style={{ transform: `scale(${escala})` }} onClick={() => setEscala((valor) => valor === 1 ? 1.5 : 1)} /></div>
      <div className="ne-zoom-controles"><button type="button" aria-label="Alejar imagen" disabled={escala === 1} onClick={() => setEscala((valor) => Math.max(1, Math.round((valor - .5) * 10) / 10))}><Minus size={18} /></button><span>{Math.round(escala * 100)}%</span><button type="button" aria-label="Acercar imagen" disabled={escala === 2} onClick={() => setEscala((valor) => Math.min(2, Math.round((valor + .5) * 10) / 10))}><Plus size={18} /></button></div>
    </div>
  </div>;
}
