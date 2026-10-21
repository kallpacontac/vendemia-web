'use client';

/**
 * Fotos, vídeos y audios debajo del saludo y la nota de cierre (Ajustes).
 *
 * El bot los manda solo, detrás del texto y en este orden: el saludo con la
 * primera respuesta de cada conversación, el cierre al cerrar una venta nueva.
 * Mia NO ve lo que hay dentro, solo que se manda.
 *
 * Como el clip del chat, cada fichero se sube AL ELEGIRLO, directo a Cloudinary
 * (`notas/<company>`), y a la lista solo entra la URL. Mientras alguno sube,
 * `alSubir(true)`: la página no deja guardar a medias.
 *
 * Las reglas son las del bot y la 0006 (modules/datos/sql): como mucho 3, solo
 * res.cloudinary.com, solo image/video/audio, sin repetir. Aquí se cortan antes
 * para que el dueño no se entere al guardar.
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Paperclip, X } from 'lucide-react';
import { useAvisar } from './Avisos';
import { problemaDeArchivo, subirAdjunto, tipoDeArchivo } from '@/lib/panel/adjuntos';

export type TipoAdjuntoNota = 'image' | 'video' | 'audio';

/** Tal cual se guarda en `companies.welcome_media` / `closing_media`. */
export interface AdjuntoNota {
  url: string;
  type: TipoAdjuntoNota;
  name: string;
}

export const MAX_ADJUNTOS_NOTA = 3;

const TIPOS: TipoAdjuntoNota[] = ['image', 'video', 'audio'];

/** Lo que haya en la columna. Lo que no se entiende se queda fuera en vez de romper la pantalla. */
export function leerAdjuntosNota(texto: string | null | undefined): AdjuntoNota[] {
  if (!texto) return [];
  try {
    const lista: unknown = JSON.parse(texto);
    if (!Array.isArray(lista)) return [];
    return lista
      .filter((a) => a && typeof a.url === 'string' && TIPOS.includes(a.type))
      .map((a) => ({ url: a.url, type: a.type, name: typeof a.name === 'string' ? a.name : '' }));
  } catch {
    return [];
  }
}

/**
 * El texto que viaja. DETERMINISTA —mismas claves, mismo orden— por lo mismo
 * que las preguntas: el patch de Ajustes compara cadenas.
 */
export function adjuntosNotaATexto(lista: AdjuntoNota[]): string {
  return JSON.stringify(lista.map(({ url, type, name }) => ({ url, type, name })));
}

interface Subida {
  id: number;
  nombre: string;
}

export default function AdjuntosNota({
  companyId,
  lista,
  alCambiar,
  alSubir,
  cuando,
  asistente = 'Mia',
}: {
  companyId: string | null;
  lista: AdjuntoNota[];
  /** Con función: una subida que termina tarde tiene que añadirse a la lista de AHORA. */
  alCambiar: (f: (l: AdjuntoNota[]) => AdjuntoNota[]) => void;
  alSubir: (subiendo: boolean) => void;
  /** La línea de ayuda: cuándo sale. */
  cuando: string;
  /** El nombre del asistente de ESTE negocio («Mia», «Luchito»…). */
  asistente?: string;
}) {
  const avisar = useAvisar();
  const entrada = useRef<HTMLInputElement>(null);
  const siguiente = useRef(0);
  const [subidas, setSubidas] = useState<Subida[]>([]);

  const ocupados = lista.length + subidas.length;
  const lleno = ocupados >= MAX_ADJUNTOS_NOTA;

  useEffect(() => {
    alSubir(subidas.length > 0);
  }, [subidas.length, alSubir]);

  async function subir(file: File) {
    if (!companyId) return;
    const id = ++siguiente.current;
    setSubidas((s) => [...s, { id, nombre: file.name }]);
    try {
      const subido = await subirAdjunto(file, companyId, 'notas');
      alCambiar((l) =>
        l.length >= MAX_ADJUNTOS_NOTA ? l : [...l, { url: subido.url, type: subido.tipo as TipoAdjuntoNota, name: subido.nombre }],
      );
    } catch (e) {
      avisar(e instanceof Error ? e.message : `No se pudo subir ${file.name}`, 'error');
    } finally {
      setSubidas((s) => s.filter((x) => x.id !== id));
    }
  }

  function elegir(files: File[]) {
    const libres = MAX_ADJUNTOS_NOTA - ocupados;
    if (files.length > libres) {
      avisar(`Caben ${MAX_ADJUNTOS_NOTA} adjuntos por nota: se suben solo ${libres === 1 ? 'el primero' : `los ${libres} primeros`}.`, 'error');
    }
    for (const f of files.slice(0, Math.max(libres, 0))) {
      if (tipoDeArchivo(f) === 'document') {
        avisar(`«${f.name}» no es una foto, un vídeo ni un audio.`, 'error');
        continue;
      }
      const problema = problemaDeArchivo(f);
      if (problema) {
        avisar(problema, 'error');
        continue;
      }
      void subir(f);
    }
  }

  function mover(i: number, d: -1 | 1) {
    alCambiar((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const n = [...l];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  }

  return (
    <div className="nota-adj">
      {(lista.length > 0 || subidas.length > 0) && (
        <ol className="nota-adj__lista">
          {lista.map((a, i) => (
            <li key={a.url} className={`nota-adj__item nota-adj__item--${a.type}`}>
              <span className="nota-adj__orden">{i + 1}</span>
              {a.type === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt={a.name} />
              ) : a.type === 'video' ? (
                <video src={a.url} controls preload="metadata" />
              ) : (
                <audio src={a.url} controls preload="metadata" />
              )}
              <div className="nota-adj__pie">
                <span title={a.name}>{a.name || 'Sin nombre'}</span>
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Que salga antes">
                  <ChevronLeft size={15} />
                </button>
                <button type="button" onClick={() => mover(i, 1)} disabled={i === lista.length - 1} aria-label="Que salga después">
                  <ChevronRight size={15} />
                </button>
                <button type="button" onClick={() => alCambiar((l) => l.filter((x) => x.url !== a.url))} aria-label={`Quitar ${a.name}`}>
                  <X size={15} />
                </button>
              </div>
            </li>
          ))}
          {subidas.map((s) => (
            <li key={`s${s.id}`} className="nota-adj__item nota-adj__item--subiendo">
              <div className="spin spin--sm" />
              <div className="nota-adj__pie">
                <span title={s.nombre}>Subiendo {s.nombre}…</span>
              </div>
            </li>
          ))}
        </ol>
      )}

      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={lleno || !companyId}
        onClick={() => entrada.current?.click()}
      >
        <Paperclip size={15} /> Adjuntar foto, vídeo o audio
      </button>
      {lleno && <small className="muted"> Ya hay {MAX_ADJUNTOS_NOTA}, el máximo.</small>}
      <input
        ref={entrada}
        type="file"
        hidden
        multiple
        accept="image/*,video/*,audio/*"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          // Se vacía para que elegir el MISMO fichero dos veces vuelva a disparar onChange.
          e.target.value = '';
          if (files.length) elegir(files);
        }}
      />
      <small className="nota-adj__ayuda">{cuando}</small>
      {lista.length > 0 && (
        <small className="nota-adj__ayuda nota-adj__ayuda--aviso">
          {asistente} no ve lo que hay dentro del adjunto. Si la nota lo menciona («te dejo un vídeo de cómo llegar»),
          que el texto se entienda solo.
        </small>
      )}
    </div>
  );
}
