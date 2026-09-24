'use client';

/**
 * El clip del chat: elegir un fichero, subirlo, y enseñar qué va a salir.
 *
 * Se sube AL ELEGIRLO, no al enviar. Así el botón Enviar solo manda un comando
 * con una URL, y el doble clic no puede disparar dos subidas; y si el fichero
 * es demasiado grande, se sabe antes de haber escrito el mensaje.
 */
import { useCallback, useRef, useState } from 'react';
import { FileText, Film, Mic, Paperclip, X } from 'lucide-react';
import { useAvisar } from './Avisos';
import { problemaDeArchivo, subirAdjunto, type Adjunto } from '@/lib/panel/adjuntos';

export function useAdjunto(companyId: string | null) {
  const avisar = useAvisar();
  const [adjunto, setAdjunto] = useState<Adjunto | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  /**
   * Sube cada vez que se quita el adjunto. Una subida que termina cuando ya se
   * cambió de conversación (o se quitó) compara y se descarta: si no, el
   * fichero elegido para un cliente aparecería listo para salir en el chat de
   * otro.
   */
  const vuelta = useRef(0);

  async function elegir(file: File) {
    if (!companyId) return;
    const problema = problemaDeArchivo(file);
    if (problema) {
      avisar(problema, 'error');
      return;
    }
    const mia = vuelta.current;
    setSubiendo(true);
    try {
      const subido = await subirAdjunto(file, companyId);
      if (vuelta.current === mia) setAdjunto(subido);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo subir el archivo', 'error');
    } finally {
      setSubiendo(false);
    }
  }

  const quitar = useCallback(() => {
    vuelta.current += 1;
    setAdjunto(null);
  }, []);
  return { adjunto, subiendo, elegir, quitar };
}

export function BotonAdjunto({
  alElegir,
  deshabilitado,
  subiendo,
}: {
  alElegir: (f: File) => void;
  deshabilitado?: boolean;
  subiendo?: boolean;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className="clip"
        title="Adjuntar foto, vídeo, audio o documento"
        aria-label="Adjuntar archivo"
        disabled={deshabilitado || subiendo}
        onClick={() => entrada.current?.click()}
      >
        {subiendo ? <div className="spin spin--sm" /> : <Paperclip size={17} />}
      </button>
      <input
        ref={entrada}
        type="file"
        hidden
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
        onChange={(e) => {
          const f = e.target.files?.[0];
          // Se vacía para que elegir el MISMO fichero dos veces vuelva a disparar onChange.
          e.target.value = '';
          if (f) alElegir(f);
        }}
      />
    </>
  );
}

/** Lo que va a salir, con la X para quitarlo. */
export function ChipAdjunto({ adjunto, alQuitar }: { adjunto: Adjunto; alQuitar: () => void }) {
  return (
    <div className="adjunto-chip">
      {adjunto.tipo === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={adjunto.url} alt="" />
      ) : adjunto.tipo === 'video' ? (
        <Film size={16} />
      ) : adjunto.tipo === 'audio' ? (
        <Mic size={16} />
      ) : (
        <FileText size={16} />
      )}
      <span>{adjunto.nombre}</span>
      <button type="button" onClick={alQuitar} aria-label="Quitar el archivo">
        <X size={14} />
      </button>
    </div>
  );
}
