'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, ListFilter, Scissors, UserRound } from 'lucide-react';

export type OpcionCombo = { value: string; label: string; detalle?: string };

type Props = {
  value: string;
  opciones: OpcionCombo[];
  alCambiar: (value: string) => void;
  etiqueta: string;
  className?: string;
  tipo?: 'negocio' | 'servicio' | 'persona' | 'filtro';
  tituloMenu?: string;
};

/** Selector visual del panel. Conserva foco y navegación con teclado sin depender del menú del sistema. */
export default function ComboPanel({ value, opciones, alCambiar, etiqueta, className = '', tipo = 'negocio', tituloMenu }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const busqueda = useRef({ texto: '', tiempo: 0 });
  const id = useId();
  const indiceElegido = Math.max(0, opciones.findIndex((o) => o.value === value));
  const elegida = opciones.find((o) => o.value === value);
  const Icono = tipo === 'servicio' ? Scissors : tipo === 'persona' ? UserRound : tipo === 'filtro' ? ListFilter : Building2;

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierto]);

  function abrir() { setActivo(indiceElegido); setAbierto(true); }
  function elegir(indice: number) {
    const opcion = opciones[indice];
    if (!opcion) return;
    alCambiar(opcion.value);
    setAbierto(false);
    boton.current?.focus();
  }

  return <div className={`panel-combo ${className}`} ref={contenedor}
    onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAbierto(false); }}>
    <button type="button" ref={boton} className="panel-combo__button" role="combobox"
      aria-label={etiqueta} aria-haspopup="listbox" aria-expanded={abierto}
      aria-controls={abierto ? id : undefined} aria-activedescendant={abierto ? `${id}-${activo}` : undefined}
      onClick={() => abierto ? setAbierto(false) : abrir()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { if (abierto) { e.preventDefault(); setAbierto(false); } return; }
        if (e.key === 'Tab') { setAbierto(false); return; }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (abierto) elegir(activo); else abrir();
          return;
        }
        if (['ArrowDown','ArrowUp','Home','End'].includes(e.key)) {
          e.preventDefault();
          if (!abierto) { abrir(); return; }
          if (e.key === 'Home') setActivo(0);
          else if (e.key === 'End') setActivo(opciones.length - 1);
          else setActivo((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + opciones.length) % opciones.length);
          return;
        }
        if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const ahora = Date.now();
          busqueda.current.texto = ahora - busqueda.current.tiempo < 650 ? busqueda.current.texto + e.key.toLocaleLowerCase('es') : e.key.toLocaleLowerCase('es');
          busqueda.current.tiempo = ahora;
          const indice = opciones.findIndex((o) => o.label.toLocaleLowerCase('es').startsWith(busqueda.current.texto));
          if (indice >= 0) { if (!abierto) setAbierto(true); setActivo(indice); }
        }
      }}>
      <span className="panel-combo__icono"><Icono size={16} aria-hidden="true" /></span>
      <span className={`panel-combo__texto${elegida ? '' : ' panel-combo__texto--vacio'}`}>{elegida?.label ?? 'Seleccionar'}</span>
      <ChevronDown size={15} className={`panel-combo__flecha${abierto ? ' panel-combo__flecha--abierta' : ''}`} aria-hidden="true" />
    </button>
    {abierto && <div className="panel-combo__menu" role="listbox" id={id} aria-label={tituloMenu ?? etiqueta}>
      {tituloMenu && <div className="panel-combo__titulo" aria-hidden="true">{tituloMenu}</div>}
      {opciones.map((opcion, i) => <div key={opcion.value} id={`${id}-${i}`} role="option"
        aria-selected={opcion.value === value} className={`panel-combo__opcion${i === activo ? ' panel-combo__opcion--activa' : ''}${opcion.value === value ? ' panel-combo__opcion--elegida' : ''}`}
        onMouseEnter={() => setActivo(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(i)}>
        <span className="panel-combo__opcion-icono"><Icono size={15} aria-hidden="true" /></span>
        <span className="panel-combo__opcion-texto"><strong>{opcion.label}</strong>{opcion.detalle && <small>{opcion.detalle}</small>}</span>
        {opcion.value === value && <Check size={16} className="panel-combo__check" aria-hidden="true" />}
      </div>)}
    </div>}
  </div>;
}
