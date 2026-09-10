'use client';

/**
 * La banda del modo demo y el botón que lo enciende.
 *
 * ⚠️ La banda NO es decoración y no se puede cerrar. Es la mitad de lo que hace
 * seguro el modo demo: la otra mitad es que no se escribe nada. Un panel lleno
 * de cifras inventadas sin nada que lo diga es una trampa esperando a que
 * alguien saque una captura y la mande a un cliente.
 *
 * Vive en el layout, así que sale en todas las pantallas — incluida cualquiera
 * que se añada mañana sin acordarse de esto.
 */
import { useEffect, useState } from 'react';
import { FlaskConical, X } from 'lucide-react';
import { alternarDemo, demoActivo } from '@/lib/panel/demo';

/**
 * `demoActivo()` lee localStorage, que en el servidor no existe. Leerlo durante
 * el render daría un HTML distinto al del cliente y React se quejaría de la
 * hidratación, así que se resuelve después de montar.
 */
function useDemo(): boolean | null {
  const [activo, setActivo] = useState<boolean | null>(null);
  useEffect(() => setActivo(demoActivo()), []);
  return activo;
}

/** La banda fija. Devuelve null mientras no se sabe, para no parpadear. */
export function BandaDemo() {
  const activo = useDemo();
  if (!activo) return null;

  return (
    <div className="demo-banda">
      <FlaskConical size={15} />
      <span>
        <b>Modo demo</b> — todo lo que ves está inventado. No se guarda nada y la base de datos no
        se toca.
      </span>
      <button type="button" onClick={alternarDemo}>
        <X size={13} /> Salir del modo demo
      </button>
    </div>
  );
}

/** El interruptor, para la barra superior. */
export function BotonDemo() {
  const activo = useDemo();
  if (activo === null) return null;

  return (
    <button
      type="button"
      className={`btn btn-sm ${activo ? 'btn-primary' : 'btn-ghost'}`}
      onClick={alternarDemo}
      title={
        activo
          ? 'Volver a los datos reales de tu negocio'
          : 'Llenar el panel con datos de ejemplo para enseñarlo. No toca la base de datos.'
      }
    >
      <FlaskConical size={14} /> {activo ? 'Salir de demo' : 'Modo demo'}
    </button>
  );
}
