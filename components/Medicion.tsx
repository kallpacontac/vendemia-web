'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { PIXEL_ID, capturarAtribucion } from '@/lib/medicion';

/**
 * PIXEL DE META + CAPTURA DE ATRIBUCIÓN.
 *
 * ── `afterInteractive`, NI ANTES NI DESPUÉS ──────────────────────────────
 * `beforeInteractive` metería el script de Meta en el camino crítico del
 * primer pintado: en un móvil con datos, eso es medio segundo de hero en
 * blanco pagado con dinero de anuncios, para medir a alguien que todavía no ha
 * visto nada. `lazyOnload` es el otro extremo: espera al `load` completo y
 * pierde el PageView de quien rebota en tres segundos — que en tráfico frío es
 * mucha gente, y justo la que necesitas contar bien para saber qué creatividad
 * no funciona. `afterInteractive` carga en cuanto la página responde.
 *
 * ── SIN ID, NO SE MONTA NADA ─────────────────────────────────────────────
 * En desarrollo no hay `NEXT_PUBLIC_META_PIXEL_ID` y este componente devuelve
 * solo la captura de atribución. Nunca mandes eventos desde tu propia máquina:
 * cada recarga tuya le enseña a Meta a buscar gente que se parece a ti, que es
 * exactamente lo contrario de lo que quieres comprar.
 *
 * ── EL <noscript> NO ES ADORNO ───────────────────────────────────────────
 * Es la única forma de contar a quien navega con JavaScript restringido o con
 * un bloqueador que tumba el script pero deja pasar la imagen. Son pocos, pero
 * son visitas que ya has pagado.
 */
export default function Medicion() {
  // La atribución se captura SIEMPRE, haya pixel o no: sirve para marcar el
  // mensaje de WhatsApp, que funciona igual sin medición ninguna.
  useEffect(() => {
    capturarAtribucion();
  }, []);

  if (!PIXEL_ID) return null;

  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${PIXEL_ID}');
fbq('track','PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          alt=""
          src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
