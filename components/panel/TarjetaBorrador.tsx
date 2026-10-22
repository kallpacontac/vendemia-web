'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * TARJETA DE BORRADOR · el mensaje de Mia que espera aprobación
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Va al final del chat del cliente, como el siguiente mensaje que todavía no
 * salió: alineada a la derecha como los del negocio y con borde punteado para
 * que nadie la confunda con algo ya enviado. Así quien aprueba lo lee con la
 * conversación entera encima (decisión de Alvaro, 21-oct-2026).
 *
 * «Corregir» edita aquí mismo y no en la caja de escribir de abajo: esa caja
 * está bloqueada mientras Mia atiende al cliente, y aprobar un borrador NO
 * pausa a Mia (si el cliente contesta, sigue ella con el encargo).
 *
 * Nada se pinta como enviado antes de tiempo: tras aprobar queda «saliendo» y
 * la tarjeta desaparece cuando el bot lo marca enviado; los mensajes de verdad
 * llegan al chat por el espejo, como cualquier otro.
 */
import { useEffect, useState } from 'react';
import { Check, ChevronDown, FileText, Film, Mic, Pencil, Sparkles, X } from 'lucide-react';
import { useAvisar } from './Avisos';
import {
  aprobarBorrador,
  conFirmaGuardable,
  conFirmaVisible,
  cuandoSale,
  descartarBorrador,
  lineaDelEncargo,
  type Borrador,
} from '@/lib/panel/borradores';

/** Por encima de esto el texto sale plegado, con «ver todo». */
const LARGO_PLEGADO = 180;

export function TarjetaBorrador({
  borrador: b,
  yo,
  alCambiar,
}: {
  borrador: Borrador;
  /** El usuario de la sesión, para decir «lo pediste tú». */
  yo: string | null;
  /** Tras aprobar o descartar: releer los borradores. */
  alCambiar: () => void;
}) {
  const avisar = useAvisar();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(() => conFirmaVisible(b.texto));
  const [abierto, setAbierto] = useState(false);
  const [verGuion, setVerGuion] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  // Otro borrador para el mismo cliente (Mia lo rehízo): se empieza de cero.
  useEffect(() => {
    setEditando(false);
    setTexto(conFirmaVisible(b.texto));
    setAbierto(false);
  }, [b.id, b.texto]);

  const quien =
    b.creado_por === null ? 'Lo propuso Mia' : b.creado_por === yo ? 'Lo pediste tú' : 'Lo pidió alguien del equipo';

  async function aprobar() {
    if (ocupado) return;
    setOcupado(true);
    try {
      const corregido = editando ? conFirmaGuardable(texto.trim()) : null;
      if (editando && !corregido) {
        avisar('El mensaje no puede ir vacío.', 'error');
        return;
      }
      const r = await aprobarBorrador(b.id, corregido && corregido !== b.texto ? corregido : null);
      avisar(
        r.programado_para
          ? `Aprobado. De noche no se escribe a clientes: sale ${cuandoSale(r.programado_para)}.`
          : 'Aprobado. Mia lo envía en unos segundos.',
        'ok',
      );
      setEditando(false);
      alCambiar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo aprobar.', 'error');
    } finally {
      setOcupado(false);
    }
  }

  async function descartar() {
    if (ocupado) return;
    setOcupado(true);
    try {
      await descartarBorrador(b.id);
      alCambiar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo descartar.', 'error');
    } finally {
      setOcupado(false);
    }
  }

  // ── Ya aprobado: saliendo, o programado para la mañana ──
  if (b.estado === 'aprobado') {
    return (
      <div className="borrador borrador--hecho" role="status">
        <div className="borrador__cab">
          <Check size={14} /> Aprobado ·{' '}
          {b.programado_para && new Date(b.programado_para).getTime() > Date.now()
            ? `sale ${cuandoSale(b.programado_para)}`
            : 'Mia lo está enviando…'}
        </div>
        <p className="borrador__texto borrador__texto--plegado">{b.texto_final ?? b.texto}</p>
      </div>
    );
  }

  // ── No salió: se cuenta por qué ──
  if (b.estado === 'rechazado') {
    return (
      <div className="borrador borrador--mal" role="status">
        <div className="borrador__cab">
          <X size={14} /> No salió
        </div>
        <p className="borrador__motivo">{b.motivo || 'Mia no pudo enviarlo.'}</p>
        <div className="borrador__acciones">
          <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => void descartar()}>
            Quitar
          </button>
        </div>
      </div>
    );
  }

  // ── Por aprobar ──
  const largo = texto.length > LARGO_PLEGADO;
  return (
    <div className="borrador" aria-label="Mensaje de Mia por aprobar">
      <div className="borrador__cab">
        <Sparkles size={14} /> Mia · por aprobar <span className="borrador__quien">· {quien}</span>
        <button
          type="button"
          className="borrador__descartar"
          disabled={ocupado}
          title="Descartar: no sale nada"
          aria-label="Descartar este mensaje"
          onClick={() => void descartar()}
        >
          <X size={15} />
        </button>
      </div>

      {editando ? (
        <textarea
          className="input borrador__editor"
          value={texto}
          rows={Math.min(10, Math.max(4, Math.ceil(texto.length / 48)))}
          maxLength={1500}
          autoFocus
          onChange={(e) => setTexto(e.target.value)}
        />
      ) : (
        <>
          <p className={`borrador__texto ${largo && !abierto ? 'borrador__texto--plegado' : ''}`}>{texto}</p>
          {largo && !abierto && (
            <button type="button" className="borrador__ver" onClick={() => setAbierto(true)}>
              ver todo <ChevronDown size={13} />
            </button>
          )}
        </>
      )}
      {texto.includes('[tu nombre]') && (
        <small className="borrador__nota">«[tu nombre]» se cambia por el tuyo al aprobar.</small>
      )}

      {(b.adjunto || b.audio) && (
        <div className="borrador__extras">
          {b.adjunto && <Adjunto a={b.adjunto} />}
          {b.audio &&
            (b.audio.url ? (
              <audio className="msg__audio" src={b.audio.url} controls preload="metadata" />
            ) : (
              <button type="button" className="borrador__chip" onClick={() => setVerGuion((v) => !v)}>
                <Mic size={13} /> Guion de audio · {b.audio.segundos} s
              </button>
            ))}
        </div>
      )}
      {b.audio && !b.audio.url && verGuion && (
        <p className="borrador__guion">
          «{b.audio.guion}»
          <small>Todavía no se puede grabar desde aquí: si lo apruebas, sale sin audio.</small>
        </p>
      )}

      {b.encargo && <p className="borrador__encargo">{lineaDelEncargo(b.encargo)}</p>}

      <div className="borrador__acciones">
        <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => void aprobar()}>
          <Check size={14} /> {ocupado ? 'Aprobando…' : 'Aprobar y enviar'}
        </button>
        {editando ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={ocupado}
            onClick={() => {
              setEditando(false);
              setTexto(conFirmaVisible(b.texto));
            }}
          >
            Deshacer cambios
          </button>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => setEditando(true)}>
            <Pencil size={13} /> Corregir
          </button>
        )}
      </div>
    </div>
  );
}

function Adjunto({ a }: { a: NonNullable<Borrador['adjunto']> }) {
  if (a.type === 'image') {
    return (
      <a href={a.url} target="_blank" rel="noreferrer" className="borrador__foto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a.url} alt={a.name || 'Imagen'} loading="lazy" />
      </a>
    );
  }
  return (
    <a href={a.url} target="_blank" rel="noreferrer" className="borrador__chip">
      {a.type === 'video' ? <Film size={13} /> : <FileText size={13} />} {a.name || (a.type === 'video' ? 'Video' : 'Documento')}
    </a>
  );
}
