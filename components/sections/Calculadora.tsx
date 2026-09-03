'use client';

import type { CSSProperties } from 'react';
import { useState } from 'react';
import {
  BENEFIT,
  MODELO_PERDIDA,
  formatoSoles,
  perdidaMensual,
  ventasPerdidasMes,
} from '@/lib/content';

/**
 * LA CALCULADORA DE PÉRDIDA — ocupa el sitio de la ilustración fija.
 *
 * Es el único elemento de la página que no afirma nada: calcula. Todo lo demás
 * son datos nuestros que el lector tiene que creerse; esto son SUS números
 * puestos en una regla de tres que puede rehacer de cabeza. Por eso vive en la
 * sección 2, justo después del hero: responde a "¿me pasa a mí?" antes de que
 * la página haya pedido nada.
 *
 * ── TRES DECISIONES QUE PARECEN DE ESTILO Y NO LO SON ────────────────────
 *
 * 1 · EL ESTADO INICIAL ES DETERMINISTA (`MODELO_PERDIDA.*.def`), y por eso el
 *     servidor y el navegador pintan exactamente el mismo S/5,400. Sortear o
 *     "personalizar" el arranque daría un hydration mismatch en la cifra más
 *     visible de la sección. Es el mismo error que tenía el H1 del hero, del
 *     que ya nos hemos curado una vez.
 *
 * 2 · EL NÚMERO NO SE ANIMA AL ARRASTRAR. Un contador con easing va SIEMPRE
 *     por detrás del dedo, así que el usuario suelta el control y la cifra
 *     sigue moviéndose sola: se lee como que la página está calculando, o peor,
 *     como que la cifra la decide ella. La respuesta inmediata es lo que
 *     convierte el control en una relación de causa y efecto — muevo, cambia —
 *     y esa relación es todo el argumento del bloque.
 *
 * 3 · `tabular-nums` EN EL RESULTADO. Sin cifras de ancho fijo el número entero
 *     tiembla y se reajusta con cada píxel de arrastre, y ese temblor se lee
 *     como inestabilidad justo en el dato que tiene que parecer sólido.
 *
 * ⚠️ LOS CONTROLES MIDEN 44px DE ALTO DE ZONA TÁCTIL aunque la barra se vea de
 * 6px. Más del 60 % del tráfico es móvil y esto se maneja con el pulgar; un
 * control de 6px reales es un control que en un teléfono no se puede usar. El
 * relleno que da esa altura está en `.rango` (globals.css).
 */

type ControlProps = {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  /** Cómo se pinta el valor al lado de la etiqueta. */
  format: (v: number) => string;
};

function Control({ id, label, value, onChange, min, max, step, format }: ControlProps) {
  // El relleno de la barra se pinta con un gradiente calculado, no con un
  // pseudo-elemento: `::-webkit-slider-runnable-track` no se puede colorear por
  // tramos y `::-moz-range-progress` solo existe en Firefox. Un gradiente con
  // parada dura funciona igual en los dos y no necesita ni un div más.
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px]" style={{ color: 'var(--text-mid)' }}>
          {label}
        </label>
        <span
          className="text-[15px] font-semibold"
          style={{ color: 'var(--text-hi)', fontVariantNumeric: 'tabular-nums' }}
        >
          {format(value)}
        </span>
      </div>
      <input
        id={id}
        type="range"
        className="rango mt-1 w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        style={
          {
            // Se pasa como variable y no como `background` porque quien pinta
            // la barra es el pseudo-elemento del track, no el input: en WebKit
            // un `background` en el propio input queda DEBAJO del track y no se
            // ve. La variable si atraviesa hasta el pseudo-elemento.
            '--relleno': `linear-gradient(to right, var(--orange-cta) 0%, var(--orange-cta) ${pct}%, var(--border-dark) ${pct}%, var(--border-dark) 100%)`,
          } as CSSProperties
        }
      />
    </div>
  );
}

export default function Calculadora() {
  const [leads, setLeads] = useState<number>(MODELO_PERDIDA.leads.def);
  const [ticket, setTicket] = useState<number>(MODELO_PERDIDA.ticket.def);

  const c = BENEFIT.calculator;
  const soles = perdidaMensual(leads, ticket);
  const ventas = Math.round(ventasPerdidasMes(leads));

  return (
    <div
      // ⚠️ `overflow-hidden` NO es cosmetico: es la red de seguridad.
      // Esta tarjeta vive dentro de una seccion apilada, que es sticky y
      // recorta lo que se salga. Sin esto, en una pantalla baja el numero
      // grande se cortaba por la mitad y sangraba fuera del recuadro negro
      // sobre el fondo crema. Con esto, si algun dia el contenido vuelve a no
      // caber, al menos se recorta DENTRO de la tarjeta y se ve como un
      // recorte, no como un error de pintado.
      className="flex h-full flex-col justify-between gap-3 overflow-hidden rounded-card p-5"
      style={{ background: 'var(--surface-800)', border: '1px solid var(--border-dark)' }}
    >
      <span
        className="inline-flex h-[26px] w-fit items-center rounded-full border px-3 text-[12px]"
        style={{ borderColor: 'var(--border-dark)', color: 'var(--text-mid)' }}
      >
        {c.tag}
      </span>

      <div className="flex flex-col gap-4">
        <Control
          id="calc-leads"
          label={c.leadsLabel}
          value={leads}
          onChange={setLeads}
          min={MODELO_PERDIDA.leads.min}
          max={MODELO_PERDIDA.leads.max}
          step={MODELO_PERDIDA.leads.step}
          format={(v) => String(v)}
        />
        <Control
          id="calc-ticket"
          label={c.ticketLabel}
          value={ticket}
          onChange={setTicket}
          min={MODELO_PERDIDA.ticket.min}
          max={MODELO_PERDIDA.ticket.max}
          step={MODELO_PERDIDA.ticket.step}
          format={(v) => `S/${formatoSoles(v)}`}
        />
      </div>

      {/* EL RESULTADO.
          `aria-live="polite"` y no "assertive": el valor cambia en cada píxel
          de arrastre, y en assertive un lector de pantalla interrumpiría a
          gritos sesenta veces por segundo. En polite espera a que el usuario
          pare, que es cuando el número significa algo. */}
      <div aria-live="polite">
        <p className="text-[13px]" style={{ color: 'var(--text-mid)' }}>
          {c.resultLabel}
        </p>
        {/* ⚠️ EL "al mes" Y LAS VENTAS VAN EN LA MISMA LINEA QUE LA CIFRA.
            Estaban en tres lineas y la tarjeta necesitaba 434 px dentro de un
            hueco de 354: los 80 que sobraban se los comia el recorte de la
            seccion apilada y el numero salia partido por la mitad. Juntarlos
            no es solo ahorrar alto — el numero, su unidad y lo que significa
            se leen de una sola pasada en vez de tres. */}
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span
            className="text-[34px] font-semibold leading-none"
            style={{ color: 'var(--orange-cta)', fontVariantNumeric: 'tabular-nums' }}
          >
            S/{formatoSoles(soles)}
          </span>
          <span className="text-[13px]" style={{ color: 'var(--text-mid)' }}>
            {c.perMonth} · {ventas === 1 ? '1 venta' : `${formatoSoles(ventas)} ventas`}{' '}
            {c.salesLabel}
          </span>
        </p>
      </div>

      {/* Se queda con el `data-b="media-caption"` que ya tenía el pie de la
          ilustración: el timeline de Benefit.tsx lo busca por ese atributo y
          sin él la línea no llegaría a aparecer nunca. */}
      <p
        data-b="media-caption"
        data-reveal="up"
        className="text-[11px] leading-[1.45]"
        style={{ color: 'var(--text-mid)' }}
      >
        {c.assumption}
      </p>
    </div>
  );
}
