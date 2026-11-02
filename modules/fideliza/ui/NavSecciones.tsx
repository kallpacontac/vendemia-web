'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Settings } from 'lucide-react';
import { paginaActiva, seccionActiva, type SeccionFideliza } from '@/modules/fideliza/ui/secciones';

/** Las secciones de Fideliza y, si la abierta tiene varias páginas, sus pestañas debajo. */
export default function NavSecciones({ secciones, ruta }: { secciones: SeccionFideliza[]; ruta: string }) {
  const abierta = secciones.find((s) => seccionActiva(s, ruta));
  const barra = useRef<HTMLElement>(null);

  // En el móvil no caben todas: que la abierta quede a la vista al entrar.
  useEffect(() => {
    const activa = barra.current?.querySelector('.active');
    if (!barra.current || !activa) return;
    const caja = barra.current.getBoundingClientRect();
    const a = activa.getBoundingClientRect();
    barra.current.scrollLeft += a.left - caja.left - (caja.width - a.width) / 2;
  }, [abierta?.label]);

  return (
    <>
      <nav ref={barra} className="fz-tabs" aria-label="Secciones de Fideliza">
        {secciones.map((s) => {
          const activa = s === abierta;
          return (
            <Link
              key={s.label}
              href={s.paginas[0].href}
              className={[activa ? 'active' : '', s.icono ? 'fz-tabs__icono' : ''].filter(Boolean).join(' ')}
              aria-current={activa ? 'page' : undefined}
              aria-label={s.icono ? s.label : undefined}
              title={s.icono ? s.label : undefined}
            >
              {s.icono ? <Settings size={16} aria-hidden="true" /> : s.label}
            </Link>
          );
        })}
      </nav>
      {abierta && abierta.paginas.length > 1 && (
        <nav className="fz-subtabs" aria-label={`Páginas de ${abierta.label}`}>
          {abierta.paginas.map((p) => (
            <Link key={p.href} href={p.href} className={paginaActiva(p.href, ruta) ? 'active' : ''} aria-current={paginaActiva(p.href, ruta) ? 'page' : undefined}>
              {p.label}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
