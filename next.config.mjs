/**
 * ══════════════════════════════════════════════════════════════════════════
 * ESTA LANDING SE PUBLICA COMO HTML ESTÁTICO, DENTRO DEL BACKOFFICE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `kallpabot-backoffice` es una carpeta de .html sueltos —login, dashboard,
 * agenda, métricas— sin build, sin servidor y con todas las rutas relativas
 * ("./assets/…", "./login.html"). La landing es su `index.html`.
 *
 * Así que aquí no hay servidor de Next que valga: `npm run publicar` genera
 * HTML plano y lo copia allí. Ver scripts/publicar.mjs.
 *
 * ── POR QUÉ EL MODO EXPORT SOLO SE ACTIVA CON UNA VARIABLE ────────────────
 * Con `output: 'export'` puesto siempre, `next dev` pierde cosas que sí
 * queremos mientras se trabaja (la página /dev/assets, los mensajes de error
 * completos). La variable la pone el script de publicación, así que el modo de
 * desarrollo se queda exactamente como estaba.
 */
const exportando = process.env.EXPORTAR_ESTATICO === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
         * Funciona porque la landing es UNA sola página y vive en la raíz de la
         * carpeta. Si algún día hay rutas anidadas (/blog/algo), un prefijo
         * relativo deja de valer y hay que pasar a basePath.
         */
        assetPrefix: './',
        // Sin esto Next emite "/pagina.html" en vez de "/pagina/index.html".
        // Da igual con una sola página, pero mantiene la carpeta limpia.
        trailingSlash: false,
      }
    : {}),
};

export default nextConfig;
