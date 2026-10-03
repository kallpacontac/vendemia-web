/**
 * Las cabeceras HTTP de Fideliza. Las importa next.config.mjs, que es lo único
 * que Next lee para cabeceras; aquí para que vivan con el resto del módulo.
 *
 * @param {{ key: string, value: string }[]} CABECERAS_PRIVADAS las del sitio (next.config.mjs)
 */
export function cabecerasFideliza(CABECERAS_PRIVADAS) {
  return [
    // Fideliza: la tarjeta lleva el token en la ruta. Ni indexar, ni enmarcar,
    // ni mandar la URL entera como Referer a la web del negocio.
    {
      source: '/m/:path*',
      headers: [...CABECERAS_PRIVADAS.filter((h) => h.key !== 'Referrer-Policy'), { key: 'Referrer-Policy', value: 'no-referrer' }],
    },
    { source: '/m/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/m/' }] },
    /**
     * La caja de Fideliza escanea el QR del cliente con la cámara. Va en TODO
     * /panel y no solo en la caja porque Permissions-Policy se fija al cargar
     * el documento: entrando a la caja desde el dashboard (navegación de
     * cliente) seguiría valiendo la de /panel. Solo `self`: ningún iframe ni
     * tercero puede pedirla. Va al final para pisar la de CABECERAS_COMUNES.
     */
    ...['/panel', '/panel/:path*'].map((source) => ({
      source,
      headers: [{ key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), interest-cohort=()' }],
    })),
  ];
}
