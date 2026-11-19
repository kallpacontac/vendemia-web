'use client';

/**
 * FIDELIZA · CAMPAÑAS — cuatro plantillas, ningún constructor libre.
 *
 * Solo por avisos push, solo a quien los aceptó, de 09:00 a 20:00 (Lima) y con
 * un tope por persona. Una compra nueva cancela los recordatorios en cola; una
 * baja también. «Aceptado» es lo que dice el servicio de push del navegador:
 * no es «entregado» ni «leído», y aquí no se llama así.
 *
 * 18-nov-2026 (The 24/7: «no sé si se guardó el personalizado; al configurar "Te extrañamos"
 * tengo que bajar: mejor un pop up y que diga que se creó con éxito»): «Configurar» abre una
 * VENTANA con los botones grandes abajo; el alcance se calcula solo; al guardar se cierra con un
 * aviso claro, y la tarjeta enseña el título y el texto guardados (así se ve que quedó el tuyo).
 */
import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useFideliza } from '@/modules/fideliza/ui/Contexto';
import { Cargando, Fallo } from '@/modules/fideliza/ui/Estados';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { accion, lecturas, mensaje, type Campana } from '@/modules/fideliza/cliente/api';
import { DEFINICIONES, type Metricas } from '@/modules/fideliza/dominio/metricas';
import MisAvisos from '@/modules/fideliza/ui/paginas/MisAvisos';

type Plantilla = Campana['template'];
const PLANTILLAS: { t: Plantilla; nombre: string; cuando: string; titulo: string; texto: string }[] = [
  { t: 'welcome', nombre: 'Bienvenida', cuando: 'Una vez, cuando alguien activa los avisos en su tarjeta.', titulo: '¡Bienvenido al club!', texto: 'Ya tienes tu tarjeta. Cada visita cuenta para tu premio.' },
  { t: 'reward_available', nombre: 'Premio disponible', cuando: 'Cuando alguien consigue un premio.', titulo: '¡Tienes un premio!', texto: 'Ya puedes canjearlo en tu próxima visita.' },
  { t: 'return_reminder', nombre: 'Recordatorio de regreso', cuando: 'Cuando pasan los días habituales entre visitas (los pones tú).', titulo: '¿Te toca volver?', texto: 'Te esperamos. Sigue sumando para tu premio.' },
  { t: 'winback', nombre: 'Recuperar inactivos', cuando: 'Cuando alguien lleva muchos días sin venir. Máximo una vez cada 90 días.', titulo: 'Te extrañamos', texto: 'Vuelve cuando quieras: tu tarjeta sigue aquí.' },
];
const ETAPA: Record<string, string> = {
  eligible: 'Elegibles',
  attempted: 'Intentados',
  provider_accepted: 'Aceptados por el navegador',
  observed_click: 'Clics',
  validated_purchase_after: 'Compra después',
  unsubscribed: 'Bajas',
  skipped: 'Omitidos',
};

const haceDias = (n: number) => new Date(Date.now() - n * 86400000).toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });

export default function Campanas() {
  const { companyId, puede } = useFideliza();
  const avisar = useAvisar();
  const [abierta, setAbierta] = useState<Plantilla | null>(null);
  const [borr, setBorr] = useState<{ title: string; body: string; config: Record<string, number> } | null>(null);
  const [audiencia, setAudiencia] = useState<{ matching: number; reachable: number } | null>(null);

  const { datos, cargando, error, releer } = useCargar(async () => {
    if (!companyId) return null;
    const [campanas, config, m] = await Promise.all([
      lecturas.campanas(companyId),
      accion<{ push: boolean }>('config.estado', {}),
      puede('metrics.read') ? accion<Metricas>('metricas', { companyId, from: haceDias(29), to: haceDias(0) }) : Promise.resolve(null),
    ]);
    return { campanas, config, m };
  }, [companyId]);

  // Los hooks, antes de los return de abajo (siempre en el mismo orden).
  const [guardando, setGuardando] = useState(false);
  /** La tarjeta recién guardada, resaltada un momento. */
  const [recien, setRecien] = useState<Plantilla | null>(null);
  useEffect(() => {
    if (!recien) return;
    const t = window.setTimeout(() => setRecien(null), 2600);
    return () => window.clearTimeout(t);
  }, [recien]);
  // Escape cierra la ventana.
  useEffect(() => {
    if (!abierta) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierta(null);
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [abierta]);

  if (cargando && !datos) return <Cargando texto="Cargando campañas…" />;
  if (error) return <Fallo texto={error} reintentar={releer} />;
  if (!datos) return null;
  const editable = puede('campaigns.manage');

  function abrir(t: Plantilla) {
    const c = datos!.campanas.find((x) => x.template === t);
    const p = PLANTILLAS.find((x) => x.t === t)!;
    setAbierta(t);
    setAudiencia(null);
    setBorr({
      title: c?.title ?? p.titulo,
      body: c?.body ?? p.texto,
      config: { inactive_days: 60, cycle_days: 30, max_per_30d: 2, ...(c?.config ?? {}) },
    });
    // A cuántos llegaría, sin tener que pedirlo.
    void accion<{ matching: number; reachable: number }>('campana.audiencia', {
      companyId, template: t, config: { inactive_days: 60, cycle_days: 30, max_per_30d: 2, ...(c?.config ?? {}) },
    }).then(setAudiencia).catch(() => undefined);
  }

  async function guardar(status: Campana['status']) {
    if (!abierta || !borr || guardando) return;
    setGuardando(true);
    try {
      await accion('campana.guardar', { companyId, template: abierta, status, ...borr });
      const nombre = PLANTILLAS.find((p) => p.t === abierta)!.nombre;
      avisar(
        status === 'active'
          ? `✓ «${nombre}» guardada y ACTIVA: se enviará sola, con tu texto.`
          : status === 'paused'
            ? `✓ «${nombre}» guardada y en pausa: no se envía hasta que la actives.`
            : `✓ «${nombre}» guardada como borrador.`,
        'ok',
      );
      setRecien(abierta);
      setAbierta(null);
      releer();
    } catch (e) {
      avisar(mensaje(e), 'error');
    } finally {
      setGuardando(false);
    }
  }


  async function estimar() {
    if (!abierta || !borr) return;
    try {
      setAudiencia(await accion('campana.audiencia', { companyId, template: abierta, config: borr.config }));
    } catch (e) {
      avisar(mensaje(e), 'error');
    }
  }

  const etapas = (t: string) => {
    const e = datos.m?.campaigns[t];
    return e ? Object.entries(e).map(([k, v]) => `${ETAPA[k] ?? k} ${v}`).join(' · ') : null;
  };

  return (
    <>
      {!datos.config.push && (
        <div className="fz-panel-aviso fz-panel-aviso--error">
          Avisos push: <b>No configurado</b> (faltan las claves VAPID en el servidor). Las campañas se pueden preparar, pero no se enviará nada.
        </div>
      )}
      {/* Los límites, a la vista antes de nada (19-nov, The 24/7: «indicar los límites… para que el
          cliente no se sature y desinstale»). Los del sistema los impone Postgres (fideliza 0014). */}
      <div className="card fz-limites">
        <h3>Para no cansar a tus clientes</h3>
        <div className="fz-limites__dos">
          <div>
            <small>Lo pone el sistema</small>
            <ul>
              <li>Solo llega a quien <b>activó los avisos</b> en su tarjeta.</li>
              <li>Solo de <b>09:00 a 20:00</b>: lo de fuera de hora sale a las 09:00.</li>
              <li>Máximo <b>4 avisos por persona cada 30 días</b>, sumando automáticos y tuyos. Pasado el tope, a ese cliente no le llega.</li>
              <li>«Te extrañamos», como mucho <b>una vez cada 90 días</b> por persona.</li>
            </ul>
          </div>
          <div>
            <small>Te recomendamos</small>
            <ul>
              <li>No más de <b>1 aviso tuyo por semana</b>.</li>
              <li>No repetir el mismo aviso antes de <b>7 días</b> (te lo avisamos).</li>
              <li>Mensajes cortos y con algo concreto: una promo, un día, un premio.</li>
              <li>Quien recibe demasiados <b>desactiva los avisos o borra la tarjeta</b>, y ya no le llega nada.</li>
            </ul>
          </div>
        </div>
        <p className="fz-def" style={{ margin: 0 }}>{DEFINICIONES.campanas}</p>
      </div>

      <div className="fz-seccion">
        <h3>Automáticos <span className="muted">· ya vienen hechos, salen solos</span></h3>
      </div>

      <div className="fz-grid">
        {PLANTILLAS.map((p) => {
          const c = datos.campanas.find((x) => x.template === p.t);
          const resumen = etapas(p.t);
          return (
            <div key={p.t} className={`card fz-campana${recien === p.t ? ' fz-campana--recien' : ''}`}>
              <div className="fz-fila" style={{ justifyContent: 'space-between' }}>
                <b>{p.nombre}</b>
                <span className={`badge-pill ${c?.status === 'active' ? 'b-new' : c?.status === 'paused' ? 'b-warm' : 'b-mute'}`}>
                  {c?.status === 'active' ? 'Activa' : c?.status === 'paused' ? 'Pausada' : c ? 'Borrador' : 'Sin configurar'}
                </span>
              </div>
              <p className="fz-def">{p.cuando}</p>
              {/* Lo que tiene guardado: se ve que quedó el texto propio. */}
              {c && (
                <div className="fz-campana__guardado">
                  <small>{c.title !== p.titulo || c.body !== p.texto ? 'Tu mensaje' : 'Mensaje'}</small>
                  <b>{c.title}</b>
                  <span>{c.body}</span>
                </div>
              )}
              {resumen && <p className="fz-def">Últimos 30 días: {resumen}</p>}
              <button className={`btn ${c ? 'btn-ghost' : 'btn-primary'} fz-campana__boton`} onClick={() => abrir(p.t)}>
                {editable ? (c ? 'Editar' : 'Configurar') : 'Ver'}
              </button>
            </div>
          );
        })}
      </div>

      {editable && companyId && <MisAvisos companyId={companyId} push={datos.config.push} resumen={etapas('manual')} alEnviar={releer} />}

      {abierta && borr && (
        <div className="modal-fondo" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) setAbierta(null); }}>
          <div className="modal fz-modal" role="dialog" aria-modal="true" aria-labelledby="fz-modal-titulo">
            <div className="fz-modal__cab">
              <h3 id="fz-modal-titulo">{PLANTILLAS.find((p) => p.t === abierta)!.nombre}</h3>
              <button type="button" className="q-icon" aria-label="Cerrar" onClick={() => setAbierta(null)} disabled={guardando}>
                <X size={18} />
              </button>
            </div>
            <div className="fz-modal__cuerpo">
              <p className="fz-def" style={{ marginTop: 0 }}>{PLANTILLAS.find((p) => p.t === abierta)!.cuando}</p>
              <div className="fz-campo">
                <label className="field-label">Título (máx. 60)</label>
                <input className="input" maxLength={60} value={borr.title} disabled={!editable} onChange={(e) => setBorr({ ...borr, title: e.target.value })} />
              </div>
              <div className="fz-campo">
                <label className="field-label">Texto (máx. 160)</label>
                <textarea className="textarea" maxLength={160} value={borr.body} disabled={!editable} onChange={(e) => setBorr({ ...borr, body: e.target.value })} />
              </div>
              {abierta === 'return_reminder' && (
                <div className="fz-campo">
                  <label className="field-label">Días habituales entre visitas (7–180)</label>
                  <input className="input" type="number" inputMode="numeric" min={7} max={180} value={borr.config.cycle_days} disabled={!editable} onChange={(e) => setBorr({ ...borr, config: { ...borr.config, cycle_days: Number(e.target.value) } })} />
                </div>
              )}
              {abierta === 'winback' && (
                <div className="fz-campo">
                  <label className="field-label">Días sin venir para considerarlo inactivo (14–365)</label>
                  <input className="input" type="number" inputMode="numeric" min={14} max={365} value={borr.config.inactive_days} disabled={!editable} onChange={(e) => setBorr({ ...borr, config: { ...borr.config, inactive_days: Number(e.target.value) } })} />
                </div>
              )}
              <div className="fz-campo">
                <label className="field-label">Máximo de mensajes por persona cada 30 días (1–4)</label>
                <input className="input" type="number" inputMode="numeric" min={1} max={4} value={borr.config.max_per_30d} disabled={!editable} onChange={(e) => setBorr({ ...borr, config: { ...borr.config, max_per_30d: Number(e.target.value) } })} />
              </div>

              <label className="field-label">Así le llega al cliente</label>
              <div className="fz-modal__vista">
                <b>{borr.title || 'Título'}</b>
                <span>{borr.body || 'Texto del aviso'}</span>
              </div>
              <p className="fz-modal__alcance">
                {audiencia
                  ? <>Hoy cumplen el criterio <b>{audiencia.matching}</b>; con avisos activados: <b>{audiencia.reachable}</b>.{' '}
                      <button type="button" className="nc-link" onClick={() => void estimar()}>Recalcular</button></>
                  : 'Calculando a cuántos llegaría…'}
              </p>
            </div>
            {editable ? (
              <div className="fz-modal__pie">
                <button className="btn btn-primary" disabled={guardando} onClick={() => void guardar('active')}>
                  <Check size={17} /> {guardando ? 'Guardando…' : 'Guardar y activar'}
                </button>
                <div className="fz-modal__pie-dos">
                  <button className="btn btn-ghost" disabled={guardando} onClick={() => void guardar('paused')}>Guardar en pausa</button>
                  <button className="btn btn-ghost" disabled={guardando} onClick={() => void guardar('draft')}>Borrador</button>
                </div>
              </div>
            ) : (
              <div className="fz-modal__pie">
                <button className="btn btn-ghost" onClick={() => setAbierta(null)}>Cerrar</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
