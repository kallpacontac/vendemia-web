'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, FlaskConical, LogOut } from 'lucide-react';

/** Menú de cuenta compartido: el contenedor no depende de la sesión para poder probarlo. */
export default function CuentaPanel({ email, pie, demo, alDemo, alSalir }: {
  email: string; pie: string; demo: boolean; alDemo: () => void; alSalir: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!abierto) return;
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const fuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierto]);
  function cerrar() { setAbierto(false); boton.current?.focus(); }
  return (
    <div className="profile-wrap" ref={caja}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAbierto(false); }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); cerrar(); }
        if (!['ArrowDown','ArrowUp','Home','End'].includes(e.key)) return;
        e.preventDefault();
        if (!abierto) { setAbierto(true); return; }
        const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
        if (!items.length) return;
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        const n = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[n]?.focus();
      }}>
      <button type="button" className="profile" ref={boton} aria-label="Menú de usuario" title={email || 'Cuenta'}
        aria-haspopup="menu" aria-expanded={abierto} aria-controls={abierto ? id : undefined} onClick={() => setAbierto((v) => !v)}>
        <div className="avatar">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logos/logo-mia.webp" alt="" />
        </div>
        <div className="profile__text"><b>{email.split('@')[0] || 'Cuenta'}</b><small>{pie}</small></div>
        <ChevronDown size={15} className="profile__flecha" />
      </button>
      {abierto && <div className="menu-cuenta" role="menu" aria-label="Opciones de usuario" id={id} ref={menu}>
        <div className="menu-cuenta__quien"><b>{email || 'Cuenta'}</b><small>{pie}</small></div>
        <button type="button" role="menuitem" className="menu-cuenta__item" onClick={() => { cerrar(); alDemo(); }}>
          <FlaskConical size={16} /> {demo ? 'Salir del modo demo' : 'Modo demo'}
        </button>
        <button type="button" role="menuitem" className="menu-cuenta__salir" onClick={() => { cerrar(); alSalir(); }}>
          <LogOut size={16} /> Cerrar sesión
        </button>
      </div>}
    </div>
  );
}
