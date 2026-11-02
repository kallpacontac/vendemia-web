'use client';

/**
 * FIDELIZA · NÚMEROS — el dashboard del club, en su propia pestaña: «Tus
 * números» (ui/Numeros.tsx) y, debajo, las cifras de detalle con su definición.
 * Inicio queda para lo operativo: tu link, tu programa y lo que hay que atender.
 */
import { useState } from 'react';
import { useFideliza } from '@/modules/fideliza/ui/Contexto';
import { Cargando, Cifra, Fallo, SinPermiso, Vacio } from '@/modules/fideliza/ui/Estados';
import Numeros from '@/modules/fideliza/ui/Numeros';
import { useCargar } from '@/components/panel/useCargar';
import { accion } from '@/modules/fideliza/cliente/api';
import { fechaHora, soles, ESTADO_PLACA } from '@/modules/fideliza/dominio/formato';
import { DEFINICIONES, pct, type Metricas } from '@/modules/fideliza/dominio/metricas';

const hoyLima = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });
const haceDias = (n: number) => new Date(Date.now() - n * 86400000).toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });

export default function PaginaNumeros() {
  const { companyId, puede } = useFideliza();
  const [dias, setDias] = useState(30);
  const permitido = puede('metrics.read');
  const { datos: m, cargando, error, releer } = useCargar(async () => {
    if (!companyId || !permitido) return null;
    return accion<Metricas>('metricas', { companyId, from: haceDias(dias - 1), to: hoyLima() });
  }, [companyId, dias, permitido]);

  if (!permitido) return <SinPermiso que="los números" />;
  if (!companyId) return <Cargando />;
  const ops = m?.operations;
  const ventasNetas = ops ? ops.gross_cents - ops.refund_cents : 0;

  return (
    <>
      <Numeros companyId={companyId} />
      {cargando && !m && <Cargando texto="Calculando las cifras…" />}
      {error && <Fallo texto={error} reintentar={releer} />}
      {m && (
        <>
          <div className="fz-fila" style={{ margin: '6px 0 14px', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 16 }}>Más cifras · últimos {dias} días</h3>
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
