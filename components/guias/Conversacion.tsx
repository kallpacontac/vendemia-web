import { DEMO } from '@/lib/content';

/**
 * La conversación de ejemplo de una página de rubro.
 *
 * ⚠️ EL GUION SALE DE `DEMO`, EL MISMO QUE LA LANDING. NO SE ESCRIBE OTRO.
 *
 * Tener dos versiones de lo que Mia contesta sería tener dos versiones de lo
 * que Mia promete, y la que se quede vieja seguirá publicada. Además Google
 * compara lo que enseñas con lo que marcas: dos guiones distintos para el
 * mismo producto hacen que ninguno parezca real.
 *
 * Se pinta ESTÁTICA y sin animación, al revés que en la landing. Aquí el
 * lector viene de un resultado de búsqueda a comprobar algo concreto, y una
 * conversación que se escribe sola delante de él le obliga a esperar para leer
 * lo que ya está escrito.
 *
 * El `tono` es el neutral a propósito: los emojis del tono "cercano" quedan
 * bien en una demo interactiva y mal en un ejemplo que se lee como referencia.
 */
export default function Conversacion({
  negocioId,
  caso = 'precio',
}: {
  negocioId: 'barberia' | 'clinica' | 'ecommerce';
  /** Cuál de las tres situaciones se enseña. La objeción es la que más vende. */
  caso?: 'precio' | 'objecion' | 'disponibilidad';
}) {
  const negocio = DEMO.negocios.find((n) => n.id === negocioId);
  const tono = DEMO.tonos.find((t) => t.id === 'neutral');
  if (!negocio || !tono) return null;

  const guion = negocio[caso];
  const respuestaMia = [tono.apertura[caso], guion.hechos, tono.cierre[caso]]
    .filter(Boolean)
    .join('\n');

  return (
    <div
      className="mt-6 rounded-2xl border p-5"
      style={{ borderColor: 'var(--border-dark)', background: 'var(--surface-800)' }}
    >
      <p className="text-[13px] font-semibold" style={{ color: 'var(--text-low)' }}>
        {negocio.nombre}
      </p>

      <div className="mt-4 space-y-3">
        <Burbuja quien="cliente" texto={guion.cliente} />
        <Burbuja quien="mia" texto={respuestaMia} />
        <Burbuja quien="cliente" texto={guion.respuesta} />
      </div>

      <p className="mt-5 text-[12.5px] leading-[1.6]" style={{ color: 'var(--text-low)' }}>
        {DEMO.pie}
      </p>
    </div>
  );
}

function Burbuja({ quien, texto }: { quien: 'cliente' | 'mia'; texto: string }) {
  const esMia = quien === 'mia';
  return (
    <div className={esMia ? 'flex justify-start' : 'flex justify-end'}>
      <div
        className="max-w-[85%] rounded-2xl px-4 py-3 text-[14px] leading-[1.55]"
        style={
          esMia
            ? { background: 'var(--surface-700)', color: 'var(--text-hi)' }
            : { background: 'var(--orange-cta)', color: '#fff' }
        }
      >
        {/* Los saltos de línea del guion son parte del mensaje —las listas de
            horarios se leen en varias líneas—, así que se respetan en vez de
            colapsarse como haría el HTML por su cuenta. */}
        <span className="whitespace-pre-line">{texto}</span>
      </div>
    </div>
  );
}
