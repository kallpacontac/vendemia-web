'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * RETARGETING · a quién hay que escribirle, ahora
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ ESTO NO ES UNA COLA DE ENVÍO, y por eso no hay botón de «mandar a todos».
 *
 * No es una funcionalidad que falte: es la que hunde la cuenta. El número que
 * enviaría es el del negocio, y escribir en masa a gente que no habló primero
 * es el patrón exacto por el que WhatsApp bloquea. Además, desde el 1-oct-2026
 * Meta cobra cada mensaje que inicia el negocio. `wa_link` lo abre una PERSONA,
 * de una en una, mirando a quién le escribe.
 *
 * ⚠️ Y ES GLOBAL, no por negocio. Una sola lista con los clientes de todas las
 * cuentas, ordenada por urgencia: quien la usa lleva varias y lo que pregunta
 * es «¿a quién le escribo ahora?». Por eso `getRetargeting()` no filtra por
 * compañía y por eso la columna «Negocio» no es decoración — sin ella abres un
 * enlace y le escribes a un cliente sin saber en nombre de quién hablas.
 *
 * La tabla la escribe SOLO el bot, cada 15 minutos. Aquí no se encola nada.
 */
import { useCallback, useMemo, useState } from 'react';
import { AlertCircle, Check, MessageCircle, Search, Send, Wallet } from 'lucide-react';
import Topbar from '@/components/panel/Topbar';
import { useSesion } from '@/components/panel/Sesion';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { BotNoResponde, encolar } from '@/lib/supabase/commands';
import { getRetargeting } from '@/lib/supabase/queries';
import { json } from '@/lib/supabase/parse';
import { colorDe, iniciales, soles, telefono } from '@/lib/panel/format';
import {
  ESTADOS,
  MOTIVOS,
  cadencia,
  estadoDe,
  haceDias,
  haceRato,
  motivoDe,
} from '@/lib/panel/retargeting';
import type { RetargetingRow } from '@/lib/supabase/types';

const POR_PAGINA = 12;

export default function Retargeting() {
  const { session } = useSesion();

  // La dependencia es el USUARIO, no la compañía activa: cambiar de negocio en
  // el selector de arriba no cambia esta lista, que es de todos a la vez.
  const { datos, cargando, recargar } = useCargar(getRetargeting, [session?.user?.id ?? null]);

  const avisar = useAvisar();
  /** El lead cuyo «ya le escribí» está en vuelo, para bloquear solo ese botón. */
  const [marcando, setMarcando] = useState<string | null>(null);

  /**
   * «Ya le escribí a este cliente.»
   *
   * ⚠️ Se encola con `f.company_id`, EL DE LA FILA, y no con el de la sesión.
   *
   * Es la diferencia entre que funcione y que no: esta lista trae clientes de
   * todos los negocios, así que la compañía activa del selector de arriba casi
   * nunca es la de la fila que estás marcando. Con el id equivocado el bot
   * rechaza el comando —«lead X no existe en Y»— y el error no se parecería en
   * nada a la causa. Por eso aquí no se usa `useComando()`, que siempre manda
   * la activa.
   *
   * No se pinta nada de forma optimista: se pide `recargar()` y se espera a que
   * el dato vuelva por el espejo, que es cuando existe de verdad. El bot
   * adelanta `contactado_at` en `retargeting` al aplicar el comando —ver
   * `marcarSeguimiento` en db.service.ts—, así que vuelve en 1-2 s y no en los
   * 15 minutos del refresco completo.
   */
  const marcar = useCallback(
    async (f: RetargetingRow) => {
      setMarcando(f.lead_id);
      try {
        await encolar(f.company_id, 'marcar_seguimiento', {
          lead_id: f.lead_id,
          motivo: f.motivo,
        });
        avisar('Apuntado. Si vuelve a quedarse a medias, reaparece.', 'ok');
        recargar();
      } catch (e) {
        if (e instanceof BotNoResponde) {
          // El comando SÍ está encolado: se aplicará en cuanto el bot arranque.
          avisar('Apuntado. Puede tardar un momento en verse en la lista.', 'espera');
          recargar();
        } else {
          avisar(e instanceof Error ? e.message : 'No se pudo apuntar', 'error');
        }
      } finally {
        setMarcando(null);
      }
    },
    [avisar, recargar],
  );

  const [busqueda, setBusqueda] = useState('');
  const [fNegocio, setFNegocio] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [fMotivo, setFMotivo] = useState('');
  /**
   * Encendido de entrada porque la pantalla contesta «¿a quién le escribo?», y
   * una fila sin motivo no tiene ni acción ni botón. No esconde nada en
   * silencio: el pie de la lista dice cuántos quedan fuera y el interruptor
   * está a la vista.
   */
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [pagina, setPagina] = useState(1);

  const filas = useMemo(() => datos ?? [], [datos]);

  /** Los negocios que de verdad han llegado, para el desplegable. */
  const negocios = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of filas) m.set(f.company_id, f.negocio || f.company_id);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [filas]);

  const pendientes = useMemo(() => filas.filter((f) => f.motivo !== ''), [filas]);
  const alDia = filas.length - pendientes.length;
  const enJuego = pendientes.reduce((s, f) => s + (f.monto || 0), 0);
  const sinRevisar = filas.filter((f) => f.motivo === 'voucher-sin-verificar').length;

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (soloPendientes && f.motivo === '') return false;
      if (fNegocio && f.company_id !== fNegocio) return false;
      if (fEstado && f.estado !== fEstado) return false;
      if (fMotivo && f.motivo !== fMotivo) return false;
      if (q && !f.nombre.toLowerCase().includes(q) && !f.telefono.includes(q)) return false;
      return true;
    });
  }, [filas, busqueda, fNegocio, fEstado, fMotivo, soloPendientes]);

  const paginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas);
  const visibles = filtradas.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA);

  /** El refresco más reciente de cualquier fila: la foto es de ese momento. */
  const actualizado = filas.reduce((m, f) => Math.max(m, f.actualizado_at || 0), 0);

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Retargeting" sub="Clientes con algo a medio cerrar, de todos tus negocios" />

        <div className="mini-row">
          <div className="mini">
            <div className="ic" style={{ background: '#FFF1E6', color: '#F58220' }}>
              <MessageCircle size={20} />
            </div>
            <div>
              <b>{pendientes.length}</b>
              <small>Con algo que hacer</small>
            </div>
          </div>
          <div className="mini">
            <div className="ic" style={{ background: '#F3EEFF', color: '#A78BFA' }}>
              <Wallet size={20} />
            </div>
            <div>
              <b>{soles(enJuego)}</b>
              <small>Sobre la mesa</small>
            </div>
          </div>
          <div className="mini">
            <div className="ic" style={{ background: '#E9FBF3', color: '#0FA968' }}>
              <AlertCircle size={20} />
            </div>
            <div>
              <b>{sinRevisar}</b>
              {/* No es una venta a recuperar: ya pagaron. Es revisar, no vender. */}
              <small>Pagaron y falta revisar</small>
            </div>
          </div>
        </div>

        {/*
          La frase no es de adorno. Es lo único que separa esta pantalla de una
          herramienta de envío masivo en la cabeza de quien la usa.
        */}
        <p className="nota-envio">
          <Send size={14} /> Los mensajes los envías <b>tú, uno a uno</b>. El botón abre WhatsApp con
          el texto ya escrito; lo editas antes de enviar si quieres.
        </p>

        <div className="toolbar">
          <div className="search">
            <Search size={16} />
            <input
              placeholder="Buscar por nombre o teléfono…"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setPagina(1);
              }}
            />
          </div>
          {/* Existe por comodidad, pero NO es el estado inicial: la lista nace global. */}
          <select
            className="select"
            value={fNegocio}
            onChange={(e) => {
              setFNegocio(e.target.value);
              setPagina(1);
            }}
          >
            <option value="">Todos los negocios</option>
            {negocios.map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={fEstado}
            onChange={(e) => {
              setFEstado(e.target.value);
              setPagina(1);
            }}
          >
            <option value="">Todo el embudo</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {estadoDe(e).label}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={fMotivo}
            onChange={(e) => {
              setFMotivo(e.target.value);
              setPagina(1);
            }}
          >
            <option value="">Cualquier motivo</option>
            {MOTIVOS.map((m) => (
              <option key={m} value={m}>
                {motivoDe(m).label}
              </option>
            ))}
          </select>
          <label className="check-inline">
            <input
              type="checkbox"
              checked={soloPendientes}
              onChange={(e) => {
                setSoloPendientes(e.target.checked);
                setPagina(1);
              }}
            />
            Solo con algo que hacer
          </label>
        </div>

        <div className="table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Negocio</th>
                <th>Embudo</th>
                <th>Qué pasó</th>
                <th>Historial</th>
                <th>Actividad</th>
                <th style={{ textAlign: 'right' }}>En juego</th>
                <th style={{ textAlign: 'right' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 30 }}>
                    Cargando…
                  </td>
                </tr>
              )}
              {!cargando && visibles.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="vacio">
                      <b>Nada pendiente</b>
                      {filas.length === 0
                        ? 'Cuando alguien deje un carrito, una cita o un pago a medias, aparecerá aquí.'
                        : 'Con estos filtros no queda nadie. Prueba a quitar alguno.'}
                    </div>
                  </td>
                </tr>
              )}
              {visibles.map((f) => (
                <Fila
                  key={f.lead_id}
                  f={f}
                  marcando={marcando === f.lead_id}
                  onMarcar={() => void marcar(f)}
                />
              ))}
            </tbody>
          </table>
        </div>

        {paginas > 1 && (
          <div className="pagination">
            <button onClick={() => setPagina(actual - 1)} disabled={actual === 1}>
              ‹
            </button>
            {Array.from({ length: paginas }, (_, i) => (
              <button
                key={i}
                className={i + 1 === actual ? 'active' : ''}
                onClick={() => setPagina(i + 1)}
              >
                {i + 1}
              </button>
            ))}
            <button onClick={() => setPagina(actual + 1)} disabled={actual === paginas}>
              ›
            </button>
          </div>
        )}

        {/*
          «¿Esto es de ahora o de ayer?» es la duda razonable de cualquiera que
          mire una lista que se refresca sola cada 15 min — y con el bot apagado
          no se refresca en absoluto, que es lo que pasa de madrugada.

          El recuento de negocios va aquí por un motivo operativo: si esperas
          cinco y ves tres, lo que falta es la fila de `platform_admins` de la
          migración 0020, no un fallo del panel. El RLS recorta sin avisar.
        */}
        {!cargando && filas.length > 0 && (
          <p className="pie-lista">
            Actualizado {haceRato(actualizado)} · {filas.length} clientes en {negocios.length}{' '}
            {negocios.length === 1 ? 'negocio' : 'negocios'}
            {alDia > 0 && ` · ${alDia} al día, sin nada que hacer`}
          </p>
        )}
      </div>
    </main>
  );
}

function Fila({
  f,
  marcando,
  onMarcar,
}: {
  f: RetargetingRow;
  marcando: boolean;
  onMarcar: () => void;
}) {
  const mot = motivoDe(f.motivo);
  const est = estadoDe(f.estado);
  /** Todos los abiertos. El primero ya se enseña como píldora: aquí solo el resto. */
  const otros = json<string[]>(f.motivos, []).filter((m) => m !== f.motivo);
  const ritmo = cadencia(f.cadencia_dias);

  return (
    <tr>
      <td>
        <div className="cell-user">
          <div className="ava-ini" style={{ background: colorDe(f.lead_id) }}>
            {iniciales(f.nombre, f.telefono)}
          </div>
          <div>
            <b>{f.nombre || 'Sin nombre'}</b>
            <small>{telefono(f.telefono)}</small>
          </div>
        </div>
      </td>
      <td>
        <span className="badge-pill" style={{ color: '#5C5C5C', background: '#F1F3F9' }}>
          {f.negocio || f.company_id}
        </span>
      </td>
      <td>
        <span className="badge-pill" style={{ color: est.color, background: `${est.color}18` }}>
          {est.label}
        </span>
      </td>
      <td style={{ maxWidth: 260 }}>
        {f.motivo ? (
          <>
            <span className="badge-pill" style={{ color: mot.color, background: `${mot.color}18` }}>
              {mot.label}
            </span>
            {f.detalle && (
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                {f.detalle}
              </div>
            )}
            {/* Un lead puede tener el carrito Y la cita a medias. */}
            {otros.length > 0 && (
              <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                + {otros.map((m) => motivoDe(m).label.toLowerCase()).join(' · ')}
              </div>
            )}
          </>
        ) : (
          <span className="muted">Al día</span>
        )}
      </td>
      <td>
        {f.n_compras > 0 ? (
          <div style={{ fontSize: 12.5 }}>
            <b>
              {f.n_compras} {f.n_compras === 1 ? 'compra' : 'compras'} · {soles(f.total_gastado)}
            </b>
            {/* cadencia_dias = 0 es «no lo sabemos», no «vuelve a diario»: no se pinta. */}
            {ritmo && <div className="muted">{ritmo}</div>}
            {f.ultimo_item && <div className="muted">último: {f.ultimo_item}</div>}
          </div>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className="muted">{haceDias(f.ultima_actividad)}</td>
      <td style={{ textAlign: 'right', fontWeight: 700 }}>
        {f.monto > 0 ? soles(f.monto) : <span className="muted">—</span>}
      </td>
      <td style={{ textAlign: 'right' }}>
        {/*
          El texto ya viaja dentro del enlace: lo redacta `recuperar.service.ts`
          del bot, con el cuidado de no prometer lo que el negocio no puede
          cumplir. NO se reescribe aquí — dos redacciones se desincronizan y la
          del front no tiene ese cuidado.
        */}
        {f.wa_link ? (
          <div className="acciones-fila">
            <a className="btn btn-primary btn-sm" href={f.wa_link} target="_blank" rel="noreferrer">
              <Send size={14} /> Escribir
            </a>
            {/*
              Va SEPARADO de «Escribir» a propósito, y no encadenado a él.

              Abrir WhatsApp no es haber escrito: se abre la pestaña, se lee la
              conversación y a veces se decide no mandar nada. Marcarlo solo por
              haber pulsado el enlace silenciaría avisos de gente a la que nadie
              escribió — y ese es justo el cliente que se pierde sin que conste.
              Lo apunta quien sabe si lo mandó: la persona.
            */}
            <button
              className="btn btn-ghost btn-sm"
              onClick={onMarcar}
              disabled={marcando}
              title="Deja de salir en la lista por este motivo"
            >
              <Check size={14} /> {marcando ? 'Apuntando…' : 'Ya le escribí'}
            </button>
          </div>
        ) : (
          <span className="muted">—</span>
        )}
        {/*
          Lo único que evita que el mismo cliente reciba el mismo mensaje dos
          veces, de dos personas distintas.

          ⚠️ Que no se lea como «ya está resuelto»: el bot silencia el AVISO, no
          a la persona. Si vuelve a quedarse a medias, el motivo reaparece — y
          eso es correcto, es una gestión nueva.
        */}
        {f.contactado_at > 0 && (
          <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>
            ya le escribiste {haceDias(f.contactado_at)}
          </div>
        )}
      </td>
    </tr>
  );
}
