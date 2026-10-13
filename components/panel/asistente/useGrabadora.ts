'use client';

/**
 * El micrófono del asistente: pulsar para empezar, pulsar para parar.
 *
 * No es «mantener pulsado»: en el móvil ese gesto falla (el dedo se mueve, sale
 * el menú de selección, se suelta sin querer) y la pregunta se pierde.
 *
 * ── Lo que NO hace, a propósito ──────────────────────────────────────────
 *
 *   · No pide el permiso al cargar la página: lo pide la primera vez que se
 *     pulsa el botón. Un cuadro de «¿permitir el micrófono?» nada más entrar
 *     se deniega por reflejo, y ya no vuelve a salir.
 *   · No guarda ni sube el audio a ningún sitio: el Blob se le entrega a quien
 *     llama y sale del navegador solo dentro del comando.
 *
 * Si deniegan el permiso o no hay micrófono, `disponible` pasa a false y el
 * botón desaparece: queda el texto, sin ningún error en pantalla.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { BITS_POR_SEGUNDO, MAX_GRABACION_S } from '@/lib/panel/asistente';

type Estado = 'reposo' | 'pidiendo' | 'grabando';

export function useGrabadora(alTerminar: (audio: Blob, segundos: number) => void) {
  /** `null` hasta saberlo: en el servidor no hay `navigator`. */
  const [disponible, setDisponible] = useState<boolean | null>(null);
  const [estado, setEstado] = useState<Estado>('reposo');
  const [segundos, setSegundos] = useState(0);

  const grabadora = useRef<MediaRecorder | null>(null);
  const reloj = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Lo que hay que hacer cuando la grabadora pare: mandarlo o tirarlo. */
  const enviar = useRef(true);
  const vivo = useRef(true);
  const alTerminarRef = useRef(alTerminar);
  alTerminarRef.current = alTerminar;

  useEffect(() => {
    setDisponible(
      typeof MediaRecorder !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function',
    );
  }, []);

  const parar = useCallback((mandar: boolean) => {
    enviar.current = mandar;
    if (reloj.current) clearInterval(reloj.current);
    reloj.current = null;
    const g = grabadora.current;
    if (g && g.state !== 'inactive') g.stop();
  }, []);

  const empezar = useCallback(async () => {
    if (grabadora.current || !navigator.mediaDevices?.getUserMedia) return;
    setEstado('pidiendo');
    let flujo: MediaStream;
    try {
      flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Denegado, o no hay micrófono. Da igual cuál: no se puede hablar.
      if (vivo.current) {
        setDisponible(false);
        setEstado('reposo');
      }
      return;
    }
    const soltar = () => flujo.getTracks().forEach((t) => t.stop());
    // La página se cerró o se bloqueó mientras salía el cuadro del permiso.
    if (!vivo.current) return soltar();

    let g: MediaRecorder;
    try {
      g = new MediaRecorder(flujo, { audioBitsPerSecond: BITS_POR_SEGUNDO });
    } catch {
      soltar();
      setDisponible(false);
      setEstado('reposo');
      return;
    }

    const trozos: Blob[] = [];
    const inicio = Date.now();
    g.ondataavailable = (e) => {
      if (e.data.size) trozos.push(e.data);
    };
    g.onstop = () => {
      // Soltar el micrófono apaga el piloto rojo del navegador.
      soltar();
      grabadora.current = null;
      if (!vivo.current) return;
      setEstado('reposo');
      setSegundos(0);
      if (!enviar.current) return;
      const audio = new Blob(trozos, { type: g.mimeType || trozos[0]?.type || 'audio/webm' });
      alTerminarRef.current(audio, Math.min(MAX_GRABACION_S, (Date.now() - inicio) / 1000));
    };

    grabadora.current = g;
    enviar.current = true;
    g.start();
    setSegundos(0);
    setEstado('grabando');
    reloj.current = setInterval(() => {
      const van = (Date.now() - inicio) / 1000;
      setSegundos(van);
      // Al minuto se corta sola y SE ENVÍA: lo dicho no se pierde.
      if (van >= MAX_GRABACION_S) parar(true);
    }, 250);
  }, [parar]);

  // Al salir de la página —o al bloquearse, que la desmonta— se corta y se tira.
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      parar(false);
    };
  }, [parar]);

  return {
    disponible: disponible === true,
    estado,
    segundos,
    empezar,
    /** Para y envía. */
    terminar: useCallback(() => parar(true), [parar]),
    /** Para y tira lo grabado. */
    cancelar: useCallback(() => parar(false), [parar]),
  };
}
