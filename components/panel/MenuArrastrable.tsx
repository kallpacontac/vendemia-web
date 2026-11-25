'use client';

/**
 * La lista del «Orden del menú» que se arrastra (Ajustes › Orden del menú, 25-nov-2026).
 *
 * Solo ordena: no sabe de sesiones ni de guardar. Recibe las dos zonas, avisa de cada cambio
 * (`alCambiar`, en vivo mientras se arrastra) y de cuándo terminó uno (`alSoltar`: al soltar,
 * con el teclado o con el botón de la fila). Quien la usa —OrdenDelMenu— decide guardar ahí.
 *
 *  · Dedo o ratón, con Pointer Events y sin librerías. Con el dedo se agarra por el asa (⠿), para
 *    que deslizar sobre la lista siga desplazando la página; con ratón, por cualquier parte.
 *  · Teclado: foco en el asa y flechas arriba/abajo, cruzando entre «A la vista» y «Más».
 *  · Una sola <ol> con las cabeceras de zona dentro: una fila que cambia de zona no se desmonta,
 *    y el arrastre no se corta a medias en el teléfono.
 *  · Dashboard (primero) y Ajustes (último de «A la vista») van fijos y no se arrastran.
 */
import { useRef, useState } from 'react';
import { Eye, EyeOff, GripVertical, type LucideIcon } from 'lucide-react';
import { RUTA_AJUSTES, RUTA_INICIO } from '@/lib/panel/menu';
import './orden-del-menu.css';

/** Las dos zonas que se arrastran. Sin Dashboard ni Ajustes: van fijos. */
export interface Zonas {
  vista: string[];
  mas: string[];
}

export interface FilaMenu {
  nombre: string;
  Icono: LucideIcon;
}

const CABEZA_VISTA = '__vista__';
const SEPARADOR_MAS = '__mas__';
const HUECO_MAS = '__hueco_mas__';

export const igualZonas = (a: Zonas, b: Zonas) => a.vista.join() === b.vista.join() && a.mas.join() === b.mas.join();

/** `d` sacado de donde esté y puesto en `zona`, en la posición `i`. */
export function poner(z: Zonas, d: string, zona: keyof Zonas, i: number): Zonas {
  const sin = { vista: z.vista.filter((h) => h !== d), mas: z.mas.filter((h) => h !== d) };
  const lista = [...sin[zona]];
  lista.splice(Math.max(0, Math.min(i, lista.length)), 0, d);
  return { ...sin, [zona]: lista };
}

export default function MenuArrastrable({
  zonas,
  filas,
  alCambiar,
  alSoltar,
  alArrastrar,
}: {
  zonas: Zonas;
  /** Nombre e icono de cada dirección. Dashboard y Ajustes salen fijos si están aquí. */
  filas: Map<string, FilaMenu>;
  alCambiar: (z: Zonas) => void;
  alSoltar: () => void;
  alArrastrar?: (arrastrando: boolean) => void;
}) {
  const listaRef = useRef<HTMLOListElement>(null);
  const [arrastrada, setArrastrada] = useState<string | null>(null);
  // Lo último que se movió, sin esperar al re-render: el puntero va más rápido que React.
  const zonasRef = useRef(zonas);
  zonasRef.current = zonas;

  function cambiar(z: Zonas) {
    if (igualZonas(z, zonasRef.current)) return;
    zonasRef.current = z;
    alCambiar(z);
  }

  /** Dónde cae `d` con el puntero en (x, y). Recoloca en vivo: la fila va debajo del dedo. */
  function recolocar(d: string, x: number, y: number) {
    const z = zonasRef.current;
    const ol = listaRef.current;
    if (!ol) return;
    // Se mira siempre dentro de la columna: un dedo que se sale por el lado sigue arrastrando.
    const caja = ol.getBoundingClientRect();
    const xDentro = Math.min(Math.max(x, caja.left + 12), caja.right - 12);
    const el = document.elementFromPoint(xDentro, y)?.closest<HTMLElement>('[data-fila]');
    const fila = el && ol.contains(el) ? el.dataset.fila! : null;
    const r = el?.getBoundingClientRect();
    const arriba = r ? y < r.top + r.height / 2 : false;

    let nueva: Zonas | null = null;
    if (fila === null) {
      if (y < caja.top) nueva = poner(z, d, 'vista', 0);
      else if (y > caja.bottom) nueva = poner(z, d, 'mas', z.mas.length);
    } else if (fila === d) {
      return;
    } else if (fila === CABEZA_VISTA || fila === RUTA_INICIO) {
      nueva = poner(z, d, 'vista', 0);
    } else if (fila === RUTA_AJUSTES || fila === SEPARADOR_MAS) {
      nueva = arriba ? poner(z, d, 'vista', z.vista.length) : poner(z, d, 'mas', 0);
    } else if (fila === HUECO_MAS) {
      nueva = poner(z, d, 'mas', z.mas.length);
    } else {
      const zona: keyof Zonas = z.vista.includes(fila) ? 'vista' : 'mas';
      const i = z[zona].filter((h) => h !== d).indexOf(fila);
      nueva = poner(z, d, zona, arriba ? i : i + 1);
    }
    if (nueva) cambiar(nueva);
  }

  /** La caja que se desplaza (en el panel es `.main`, no la ventana). */
  function cajaQueDesplaza(): HTMLElement | null {
    let el = listaRef.current?.parentElement ?? null;
    while (el) {
      const o = getComputedStyle(el).overflowY;
      if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight) return el;
      el = el.parentElement;
    }
    return null;
  }

  function empezar(e: React.PointerEvent, d: string) {
    const objetivo = e.target as HTMLElement;
    const desdeAsa = objetivo.closest('.menu-orden__asa');
    // Con el dedo, solo desde el asa: deslizar sobre la lista tiene que seguir desplazando la página.
    if (e.pointerType !== 'mouse' && !desdeAsa) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // El botón «A la vista / A Más» se pulsa, no arrastra.
    if (!desdeAsa && objetivo.closest('button')) return;
    e.preventDefault();
    setArrastrada(d);
    alArrastrar?.(true);
    const caja = cajaQueDesplaza();
    let ultimoX = e.clientX;
    let ultimoY = e.clientY;
    let rueda: number | null = null;

    // Cerca del borde, la página sigue sola: con una lista larga en el teléfono, si no, no se llega.
    const desplazar = () => {
      const borde = caja ? caja.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      const paso = ultimoY < borde.top + 60 ? -10 : ultimoY > borde.bottom - 60 ? 10 : 0;
      if (paso) {
        if (caja) caja.scrollTop += paso;
        else window.scrollBy(0, paso);
        recolocar(d, ultimoX, ultimoY);
      }
      rueda = requestAnimationFrame(desplazar);
    };
    rueda = requestAnimationFrame(desplazar);

    const mover = (ev: PointerEvent) => {
      ultimoX = ev.clientX;
      ultimoY = ev.clientY;
      recolocar(d, ev.clientX, ev.clientY);
    };
    const soltar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
      if (rueda !== null) cancelAnimationFrame(rueda);
      setArrastrada(null);
      alArrastrar?.(false);
      alSoltar();
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
  }

  /** Teclado: flecha arriba/abajo con el foco en el asa. Cruza entre «A la vista» y «Más». */
  function conTeclado(e: React.KeyboardEvent, d: string) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const z = zonasRef.current;
    const seguida = [...z.vista, SEPARADOR_MAS, ...z.mas];
    const i = seguida.indexOf(d);
    const j = e.key === 'ArrowUp' ? i - 1 : i + 1;
    if (j < 0 || j >= seguida.length) return;
    [seguida[i], seguida[j]] = [seguida[j], seguida[i]];
    const corte = seguida.indexOf(SEPARADOR_MAS);
    cambiar({ vista: seguida.slice(0, corte), mas: seguida.slice(corte + 1) });
    alSoltar();
    // La fila se pinta en otro sitio: el foco la sigue.
    requestAnimationFrame(() =>
      listaRef.current?.querySelector<HTMLElement>(`[data-fila="${CSS.escape(d)}"] .menu-orden__asa`)?.focus(),
    );
  }

  function alternar(d: string) {
    const z = zonasRef.current;
    cambiar(z.mas.includes(d) ? poner(z, d, 'vista', z.vista.length) : poner(z, d, 'mas', 0));
    alSoltar();
  }

  function filaFija(href: string, nota: string) {
    const f = filas.get(href);
    if (!f) return null;
    return (
      <li key={href} data-fila={href} className="menu-orden__fila menu-orden__fila--fija">
        <span className="menu-orden__asa menu-orden__asa--fija" aria-hidden />
        <span className="menu-orden__ico"><f.Icono size={16} /></span>
        <span className="menu-orden__txt">
          {f.nombre}
          <small> · {nota}</small>
        </span>
      </li>
    );
  }

  function fila(href: string, enMas: boolean) {
    const f = filas.get(href);
    if (!f) return null;
    return (
      <li
        key={href}
        data-fila={href}
        className={`menu-orden__fila ${enMas ? 'menu-orden__fila--mas' : ''} ${arrastrada === href ? 'menu-orden__fila--arrastrada' : ''}`}
        onPointerDown={(e) => empezar(e, href)}
      >
        <button
          type="button"
          className="menu-orden__asa"
          aria-label={`Mover ${f.nombre}. Arrástralo, o usa las flechas arriba y abajo.`}
          onKeyDown={(e) => conTeclado(e, href)}
        >
          <GripVertical size={18} />
        </button>
        <span className="menu-orden__ico"><f.Icono size={16} /></span>
        <span className="menu-orden__txt">{f.nombre}</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm menu-orden__vis"
          aria-label={enMas ? `Poner ${f.nombre} a la vista` : `Mandar ${f.nombre} a «Más»`}
          title={enMas ? 'Poner a la vista' : 'Mandar a «Más»'}
          onClick={() => alternar(href)}
        >
          {enMas ? <Eye size={14} /> : <EyeOff size={14} />}
          <span className="menu-orden__vis-txt">{enMas ? 'A la vista' : 'A «Más»'}</span>
        </button>
      </li>
    );
  }

  return (
    <ol ref={listaRef} className={`menu-orden__lista ${arrastrada ? 'menu-orden__lista--arrastrando' : ''}`}>
      <li data-fila={CABEZA_VISTA} className="menu-orden__zona" aria-hidden>
        A la vista
      </li>
      {filaFija(RUTA_INICIO, 'siempre primero')}
      {zonas.vista.map((h) => fila(h, false))}
      {filaFija(RUTA_AJUSTES, 'siempre al final, antes de «Más»')}
      <li data-fila={SEPARADOR_MAS} className="menu-orden__zona menu-orden__zona--mas">
        En «Más»
      </li>
      {zonas.mas.map((h) => fila(h, true))}
      {zonas.mas.length === 0 && (
        <li data-fila={HUECO_MAS} className="menu-orden__hueco">
          Suelta aquí lo que casi no usas.
        </li>
      )}
    </ol>
  );
}
