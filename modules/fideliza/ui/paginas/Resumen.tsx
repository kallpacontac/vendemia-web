'use client';

/**
 * FIDELIZA · RESUMEN
 *
 * Solo cifras que salen de loyalty_metrics(). Sin metas inventadas, sin
 * flechas de tendencia que nadie ha calculado. Si no hay datos, se dice.
 */
import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { useFideliza } from '@/modules/fideliza/ui/Contexto';
import { Cargando, Fallo, Vacio } from '@/modules/fideliza/ui/Estados';
import { useCargar } from '@/components/panel/useCargar';
import { accion, lecturas } from '@/modules/fideliza/cliente/api';
import { urlNegocio } from '@/modules/fideliza/dominio/config';
import { fechaHora, soles, ESTADO_PLACA } from '@/modules/fideliza/dominio/formato';
import { DEFINICIONES, pct, type Metricas } from '@/modules/fideliza/dominio/metricas';

const hoyLima = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });
const haceDias = (n: number) => new Date(Date.now() - n * 86400000).toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });

const ESTADO_PROGRAMA: Record<string, [string, string]> = {
  draft: ['Borrador', 'b-mute'],
  active: ['Activo', 'b-new'],
  paused: ['Pausado', 'b-warm'],
  error: ['Con error', 'b-hot'],
};

function Cifra({ titulo, valor, def }: { titulo: string; valor: React.ReactNode; def: string }) {
  return (
    <div className="card">
      <div className="kpi__label">{titulo}</div>
      <div className="fz-num">{valor}</div>
      <p className="fz-def">{def}</p>
    </div>
  );
}

export default function Resumen() {
  const { companyId, ajustes, puede } = useFideliza();
  const [dias, setDias] = useState(30);

  const { datos, cargando, error, releer } = useCargar(async () => {
    if (!companyId) return null;
    const [programas, config, m] = await Promise.all([
      lecturas.programas(companyId),
      accion<{ servidor: boolean; wallet: boolean; push: boolean; cron: boolean }>('config.estado', {}),
      puede('metrics.read')
        ? accion<Metricas>('metricas', { companyId, from: haceDias(dias - 1), to: hoyLima() })
        : Promise.resolve(null),
    ]);
    const vivo = programas.find((p) => p.status === 'active' || p.status === 'paused') ?? programas[0] ?? null;
    const versiones = vivo?.current_version_id ? await lecturas.versiones(companyId, vivo.id) : [];
    return { programas, vivo, version: versiones[0] ?? null, config, m };
  }, [companyId, dias]);

  if (cargando && !datos) return <Cargando texto="Calculando el resumen…" />;
  if (error) return <Fallo texto={error} reintentar={releer} />;
  if (!datos) return null;
  const { vivo, version, config, m } = datos;

  const alertas: { texto: string; enlace?: string }[] = [];
  if (!config.servidor) alertas.push({ texto: 'Falta la clave del servidor de Fideliza: las páginas públicas y Wallet no funcionan (ver modules/fideliza/sql/README.md).' });
  if (!ajustes) alertas.push({ texto: 'Completa los datos del negocio (paso 1 del programa).', enlace: '/panel/fideliza/programa' });
  if (!vivo) alertas.push({ texto: 'Todavía no hay programa. Configúralo y publícalo.', enlace: '/panel/fideliza/programa' });
  if (vivo?.status === 'draft') alertas.push({ texto: 'El programa está en borrador: nadie puede unirse aún.', enlace: '/panel/fideliza/programa' });
  if (version?.valid_to && new Date(version.valid_to) < new Date())
    alertas.push({ texto: 'La regla del programa venció: las compras no suman. Publica una nueva.', enlace: '/panel/fideliza/programa' });
  if (!config.wallet) alertas.push({ texto: 'Google Wallet no está configurado en el servidor: las tarjetas solo funcionan como web.' });
  if (m?.wallet.classes.some((c) => c.state === 'error'))
    alertas.push({ texto: `La tarjeta de Google Wallet del programa dio error: ${m.wallet.classes.find((c) => c.state === 'error')?.last_error ?? ''}`, enlace: '/panel/fideliza/ajustes' });
  if (m && m.outbox.overdue > 0) alertas.push({ texto: `${m.outbox.overdue} actualizaciones de Wallet o avisos llevan más de 15 minutos en cola.`, enlace: '/panel/fideliza/ajustes' });
  if (m && m.outbox.dead > 0) alertas.push({ texto: `${m.outbox.dead} trabajos fallaron tras varios intentos y necesitan revisión.`, enlace: '/panel/fideliza/ajustes' });
  if (!config.cron) alertas.push({ texto: 'Falta el secreto del cron: los reintentos automáticos y las campañas no corren solos.' });

  const [estado, clase] = ESTADO_PROGRAMA[vivo?.status ?? 'draft'];
  const ops = m?.operations;
  const ventasNetas = ops ? ops.gross_cents - ops.refund_cents : 0;

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="fz-fila" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="kpi__label">Programa</div>
            <div className="fz-fila">
              <b style={{ fontSize: 18 }}>{vivo?.name ?? 'Sin programa'}</b>
              <span className={`badge-pill ${clase}`}>{estado}</span>
            </div>
          </div>
          <div className="fz-fila">
            {puede('ops.record') && (
              <Link className="btn btn-primary btn-sm" href="/panel/fideliza/caja">
                Registrar operación
              </Link>
            )}
            {puede('members.create') && (
              <Link className="btn btn-ghost btn-sm" href="/panel/fideliza/clientes?nuevo=1">
                Añadir cliente
              </Link>
            )}
            {puede('program.edit') && (
              <Link className="btn btn-ghost btn-sm" href="/panel/fideliza/programa">
                Configurar programa
              </Link>
            )}
            {puede('devices.manage') && (
              <Link className="btn btn-ghost btn-sm" href="/panel/fideliza/placas?nueva=1">
                Crear placa
              </Link>
            )}
            {ajustes && (
              <a className="btn btn-ghost btn-sm" href={urlNegocio(ajustes.slug)} target="_blank" rel="noopener noreferrer">
                Página pública <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>
      </div>

      {alertas.map((a) => (
        <div key={a.texto} className="fz-panel-aviso" role="status">
          <AlertTriangle size={16} />
          <span style={{ flex: 1 }}>{a.texto}</span>
          {a.enlace && (
            <Link className="btn btn-ghost btn-sm" href={a.enlace}>
              Ir
            </Link>
          )}
        </div>
      ))}

      {!m ? (
        <Vacio titulo="Las métricas son para propietario, gerente y analista">Tu usuario puede operar la caja.</Vacio>
      ) : (
        <>
          <div className="fz-fila" style={{ margin: '6px 0 14px', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 16 }}>Últimos {dias} días</h3>
            <div className="chip-tabs">
              {[7, 30, 90].map((n) => (
                <button key={n} className={dias === n ? 'active' : ''} onClick={() => setDias(n)}>
                  {n} días
                </button>
              ))}
            </div>
          </div>
          {m.members.total === 0 && (
            <Vacio titulo="Todavía no hay clientes en el programa">
              Cuando alguien cree su tarjeta (desde la placa, el QR o la caja), las cifras aparecerán aquí.
            </Vacio>
          )}
          <div className="fz-grid">
            <Cifra titulo="Miembros" valor={m.members.total.toLocaleString('es-PE')} def={DEFINICIONES.miembros} />
            <Cifra titulo="Nuevos en el periodo" valor={m.members.new} def={DEFINICIONES.nuevos} />
            <Cifra titulo="Activación" valor={pct(m.members.new_activated, m.members.new)} def={DEFINICIONES.activacion} />
            <Cifra
              titulo="Con al menos una operación"
              valor={m.members.with_operation}
              def="Miembros (de siempre) con alguna compra o visita registrada."
            />
            <Cifra titulo="Alta desde la página" valor={pct(m.funnel.joins, m.funnel.join_views)} def={DEFINICIONES.conversion} />
          </div>

          <h3 style={{ fontSize: 15, margin: '6px 0 10px' }}>Volvieron</h3>
          <div className="fz-grid">
            {(['30', '60', '90'] as const).map((n) => (
              <Cifra
                key={n}
                titulo={`A ${n} días`}
                valor={pct(m.repeat[n]?.repeated ?? 0, m.repeat[n]?.cohort ?? 0)}
                def={`${m.repeat[n]?.repeated ?? 0} de ${m.repeat[n]?.cohort ?? 0} en la cohorte madura. ${DEFINICIONES.repeticion}`}
              />
            ))}
            <Cifra titulo="Recuperados" valor={m.recovered} def={DEFINICIONES.recuperados} />
          </div>

          <h3 style={{ fontSize: 15, margin: '6px 0 10px' }}>Operaciones y premios</h3>
          <div className="fz-grid">
            <Cifra titulo="Compras" valor={ops!.purchases} def={DEFINICIONES.frecuenciaCompra + ` Frecuencia: ${ops!.purchase_members ? (ops!.purchases / ops!.purchase_members).toFixed(1) : '—'}.`} />
            <Cifra titulo="Visitas" valor={ops!.visits} def={DEFINICIONES.frecuenciaVisita + ` Frecuencia: ${ops!.visit_members ? (ops!.visits / ops!.visit_members).toFixed(1) : '—'}.`} />
            <Cifra titulo="Ticket medio" valor={ops!.purchases ? soles(Math.round(ventasNetas / ops!.purchases)) : '—'} def={DEFINICIONES.ticket} />
            <Cifra titulo="Unidades otorgadas" valor={ops!.units_granted.toLocaleString('es-PE')} def="Sellos, puntos o visitas sumados en el periodo (sin restar devoluciones)." />
            <Cifra titulo="Premios disponibles ahora" valor={m.rewards.available_now} def="Emitidos, sin canjear y sin vencer." />
            <Cifra titulo="Canjes" valor={m.rewards.redeemed} def={`Tasa de canje: ${pct(m.rewards.issued_redeemed, m.rewards.issued)}. ${DEFINICIONES.canje}`} />
            <Cifra titulo="Cobertura de ventas" valor="—" def={DEFINICIONES.cobertura} />
          </div>

          <h3 style={{ fontSize: 15, margin: '6px 0 10px' }}>Google Wallet y placas</h3>
          <div className="fz-grid">
            <Cifra
              titulo="Pases emitidos"
              valor={m.wallet.passes}
              def={`Al día: ${m.wallet.passes_by_state.synced ?? 0} · con error: ${m.wallet.passes_by_state.error ?? 0} · pendientes de actualizar: ${m.wallet.pending_updates}. Última sincronización: ${fechaHora(m.wallet.last_sync)}.`}
            />
            <Cifra titulo="Enlaces de guardado emitidos" valor={m.wallet.save_links_issued} def={DEFINICIONES.wallet} />
            <Cifra
              titulo="Placas activas"
              valor={m.devices.by_status.active ?? 0}
              def={Object.entries(m.devices.by_status).map(([k, v]) => `${ESTADO_PLACA[k] ?? k}: ${v}`).join(' · ') || 'Sin placas.'}
            />
            <Cifra
              titulo="Aperturas de placas"
              valor={(m.devices.opens_by_source.nfc ?? 0) + (m.devices.opens_by_source.qr ?? 0)}
              def={`NFC/directo: ${m.devices.opens_by_source.nfc ?? 0} · QR: ${m.devices.opens_by_source.qr ?? 0} · sin destino: ${m.devices.unavailable_opens}. ${DEFINICIONES.aperturas}`}
            />
          </div>
        </>
      )}
    </>
  );
}
