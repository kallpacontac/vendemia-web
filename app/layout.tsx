import type { Metadata } from 'next';

/**
 * TIPOGRAFÍA · Plus Jakarta Sans, desde Google Fonts
 *
 * ⚠️ NO uses `next/font` aquí, aunque sea lo idiomático en Next. Dos motivos,
 * y el primero es que directamente NO COMPILA:
 *
 * 1 · next/font exige que `assetPrefix` empiece por "/" o sea una URL absoluta,
 *     y esta landing se exporta con prefijo relativo "./" para poder vivir
 *     dentro del backoffice en cualquier ruta (ver next.config.mjs). El build
 *     falla con "assetPrefix must start with a leading slash".
 *
 * 2 · Aunque compilara, sería incoherente. login.html, dashboard.html y el
 *     resto del backoffice ya cargan ESTA MISMA URL de Google Fonts. Usando la
 *     misma, el navegador se la encuentra ya cacheada al pasar de la landing al
 *     panel; con next/font tendríamos la fuente dos veces, servida de dos
 *     sitios, y la segunda página volvería a descargarla.
 *
 * Los pesos (400–800) son los de login.html, carácter por carácter: si cambias
 * la URL, cámbiala también allí o se rompe el cacheo compartido.
 *
 * La familia se aplica desde globals.css a través de --font-sans.
 */
/**
 * El favicon, el icono de iOS y la imagen de Open Graph NO se declaran aquí:
 * Next los descubre por convención en app/icon.png, app/apple-icon.png y
 * app/opengraph-image.png. Los tres los genera `node scripts/logo.mjs`.
 */
export const metadata: Metadata = {
  // Sin esto Next resuelve la imagen de Open Graph contra localhost:3000 y la
  // previsualización sale rota en WhatsApp y en LinkedIn. Pon el dominio real
  // en NEXT_PUBLIC_SITE_URL al desplegar.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  // Ni "bot" ni "chatbot", tampoco aquí: el título de Google es lo primero que
  // lee el cliente y es donde se decide en qué categoría te mete.
  title: 'Vendemia · Tu vendedor digital en WhatsApp',
  description:
    'Mia atiende en 30 segundos, resuelve objeciones, agenda citas y cobra por WhatsApp — también de madrugada y en domingo. Listo en 10 minutos, desde S/89 al mes.',
};

/**
 * ⚠️ FLAG DE DESARROLLO — QUITAR ANTES DE PRODUCCIÓN
 *
 * En producción la intro se ve UNA VEZ POR SESIÓN (flag `intro_seen` en
 * sessionStorage). Eso es lo correcto: a la segunda visita es irritante.
 * Pero para trabajar en ella es insufrible tener que abrir una pestaña nueva
 * cada vez, así que en `npm run dev` se reproduce en cada recarga.
 *
 * Está atado a NODE_ENV, o sea que `npm run build` lo apaga solo y no puede
 * escaparse a producción. Aun así, si algún día alguien lo cambia a `true`
 * fijo, `scripts/audit.mjs` lo caza (comprobación 9).
 *
 * Para probar el comportamiento REAL sin hacer build:
 *   ?intro=0  → fuerza saltarla
 *   ?intro=1  → fuerza reproducirla
 */
const REPLAY_INTRO_ON_RELOAD = process.env.NODE_ENV !== 'production';

/**
 * Script bloqueante: decide ANTES del primer paint si la intro corre.
 * Sin esto habría un flash de la página en su sitio antes de que React
 * la desplace hacia abajo.
 *
 * ⚠️ NI UN SOLO BACKTICK AQUÍ DENTRO, NI SIQUIERA EN LOS COMENTARIOS.
 * Esto es un template literal, así que un backtick lo CIERRA y a partir de ahí
 * TypeScript intenta leer el resto del script como código. El error que sale no
 * se parece en nada a la causa —"TS1005: ',' expected", "Module declaration
 * names may only use ' or \" quoted strings"— y apunta a la línea del comentario,
 * no a la del backtick. Ya pasó una vez por citar `replaceState` así.
 * Para nombrar código en estos comentarios, escríbelo a pelo: replaceState.
 * Es la misma trampa que el "--" dentro de app/icon.svg.
 */
const INTRO_GATE = `
(function(){
  document.documentElement.classList.remove('no-js');

  /* ⚠️ TODO LO DE AQUÍ ABAJO ES SOLO DE LA LANDING.

     Este script vive en el layout raíz porque tiene que ser bloqueante y correr
     en <head>, y eso solo se puede hacer aquí. Pero el panel también pasa por
     este layout, y allí no hay intro, ni telón, ni una sola página que
     preservar: borrarle el hash a /panel/mensajes#lead-3 o forzarle el scroll
     al principio sería romper cosas que sí funcionan.

     Y hay algo peor que romper el scroll: el acceso con Google y el enlace de
     recuperar contraseña vuelven con la sesión DENTRO del hash
     (#access_token=...). Borrarlo antes de que supabase-js lo lea deja al
     usuario fuera, sin mensaje y sin pista — el fallo se ve en /login o en
     /callback, a mil kilómetros de este script. Ver (acceso)/callback/page.tsx.

     La landing es "/" y nada más. El resto sale por aquí sin tocar nada. */
  if (location.pathname !== '/') {
    document.documentElement.dataset.intro = 'skip';
    return;
  }

  /* ⚠️ Lo más importante de este script, y tiene que ir ANTES que nada.
     Por defecto el navegador restaura la posición de scroll al recargar. En una
     página normal eso se agradece; aquí lo rompe todo a la vez:

       · el navbar es position:fixed DENTRO de .page-curtain, que durante la
         intro está trasladado 100vh. Si scrollY ya valía ~100vh, el navbar
         aterriza justo en el borde superior del viewport y se ve por encima
         de la intro;
       · al terminar el telón no estás en el hero sino donde estabas antes;
       · y a media página las tres secciones sticky se ven solapadas, como
         fundidas unas con otras.

     Tres síntomas, una causa. 'manual' hace que la recarga empiece arriba. */
  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) {}

  /* ⚠️ EL HASH SE BORRA, Y SE BORRA AQUÍ.

     Esta landing es UNA página con una puerta de entrada: el hero. Los enlaces
     del menú desplazan, pero no escriben la sección en la URL (ver
     SmoothScroll.tsx). Aun así puede llegar un hash de fuera: un enlace viejo
     ya compartido, un marcador, o el historial del navegador. Si se queda,
     recargar te deja a media página — sin intro y sin titular — que es
     justo lo que no queremos.

     TIENE QUE SER EN ESTE SCRIPT y no en un efecto de React. Este script es
     bloqueante y corre en <head>, o sea ANTES de que exista el elemento con ese
     id: sin destino al que saltar, el navegador no salta y no hay nada que
     deshacer. Hecho más tarde, el salto ya habría ocurrido y se vería ir y
     volver.

     Se usa replaceState y no pushState: no queremos dejar el hash en el
     historial, queremos que desaparezca. Y se conserva la query porque de ahí
     salen los modificadores ?intro=0 y ?intro=1 de aquí abajo.

     ── Si algún día quieres enlaces profundos de verdad ──────────────────────
     Quita este bloque Y devuelve el history.pushState de SmoothScroll.tsx.
     Los dos, o quedará a medias. Ojo: entonces recargar volverá a dejar al
     visitante donde estaba, no en el hero. */
  try {
    if (location.hash) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  } catch (e) {}

  try {
    var replay = ${REPLAY_INTRO_ON_RELOAD};              /* ⚠️ DEV ONLY */
    var forced = new URLSearchParams(location.search).get('intro');
    var seen = (replay || forced === '1') ? null : sessionStorage.getItem('intro_seen');
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var run = forced === '0' ? false : (!seen && !reduced);
    document.documentElement.dataset.intro = run ? 'run' : 'skip';
  } catch (e) {
    document.documentElement.dataset.intro = 'skip';
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="no-js">
      <head>
        {/* Mismo trío que login.html: los dos preconnect ahorran la negociación
            TLS con los dos dominios (el CSS viene de googleapis y los .woff2 de
            gstatic), y sin ellos la fuente llega ~100 ms más tarde. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: INTRO_GATE }} />
      </head>
      {/*
        Ni telón, ni Lenis, ni intro aquí: eso es de la landing y vive en
        app/(landing)/layout.tsx. Este layout solo pone el <html>, la fuente y
        los metadatos, que sí son de todo el sitio.
      */}
      <body>{children}</body>
    </html>
  );
}
