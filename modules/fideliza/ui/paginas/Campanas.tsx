'use client';

/**
 * FIDELIZA · CAMPAÑAS — cuatro plantillas, ningún constructor libre.
 *
 * Solo por avisos push, solo a quien los aceptó, de 09:00 a 20:00 (Lima) y con
 * un tope por persona. Una compra nueva cancela los recordatorios en cola; una
 * baja también. «Aceptado» es lo que dice el servicio de push del navegador:
 * no es «entregado» ni «leído», y aquí no se llama así.
 */
import { useState } from 'react';
import { useFideliza } from '@/modules/fideliza/ui/Contexto';
import { Cargando, Fallo } from '@/modules/fideliza/ui/Estados';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { accion, lecturas, mensaje, type Campana } from '@/modules/fideliza/cliente/api';
import { DEFINICIONES, type Metricas } from '@/modules/fideliza/dominio/metricas';

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
  }

  async function guardar(status: Campana['status']) {
    if (!abierta || !borr) return;
    try {
      await accion('campana.guardar', { companyId, template: abierta, status, ...borr });
      avisar(status === 'active' ? 'Campaña activa' : status === 'paused' ? 'Campaña pausada' : 'Guardada como borrador');
      releer();
    } catch (e) {
      avisar(mensaje(e), 'error');
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

  return (
    <>
      {!datos.config.push && (
        <div className="fz-panel-aviso fz-panel-aviso--error">
          Avisos push: <b>No configurado</b> (faltan las claves VAPID en el servidor). Las campañas se pueden preparar, pero no se enviará nada.
        </div>
      )}
      <div className="fz-panel-aviso fz-panel-aviso--info">
        Se envían solo a quien activó los avisos en su tarjeta, entre 09:00 y 20:00, como máximo {borr?.config.max_per_30d ?? 2} por persona cada 30 días. {DEFINICIONES.campanas}
      </div>

      <div className="fz-grid">
        {PLANTILLAS.map((p) => {
          const c = datos.campanas.find((x) => x.template === p.t);
          const etapas = datos.m?.campaigns[p.t] ?? null;
          return (
            <div key={p.t} className="card">
              <div className="fz-fila" style={{ justifyContent: 'space-between' }}>
                <b>{p.nombre}</b>
                <span className={`badge-pill ${c?.status === 'active' ? 'b-new' : c?.status === 'paused' ? 'b-warm' : 'b-mute'}`}>
                  {c?.status === 'active' ? 'Activa' : c?.status === 'paused' ? 'Pausada' : c ? 'Borrador' : 'Sin configurar'}
                </span>
              </div>
              <p className="fz-def">{p.cuando}</p>
              {etapas && (
                <p className="fz-def">
                  Últimos 30 días: {Object.entries(etapas).map(([k, v]) => `${ETAPA[k] ?? k} ${v}`).join(' · ')}
                </p>
              )}
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => abrir(p.t)}>
                {editable ? 'Configurar' : 'Ver'}
              </button>
            </div>
          );
        })}
      </div>

      {abierta && borr && (
        <div className="card" style={{ maxWidth: 640 }}>
          <h3 style={{ fontSize: 16, marginBottom: 10 }}>{PLANTILLAS.find((p) => p.t === abierta)!.nombre}</h3>
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
              <input className="input" type="number" min={7} max={180} value={borr.config.cycle_days} disabled={!editable} onChange={(e) => setBorr({ ...borr, config: { ...borr.config, cycle_days: Number(e.target.value) } })} />
            </div>
          )}
          {abierta === 'winback' && (
            <div className="fz-campo">
              <label className="field-label">Días sin venir para considerarlo inactivo (14–365)</label>
              <input className="input" type="number" min={14} max={365} value={borr.config.inactive_days} disabled={!editable} onChange={(e) => setBorr({ ...borr, config: { ...borr.config, inactive_days: Number(e.target.value) } })} />
            </div>
          )}
          <div className="fz-campo">
            <label className="field-label">Máximo de mensajes por persona cada 30 días (1–4)</label>
            <input className="input" type="number" min={1} max={4} value={borr.config.max_per_30d} disabled={!editable} onChange={(e) => setBorr({ ...borr, config: { ...borr.config, max_per_30d: Number(e.target.value) } })} />
          </div>

          <label className="field-label">Vista previa</label>
          <div className="card" style={{ boxShadow: 'none', border: '1.5px solid var(--line)', maxWidth: 360, padding: 12 }}>
            <b style={{ fontSize: 14 }}>{borr.title}</b>
            <p style={{ fontSize: 13 }}>{borr.body}</p>
          </div>

          <div className="fz-fila" style={{ marginTop: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => void estimar()}>
              Estimar audiencia
            </button>
            {audiencia && (
              <span className="muted" style={{ fontSize: 13 }}>
                Cumplen el criterio hoy: {audiencia.matching} · con avisos activados: <b>{audiencia.reachable}</b>
              </span>
            )}
          </div>
          {editable && (
            <div className="fz-fila" style={{ marginTop: 14 }}>
              <button className="btn btn-primary btn-sm" onClick={() => void guardar('active')}>
                Activar
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => void guardar('paused')}>
                Pausar
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => void guardar('draft')}>
                Guardar borrador
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
