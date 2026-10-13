/**
 * El texto de una respuesta de Mia.
 *
 * ⚠️ NUNCA `dangerouslySetInnerHTML` aquí. La respuesta puede citar mensajes de
 * clientes, y un cliente puede escribir lo que quiera. Cada trozo se pinta como
 * texto de React, que lo escapa; ver `trocear` en lib/panel/asistente.ts.
 */
import { Fragment } from 'react';
import { MessageCircle } from 'lucide-react';
import { trocear } from '@/lib/panel/asistente';

export default function TextoMia({ texto }: { texto: string }) {
  const lineas = texto.split(/\r?\n/);
  return (
    <p className="asis-texto">
      {lineas.map((linea, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {trocear(linea).map((t, j) =>
            t.tipo === 'whatsapp' ? (
              // Abre el chat con el mensaje ya redactado. El número va A LA VISTA:
              // ver `Trozo` en lib/panel/asistente.ts.
              <a key={j} className="asis-wa" href={t.url} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={14} /> {t.numero ? 'Escribirle por WhatsApp' : 'Enviar por WhatsApp'}
                {t.numero && <small>{t.numero}</small>}
              </a>
            ) : t.negrita ? (
              <b key={j}>{t.texto}</b>
            ) : (
              <Fragment key={j}>{t.texto}</Fragment>
            ),
          )}
        </Fragment>
      ))}
    </p>
  );
}
