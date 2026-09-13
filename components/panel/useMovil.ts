'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ¿ESTAMOS EN UNA PANTALLA ESTRECHA?
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Casi todo lo del móvil se resuelve con CSS, y ahí debe quedarse. Esto es
 * para el caso en que no basta: cuando lo que cambia no es cómo se pinta algo
 * sino QUÉ se pinta —la agenda enseña un día en vez de los siete—, porque
 * montar las dos rejillas y esconder una con `display:none` significa pintar
 * el doble de celdas y, con arrastrar y soltar por medio, tener dos veces cada
 * hueco escuchando el mismo `drop`.
 *
 * ⚠️ Arranca en `false` a propósito. En el servidor no hay `window`, así que
 * el primer pintado tiene que ser el mismo que el del cliente o React avisa de
 * que el HTML no cuadra. El efecto corrige en cuanto monta.
 */
import { useEffect, useState } from 'react';

export function useMovil(hasta = 720): boolean {
  const [movil, setMovil] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${hasta}px)`);
    const mirar = () => setMovil(mq.matches);
    mirar();
    // `change` en vez del `addListener` viejo: Safari lo soporta desde la 14.
    mq.addEventListener('change', mirar);
    return () => mq.removeEventListener('change', mirar);
  }, [hasta]);

  return movil;
}
