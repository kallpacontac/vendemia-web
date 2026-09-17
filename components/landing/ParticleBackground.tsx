'use client';

import { useEffect, useRef } from 'react';

// Video supplied in the approved visual reference.
const REFERENCE_VIDEO = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260818_072341_50851634-bbc3-4c33-9acc-7647d4db44aa.mp4';

export default function ParticleBackground() {
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = video.current;
    const container = root.current;
    if (!element || !container) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = true;
    const syncPlayback = () => {
      if (reducedMotion.matches || document.hidden || !visible) {
        element.pause();
      } else {
        void element.play().catch(() => {
          // Autoplay can be blocked on mobile: retain the decoded still frame.
        });
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncPlayback();
    });
    observer.observe(container);
    element.addEventListener('loadeddata', syncPlayback);
    element.addEventListener('canplay', syncPlayback);
    reducedMotion.addEventListener('change', syncPlayback);
    document.addEventListener('visibilitychange', syncPlayback);
    syncPlayback();

    return () => {
      observer.disconnect();
      element.pause();
      element.removeEventListener('loadeddata', syncPlayback);
      element.removeEventListener('canplay', syncPlayback);
      reducedMotion.removeEventListener('change', syncPlayback);
      document.removeEventListener('visibilitychange', syncPlayback);
    };
  }, []);

  return (
    <div ref={root} className="vendemia-particles" aria-hidden="true">
      <svg width="0" height="0" className="vendemia-particles__palette">
        <defs>
          <filter id="vendemia-particle-palette" colorInterpolationFilters="sRGB">
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncR type="table" tableValues="0 1" />
              <feFuncG type="table" tableValues="0 0.478" />
              <feFuncB type="table" tableValues="0 0.094" />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>
      <video
        ref={video}
        className="vendemia-particles__film"
        src={REFERENCE_VIDEO}
        muted
        loop
        playsInline
        preload="auto"
        tabIndex={-1}
        disablePictureInPicture
      />
      <div className="vendemia-particles__reading-shade" />
    </div>
  );
}
