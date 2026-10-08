'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ENLACES DE UN LOTE · grabar chips sin poder equivocarse de placa
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Cada placa tiene UN token y dos URL que abren lo mismo:
 *
 *   NFC  →  fideliza.vendemias.com/t/<token>        (lo que se graba en el chip)
 *   QR   →  fideliza.vendemias.com/t/<token>?o=qr   (lo que lleva el QR impreso)
 *
 * El `?o=qr` solo sirve para medir si escanearon el QR o acercaron el móvil.
 * Ninguna de las dos cambia nunca: a dónde lleva la placa se decide en el
 * panel, sin reimprimir ni regrabar.
 *
 * ── EL RIESGO QUE ESTO EVITA ─────────────────────────────────────────────
 * En una placa NFC + QR, el chip y el QR impreso tienen que ser del MISMO
 * token. Si no, la tarjeta de activación activa la del QR y el chip abre otra
 * que sigue «sin activar». Elegir de una lista («grabar la #07») deja la puerta
 * abierta a equivocarse de fila. Por eso grabar NO se hace desde la lista:
 *
 *   1 · se escanea el QR impreso de la placa que se tiene en la mano,
 *   2 · se graba en su chip el enlace que sale de ESE QR,
 *   3 · (opcional, o para placas que grabó un proveedor) se comprueba:
 *       QR y chip leídos de la misma placa tienen que dar el mismo token.
 *
 * Grabar y comprobar usan Web NFC + BarcodeDetector: Chrome en Android, por
 * HTTPS. En iPhone no existen; ahí queda la lista para copiar, con el aviso.
 */
import { useEffect, useRef, useState } from 'react';
import { useAvisar } from '@/components/panel/Avisos';
import { FIDELIZA_URL, urlPlaca, urlPlacaQr } from '@/modules/fideliza/dominio/config';
import EscanerQr, { hayEscaner } from '@/modules/fideliza/ui/EscanerQr';

interface PlacaConToken {
  id: string;
  public_token: string;
  /** Ya la activó un negocio (solo en el stock leído de la base). */
  company_id?: string | null;
}

/**
 * El orden de un lote, el mismo en la hoja de QR, en esta lista y en la Fábrica
 * después de recargar. Por token y no por fecha: las placas de un lote nacen en
 * la misma transacción, con el mismo `created_at`.
 */
export const ordenLote = <T extends PlacaConToken>(placas: T[]) =>
  [...placas].sort((a, b) => (a.public_token < b.public_token ? -1 : a.public_token > b.public_token ? 1 : 0));

const num = (i: number, total: number) => '#' + String(i + 1).padStart(Math.max(2, String(total).length), '0');
const POR_PAGINA = 20;
const CLAVE_GRABADAS = 'fz_nfc_grabadas';

// ── Web NFC (sin tipos en TypeScript todavía) ───────────────────────────────
type RegistroNdef = { recordType: string; data?: DataView };
type LectorNdef = {
  write: (m: { records: { recordType: 'url'; data: string }[] }, o?: { signal?: AbortSignal }) => Promise<void>;
  scan: (o?: { signal?: AbortSignal }) => Promise<void>;
  onreading: ((e: { message: { records: RegistroNdef[] } }) => void) | null;
  onreadingerror: (() => void) | null;
};
const hayNfc = () => typeof window !== 'undefined' && 'NDEFReader' in window;
const nuevoLector = () => new (window as unknown as { NDEFReader: new () => LectorNdef }).NDEFReader();

/** El token de un enlace de placa (QR o NFC), solo si es de NUESTRO dominio. */
function tokenDe(texto: string): string | null {
  try {
    const u = new URL(texto.trim());
    if (u.host !== new URL(FIDELIZA_URL).host) return null;
    return u.pathname.match(/^\/t\/([A-Za-z0-9_-]{22,64})\/?$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Lee el primer chip que se acerque y devuelve su URL (o null si no lleva). */
function leerChip(signal: AbortSignal): Promise<string | null> {
  return new Promise((ok, mal) => {
    const lector = nuevoLector();
    lector.onreading = (e) => {
      const url = e.message.records.find((r) => r.recordType === 'url' && r.data);
      ok(url?.data ? new TextDecoder().decode(url.data) : null);
    };
    lector.onreadingerror = () => mal(new Error('No se pudo leer el chip. Vuelve a acercarlo.'));
    lector.scan({ signal }).catch(mal);
  });
}

function mensajeNfc(e: unknown): string {
  const nombre = e instanceof Error ? e.name : '';
  if (nombre === 'NotAllowedError') return 'El navegador no dio permiso para usar NFC. Actívalo en los ajustes del sitio.';
  if (nombre === 'NotSupportedError') return 'Ese chip no se puede grabar (¿está bloqueado o no es NTAG?).';
  if (nombre === 'NotReadableError') return 'El NFC del móvil está apagado. Actívalo en Ajustes.';
  return e instanceof Error ? e.message : 'Error desconocido';
}

async function copiarTexto(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    // Sin permiso de portapapeles (algunos navegadores del móvil): el método viejo.
    const t = document.createElement('textarea');
    t.value = texto;
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    t.remove();
  }
}

/** Las ya grabadas o comprobadas en ESTE móvil: una ayuda para no perderse, no un registro. */
function leerGrabadas(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLAVE_GRABADAS) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

type Modo = 'grabar' | 'comprobar';
type Paso =
  | { modo: Modo; etapa: 'qr' }
  | { modo: Modo; etapa: 'chip'; i: number; ocupado: boolean }
  | { modo: Modo; etapa: 'fin'; ok: boolean; texto: string };

export default function EnlacesPlacas({ placas, nfc }: { placas: PlacaConToken[]; nfc: boolean }) {
  const avisar = useAvisar();
  const [pagina, setPagina] = useState(0);
  const [paso, setPaso] = useState<Paso | null>(null);
  const [grabadas, setGrabadas] = useState<Set<string>>(new Set());
  const [puedeGrabar, setPuedeGrabar] = useState(false);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => {
    setGrabadas(leerGrabadas());
    setPuedeGrabar(nfc && hayNfc() && hayEscaner());
    return () => ctl.current?.abort();
  }, [nfc]);

  const total = placas.length;
  const paginas = Math.ceil(total / POR_PAGINA);
  const visibles = placas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const hechas = placas.filter((p) => grabadas.has(p.id)).length;

  function marcar(id: string) {
    const nuevas = new Set(leerGrabadas()).add(id);
    try {
      localStorage.setItem(CLAVE_GRABADAS, JSON.stringify([...nuevas].slice(-3000)));
    } catch {
      /* sin almacenamiento: solo se pierde la marca */
    }
    setGrabadas(nuevas);
  }

  function empezar(modo: Modo) {
    ctl.current?.abort();
    setPaso({ modo, etapa: 'qr' });
  }

  function cerrar() {
    ctl.current?.abort();
    setPaso(null);
  }

  /** Paso 1: el QR impreso dice qué placa es la que está en la mano. */
  function alLeerQr(texto: string) {
    if (!paso) return;
    const token = tokenDe(texto);
    const i = token ? placas.findIndex((p) => p.public_token === token) : -1;
    if (i < 0) {
      setPaso({
        modo: paso.modo,
        etapa: 'fin',
        ok: false,
        texto: token ? 'Ese QR es de una placa de OTRO lote. Abre su lote para grabarla.' : 'Ese QR no es de una placa de Vendemia.',
      });
      return;
    }
    setPaso({ modo: paso.modo, etapa: 'chip', i, ocupado: false });
  }

  /** Paso 2: grabar en el chip el enlace del QR leído, o leer el chip y compararlo. */
  async function usarChip() {
    if (!paso || paso.etapa !== 'chip') return;
    const { modo, i } = paso;
    const placa = placas[i];
    const n = num(i, total);
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setPaso({ modo, etapa: 'chip', i, ocupado: true });
    try {
      if (modo === 'grabar') {
        await nuevoLector().write({ records: [{ recordType: 'url', data: urlPlaca(placa.public_token) }] }, { signal: c.signal });
        marcar(placa.id);
        setPaso({ modo, etapa: 'fin', ok: true, texto: `Chip de la placa ${n} grabado con el enlace de su QR.` });
      } else {
        const url = await leerChip(c.signal);
        c.abort(); // deja de escuchar: ya leyó
        const tokenChip = url ? tokenDe(url) : null;
        if (tokenChip === placa.public_token) {
          marcar(placa.id);
          setPaso({ modo, etapa: 'fin', ok: true, texto: `Placa ${n}: el chip y el QR coinciden.` });
        } else {
          const j = tokenChip ? placas.findIndex((p) => p.public_token === tokenChip) : -1;
          setPaso({
            modo,
            etapa: 'fin',
            ok: false,
            texto: !url
              ? `El chip de la placa ${n} está vacío. Grábalo con «Grabar chips».`
              : j >= 0
                ? `NO coinciden: el QR es de la ${n} y el chip de la ${num(j, total)}. Vuelve a grabar este chip con «Grabar chips».`
                : `NO coinciden: el chip lleva otro enlace (${url}). Vuelve a grabarlo con «Grabar chips».`,
          });
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      avisar(mensajeNfc(e), 'error');
      setPaso({ modo, etapa: 'chip', i, ocupado: false });
    }
  }

  async function copiar(texto: string, que: string) {
    await copiarTexto(texto);
    avisar(`Copiado: ${que}`);
  }

  /** Una fila por placa: así el proveedor no puede emparejar un QR con el chip de otra. */
  const listaProveedor = () =>
    [
      nfc ? 'Placa\tQR impreso\tChip NFC' : 'Placa\tQR impreso',
      ...placas.map((p, i) => [num(i, total), urlPlacaQr(p.public_token), ...(nfc ? [urlPlaca(p.public_token)] : [])].join('\t')),
    ].join('\n');

  return (
    <div className="fz-enlaces">
      {nfc &&
        (puedeGrabar ? (
          <div className="fz-fila" style={{ marginBottom: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={() => empezar('grabar')}>
              Grabar chips
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => empezar('comprobar')}>
              Comprobar una placa
            </button>
            {hechas > 0 && (
              <span className="fz-def" style={{ margin: 0 }}>
                {hechas} de {total} listas en este móvil
              </span>
            )}
          </div>
        ) : (
          <div className="fz-panel-aviso" style={{ marginBottom: 12 }}>
            <span>
              Para <b>grabar y comprobar sin riesgo</b>, abre esta pantalla en <b>Chrome de Android</b>: lee el QR de la placa y graba ese mismo enlace en
              su chip. Desde iPhone, usa la lista de abajo con cuidado: el chip lleva el enlace NFC de la <b>misma fila</b> que su QR.
            </span>
          </div>
        ))}

      {paso && (
        <div className="fz-asistente" role="status">
          {paso.etapa === 'qr' && (
            <>
              <b>Paso 1 · Escanea el QR impreso de la placa</b>
              <p className="fz-def">Ten en la mano solo esa placa. {paso.modo === 'grabar' ? 'Su chip recibirá el enlace de este QR.' : ''}</p>
              <EscanerQr
                alLeer={alLeerQr}
                alFallar={() => {
                  avisar('No se pudo abrir la cámara. Dale permiso en el navegador.', 'error');
                  cerrar();
                }}
              />
            </>
          )}

          {paso.etapa === 'chip' && (
            <>
              <b>
                Paso 2 · Placa {num(paso.i, total)}: {paso.modo === 'grabar' ? 'graba su chip' : 'lee su chip'}
              </b>
              <p className="fz-def">
                {paso.ocupado
                  ? 'Acerca el chip de ESA MISMA placa a la parte de atrás del móvil y no lo muevas…'
                  : 'Sin soltar la placa, pulsa el botón y acerca su chip a la parte de atrás del móvil.'}
              </p>
              {placas[paso.i].company_id && <p className="fz-def">Ojo: esta placa ya la activó un negocio. Si la regrabas, sigue siendo suya.</p>}
              <button className="btn btn-primary" disabled={paso.ocupado} onClick={() => void usarChip()}>
                {paso.ocupado ? 'Esperando el chip…' : paso.modo === 'grabar' ? `Grabar chip de ${num(paso.i, total)}` : `Leer chip de ${num(paso.i, total)}`}
              </button>
            </>
          )}

          {paso.etapa === 'fin' && (
            <div className={`fz-panel-aviso ${paso.ok ? 'fz-panel-aviso--ok' : 'fz-panel-aviso--error'}`} style={{ marginBottom: 0 }}>
              <span style={{ flex: 1 }}>
                {paso.ok ? '✓ ' : '✗ '}
                {paso.texto}
              </span>
            </div>
          )}

          <div className="fz-fila" style={{ marginTop: 10 }}>
            {paso.etapa === 'fin' && (
              <button className="btn btn-primary btn-sm" onClick={() => empezar(paso.modo)}>
                {paso.modo === 'grabar' ? 'Siguiente placa' : 'Comprobar otra'}
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={cerrar}>
              {paso.etapa === 'fin' ? 'Terminar' : 'Cancelar'}
            </button>
          </div>
        </div>
      )}

      <button className="btn btn-ghost btn-sm" onClick={() => void copiar(listaProveedor(), `lista de ${total} placas`)}>
        Copiar lista para el proveedor
      </button>
      <p className="fz-def">
        Una fila por placa{nfc ? ': el QR impreso y el chip de esa placa llevan los enlaces de la misma fila' : ''}. Se pega tal cual en un Excel o en un
        WhatsApp.
      </p>

      <details className="fz-mas">
        <summary>Enlaces placa por placa</summary>
        {nfc && (
          <p className="fz-def">
            ⚠️ Copia el NFC de la <b>misma fila</b> que el QR de la placa que tienes en la mano. Si puedes, usa «Grabar chips»: lee el QR y no hay forma de
            equivocarse.
          </p>
        )}
        <ul className="fz-lista fz-enlaces__lista">
          {visibles.map((p, k) => {
            const n = num(pagina * POR_PAGINA + k, total);
            return (
              <li key={p.id}>
                <span className="fz-enlaces__id">
                  <b>{n}</b> <span className="fz-mono">{p.public_token.slice(0, 6)}…</span>
                  {grabadas.has(p.id) && <span className="fz-enlaces__ok">✓ lista</span>}
                  {p.company_id && <span className="fz-enlaces__dueno">activada</span>}
                </span>
                <span className="fz-fila" style={{ gap: 6, justifyContent: 'flex-end' }}>
                  {nfc && (
                    <button className="btn btn-ghost btn-sm" onClick={() => void copiar(urlPlaca(p.public_token), `NFC ${n}`)}>
                      Copiar NFC
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => void copiar(urlPlacaQr(p.public_token), `QR ${n}`)}>
                    Copiar QR
                  </button>
                </span>
              </li>
            );
          })}
        </ul>

        {paginas > 1 && (
          <div className="fz-fila" style={{ justifyContent: 'center', marginTop: 8 }}>
            <button className="btn btn-ghost btn-sm" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>
              Anteriores
            </button>
            <span className="fz-def" style={{ margin: 0 }}>
              {pagina * POR_PAGINA + 1}–{Math.min(total, (pagina + 1) * POR_PAGINA)} de {total}
            </span>
            <button className="btn btn-ghost btn-sm" disabled={pagina >= paginas - 1} onClick={() => setPagina(pagina + 1)}>
              Siguientes
            </button>
          </div>
        )}
      </details>
    </div>
  );
}
