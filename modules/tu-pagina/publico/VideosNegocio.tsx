'use client';

/**
 * «En video»: los videos verticales del negocio (secciones.apariencia.videos), después del
 * catálogo. Pedido por Alvaro el 14-nov-2026 para The 24/7 (inauguración de la sede Premium y el
 * lavado capilar).
 *
 * Para que la página siga ligera: nada se descarga hasta que el video se acerca a la pantalla
 * (preload="none" + IntersectionObserver), se reproduce sin sonido solo mientras se ve y se pausa
 * al salir. Con «reducir movimiento» no arranca solo: se toca para verlo. El sonido, con su botón.
 */
import { useEffect, useRef, useState } from 'react';
import { Play, Volume2, VolumeX } from 'lucide-react';
import type { VideoPagina } from '@/modules/tu-pagina/dominio/apariencia';

function Video({ v }: { v: VideoPagina }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [mudo, setMudo] = useState(true);
  const [pausado, setPausado] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ob = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && e.intersectionRatio >= 0.55) {
        if (!quieto) void el.play().catch(() => setPausado(true));
      } else if (!el.paused) {
        el.pause();
      }
    }, { threshold: [0, 0.55] });
    ob.observe(el);
    return () => ob.disconnect();
  }, []);

  const alternar = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  };

  return (
    <figure className="tp-video">
      <div className="tp-video__marco">
        <video ref={ref} src={v.url} poster={v.poster} muted={mudo} loop playsInline preload="none"
          onPlay={() => setPausado(false)} onPause={() => setPausado(true)} onClick={alternar}
          aria-label={v.titulo ? `Video: ${v.titulo}` : 'Video del negocio'} />
        {pausado && <button type="button" className="tp-video__play" onClick={alternar} aria-label="Reproducir"><Play size={26} aria-hidden="true" /></button>}
        <button type="button" className="tp-video__sonido" onClick={() => setMudo((m) => !m)} aria-pressed={!mudo} aria-label={mudo ? 'Activar sonido' : 'Quitar sonido'}>
          {mudo ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
        </button>
      </div>
      {v.titulo && <figcaption>{v.titulo}</figcaption>}
    </figure>
  );
}

export default function VideosNegocio({ videos, titulo }: { videos: VideoPagina[]; titulo: string }) {
  if (!videos.length) return null;
  return (
    <section className="tp-videos" aria-labelledby="tp-videos-t">
      <span className="tp-videos__etiqueta">En video</span>
      <h2 id="tp-videos-t">{titulo}</h2>
      <div className="tp-videos__fila">
        {videos.map((v) => <Video key={v.url} v={v} />)}
      </div>
    </section>
  );
}
