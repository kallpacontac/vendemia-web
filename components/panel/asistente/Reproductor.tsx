'use client';

/**
 * El audio de una respuesta de Mia: play/pausa, progreso y duración.
 *
 * ⚠️ SUENA EN VOZ ALTA, y lo que dice es la lectura de las ventas. Por eso:
 *
 *   · Solo arranca solo si `sonarSolo`, que quien llama pone únicamente cuando
 *     el usuario acaba de preguntar HABLANDO. Si escribió, puede estar delante
 *     de clientes: el audio queda listo para pulsar.
 *   · Al desmontarse SE PAUSA. Quitar un <audio> del DOM no lo calla: sin el
 *     `pause()` de la limpieza, la conversación desaparecería al bloquearse la
 *     página y la voz seguiría contando la caja.
 *   · Solo suena uno a la vez.
 *
 * `src` es una URL `blob:` en memoria (ver descargarAudio): el enlace firmado
 * del bot caduca a los 10 minutos, esto no.
 */
import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { duracion } from '@/lib/panel/asistente';

/** El que está sonando, para callarlo cuando empieza otro. */
let sonando: HTMLAudioElement | null = null;

export default function Reproductor({ src, sonarSolo }: { src: string; sonarSolo: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [activo, setActivo] = useState(false);
  const [van, setVan] = useState(0);
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    // Si el navegador bloquea el autoplay, la promesa se rechaza y aquí no
    // pasa nada: queda el botón de play, sin error.
    if (sonarSolo) void a.play().catch(() => {});
    return () => {
      a.pause();
      if (sonando === a) sonando = null;
    };
    // Solo al nacer: que `sonarSolo` cambie después no debe volver a arrancarlo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function alternar() {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => {});
    else a.pause();
  }

  /** Un MP3 servido como Blob a veces dice `Infinity` hasta que se ha leído entero. */
  const leerTotal = (a: HTMLAudioElement) => setTotal(Number.isFinite(a.duration) ? a.duration : null);

  return (
    <div className="asis-audio">
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={(e) => {
          if (sonando && sonando !== e.currentTarget) sonando.pause();
          sonando = e.currentTarget;
          setActivo(true);
        }}
        onPause={() => setActivo(false)}
        onEnded={() => setActivo(false)}
        onTimeUpdate={(e) => setVan(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => leerTotal(e.currentTarget)}
        onDurationChange={(e) => leerTotal(e.currentTarget)}
      />
      <button
        type="button"
        className="asis-audio__play"
        onClick={alternar}
        aria-label={activo ? 'Pausar el audio de Mia' : 'Oír el audio de Mia'}
      >
        {activo ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <input
        type="range"
        className="asis-audio__barra"
        min={0}
        max={total ?? Math.max(van, 1)}
        step={0.1}
        value={van}
        disabled={total === null}
        aria-label="Posición del audio"
        onChange={(e) => {
          if (audio.current) audio.current.currentTime = Number(e.target.value);
        }}
      />
      <span className="asis-audio__tiempo">
        {duracion(van)}
        {total !== null && ` / ${duracion(total)}`}
      </span>
    </div>
  );
}
