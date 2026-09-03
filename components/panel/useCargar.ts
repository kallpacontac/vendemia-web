'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Cuándo volver a preguntar después de un `recargar()`, en milisegundos.
 *
 * ══ POR QUÉ SE PREGUNTA OCHO VECES Y NO UNA ══════════════════════════════
 *
 * Un comando pasa por dos sistemas, no por uno:
 *
 *   1 · el BOT lo aplica en su SQLite  →  la fila de `commands` pasa a `done`
 *   2 · el ESPEJO publica el cambio en Supabase  →  `catalog`, `leads`… cambian
 *
 * `encolar()` resuelve en el paso 1, que es lo correcto: es cuando el cambio
 * existe de verdad. Pero la pantalla lee lo del paso 2, y entre uno y otro pasa
 * un rato MUY variable. Medido en producción, dos veces el mismo día: 0,19 s
 * una y 2,44 s otra.
 *
 * Con un solo refresco, ese rato decide si ves tu cambio. Y al perder la
 * carrera no hay segunda oportunidad: la pantalla se queda con lo viejo hasta
 * que alguien recarga a mano. Reproducido con Playwright contra producción —
 * mismo test, tres pasadas: 4,6 s, 6,7 s, y una que no salió en 24 s. Eso es
 * exactamente el "tengo que actualizar la página para que aparezca".
 *
 * ⚠️ Lo CORRECTO sería escuchar la tabla por Realtime en vez de preguntar. No
 * se puede: `catalog` no está en la publicación `supabase_realtime`. El canal
 * se suscribe sin dar error y no llega ni un evento — comprobado. Si algún día
 * se añaden las tablas del espejo a la publicación, esto se sustituye por una
 * suscripción y se acabaron los reintentos.
 *
 * Mientras tanto: espaciado creciente hasta 12,5 s, y se para en cuanto los
 * datos cambian de verdad (ver `firma`), que es el caso normal a los 2-3 s. En
 * la práctica son dos o tres consultas de más, no ocho.
 */
const REINTENTOS_MS = [600, 1300, 2200, 3400, 5000, 7000, 9500, 12500];

/** Huella del contenido, para saber si una recarga trajo algo distinto. */
const firma = (d: unknown): string => {
  try {
    return JSON.stringify(d);
  } catch {
    return String(d);
  }
};

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
  /** Huella de lo último que llegó. */
  const ultimaFirma = useRef<string>('');
  /** Huella de ANTES del comando: los reintentos paran cuando deja de coincidir. */
  const firmaObjetivo = useRef<string | null>(null);

  const pararReintentos = useCallback(() => {
    relojes.current.forEach(clearTimeout);
    relojes.current = [];
    firmaObjetivo.current = null;
  }, []);

  const recargar = useCallback(() => {
    pararReintentos();
    // Se guarda cómo estaban los datos ANTES. En cuanto una recarga traiga algo
    // distinto, se cancelan los reintentos que queden: ya llegó el espejo.
    firmaObjetivo.current = ultimaFirma.current;
    relojes.current = REINTENTOS_MS.map((ms) => setTimeout(() => setRonda((r) => r + 1), ms));
    setRonda((r) => r + 1);
  }, [pararReintentos]);

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
        if (!vivo) return;
        setDatos(d);
        hayDatos.current = d !== null;

        const nueva = firma(d);
        // ¿Ya llegó lo que estábamos esperando? Entonces sobran los reintentos.
        if (firmaObjetivo.current !== null && nueva !== firmaObjetivo.current) pararReintentos();
        ultimaFirma.current = nueva;
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
