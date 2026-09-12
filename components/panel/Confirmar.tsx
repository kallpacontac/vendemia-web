'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * «¿SEGURO?» · el paso antes de tocar la cita de alguien
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Mover o cancelar una cita le cambia el día a una persona real, y con
 * `window.confirm` el navegador enseña un cuadro del sistema donde no cabe
 * decir QUÉ se va a cambiar: ni el nombre, ni el antes y el después. Aquí sí.
 *
 * Importa el doble desde que se puede arrastrar en la rejilla: soltar es un
 * gesto fácil de hacer sin querer, y sin este paso un resbalón movería la cita
 * de un cliente sin que nadie se enterase.
 *
 * Se cierra con Escape o pulsando fuera —igual que el menú de la cuenta—, y
 * NUNCA al confirmar por accidente: el botón de confirmar no recibe el foco de
 * entrada, así que un Enter suelto no dispara nada.
 */
import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function Confirmar({
  titulo,
  detalle,
  textoConfirmar = 'Confirmar',
  peligro = false,
  ocupado = false,
  alConfirmar,
  alCerrar,
}: {
  titulo: string;
  /** Qué va a pasar exactamente. Sale en el cuerpo, no en el botón. */
  detalle: React.ReactNode;
  textoConfirmar?: string;
  /** true pinta el botón en rojo: lo que se va a hacer no se deshace solo. */
  peligro?: boolean;
  ocupado?: boolean;
  alConfirmar: () => void;
  alCerrar: () => void;
}) {
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar();
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [alCerrar]);

  return (
    <div
      className="modal-fondo"
      role="presentation"
      // Solo si el clic empieza Y acaba en el fondo: arrastrar texto desde
      // dentro y soltar fuera no puede cerrar el cuadro.
      onClick={(e) => {
        if (e.target === e.currentTarget) alCerrar();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} ref={caja}>
        <div className="modal__cab">
          <AlertTriangle size={16} />
          <b>{titulo}</b>
        </div>
        <div className="modal__cuerpo">{detalle}</div>
        <div className="modal__pie">
          <button type="button" className="btn btn-ghost" onClick={alCerrar} disabled={ocupado}>
            Dejarlo
          </button>
          <button
            type="button"
            className={`btn ${peligro ? 'btn-peligro' : 'btn-primary'}`}
            onClick={alConfirmar}
            disabled={ocupado}
          >
            {ocupado ? 'Aplicando…' : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
