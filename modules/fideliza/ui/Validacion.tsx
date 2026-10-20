'use client';

/**
 * AVISOS DE CAMPOS · lo que falta o está mal, dicho junto al campo.
 *
 * Cada pantalla calcula sus errores como `{ clave: 'mensaje' }`, EN EL ORDEN
 * en que aparecen los campos. Este hook decide cuándo enseñarlos:
 *
 *   · un campo, cuando se sale de él (onBlur) o tras el primer intento de
 *     guardar: no se riñe a quien aún no ha escrito nada;
 *   · todos, al pulsar Guardar/Publicar: arriba del botón sale la lista y se
 *     salta al primero.
 *
 * Los errores que solo sabe el servidor (p. ej. «ese link ya lo usa otro
 * negocio») los añade la pantalla a su mapa como uno más.
 */
import { useState } from 'react';
import { AlertCircle } from 'lucide-react';

export type Errores = Record<string, string>;

export const idCampo = (clave: string) => `fz-c-${clave.replace(/[^A-Za-z0-9_-]/g, '-')}`;

export function irACampo(clave: string) {
  const el = document.getElementById(idCampo(clave));
  if (!el) return;
  for (let d = el.closest('details'); d; d = d.parentElement?.closest('details') ?? null) d.open = true;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if ('focus' in el) (el as HTMLElement).focus({ preventScroll: true });
}

export interface OpcionesValidacion {
  /** Cómo llegar a un campo que no está en pantalla (p. ej. otro paso del asistente). */
  ir?: (clave: string) => void;
  /** Texto delante de cada línea del resumen (p. ej. «Paso 4 · Beneficio»). */
  etiqueta?: (clave: string) => string | null;
}

export function useValidacion(errores: Errores, opciones: OpcionesValidacion = {}) {
  const [intentado, setIntentado] = useState(false);
  const [tocados, setTocados] = useState<ReadonlySet<string>>(new Set());
  const visible = (k: string) => (intentado || tocados.has(k) ? errores[k] : undefined);
  const lista = Object.entries(errores);

  return {
    /** Para esparcir en el <input>/<select>: id, aria-invalid y onBlur. */
    campo: (k: string) => ({
      id: idCampo(k),
      'aria-invalid': visible(k) ? true : undefined,
      'aria-describedby': visible(k) ? `${idCampo(k)}-e` : undefined,
      onBlur: () => setTocados((t) => (t.has(k) ? t : new Set(t).add(k))),
    }),
    /** El mensaje bajo el campo (o nada). */
    error: (k: string) => {
      const t = visible(k);
      return t ? (
        <small className="fz-error" id={`${idCampo(k)}-e`} role="alert">
          <AlertCircle size={13} /> {t}
        </small>
      ) : null;
    },
    hayError: (k: string) => Boolean(visible(k)),
    /**
     * Antes de guardar. true = todo bien; si no, enseña los errores y lleva al
     * primero. Con `claves`, solo cuentan esas (p. ej. las del paso actual).
     */
    comprobar: (claves?: string[]) => {
      const malos = claves ? lista.filter(([k]) => claves.includes(k)) : lista;
      if (claves) setTocados((t) => new Set([...t, ...malos.map(([k]) => k)]));
      else setIntentado(true);
      if (!malos.length) return true;
      setTimeout(() => (opciones.ir ?? irACampo)(malos[0][0]), 30);
      return false;
    },
    /** La lista completa, para poner junto al botón de guardar. */
    resumen: (titulo = 'Antes de publicar, revisa:') =>
      intentado && lista.length ? (
        <div className="fz-panel-aviso fz-panel-aviso--error fz-resumen-errores" role="alert">
          <span>
            <b>{titulo}</b>
            <ul>
              {lista.map(([k, m]) => (
                <li key={k}>
                  <button type="button" onClick={() => (opciones.ir ?? irACampo)(k)}>
                    {opciones.etiqueta?.(k) ? <b>{opciones.etiqueta(k)}: </b> : null}
                    {m}
                  </button>
                </li>
              ))}
            </ul>
          </span>
        </div>
      ) : null,
    total: lista.length,
  };
}

// ── Reglas comunes ──────────────────────────────────────────────────────────

export { esWeb } from '@/modules/fideliza/dominio/botones';
export const esSlug = (s: string) => /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(s);
export const motivoSlug = (s: string) =>
  !s
    ? 'Escribe tu link (ej. barberia-el-centro).'
    : s.length < 3
      ? 'Tu link necesita al menos 3 letras.'
      : /^-|-$/.test(s)
        ? 'Tu link no puede empezar ni terminar con guion.'
        : !esSlug(s)
          ? 'Tu link solo admite minúsculas, números y guiones.'
          : null;
