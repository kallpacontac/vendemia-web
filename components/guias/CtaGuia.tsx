'use client';

/**
 * El botón de WhatsApp de las guías, y lo único que viaja al navegador de
 * estas páginas.
 *
 * ⚠️ EXISTE SOLO PARA QUE `MarcoGuia` NO SEA UN COMPONENTE DE CLIENTE.
 *
 * `whatsappLink()` devuelve un `onClick` —cuenta la conversión y le pega la
 * atribución al mensaje—, y un manejador no se puede pasar desde un componente
 * de servidor: el build falla con "Event handlers cannot be passed to Client
 * Component props". La salida fácil era poner 'use client' arriba del marco
 * entero, y eso mandaría al navegador un artículo de dos mil palabras que no
 * tiene una sola línea de interactividad.
 *
 * Así el texto de la guía se queda en el servidor, que es justo lo que quieres
 * en la página a la que llega alguien desde Google con mala conexión.
 */
import { whatsappLink } from '@/lib/content';

export default function CtaGuia({
  label,
  className,
  style,
}: {
  label: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <a {...whatsappLink(label)} className={className} style={style}>
      {label}
    </a>
  );
}
