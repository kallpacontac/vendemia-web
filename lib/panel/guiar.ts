/**
 * Llevar la vista al siguiente paso de un formulario (18-nov-2026, The 24/7: «una animación que
 * scrollee automáticamente a donde tiene que llenar; guiemos al cliente por donde tiene que
 * llenar»). Desliza con suavidad hasta el paso y lo ilumina un momento (`.guia-pulso` en
 * app/panel.css). Con «reducir movimiento», salta sin animar y sin pulso.
 *
 * Espera un cuadro para que React haya pintado el paso (puede acabar de aparecer). Funciona
 * igual dentro de una ventana con su propio scroll (Nueva cita) que en la página (Caja).
 */
export function guiarA(el: HTMLElement | null | undefined, donde: ScrollLogicalPosition = 'start') {
  if (!el || typeof window === 'undefined') return;
  const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  requestAnimationFrame(() => {
    // Ya entero a la vista: no mover la pantalla bajo el dedo, solo señalarlo.
    // (Dentro de una ventana con scroll propio, cuenta lo que se ve de esa ventana.)
    const r = el.getBoundingClientRect();
    let arriba = 70;
    let abajo = window.innerHeight - 10;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) {
        const c = p.getBoundingClientRect();
        arriba = Math.max(c.top, 0);
        abajo = Math.min(c.bottom, window.innerHeight) - 10;
        break;
      }
    }
    const visible = r.top >= arriba && r.bottom <= abajo;
    if (!visible) el.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: donde });
    if (quieto) return;
    el.classList.remove('guia-pulso');
    void el.offsetWidth; // reinicia la animación si ya estaba
    el.classList.add('guia-pulso');
    window.setTimeout(() => el.classList.remove('guia-pulso'), 1400);
  });
}
