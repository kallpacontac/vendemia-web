'use client';

/**
 * "El bot no está en línea".
 *
 * El bot vive en un portátil y puede estar apagado; eso es normal y el panel
 * sigue leyendo, porque la réplica está ahí. El problema es otro: sin avisar,
 * enseña las cifras de ayer con la misma cara con la que enseñaría las de
 * ahora, y alguien decide algo con ellas.
 *
 * Solo aparece cuando hay una respuesta que dice que algo va mal. Si la
 * compañía todavía no tiene instancia registrada —consulta sin fila— no se
 * enseña nada: eso es desconocido, no caído, y una alarma permanente se acaba
 * ignorando justo el día que importa.
 */
import { AlertTriangle } from 'lucide-react';
import { botOperativo, useSalud } from './Salud';

export default function AvisoBot() {
  const { salud, cargando, desconocido } = useSalud();

  if (cargando || desconocido || !salud || botOperativo(salud)) return null;

  return (
    <div className="desfase desfase--flotante">
      <AlertTriangle size={16} />
      <span>
        {/* El texto lo redacta la vista: dice qué pasa Y qué hacer. */}
        {salud.diagnostico ?? 'El bot no está en línea. Lo que ves es la última foto que subió.'}
      </span>
    </div>
  );
}
