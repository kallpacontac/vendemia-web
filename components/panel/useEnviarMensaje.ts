'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ENVIAR UN MENSAJE AL CLIENTE · sin mandarlo dos veces
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Un mensaje repetido no se deshace: le llega al cliente dos veces y queda
 * raro. Y había tres formas de que pasara:
 *
 *  1. DOBLE CLIC o Enter mantenido. El botón se desactiva con un estado de
 *     React, que llega un render tarde. Aquí se cierra con un ref, que es
 *     síncrono: el segundo clic encuentra la puerta cerrada.
 *
 *  2. EL BOT TARDA. Pasados 15 s `useComando` dice «Guardado, se está
 *     aplicando» y devuelve `undefined`, igual que un error. El texto se queda
 *     en la caja, y lo natural es darle otra vez a Enviar: eso encola un
 *     SEGUNDO comando, y cuando el bot despierta manda los dos.
 *
 *  3. EL BOT REINTENTA. Si el envío salió pero algo falló después, el comando
 *     queda en error y la cola lo reintenta: el mismo mensaje, otra vez.
 *
 * Contra 2 y 3 viaja `client_msg_id`: la MISMA clave mientras el mensaje sea el
 * mismo (destino, texto y adjunto), una nueva en cuanto cambia algo o cuando el
 * envío se confirma. El bot no manda dos veces un `client_msg_id` que ya mandó
 * (ver docs/prompt-bot-adjuntos-y-duplicados.md). Sin esa parte del bot, la
 * clave no hace nada — pero tampoco rompe nada.
 */
import { useCallback, useRef, useState } from 'react';
import { useAvisar, useComando } from './Avisos';
import type { Adjunto } from '@/lib/panel/adjuntos';

export type Destino = { lead_id: string } | { phone: string };

export interface ResultadoSendMessage {
  phone: string;
  lead_id?: string;
  /** El bot lo pone a true cuando mandó el adjunto. Sin él, solo salió el texto. */
  media?: boolean;
  /** true si ese `client_msg_id` ya se había enviado y esta vez no se mandó nada. */
  repetido?: boolean;
}

const nuevaClave = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function useEnviarMensaje() {
  const comando = useComando();
  const avisar = useAvisar();
  const enVuelo = useRef(false);
  const clave = useRef<{ huella: string; id: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = useCallback(
    async (
      destino: Destino,
      texto: string,
      adjunto: Adjunto | null,
      exito?: string,
    ): Promise<ResultadoSendMessage | undefined> => {
      if (enVuelo.current) return undefined;
      const huella = JSON.stringify([destino, texto, adjunto?.url ?? '']);
      if (clave.current?.huella !== huella) clave.current = { huella, id: nuevaClave() };

      enVuelo.current = true;
      setEnviando(true);
      try {
        const r = await comando<ResultadoSendMessage>(
          'send_message',
          {
            ...destino,
            text: texto,
            client_msg_id: clave.current.id,
            ...(adjunto
              ? { media_url: adjunto.url, media_type: adjunto.tipo, media_name: adjunto.nombre }
              : {}),
          },
          exito,
        );
        if (r) {
          clave.current = null;
          // Un bot que aún no sabe de adjuntos manda el texto y se olvida del
          // fichero sin decir nada. Se dice aquí, que es donde se puede ver.
          if (adjunto && !r.media && !r.repetido) {
            avisar(
              texto
                ? 'El texto salió, pero el archivo no: el bot todavía no envía adjuntos.'
                : 'El archivo no salió: el bot todavía no envía adjuntos.',
              'error',
            );
          }
        }
        return r;
      } finally {
        enVuelo.current = false;
        setEnviando(false);
      }
    },
    [comando, avisar],
  );

  return { enviar, enviando };
}
