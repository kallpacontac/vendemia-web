'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA CONVERSACIÓN CON MIA · el chat del asistente
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── Texto y audio son COMPLEMENTARIOS ────────────────────────────────────
 *
 * No son la misma respuesta en dos formatos. El texto lleva los datos —cifras,
 * nombres, horas— y es la respuesta completa. El audio lleva la lectura: qué
 * destaca, qué significa, qué hacer hoy. Por eso:
 *
 *   · el texto siempre viene y el audio nunca lo sustituye;
 *   · lo que dice el audio (`hablado`) NO se pinta debajo como si fuera más
 *     respuesta: va plegado tras «ver lo que dice», para quien no puede oírlo.
 *
 * ── Todo vive en este componente, y muere con él ─────────────────────────
 *
 * La conversación es un `useState`; los audios, URLs `blob:` apuntadas en un
 * Set. Quien lo monta (la página) lo desmonta al bloquearse, al cambiar de
 * negocio o al salir, y la limpieza de abajo revoca cada audio. No hay nada
 * más que borrar porque no se guardó nada más. Ver lib/panel/asistente.ts.
 *
 * ── Una pregunta en vuelo a la vez ───────────────────────────────────────
 *
 * Mientras Mia no contesta con el TEXTO, no se puede mandar otra. El audio no
 * bloquea: llega después, sobre la misma burbuja, y mientras se puede seguir
 * preguntando.
 *
 * Si la base dice que hay otra pregunta abierta —la de antes del timeout, o una
 * hecha en otro negocio hace segundos—, esta espera sola a que se libere (menos
 * de un minuto) y sale. Mientras espera NO está en la cola, así que se puede
 * descartar sin dejar nada detrás.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Mic, Trash2, Volume2, X } from 'lucide-react';
import {
  ESPERA_EN_CURSO_MS,
  MAX_AUDIO_BYTES,
  MAX_GRABACION_S,
  MAX_PREGUNTA,
  REINTENTO_EN_CURSO_MS,
  aBase64,
  descargarAudio,
  duracion,
  esperarAudio,
  preguntar,
  sugerencias,
  type Pregunta,
} from '@/lib/panel/asistente';
import type { AudioAsistente } from '@/lib/supabase/commands';
import type { BusinessMode } from '@/lib/supabase/types';
import { demoActivo } from '@/lib/panel/demo';
import Reproductor from './Reproductor';
import TextoMia from './TextoMia';
import { useGrabadora } from './useGrabadora';

/** El audio de una burbuja de Mia, ya del lado de la pantalla. */
type Voz =
  | null
  | { estado: 'generando' }
  | { estado: 'listo'; src: string; hablado: string; sonarSolo: boolean }
  /** Llegó, pero no se pudo bajar: queda lo que dice, por escrito. */
  | { estado: 'sin_reproductor'; hablado: string };

type Burbuja =
  | {
      id: number;
      de: 'yo';
      texto: string | null;
      /** Si preguntó hablando: cuánto duró. */
      audioS: number | null;
      /** Lo que Mia entendió del audio. */
      transcripcion: string | null;
    }
  | { id: number; de: 'mia'; texto: string; voz: Voz; aviso: boolean };

let siguienteId = 1;

const AUDIO_GRANDE = 'Ese audio pesa demasiado para enviarlo. ¿Me lo repites más corto, o me lo escribes?';

export default function Conversacion({
  companyId,
  modo,
  esDueno,
  conVoz,
  alCambiarVoz,
  alNoDisponible,
  alSinPermiso,
  alSinSesion,
}: {
  companyId: string;
  modo: BusinessMode | null | undefined;
  esDueno: boolean;
  /** El interruptor «Responder también con voz». Lo guarda la página. */
  conVoz: boolean;
  alCambiarVoz: (v: boolean) => void;
  /** El bot dice que este negocio no tiene asistente. */
  alNoDisponible: () => void;
  /** El bot dice que el rol de quien pregunta no entra. */
  alSinPermiso: () => void;
  alSinSesion: () => void;
}) {
  const [burbujas, setBurbujas] = useState<Burbuja[]>([]);
  const [enVuelo, setEnVuelo] = useState(false);
  const [borrador, setBorrador] = useState('');
  /** La pregunta espera a que se libere la anterior: todavía no está en la cola. */
  const [esperaAnterior, setEsperaAnterior] = useState(false);
  /** «Tu negocio aún no tiene la voz de Mia activada». Una vez por visita. */
  const [avisoVoz, setAvisoVoz] = useState(false);

  const vivo = useRef(true);
  /** Lo mismo que `enVuelo`, pero legible en el mismo instante: dos Enter seguidos no son dos preguntas. */
  const ocupado = useRef(false);
  /** Cada envío y cada «Descartar» lo suben: un envío que ya no es el último se calla. */
  const turno = useRef(0);
  /** La pregunta que está esperando, para devolverla a la caja si se descarta. */
  const esperando = useRef<{ id: number; texto: string | null } | null>(null);
  /** Cada `blob:` creado, para revocarlo al salir. */
  const audios = useRef(new Set<string>());
  /** Respuestas SEGUIDAS en las que se pidió voz y el bot dijo que no hay. */
  const sinVozSeguidas = useRef(0);
  const yaAvisoVoz = useRef(false);
  const fondo = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    vivo.current = true;
    const urls = audios.current;
    return () => {
      vivo.current = false;
      for (const u of urls) URL.revokeObjectURL(u);
      urls.clear();
    };
  }, []);

  // Lo último, siempre a la vista.
  useEffect(() => {
    fondo.current?.scrollTo({ top: fondo.current.scrollHeight });
  }, [burbujas, enVuelo]);

  const cambiar = useCallback((id: number, con: (b: Burbuja) => Burbuja) => {
    setBurbujas((lista) => lista.map((b) => (b.id === id ? con(b) : b)));
  }, []);

  const ponerVoz = useCallback(
    (id: number, voz: Voz) => cambiar(id, (b) => (b.de === 'mia' ? { ...b, voz } : b)),
    [cambiar],
  );

  const diceMia = useCallback((texto: string, aviso = false, voz: Voz = null): number => {
    const id = siguienteId++;
    setBurbujas((l) => [...l, { id, de: 'mia', texto, voz, aviso }]);
    return id;
  }, []);

  /**
   * Se pidió voz y el bot dijo que no hay. A la segunda seguida se apaga el
   * interruptor y se avisa, una sola vez: seguir pidiéndola es esperar unos
   * segundos de más en cada respuesta para nada.
   */
  const contarSinVoz = useCallback(() => {
    sinVozSeguidas.current += 1;
    if (sinVozSeguidas.current < 2) return;
    alCambiarVoz(false);
    if (yaAvisoVoz.current) return;
    yaAvisoVoz.current = true;
    setAvisoVoz(true);
  }, [alCambiarVoz]);

  /** Del audio que manda el bot al que suena aquí. Nunca bloquea el chat. */
  const traerVoz = useCallback(
    async (id: number, comandoId: string, audio: AudioAsistente, sonarSolo: boolean) => {
      if (!audio) return;
      let listo = audio.estado === 'listo' ? audio : null;
      if (audio.estado === 'sin_audio') return contarSinVoz();
      if (audio.estado === 'generando') {
        const r = await esperarAudio(comandoId, () => vivo.current);
        if (!vivo.current) return;
        if (r.sinVoz) contarSinVoz();
        listo = r.audio;
      }
      // Sin audio al final: se quita el «preparando…» y ya. El texto es la respuesta.
      if (!listo) return ponerVoz(id, null);

      sinVozSeguidas.current = 0;
      const src = await descargarAudio(listo.url);
      if (!vivo.current) {
        if (src) URL.revokeObjectURL(src);
        return;
      }
      if (!src) return ponerVoz(id, { estado: 'sin_reproductor', hablado: listo.hablado });
      audios.current.add(src);
      ponerVoz(id, { estado: 'listo', src, hablado: listo.hablado, sonarSolo });
    },
    [contarSinVoz, ponerVoz],
  );

  const enviar = useCallback(
    async (p: Pregunta, lo: Omit<Extract<Burbuja, { de: 'yo' }>, 'id' | 'de'>) => {
      if (ocupado.current) return;
      /**
       * En demo el panel enseña cifras inventadas, y Mia contestaría con las
       * REALES del negocio: justo la mezcla que el modo demo existe para
       * evitar delante de un cliente. No se pregunta.
       */
      if (demoActivo()) {
        diceMia('En modo demo no le pregunto al bot: te contestaría con los números reales del negocio. Sal del modo demo para usar el asistente.', true);
        return;
      }
      const mio = siguienteId++;
      const yo = ++turno.current;
      setBurbujas((l) => [...l, { id: mio, de: 'yo', ...lo }]);
      ocupado.current = true;
      setEnVuelo(true);

      let d = await preguntar(companyId, p);
      if (d.tipo === 'en_curso') {
        esperando.current = { id: mio, texto: lo.texto };
        setEsperaAnterior(true);
        const hasta = Date.now() + ESPERA_EN_CURSO_MS;
        while (d.tipo === 'en_curso' && Date.now() < hasta) {
          await new Promise((r) => setTimeout(r, REINTENTO_EN_CURSO_MS));
          if (!vivo.current || turno.current !== yo) return;
          // Mientras se intenta no se puede descartar: si entra, ya está en la
          // cola y esperar su respuesta es «revisando tus números».
          esperando.current = null;
          setEsperaAnterior(false);
          d = await preguntar(companyId, p);
          if (!vivo.current || turno.current !== yo) return;
          if (d.tipo === 'en_curso') {
            esperando.current = { id: mio, texto: lo.texto };
            setEsperaAnterior(true);
          }
        }
        esperando.current = null;
        setEsperaAnterior(false);
      }
      if (!vivo.current || turno.current !== yo) return;
      ocupado.current = false;
      setEnVuelo(false);

      switch (d.tipo) {
        case 'respuesta': {
          const { r } = d;
          if (r.transcripcion) cambiar(mio, (b) => (b.de === 'yo' ? { ...b, transcripcion: r.transcripcion } : b));
          const espera = r.audio !== null && r.audio.estado !== 'sin_audio';
          const id = diceMia(r.respuesta, false, espera ? { estado: 'generando' } : null);
          // Solo si acaba de HABLAR: espera que le hablen. Si escribió, el
          // audio queda listo para pulsar: puede estar delante de clientes.
          void traerVoz(id, r.id, r.audio, 'audio' in p);
          break;
        }
        case 'no_disponible':
          alNoDisponible();
          break;
        case 'sin_permiso':
          alSinPermiso();
          break;
        case 'sin_sesion':
          alSinSesion();
          break;
        case 'sin_respuesta':
          // ⚠️ No se reenvía sola: la pregunta sigue en la cola, y si el bot
          // estaba apagado la contestará al arrancar. Se le devuelve el texto
          // a la caja para que repetirla sea una decisión, no un clic perdido.
          diceMia('Mia no responde ahora mismo. ¿Lo intentamos otra vez?', true);
          if ('pregunta' in p) setBorrador((b) => b || p.pregunta);
          break;
        case 'no_enviada':
          diceMia('No se pudo enviar la pregunta. Revisa tu conexión y vuelve a intentarlo.', true);
          if ('pregunta' in p) setBorrador((b) => b || p.pregunta);
          break;
        case 'en_curso':
          // La anterior sigue sin contestar y la base no deja entrar otra. Lo
          // escrito vuelve a la caja: en un momento se podrá mandar.
          diceMia(d.mensaje, true);
          if ('pregunta' in p) setBorrador((b) => b || p.pregunta);
          break;
        case 'muy_grande':
          diceMia(AUDIO_GRANDE, true);
          break;
        case 'error':
          diceMia(d.mensaje, true);
          break;
      }
    },
    [companyId, cambiar, diceMia, traerVoz, alNoDisponible, alSinPermiso, alSinSesion],
  );

  /** Descarta la pregunta que espera a la anterior. No llegó a la cola: no deja nada. */
  const descartar = useCallback(() => {
    const e = esperando.current;
    if (!e) return;
    turno.current++;
    esperando.current = null;
    ocupado.current = false;
    setEsperaAnterior(false);
    setEnVuelo(false);
    setBurbujas((l) => l.filter((b) => b.id !== e.id));
    if (e.texto) setBorrador((b) => b || e.texto!);
  }, []);

  const preguntarTexto = useCallback(
    (crudo: string) => {
      const pregunta = crudo.trim().slice(0, MAX_PREGUNTA);
      if (!pregunta || enVuelo) return;
      setBorrador('');
      void enviar({ pregunta, ...(conVoz && { con_voz: true }) }, { texto: pregunta, audioS: null, transcripcion: null });
    },
    [enVuelo, enviar, conVoz],
  );

  const preguntarAudio = useCallback(
    async (audio: Blob, segundos: number) => {
      if (segundos < 0.6 || !audio.size) return; // un toque sin querer
      if (audio.size > MAX_AUDIO_BYTES) {
        diceMia(AUDIO_GRANDE, true);
        return;
      }
      let base64: string;
      try {
        base64 = await aBase64(audio);
      } catch {
        if (vivo.current) diceMia('No se pudo preparar el audio. ¿Me lo repites o me lo escribes?', true);
        return;
      }
      if (!vivo.current) return;
      void enviar(
        { audio: { base64, mime: audio.type }, ...(conVoz && { con_voz: true }) },
        { texto: null, audioS: segundos, transcripcion: null },
      );
    },
    [diceMia, enviar, conVoz],
  );

  const mic = useGrabadora((audio, s) => void preguntarAudio(audio, s));
  const grabando = mic.estado === 'grabando';
  const chips = burbujas.length === 0 && !enVuelo ? sugerencias(modo, esDueno) : [];

  // La caja crece con lo escrito, hasta unas cinco líneas.
  useEffect(() => {
    const c = caja.current;
    if (!c) return;
    c.style.height = 'auto';
    c.style.height = `${Math.min(c.scrollHeight, 132)}px`;
  }, [borrador, grabando]);

  return (
    <section className="asis" aria-label="Conversación con Mia">
      <div className="asis__msgs" ref={fondo} role="log" aria-live="polite">
        {burbujas.length === 0 && !enVuelo && (
          <div className="asis__vacio">
            <b>Mia Gerente</b>
            <span>
              Pregúntale cómo va tu negocio, escribiendo o hablando. Lo que hablen se queda en esta pantalla: al
              salir o recargar, se borra.
            </span>
          </div>
        )}

        {burbujas.map((b) =>
          b.de === 'yo' ? (
            <div key={b.id} className="asis-b asis-b--yo">
              {b.audioS === null ? (
                <span className="asis-b__mio">{b.texto}</span>
              ) : (
                <>
                  <span className="asis-b__nota">
                    <Mic size={14} /> Audio ({duracion(b.audioS)})
                  </span>
                  {b.transcripcion && <small className="asis-b__oido">{b.transcripcion}</small>}
                </>
              )}
            </div>
          ) : (
            <div key={b.id} className={`asis-b asis-b--mia ${b.aviso ? 'asis-b--aviso' : ''}`}>
              <TextoMia texto={b.texto} />
              {b.voz?.estado === 'generando' && (
                <span className="asis-b__preparando">
                  <Volume2 size={14} /> preparando el audio…
                </span>
              )}
              {b.voz?.estado === 'listo' && <Reproductor src={b.voz.src} sonarSolo={b.voz.sonarSolo} />}
              {(b.voz?.estado === 'listo' || b.voz?.estado === 'sin_reproductor') && (
                <details className="asis-b__hablado">
                  <summary>
                    {b.voz.estado === 'listo' ? 'Ver lo que dice' : 'No se pudo cargar el audio · ver lo que dice'}
                  </summary>
                  <p>{b.voz.hablado}</p>
                </details>
              )}
            </div>
          ),
        )}

        {enVuelo && !esperaAnterior && (
          <div className="asis-b asis-b--mia asis-b--espera" role="status">
            <i className="spin spin--sm" /> Mia está revisando tus números…
          </div>
        )}
        {enVuelo && esperaAnterior && (
          <div className="asis-b asis-b--mia asis-b--espera" role="status">
            <span>
              <i className="spin spin--sm" /> Termino con tu pregunta anterior (aquí o en otro negocio) y voy con esta. Menos
              de un minuto.
            </span>
            <button type="button" className="asis-b__descartar" onClick={descartar}>
              Descartar
            </button>
          </div>
        )}
      </div>

      <div className="asis__pie">
        {avisoVoz && (
          <p className="asis__aviso" role="status">
            Tu negocio aún no tiene la voz de Mia activada
            <button type="button" onClick={() => setAvisoVoz(false)} aria-label="Cerrar el aviso">
              <X size={14} />
            </button>
          </p>
        )}

        {chips.length > 0 && (
          <div className="asis__chips">
            {chips.map((c) => (
              <button key={c} type="button" onClick={() => preguntarTexto(c)}>
                {c}
              </button>
            ))}
          </div>
        )}

        {grabando ? (
          // Dos botones con su palabra, no dos iconos: con una ✕ y un cuadrado
          // rojo no se sabía cuál mandaba la nota y cuál la tiraba, y equivocarse
          // es mandar a Mia algo que no querías decir.
          <div className="asis__caja asis__caja--grabando">
            <button
              type="button"
              className="asis__btn asis__btn--texto asis__btn--borrar"
              onClick={mic.cancelar}
              aria-label="Borrar la nota de voz"
            >
              <Trash2 size={16} /> Borrar
            </button>
            <span className="asis__grabando" role="timer">
              <i /> {duracion(mic.segundos)} <small>/ {duracion(MAX_GRABACION_S)}</small>
            </span>
            <button
              type="button"
              className="asis__btn asis__btn--texto asis__btn--enviar"
              onClick={mic.terminar}
              aria-label="Enviar la nota de voz"
            >
              Enviar <ArrowUp size={16} />
            </button>
          </div>
        ) : (
          <div className="asis__caja">
            <textarea
              ref={caja}
              rows={1}
              maxLength={MAX_PREGUNTA}
              placeholder="Escríbele a Mia…"
              aria-label="Tu pregunta"
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              onKeyDown={(e) => {
                // Enter envía; Shift+Enter salta de línea. Y no mientras se
                // compone un acento o un carácter con el teclado del móvil.
                if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
                e.preventDefault();
                preguntarTexto(borrador);
              }}
            />
            {mic.disponible && (
              <button
                type="button"
                className="asis__btn"
                onClick={() => void mic.empezar()}
                disabled={enVuelo || mic.estado === 'pidiendo'}
                aria-label="Preguntar hablando"
                title="Preguntar hablando"
              >
                <Mic size={18} />
              </button>
            )}
            <button
              type="button"
              className="asis__btn asis__btn--enviar"
              onClick={() => preguntarTexto(borrador)}
              disabled={enVuelo || !borrador.trim()}
              aria-label="Enviar"
            >
              <ArrowUp size={18} />
            </button>
          </div>
        )}

        <div className="asis__voz">
          <button
            type="button"
            role="switch"
            aria-checked={conVoz}
            aria-labelledby="asis-voz"
            className={`toggle ${conVoz ? 'on' : ''}`}
            onClick={() => alCambiarVoz(!conVoz)}
          />
          <span id="asis-voz">Responder también con voz</span>
        </div>
      </div>
    </section>
  );
}
