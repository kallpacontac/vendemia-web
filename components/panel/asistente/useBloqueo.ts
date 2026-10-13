'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * «CONFIRMA QUE ERES TÚ» · el bloqueo del asistente
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Es lo que justifica que el asistente viva en la web y no en WhatsApp: allí,
 * quien tiene el teléfono ES el dueño. Aquí se puede pedir que lo demuestre.
 *
 * La sesión del panel aguanta una hora sin que nadie la toque (ver
 * lib/panel/caducidad.ts). Para la agenda está bien; para una pantalla que
 * contesta «¿cuánto entró hoy?» a quien se siente delante, no. Esta página se
 * bloquea a los 10 minutos.
 *
 * ── Por qué el estado vive FUERA del componente ──────────────────────────
 *
 * Con un `useState` normal, el bloqueo se saltaba pulsando «Agenda» y luego
 * «Asistente»: la página se desmonta, se vuelve a montar y nace desbloqueada.
 * En el módulo, sobrevive a ir y volver por el panel.
 *
 * Y con solo eso se saltaba con F5, que vacía el módulo. Por eso, al llegar
 * sin nada en memoria, la referencia es CUÁNDO SE AUTENTICÓ la persona de
 * verdad (`amr` del token): si hace más de 10 minutos, se pide la contraseña.
 *
 * ⚠️ No se usa el registro de actividad del panel (`vendemia_actividad`) para
 * esto, aunque parezca lo natural: el propio F5 —o el clic en el menú— es un
 * gesto, se apunta como actividad, y la página nueva la leería como «acaba de
 * estar aquí».
 *
 * Nada de esto se guarda en el navegador. Es memoria y lo que ya dice el token.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ultimaAutenticacion } from '@/lib/panel/caducidad';

/** 10 minutos sin que nadie toque ESTA página. */
export const LIMITE_MS = 10 * 60 * 1000;

const GESTOS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/** De quién es lo de abajo: otra cuenta en el mismo navegador empieza de cero. */
let usuario: string | null = null;
/** La última vez que alguien tocó esta página, o confirmó que era él. */
let presencia: number | null = null;
let bloqueado = false;

/** ¿Hay que bloquear? Se mira SIEMPRE antes de apuntar presencia, nunca después. */
function vencido(s: Session | null, ahora: number): boolean {
  const desde = presencia ?? ultimaAutenticacion(s);
  // Sin referencia —un token que no dice cuándo se autenticó— se bloquea: ante
  // la duda, que lo demuestre.
  return desde === null || ahora - desde > LIMITE_MS;
}

export function useBloqueo(session: Session | null) {
  const sesionRef = useRef(session);
  sesionRef.current = session;

  const [estaBloqueado, setEstaBloqueado] = useState(() => {
    const id = session?.user?.id ?? null;
    if (id !== usuario) {
      usuario = id;
      presencia = null;
      bloqueado = false;
    }
    if (!bloqueado && vencido(session, Date.now())) bloqueado = true;
    // Llegar hasta aquí sin bloqueo ya es estar delante.
    if (!bloqueado) presencia = Date.now();
    return bloqueado;
  });

  useEffect(() => {
    if (estaBloqueado) return;

    /** @returns true si acaba de bloquear. */
    const revisar = (esGesto: boolean): boolean => {
      if (bloqueado) return true;
      const ahora = Date.now();
      if (vencido(sesionRef.current, ahora)) {
        bloqueado = true;
        setEstaBloqueado(true);
        return true;
      }
      if (esGesto) presencia = ahora;
      return false;
    };
    /**
     * ⚠️ En CAPTURA, y cortando el gesto si toca bloquear.
     *
     * React escucha en la raíz, que está por debajo de `window`: en burbuja,
     * el Enter de quien vuelve a los 20 minutos llegaba primero a la caja de
     * texto, la pregunta salía, y el bloqueo se enteraba después. Así el gesto
     * que descubre el bloqueo no llega a hacer nada más.
     */
    const gesto = (e: Event) => {
      if (revisar(true)) e.stopPropagation();
    };
    const mirar = () => void revisar(false);
    // Con la pestaña en segundo plano o la tapa cerrada los relojes se paran:
    // al volver se mira antes de que nadie alcance a leer nada.
    const alVolver = () => {
      if (document.visibilityState === 'visible') mirar();
    };

    for (const e of GESTOS) window.addEventListener(e, gesto, { capture: true, passive: true });
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', mirar);
    window.addEventListener('pageshow', mirar);
    // Cada segundo: al abrir la tapa no siempre hay `visibilitychange`, y lo que
    // quedó en pantalla no puede seguir ahí más que un instante.
    const reloj = setInterval(mirar, 1000);

    return () => {
      for (const e of GESTOS) window.removeEventListener(e, gesto, { capture: true });
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', mirar);
      window.removeEventListener('pageshow', mirar);
      clearInterval(reloj);
    };
  }, [estaBloqueado]);

  /** La persona acaba de demostrar que es ella. */
  const desbloquear = useCallback(() => {
    bloqueado = false;
    presencia = Date.now();
    setEstaBloqueado(false);
  }, []);

  return { bloqueado: estaBloqueado, desbloquear };
}
