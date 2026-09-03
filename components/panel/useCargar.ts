'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Cuándo volver a preguntar después de un `recargar()`, en milisegundos.
 *
 * ══ POR QUÉ NO BASTA CON PEDIRLO UNA VEZ ═════════════════════════════════
 *
 * Un comando pasa por dos sistemas, no por uno:
 *
 *   1 · el BOT lo aplica en su SQLite  →  la fila de `commands` pasa a `done`
 *   2 · el ESPEJO publica el cambio en Supabase  →  `catalog`, `leads`… cambian
 *
 * `encolar()` resuelve en el paso 1, que es lo correcto: es cuando el cambio
 * existe de verdad. Pero la pantalla lee lo del paso 2, y entre uno y otro pasa
 * un instante. Medido en producción: el bot tardó 1,48 s y el espejo 0,19 s más.
 *
 * Refrescando una sola vez, esos 190 ms deciden si ves tu cambio o no. Y cuando
 * pierdes la carrera no hay segunda oportunidad: la pantalla se queda con los
 * datos viejos hasta que alguien recarga a mano. Comprobado con Playwright
 * contra producción — mismo test, dos pasadas: en una el producto salió a los
 * 2,6 s, en la otra no salió en 24 s. Ese es exactamente el "tengo que
 * actualizar la página para que aparezca".
 *
 * Así que se pregunta varias veces repartidas. Son tres consultas de más por
 * acción, y valen lo que cuestan.
 */
const REINTENTOS_MS = [900, 2200, 4500];

/**
 * Cargar datos de Supabase en una pantalla del panel.
 *
 * Es deliberadamente pequeño —no hay caché ni revalidación— porque el panel se
 * refresca por otro camino: los cambios los aplica el bot y vuelven por el
 * espejo. Lo que hace falta aquí es un `recargar()` que se pueda llamar después
 * de encolar un comando, y que la pantalla no se rompa si la consulta falla.
 *
 * El flag `vivo` evita el aviso de "setState en un componente desmontado"
 * cuando alguien cambia de pantalla con la consulta a medias.
 */
export function useCargar<T>(
  cargar: () => Promise<T>,
  deps: unknown[],
): { datos: T | null; cargando: boolean; error: string | null; recargar: () => void } {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ronda, setRonda] = useState(0);
  const claveAnterior = useRef<string | null>(null);
  /** Para no enseñar la rueda en los reintentos: ya hay datos buenos puestos. */
  const hayDatos = useRef(false);
  const relojes = useRef<ReturnType<typeof setTimeout>[]>([]);

  const recargar = useCallback(() => {
    relojes.current.forEach(clearTimeout);
    relojes.current = REINTENTOS_MS.map((ms) => setTimeout(() => setRonda((r) => r + 1), ms));
    setRonda((r) => r + 1);
  }, []);

  // Si alguien se va de la pantalla a media ráfaga, los reintentos se cancelan.
  useEffect(() => () => relojes.current.forEach(clearTimeout), []);

  useEffect(() => {
    let vivo = true;

    /**
     * ⚠️ Al CAMBIAR de compañía hay que tirar lo anterior, no dejarlo puesto
     * mientras llega lo nuevo.
     *
     * Quien pertenece a varias empresas cambia con el selector, y sin esto la
     * pantalla seguiría enseñando las cifras de la anterior —ya con el nombre
     * de la nueva en la cabecera— hasta que respondiera la consulta. Son datos
     * suyos, así que no es una fuga, pero es exactamente el tipo de mezcla que
     * lleva a leer el número equivocado y decidir con él.
     *
     * Solo se limpia cuando cambian las dependencias, no en cada `recargar()`:
     * refrescar tras guardar no debe parpadear a pantalla vacía.
     */
    const clave = JSON.stringify(deps);
    if (claveAnterior.current !== null && claveAnterior.current !== clave) {
      setDatos(null);
      hayDatos.current = false;
    }
    claveAnterior.current = clave;

    // Solo bloquea mientras no hay nada que enseñar. En un reintento la
    // pantalla ya tiene datos: parpadear a "cargando" tres veces seguidas
    // después de guardar es peor que no avisar.
    setCargando(!hayDatos.current);
    setError(null);

    cargar()
      .then((d) => {
        if (vivo) {
          setDatos(d);
          hayDatos.current = d !== null;
        }
      })
      .catch((e: unknown) => {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudieron cargar los datos');
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });

    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, ronda]);

  return { datos, cargando, error, recargar };
}
