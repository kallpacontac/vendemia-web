/**
 * ══════════════════════════════════════════════════════════════════════════
 * EL SITIO SE DESPLIEGA EN VERCEL · el export estático es la excepción
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `npm run build` (lo que ejecuta Vercel) construye la aplicación entera:
 * landing y panel. El panel necesita ir así porque habla con Supabase desde el
 * navegador con las variables NEXT_PUBLIC_SUPABASE_*, que se incrustan en el
 * bundle al construir.
 *
 * ── EL MODO EXPORT SIGUE AHÍ, PERO SOLO PARA LA LANDING ───────────────────
 * `npm run publicar` pone EXPORTAR_ESTATICO=1 y saca un out/ con la landing
 * sola, para poder colgarla en cualquier servidor estático. El panel se borra
 * de ese artefacto a propósito (ver scripts/publicar.mjs): con rutas anidadas,
 * el prefijo relativo de aquí abajo deja de valer.
 *
 * ── POR QUÉ EL MODO EXPORT SOLO SE ACTIVA CON UNA VARIABLE ────────────────
 * Con `output: 'export'` puesto siempre, `next dev` pierde cosas que sí
 * queremos mientras se trabaja (la página /dev/assets, los mensajes de error
 * completos). La variable la pone el script de publicación, así que el modo de
 * desarrollo se queda exactamente como estaba.
 */
const exportando = process.env.EXPORTAR_ESTATICO === '1';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * CABECERAS DE SEGURIDAD
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ Solo existen sirviendo desde un servidor (Vercel). En `output: 'export'`
 * no hay quien las mande: son cabeceras HTTP, no etiquetas del HTML. Si algún
 * día la landing se cuelga en otro sitio, hay que configurarlas allí.
 *
 * `frame-ancestors 'none'` es lo que más importa del lote y va en el panel: sin
 * eso, cualquiera puede meter /panel/mensajes en un iframe invisible sobre su
 * propia página y conseguir que un dueño con la sesión abierta pulse "pausar
 * bot" o "resolver escalación" creyendo que pulsa otra cosa. Se llama
 * clickjacking y no lo evita ningún RLS: las peticiones las hace su navegador,
 * con su sesión, y son legítimas.
 *
 * `Referrer-Policy` tampoco es decorativo aquí: desde /panel/mensajes?lead=<id>
 * se abre wa.me en otra pestaña, y con la política por defecto de algunos
 * navegadores esa URL entera —con el id del lead dentro— viaja como Referer a
 * un tercero.
 *
 * NO hay CSP de scripts a propósito: Next inyecta scripts en línea y una CSP
 * estricta necesita nonces por petición. Ponerla mal deja la aplicación en
 * blanco, y ponerla con 'unsafe-inline' es escribir una cabecera que no
 * protege de nada. Si se hace, que sea con la ayuda de nonces de Next y
 * probándola, no copiada de un artículo.
 */
const CABECERAS_COMUNES = [
  // Evita que el navegador "adivine" el tipo de un fichero y acabe ejecutando
  // como script algo que se sirvió como texto.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
];

/**
 * Lo que se le pone al panel y al login.
 *
 * ── NO HAY `Cache-Control: no-store`, Y SE PROBÓ ─────────────────────────
 * Se puso, y Next lo ignora: en las páginas preconstruidas impone la suya
 * (`s-maxage=…, stale-while-revalidate`) y la nuestra no llega al navegador.
 * Dejar una cabecera que no se aplica es peor que no ponerla — se lee en el
 * repositorio y se da por hecha una protección que no existe.
 *
 * Y aquí no hace falta: el HTML del panel NO lleva datos. Todo se pide desde
 * el navegador con la sesión del usuario, así que lo que se cachea es el
 * esqueleto vacío —comprobado: `curl /panel/mensajes` solo devuelve "Cargando
 * tu panel…"—. Si algún día alguna pantalla se renderiza en servidor con datos
 * dentro, esto deja de ser cierto y hay que volver aquí.
 */
const CABECERAS_PRIVADAS = [
  ...CABECERAS_COMUNES,
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  // Que no acabe indexada si alguien comparte una URL por error.
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

async function cabeceras() {
  return [
    { source: '/:path*', headers: [...CABECERAS_COMUNES, { key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
    // Las dos entradas son necesarias: `/panel/:path*` no cubre `/panel` a secas.
    { source: '/panel', headers: CABECERAS_PRIVADAS },
    { source: '/panel/:path*', headers: CABECERAS_PRIVADAS },
    { source: '/login', headers: CABECERAS_PRIVADAS },
    { source: '/nueva-clave', headers: CABECERAS_PRIVADAS },
    { source: '/callback', headers: CABECERAS_PRIVADAS },
  ];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // En modo export, Next avisa de que `headers` no se aplicará. Es verdad y no
  // hay nada que hacer, así que ni se declara: mejor sin la función que con un
  // aviso en cada publicación al que uno se acostumbra.
  ...(exportando ? {} : { headers: cabeceras }),
  images: {
    // Los assets reales se declaran en lib/assets.ts. Cuando apunten a un CDN,
    // añade aquí su dominio.
    remotePatterns: [],
    /**
     * En export no hay servidor que optimice imágenes al vuelo, así que Next
     * aborta el build si no se le dice esto. Da igual en la práctica: aquí no
     * se usa `next/image` en ningún sitio — todo son <img> y SVG. Ver la nota
     * de components/Mark.tsx sobre por qué.
     */
    unoptimized: exportando,
  },
  ...(exportando
    ? {
        output: 'export',
        /**
         * ⚠️ './' Y NO '/'. Es lo que hace que el resultado funcione servido en
         * la raíz de un dominio, en un subdirectorio Y abierto a pelo desde el
         * disco. Con el prefijo por defecto, el HTML pide "/_next/…" y en
         * cualquier sitio que no sea la raíz exacta eso es un 404: la página
         * carga sin estilos ni JavaScript.
         *
         * Funciona porque el artefacto exportado es UNA sola página en la raíz.
         * Las rutas anidadas que sí existen ya —/panel/leads, /login— no caben
         * en este esquema: desde ellas "./_next/…" resolvería a
         * "/panel/_next/…". Por eso publicar.mjs las borra de out/ y el panel
         * se despliega en Vercel, no aquí.
         */
        assetPrefix: './',
        // Sin esto Next emite "/pagina.html" en vez de "/pagina/index.html".
        // Da igual con una sola página, pero mantiene la carpeta limpia.
        trailingSlash: false,
      }
    : {}),
};

export default nextConfig;
