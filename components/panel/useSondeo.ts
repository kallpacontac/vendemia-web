'use client';

import { useEffect, useRef } from 'react';

/**
 * Ejecuta `fn` cada `ms` mientras la pestaña esté a la vista.
 *
 * Existe porque las tablas del espejo (`messages`, `leads`…) no están en la
 * publicación de Realtime: sin esto, la bandeja de Mensajes no se enteraba de
 * nada hasta recargar la página a mano. Ver scripts/realtime-mensajes.sql, que
 * es el arreglo de fondo; esto es lo que hace que funcione mientras tanto, y
 * lo que lo sostiene si el websocket se cae.
 *
 * ── Por qué se para con la pestaña oculta ─────────────────────────────────
 * Un panel abierto en una pestaña olvidada todo el día serían miles de
 * consultas a Supabase para que no las vea nadie. Al volver a la pestaña se
 * lanza una al momento, así que quien vuelve no espera al siguiente tic.
 *
 * `fn` puede cambiar en cada render: se guarda en un ref para que el
 * intervalo no se reinicie cada vez que la pantalla se repinta.
 */
export function useSondeo(fn: () => void, ms: number, activo = true) {
  const ultima = useRef(fn);
  ultima.current = fn;

  useEffect(() => {
    if (!activo) return;
    const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
    const tic = () => {
      if (visible()) ultima.current();
    };
    const reloj = setInterval(tic, ms);
    const alVolver = () => {
      if (visible()) ultima.current();
    };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    return () => {
      clearInterval(reloj);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
    };
  }, [ms, activo]);
}
