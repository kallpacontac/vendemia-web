'use client';

/**
 * FIDELIZA · AVISOS — lo que le llega al celular del cliente, con interruptores.
 *
 * Solo por avisos push, solo a quien los aceptó, de 09:00 a 20:00 (Lima) y con un tope por
 * persona (lo impone Postgres, 0014). «Aceptado» es lo que dice el servicio de push del
 * navegador: no es «entregado» ni «leído»; aquí se dice «recibieron».
 *
 * 20-nov-2026 (maqueta aprobada por Alvaro): era Clientes › Campañas, con cada automático
 * «Sin configurar» y un formulario por delante. Ahora es su propia pestaña y cada aviso es una
 * fila con interruptor:
 *   · «Al sumar un sello» y «Al ganar el premio» salen siempre (avisarSello / avisarPremio): se
 *     enseñan para que el dueño sepa que existen, sin interruptor.
 *   · Bienvenida, ¿Te toca volver?, Te extrañamos: campañas. Prenderlas por primera vez usa el
 *     texto de fábrica (dominio/avisos.ts); los días se eligen tocando; el lápiz es opcional.
 *   · Cumpleaños: el regalo del negocio (loyalty_settings.cumple_regalo, sql/0025).
 *   · «Premio disponible» (reward_available) ya no se ofrece: repetía el aviso del premio. Si un
 *     negocio la tiene prendida, sale su fila para poder apagarla.
 * «Mis avisos» (los que manda el dueño cuando quiere) sigue debajo, sin cambios.
 */
import { useEffect, useState } from 'react';
import { Check, Pencil, Send, X } from 'lucide-react';
import '@/components/panel/resumen-negocio.css';
import { useFideliza } from '@/modules/fideliza/ui/Contexto';
import { Cargando, Fallo } from '@/modules/fideliza/ui/Estados';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { accion, lecturas, mensaje, type Campana } from '@/modules/fideliza/cliente/api';
import type { Metricas } from '@/modules/fideliza/dominio/metricas';
import { AVISOS_AUTO, DIAS_EXTRANAMOS, DIAS_VOLVER, avisoDeFabrica, type PlantillaAuto } from '@/modules/fideliza/dominio/avisos';
import MisAvisos from '@/modules/fideliza/ui/paginas/MisAvisos';
import PedirResena from '@/modules/fideliza/ui/PedirResena';

type Plantilla = Campana['template'];
type Borrador = { title: string; body: string; config: Record<string, number> };

const haceDias = (n: number) => new Date(Date.now() - n * 86400000).toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });
const clientes = (n: number) => `${n} ${n === 1 ? 'cliente' : 'clientes'}`;
const minus = (t: string) => (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);

export default function Campanas() {
  const { companyId, puede, ajustes, recargar: recargarCtx } = useFideliza();
  const avisar = useAvisar();
  const [editando, setEditando] = useState<Plantilla | 'cumple' | null>(null);
  const [borr, setBorr] = useState<Borrador | null>(null);
  const [regalo, setRegalo] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [abrirNuevo, setAbrirNuevo] = useState(0);

  const { datos, cargando, error, releer } = useCargar(async () => {
    if (!companyId) return null;
    const [campanas, config, m, alcance, programas] = await Promise.all([
      lecturas.campanas(companyId),
      accion<{ push: boolean }>('config.estado', {}),
      puede('metrics.read') ? accion<Metricas>('metricas', { companyId, from: haceDias(29), to: haceDias(0) }).catch(() => null) : Promise.resolve(null),
      accion<{ matching: number; reachable: number }>('aviso.audiencia', { companyId, audiencia: 'todos', valor: 1 }).catch(() => null),
      lecturas.programas(companyId).catch(() => []),
    ]);
    const vivo = programas.find((p) => p.status === 'active' || p.status === 'paused') ?? null;
    const [version] = vivo?.current_version_id ? await lecturas.versiones(companyId, vivo.id).catch(() => []) : [];
    return { campanas, config, m, alcance, club: vivo?.name ?? '', meta: version?.reward_threshold ?? null, premio: version?.reward_description ?? '' };
  }, [companyId]);

  // Escape cierra la ventana.
  useEffect(() => {
    if (!editando) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && !ocupado && setEditando(null);
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [editando, ocupado]);

  if (cargando && !datos) return <Cargando texto="Cargando avisos…" />;
  if (error) return <Fallo texto={error} reintentar={releer} />;
  if (!datos || !companyId) return null;
  const editable = puede('campaigns.manage');
  const negocio = ajustes?.display_name ?? '';
  const club = { negocio, club: datos.club, premio: datos.premio };
  const campana = (t: Plantilla) => datos.campanas.find((x) => x.template === t);
  const hayCumple = typeof ajustes?.cumple_regalo === 'string';
  const regaloActual = (ajustes?.cumple_regalo ?? '').trim();

  async function guardarCampana(t: Plantilla, status: Campana['status'], b: Borrador, ok: string) {
    setOcupado(t);
    try {
      await accion('campana.guardar', { companyId, template: t, status, ...b });
      avisar(ok, 'ok');
      setEditando(null);
      releer();
    } catch (e) {
      avisar(mensaje(e), 'error');
    } finally {
      setOcupado(null);
    }
  }
  const actual = (t: PlantillaAuto): Borrador => {
    const c = campana(t);
    const f = avisoDeFabrica(t, club);
    return c ? { title: c.title, body: c.body, config: { ...f.config, ...(c.config ?? {}) } } : f;
  };
  function alternar(t: Plantilla) {
    const c = campana(t);
    const nombre = t === 'reward_available' ? 'Premio disponible' : AVISOS_AUTO[t as PlantillaAuto].nombre;
    if (c?.status === 'active') return void guardarCampana(t, 'paused', { title: c.title, body: c.body, config: c.config ?? {} }, `Apagado: ${nombre}.`);
    void guardarCampana(t, 'active', actual(t as PlantillaAuto), `Prendido: ${nombre}. Sale solo.`);
  }
  function cambiarDias(t: PlantillaAuto, clave: string, n: number) {
    const b = actual(t);
    void guardarCampana(t, campana(t)?.status ?? 'active', { ...b, config: { ...b.config, [clave]: n } }, `Listo: a los ${n} días.`);
  }
  function abrir(t: PlantillaAuto) {
    setBorr(actual(t));
    setEditando(t);
  }
  async function guardarRegalo(valor: string) {
    setOcupado('cumple');
    try {
      await accion('cumple.regalo', { companyId, regalo: valor });
      avisar(valor ? `Prendido: Cumpleaños. Regalo: ${valor}.` : 'Apagado: Cumpleaños.', 'ok');
      setEditando(null);
      recargarCtx();
    } catch (e) {
      const m = mensaje(e);
      avisar(/loyalty_cumple_regalo_guardar|function|schema cache/i.test(m) ? 'Falta instalar la actualización de cumpleaños (sql 0025). Avisa a Vendemia.' : m, 'error');
    } finally {
      setOcupado(null);
    }
  }

  /** «27 recibieron · 12 volvieron» («volvieron» = compraron en los 14 días siguientes). */
  const cifras = (t: string) => {
    const e = datos.m?.campaigns[t];
    if (!e || !e.provider_accepted) return null;
    return `${e.provider_accepted} recibieron · ${e.validated_purchase_after ?? 0} volvieron`;
  };
  const resultado = (t: string) => {
    if (!datos.m?.campaigns[t]) return null;
    return `Últimos 30 días: ${cifras(t) ?? 'todavía no ha salido a nadie'}.`;
  };

  const meta = datos.meta ?? 8;
  const ejemplo = Math.max(1, Math.min(meta - 2, 3));
  const queGana = datos.premio ? minus(datos.premio) : 'tu premio';
  const rewardViejo = campana('reward_available')?.status === 'active';

  return (
    <>
      {!datos.config.push && (
        <div className="fz-panel-aviso fz-panel-aviso--error">
          Los avisos todavía no están listos en el servidor: se pueden preparar, pero no sale ninguno. Avisa a Vendemia.
        </div>
      )}

      <section className="fz-avisos">
        <article className="fz-numeros__card fz-avisos__alcance">
          <div className="negocio-card-head">
            <h2>Le llegan al celular de tus clientes</h2>
            {datos.alcance && <span className="negocio-currency">{datos.alcance.reachable} de {datos.alcance.matching}</span>}
          </div>
          <p className="fz-numeros__sub">
            {datos.alcance
              ? <>Les llegan a <b>{clientes(datos.alcance.reachable)}</b> de tus {datos.alcance.matching}: los que aceptaron avisos en su tarjeta. A los demás puedes escribirles por WhatsApp desde su ficha en Clientes.</>
              : 'Solo les llegan a los clientes que aceptaron avisos en su tarjeta.'}
          </p>
          {editable && (
            <button type="button" className="btn btn-primary fz-avisos__mandar" onClick={() => setAbrirNuevo((n) => n + 1)}>
              <Send size={17} /> Mandar un aviso ahora
            </button>
          )}
        </article>

        <article className="fz-numeros__card">
          <div className="negocio-card-head"><h2>Salen solos</h2><span className="negocio-currency">sin que hagas nada</span></div>
          <ul className="fz-avisos__lista">
            <Fila nombre="Al sumar un sello" fijo titulo="+1 sello" texto={`Llevas ${ejemplo} de ${meta}. Te faltan ${meta - ejemplo} para ${queGana}.`} pie="Siempre prendido: es lo que hace que vuelvan." />
            <Fila nombre="Al ganar el premio" fijo titulo="¡Ganaste un premio!" texto={`${datos.premio || 'Tu premio'} · Enseña tu tarjeta en ${negocio || 'el local'} para canjearlo.`} pie="Siempre prendido." />

            {(Object.keys(AVISOS_AUTO) as PlantillaAuto[]).map((t) => {
              const c = campana(t);
              const b = actual(t);
              const on = c?.status === 'active';
              const clave = t === 'return_reminder' ? 'cycle_days' : t === 'winback' ? 'inactive_days' : null;
              const opciones = t === 'return_reminder' ? DIAS_VOLVER : DIAS_EXTRANAMOS;
              return (
                <Fila
                  key={t}
                  nombre={AVISOS_AUTO[t].nombre}
                  on={on}
                  ocupado={ocupado === t}
                  editable={editable}
                  alternar={() => alternar(t)}
                  titulo={b.title}
                  texto={b.body}
                  cuando={AVISOS_AUTO[t].cuando}
                  pie={resultado(t)}
                  editar={editable ? () => abrir(t) : undefined}
                  dias={clave ? (
                    <div className="chip-tabs fz-avisos__dias" role="group" aria-label={`${AVISOS_AUTO[t].nombre}: días sin venir`}>
                      {opciones.map((n) => (
                        <button key={n} type="button" className={b.config[clave] === n ? 'active' : ''} aria-pressed={b.config[clave] === n}
                          disabled={!editable || ocupado === t} onClick={() => cambiarDias(t, clave, n)}>
                          {n} días
                        </button>
                      ))}
                    </div>
                  ) : undefined}
                />
              );
            })}

            {hayCumple && (
              <Fila
                nombre="Cumpleaños"
                on={Boolean(regaloActual)}
                ocupado={ocupado === 'cumple'}
                editable={editable}
                alternar={() => {
                  if (regaloActual) return void guardarRegalo('');
                  setRegalo('');
                  setEditando('cumple');
                }}
                titulo={`🎂 ¡Feliz cumpleaños! · ${negocio || 'tu negocio'}`}
                texto={regaloActual ? `Hoy te toca: ${regaloActual.replace(/[.!]+$/, '')}. Enseña tu tarjeta al llegar. ¡Te esperamos!` : 'Elige qué le regalas y se prende. Sale a las 9:00 del día de su cumpleaños.'}
                cuando="El día de su cumpleaños, si lo dio en la Caja o en su ficha."
                pie={regaloActual ? `Regalo: ${regaloActual}` : null}
                editar={editable ? () => { setRegalo(regaloActual); setEditando('cumple'); } : undefined}
              />
            )}

            <PedirResena
              companyId={companyId}
              editable={editable}
              negocio={negocio}
              placeId={((ajustes?.page_style ?? null) as { place_id?: string } | null)?.place_id ?? null}
            />

            {rewardViejo && (
              <Fila
                nombre="Premio disponible (antiguo)"
                on
                ocupado={ocupado === 'reward_available'}
                editable={editable}
                alternar={() => alternar('reward_available')}
                titulo={campana('reward_available')!.title}
                texto={campana('reward_available')!.body}
                cuando="Repite el aviso de «Al ganar el premio». Te recomendamos apagarlo."
                pie={resultado('reward_available')}
              />
            )}
          </ul>
        </article>
      </section>

      {editable && <MisAvisos companyId={companyId} push={datos.config.push} resumen={cifras('manual')} alEnviar={releer} abrir={abrirNuevo} />}

      <p className="fz-avisos__tope">
        Para no cansar a tus clientes, el sistema manda como máximo 4 avisos por persona cada 30 días (sumando los automáticos y los tuyos) y solo de 9:00 a 20:00. No tienes que configurarlo.
      </p>

      {editando && editando !== 'cumple' && borr && (
        <Ventana titulo={AVISOS_AUTO[editando as PlantillaAuto]?.nombre ?? 'Aviso'} cerrar={() => !ocupado && setEditando(null)}>
          <div className="fz-modal__cuerpo">
            <div className="fz-campo">
              <label className="field-label" htmlFor="fz-av-titulo">Título</label>
              <input id="fz-av-titulo" className="input" maxLength={60} value={borr.title} onChange={(e) => setBorr({ ...borr, title: e.target.value })} />
            </div>
            <div className="fz-campo">
              <label className="field-label" htmlFor="fz-av-texto">Mensaje</label>
              <textarea id="fz-av-texto" className="textarea" maxLength={160} value={borr.body} onChange={(e) => setBorr({ ...borr, body: e.target.value })} />
            </div>
            <label className="field-label">Así le llega al cliente</label>
            <div className="fz-modal__vista">
              <b>{borr.title || 'Título'}</b>
              <span>{borr.body || 'Mensaje'}</span>
            </div>
            <button type="button" className="nc-link" onClick={() => setBorr({ ...borr, ...avisoDeFabrica(editando as PlantillaAuto, club), config: borr.config })}>
              Volver al mensaje de fábrica
            </button>
          </div>
          <div className="fz-modal__pie">
            <button className="btn btn-primary" disabled={Boolean(ocupado) || !borr.title.trim() || !borr.body.trim()}
              onClick={() => void guardarCampana(editando as Plantilla, 'active', borr, `Guardado y prendido: ${AVISOS_AUTO[editando as PlantillaAuto].nombre}.`)}>
              <Check size={17} /> {ocupado ? 'Guardando…' : campana(editando as Plantilla)?.status === 'active' ? 'Guardar' : 'Guardar y prender'}
            </button>
          </div>
        </Ventana>
      )}

      {editando === 'cumple' && (
        <Ventana titulo="Cumpleaños" cerrar={() => !ocupado && setEditando(null)}>
          <div className="fz-modal__cuerpo">
            <div className="fz-campo">
              <label className="field-label" htmlFor="fz-av-regalo">¿Qué le regalas?</label>
              <input id="fz-av-regalo" className="input" maxLength={120} autoFocus value={regalo} placeholder="Ej.: Perfilado de barba gratis" onChange={(e) => setRegalo(e.target.value)} />
            </div>
            <label className="field-label">Así le llega al cliente</label>
            <div className="fz-modal__vista">
              <b>🎂 ¡Feliz cumpleaños! · {negocio || 'tu negocio'}</b>
              <span>Hoy te toca: {(regalo.trim() || '…').replace(/[.!]+$/, '')}. Enseña tu tarjeta al llegar. ¡Te esperamos!</span>
            </div>
            <p className="fz-def">Sale a las 9:00 del día de su cumpleaños, una vez al año. En la Caja también se avisa a quien atiende.</p>
          </div>
          <div className="fz-modal__pie">
            <button className="btn btn-primary" disabled={Boolean(ocupado) || !regalo.trim()} onClick={() => void guardarRegalo(regalo.trim())}>
              <Check size={17} /> {ocupado ? 'Guardando…' : regaloActual ? 'Guardar' : 'Guardar y prender'}
            </button>
          </div>
        </Ventana>
      )}
    </>
  );
}

/** Una fila: nombre e interruptor, el mensaje tal cual le llega, y debajo los días y el resultado. */
function Fila({
  nombre, fijo, on, ocupado, editable, alternar, titulo, texto, cuando, pie, editar, dias,
}: {
  nombre: string;
  fijo?: boolean;
  on?: boolean;
  ocupado?: boolean;
  editable?: boolean;
  alternar?: () => void;
  titulo: string;
  texto: string;
  cuando?: string;
  pie?: string | null;
  editar?: () => void;
  dias?: React.ReactNode;
}) {
  const prendido = fijo || on;
  return (
    <li className={`fz-avisos__fila${prendido ? '' : ' fz-avisos__fila--off'}`}>
      <div className="fz-avisos__cab">
        <div>
          <b>{nombre}</b>
          {cuando && <small>{cuando}</small>}
        </div>
        {fijo ? (
          <span className="badge-pill b-new">Siempre</span>
        ) : (
          <button
            type="button"
            className={`toggle${on ? ' on' : ''}`}
            role="switch"
            aria-checked={Boolean(on)}
            aria-label={nombre}
            disabled={!editable || ocupado}
            onClick={alternar}
          />
        )}
      </div>
      <div className="fz-avisos__msg">
        <b>{titulo}</b>
        <span>{texto}</span>
      </div>
      {(dias || pie || editar) && (
        <div className="fz-avisos__pie">
          {dias}
          {pie && <small>{pie}</small>}
          {editar && (
            <button type="button" className="nc-link fz-avisos__editar" onClick={editar}>
              <Pencil size={13} /> Cambiar mensaje
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function Ventana({ titulo, cerrar, children }: { titulo: string; cerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-fondo" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar(); }}>
      <div className="modal fz-modal" role="dialog" aria-modal="true" aria-labelledby="fz-av-ventana">
        <div className="fz-modal__cab">
          <h3 id="fz-av-ventana">{titulo}</h3>
          <button type="button" className="q-icon" aria-label="Cerrar" onClick={cerrar}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
