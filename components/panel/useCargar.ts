'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Cargar datos de Supabase en una pantalla del panel.
 *
 * Es deliberadamente pequeño —no hay caché ni revalidación— porque el panel se
 * refresca solo por otro camino: los cambios los aplica el bot y vuelven por el
 * espejo en 1-2 segundos. Lo que hace falta aquí es un `recargar()` que se
 * pueda llamar después de encolar un comando, y que la pantalla no se rompa si
 * la consulta falla.
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

  const recargar = useCallback(() => setRonda((r) => r + 1), []);

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
    if (claveAnterior.current !== null && claveAnterior.current !== clave) setDatos(null);
    claveAnterior.current = clave;

    setCargando(true);
    setError(null);

    cargar()
      .then((d) => {
        if (vivo) setDatos(d);
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
