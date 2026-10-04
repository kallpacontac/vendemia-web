'use client';

/**
 * «Primeros pasos»: lo que el dueño tiene que hacer, en orden, en palabras
 * suyas. Cada paso sabe solo si está hecho (lo lee de la base) y lleva con un
 * botón al sitio exacto donde se hace. Desaparece cuando lo obligatorio está.
 */
import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ChevronDown, ChevronUp, Circle } from 'lucide-react';

export interface Paso {
  titulo: string;
  que: string;
  hecho: boolean;
  opcional?: boolean;
  href: string;
  boton: string;
}

export default function PrimerosPasos({ pasos }: { pasos: Paso[] }) {
  const obligatorios = pasos.filter((p) => !p.opcional);
  const listo = obligatorios.every((p) => p.hecho);
  const hechos = pasos.filter((p) => p.hecho).length;
  const [abierto, setAbierto] = useState(!listo);
  const siguiente = pasos.find((p) => !p.hecho);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <button type="button" className="fz-pasos-cab" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto}>
        <span>
          <b style={{ fontSize: 16 }}>{listo ? '¡Tu Fideliza está listo!' : 'Primeros pasos'}</b>
          <span className="fz-def" style={{ display: 'block', marginTop: 2 }}>
            {hechos} de {pasos.length} hechos
            {!listo && siguiente ? ` · siguiente: ${siguiente.titulo}` : ''}
          </span>
        </span>
        {abierto ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      <div className="fz-progreso" aria-hidden="true">
        <i style={{ width: `${(hechos / pasos.length) * 100}%` }} />
      </div>

      {abierto && (
        <ol className="fz-pasos-lista">
          {pasos.map((p, i) => (
            <li key={p.titulo} className={p.hecho ? 'hecho' : p === siguiente ? 'siguiente' : ''}>
              <span className="fz-pasos-ico">{p.hecho ? <CheckCircle2 size={22} /> : <Circle size={22} />}</span>
              <span style={{ flex: 1 }}>
                <b>
                  {i + 1}. {p.titulo}
                  {p.opcional && <span className="badge-pill b-mute" style={{ marginLeft: 8 }}>Opcional</span>}
                </b>
                <span className="fz-def" style={{ display: 'block', marginTop: 2 }}>{p.que}</span>
              </span>
              <Link className={`btn btn-sm ${p.hecho ? 'btn-ghost' : p === siguiente ? 'btn-primary' : 'btn-ghost'}`} href={p.href}>
                {p.hecho ? 'Cambiar' : p.boton}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
