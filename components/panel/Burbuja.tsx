'use client';

/**
 * Un mensaje del chat, con lo que traiga adjunto.
 *
 * Los adjuntos salen de `messages.media_url` / `media_type` / `media_name`, que
 * escribe el bot (ver docs/prompt-bot-adjuntos-y-duplicados.md). Mientras el
 * bot no los guarde, las columnas no existen o vienen vacías y esto pinta solo
 * el texto, como antes: no hay que tocar nada el día que lleguen.
 *
 * El texto de un mensaje con adjunto es el pie de foto. Si viene vacío, solo
 * se ve el adjunto.
 */
import { FileText } from 'lucide-react';
import type { Mensaje } from '@/lib/supabase/queries';

const ETIQUETA: Record<string, string> = { owner: '👤 Tú', assistant: '🤖 Mia' };

export function Burbuja({ m }: { m: Mensaje }) {
  const clase = m.role === 'user' ? 'user' : m.role === 'owner' ? 'agent' : 'bot';
  const url = m.media_url || null;

  return (
    <div className={`msg ${clase}`}>
      {ETIQUETA[m.role] && <span className="tag">{ETIQUETA[m.role]}</span>}
      {url && <Adjunto url={url} tipo={m.media_type ?? 'document'} nombre={m.media_name ?? ''} />}
      {m.content && <span className="msg__texto">{m.content}</span>}
    </div>
  );
}

function Adjunto({ url, tipo, nombre }: { url: string; tipo: string; nombre: string }) {
  if (tipo === 'image' || tipo === 'sticker') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="msg__media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={nombre || 'Imagen'} loading="lazy" />
      </a>
    );
  }
  if (tipo === 'video') {
    return <video className="msg__media" src={url} controls preload="metadata" />;
  }
  if (tipo === 'audio') {
    return <audio className="msg__audio" src={url} controls preload="metadata" />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="msg__doc">
      <FileText size={18} />
      <span>{nombre || 'Documento'}</span>
    </a>
  );
}
