'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ALTA DEL NEGOCIO · lo que ve una cuenta recién creada sin negocio
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Una sola pregunta: cómo se llama el negocio. Ese nombre es también su página
 * (fideliza.vendemias.com/n/<enlace>), y por eso se enseña el enlace mientras
 * escribe. El WhatsApp ya no se pide aquí: se pone en los botones de la página,
 * que es donde sirve.
 *
 * La RPC (modules/fideliza/sql/0009, rehecha en 0010) crea la compañía, le da
 * la membresía de owner y los ajustes de Fideliza en una transacción. Un
 * negocio creado así NO tiene bot de WhatsApp: ese sigue necesitando tu
 * aprobación (tabla `instances`).
 *
 * ── GUARDA DE DUPLICADOS ─────────────────────────────────────────────────
 * Si el enlace natural ya lo tiene otro negocio, no se crea «-2» en silencio:
 * puede ser el mismo negocio creado con otra cuenta, o un colaborador que entró
 * antes de que lo invitaran. Se le dice, y para seguir tiene que confirmar que
 * es otro negocio. Si 0010 no está aplicada, el enlace se calcula aquí y la
 * guarda no actúa (la RPC de alta sigue resolviendo el choque con «-2»).
 *
 * Al terminar se recarga la página entera a propósito: la sesión vuelve a leer
 * las membresías y el panel arranca ya con el negocio elegido, sin tocar
 * Sesion.tsx. Sin destino pendiente, va directo a configurar su página.
 */
import { useEffect, useRef, useState } from 'react';
import { accion, mensaje } from '@/modules/fideliza/cliente/api';
import { slugDe } from '@/modules/fideliza/dominio/botones';
import { urlNegocio } from '@/modules/fideliza/dominio/config';
import { rutaActual, tomarDestino } from '@/lib/panel/destino';

interface Enlace {
  slug: string;
  /** El enlace natural (sin «-2») ya es de otro negocio. */
  ocupado: boolean;
  base: string;
}

/** Lo mismo que loyalty_business_slug_base: lo que se ve antes de que conteste la base. */
function enlaceLocal(nombre: string): Enlace {
  let s = slugDe(nombre).slice(0, 36).replace(/-+$/, '') || 'negocio';
  if (s.length < 3) s += '-negocio';
  return { slug: s, base: s, ocupado: false };
}

const sinProtocolo = (url: string) => url.replace(/^https?:\/\//, '');

export default function AltaNegocio({ salir }: { salir: () => Promise<void> }) {
  const [nombre, setNombre] = useState('');
  const [enlace, setEnlace] = useState<Enlace | null>(null);
  const [comprobando, setComprobando] = useState(false);
  /** Con el enlace ocupado, el dueño confirma que es OTRO negocio. */
  const [esOtro, setEsOtro] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Solo cuenta la última respuesta: escribir rápido no puede pintar una vieja. */
  const turno = useRef(0);

  useEffect(() => {
    const limpio = nombre.trim();
    const mio = ++turno.current;
    setEsOtro(false);
    if (limpio.length < 2) {
      setEnlace(null);
      setComprobando(false);
      return;
    }
    setEnlace(enlaceLocal(limpio));
    setComprobando(true);
    const t = setTimeout(() => {
      accion<Enlace>('negocio.enlace', { nombre: limpio })
        .then((r) => {
          if (turno.current === mio) setEnlace(r);
        })
        .catch(() => {
          /* sin 0010 o sin red: se queda el enlace calculado aquí */
        })
        .finally(() => {
          if (turno.current === mio) setComprobando(false);
        });
    }, 450);
    return () => clearTimeout(t);
  }, [nombre]);

  const bloqueado = Boolean(enlace?.ocupado && !esOtro);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (bloqueado || comprobando) return;
    setError(null);
    setEnviando(true);
    try {
      await accion('negocio.crear', { nombre: nombre.trim() });
      /**
       * A dónde: lo que pidió antes del login, o la pantalla en la que ya está
       * (p. ej. «activar placa» con su código), o a configurar su página.
       */
      const aqui = rutaActual();
      const destino = tomarDestino() ?? (/^\/panel\/?(?:[?#]|$)/.test(aqui) ? '/panel/fideliza/mi-pagina' : aqui);
      window.location.assign(destino);
    } catch (err) {
      setError(mensaje(err));
      setEnviando(false);
    }
  }

  return (
    <div className="acceso">
      <form className="acceso__card" onSubmit={crear}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="acceso__logo" src="/assets/logos/logo-naranja.webp" alt="Vendemia" />
        <h1>¿Cómo se llama tu negocio?</h1>
        <p className="sub">Ese nombre es también tu página: la que abren tus placas y tus clientes.</p>

        <label className="field-label" htmlFor="alta-nombre">
          Nombre del negocio
        </label>
        <input
          id="alta-nombre"
          className="input"
          autoFocus
          required
          minLength={2}
          maxLength={60}
          placeholder="Barbería Lucas"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />

        {enlace && (
          <p className="acceso__enlace" aria-live="polite">
            Tu página: <b>{sinProtocolo(urlNegocio(enlace.slug))}</b>
            {comprobando && <span> · comprobando…</span>}
          </p>
        )}

        {enlace?.ocupado && !comprobando && (
          <div className="acceso__aviso">
            Ya hay un negocio con el enlace <b>{enlace.base}</b>.
            <br />
            · Si es <b>el tuyo</b>, entra con la cuenta con la que lo creaste, o pide a su dueño que te invite.
            <br />
            · Si es <b>otro negocio</b>, añade tu distrito al nombre (p. ej. «{nombre.trim()} Surco»).
            <label className="acceso__check">
              <input type="checkbox" checked={esOtro} onChange={(e) => setEsOtro(e.target.checked)} />
              Es otro negocio: quiero el enlace <b>{enlace.slug}</b>
            </label>
          </div>
        )}

        {error && <div className="acceso__error">{error}</div>}

        <button
          className="btn btn-primary"
          type="submit"
          disabled={enviando || comprobando || bloqueado || nombre.trim().length < 2}
        >
          {enviando ? 'Creando…' : 'Crear mi página'}
        </button>
        <div className="acceso__alt">
          ¿No es tu cuenta?{' '}
          <button type="button" onClick={() => void salir()}>
            Salir
          </button>
        </div>
      </form>
    </div>
  );
}
