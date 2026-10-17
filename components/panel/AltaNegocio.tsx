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
 * Sesion.tsx. Sin destino pendiente, se queda donde estaba.
 *
 * ── SI VIENE DE UNA PLACA ────────────────────────────────────────────────
 * Primero la placa, luego la página. Aquí mismo se pide el código de la
 * tarjeta y se canjea al crear el negocio: si se dejaba para después, quien
 * confirmaba la cuenta desde el correo en otro dispositivo perdía el «a dónde
 * ibas», montaba su página y la placa seguía sin activar (17-oct).
 *
 * Un solo campo para los dos casos, porque la base acepta los dos códigos:
 *   · placa suelta  → su código, XXXXX-XXXXX;
 *   · varias placas → el del pedido, PXXXX-XXXXX, que las activa todas.
 * Después, a Mi página: al publicar, todas quedan apuntando a ella.
 *
 * «Viene de una placa» se sabe por `?origen=placa` (en la URL o en el destino
 * guardado) o por la marca que deja el registro en la cuenta, que sí viaja de
 * un dispositivo a otro (login/page.tsx).
 */
import { useEffect, useRef, useState } from 'react';
import { accion, mensaje } from '@/modules/fideliza/cliente/api';
import { slugDe } from '@/modules/fideliza/dominio/botones';
import { urlNegocio } from '@/modules/fideliza/dominio/config';
import { rutaActual, tomarDestino, verDestino, vieneDePlaca } from '@/lib/panel/destino';
import { useSesion } from './Sesion';

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

/** Lo que se escribe del código: letras y números, con el guion en su sitio. */
const limpiarCodigo = (c: string) => c.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 13);
const codigoCompleto = (c: string) => c.replace(/-/g, '').length >= 10;
/** El código que trae el QR de la tarjeta, en el fragmento: `#codigo=…`. */
const codigoDe = (ruta: string | null) => limpiarCodigo(new URLSearchParams((ruta ?? '').split('#')[1] ?? '').get('codigo') ?? '');

export default function AltaNegocio({ salir }: { salir: () => Promise<void> }) {
  const { session } = useSesion();
  const [nombre, setNombre] = useState('');
  /** null = no viene de una placa; '' = sí, todavía sin código. */
  const [codigo, setCodigo] = useState<string | null>(null);
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

  useEffect(() => {
    const guardado = verDestino();
    const desdePlaca =
      vieneDePlaca(guardado ?? '') || vieneDePlaca(rutaActual()) || session?.user?.user_metadata?.origen === 'placa';
    if (desdePlaca) setCodigo(codigoDe(guardado) || codigoDe(rutaActual()));
  }, [session]);

  const bloqueado = Boolean(enlace?.ocupado && !esOtro);
  const conPlaca = codigo !== null;

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (bloqueado || comprobando) return;
    setError(null);
    setEnviando(true);
    try {
      const alta = await accion<{ company_id: string }>('negocio.crear', { nombre: nombre.trim() });
      if (conPlaca && codigoCompleto(codigo)) {
        tomarDestino();
        try {
          // Con el código de un PEDIDO llegan todas sus placas a la vez.
          const r = await accion<{ id: string; count?: number }>('placa.reclamar', { companyId: alta.company_id, code: codigo });
          window.location.assign(`/panel/fideliza/mi-pagina?placa=${r.id}&n=${r.count ?? 1}`);
        } catch {
          // El negocio ya existe: el código se corrige en Placas, con su mensaje.
          window.location.assign(`/panel/fideliza/placas?activar=1&origen=placa#codigo=${encodeURIComponent(codigo)}`);
        }
        return;
      }
      /**
       * A dónde: lo que pidió antes del login, o la pantalla en la que ya está.
       * Quien viene de una placa (`?origen=placa`) sigue a activarla; los demás
       * se quedan en su panel. Antes, desde /panel se iba a «Mi página», y eso
       * mandaba a Fideliza también a los negocios del bot.
       */
      window.location.assign(tomarDestino() ?? rutaActual());
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
        <p className="sub">
          {conPlaca
            ? 'Dos datos y tu placa queda tuya. Después armas la página que abrirá.'
            : 'Ese nombre es también tu página: la que abren tus placas y tus clientes.'}
        </p>

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

        {conPlaca && (
          <>
            <label className="field-label" htmlFor="alta-codigo" style={{ marginTop: 14 }}>
              Código de activación
            </label>
            <input
              id="alta-codigo"
              className="input fz-mono"
              autoComplete="off"
              placeholder="XXXXX-XXXXX"
              value={codigo}
              onChange={(e) => setCodigo(limpiarCodigo(e.target.value))}
            />
            <p className="acceso__enlace">
              Está en la tarjeta que vino en la caja. ¿Compraste varias placas? Usa el <b>código del pedido</b> (empieza por P) y se activan todas
              juntas.
            </p>
          </>
        )}

        {error && <div className="acceso__error">{error}</div>}

        <button
          className="btn btn-primary"
          type="submit"
          disabled={enviando || comprobando || bloqueado || nombre.trim().length < 2 || (conPlaca && !codigoCompleto(codigo))}
        >
          {enviando ? (conPlaca ? 'Activando…' : 'Creando…') : conPlaca ? 'Activar mi placa' : 'Crear mi página'}
        </button>
        {conPlaca && (
          <div className="acceso__alt">
            ¿No tienes el código a mano?{' '}
            <button type="button" onClick={() => setCodigo(null)}>
              Activarla después
            </button>
          </div>
        )}
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
