'use client';

/**
 * Que el teclado de la tablet no tape lo que se está escribiendo (18-nov-2026, The 24/7: «en
 * tablet debe aparecer las teclas y debe mostrar la caja de texto»).
 *
 * Al tocar una caja de texto, y cada vez que el teclado cambia el alto visible (visualViewport),
 * si la caja quedó debajo del teclado o pegada arriba, se desliza su contenedor (la página o la
 * ventana con scroll propio, como Nueva cita) hasta dejarla en el centro de lo que se ve.
 * En la computadora no hace nada: no hay teclado que tape.
 */
import { useEffect } from 'react';

const ESCRIBIBLE = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]), textarea';

function aLaVista(el: HTMLElement) {
  const vv = window.visualViewport;
  if (!vv) return;
  const r = el.getBoundingClientRect();
  const arriba = vv.offsetTop + 64;
  const abajo = vv.offsetTop + vv.height - 16;
  if (r.top >= arriba && r.bottom <= abajo) return;
  const delta = r.top + r.height / 2 - (vv.offsetTop + vv.height / 2);
  let p = el.parentElement;
  while (p && !(/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight)) p = p.parentElement;
  const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  (p ?? window).scrollBy({ top: delta, behavior: quieto ? 'auto' : 'smooth' });
}

export default function TecladoVisible() {
  useEffect(() => {
    // Solo con pantalla táctil (tablet o celular): ahí sale el teclado.
    if (!window.matchMedia?.('(pointer: coarse)').matches) return;
    let t = 0;
    const revisar = (espera: number) => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        const el = document.activeElement;
        if (el instanceof HTMLElement && el.matches(ESCRIBIBLE)) aLaVista(el);
      }, espera);
    };
    // El teclado tarda en subir: se mira cuando termina (cambia el alto visible) y, por si el
    // navegador no avisa, un momento después del toque.
    const alFoco = () => revisar(350);
    const alCambiarAlto = () => revisar(80);
    document.addEventListener('focusin', alFoco);
    window.visualViewport?.addEventListener('resize', alCambiarAlto);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('focusin', alFoco);
      window.visualViewport?.removeEventListener('resize', alCambiarAlto);
    };
  }, []);
  return null;
}
