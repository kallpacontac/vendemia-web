'use client';
/**
 * ══════════════════════════════════════════════════════════════════════════
 * BOLETAS Y FACTURAS · /panel/comprobantes
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Una pantalla: emitir, ver lo del día, imprimir, consultar, reintentar y
 * anular. Está dentro de Caja (SubnavCaja); su configuración, en Ajustes › Boletas y facturas (SeccionFacturacion).
 *
 * Se puede abrir con algo ya escrito, para enlazarlo desde la Caja o Pedidos:
 *   /panel/comprobantes?nuevo=boleta&concepto=Corte&monto=35&ref=cita:abc123
 */
import { useEffect, useState } from 'react';
import { FilePlus2, MessageCircle, Printer, RefreshCw, Settings, Ban, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import SubnavCaja from '@/components/panel/SubnavCaja';
import Topbar from '@/components/panel/Topbar';
import { useSesion } from '@/components/panel/Sesion';
import { useCargar } from '@/components/panel/useCargar';
import { useAvisar } from '@/components/panel/Avisos';
import { isoLocal } from '@/lib/panel/format';
import { esAppointmentFamily } from '@/lib/panel/modo';
import { INFO_PROVEEDOR } from '../dominio/proveedoresInfo';
import { NOMBRE_DOC_CLIENTE } from '../dominio/catalogos';
import type { ComprobanteGuardado, TipoComprobante } from '../dominio/tipos';
import { actuar, imprimir, leerAjustes, leerComprobantes, SinTablas, soles2, textoWhatsApp } from './api';
import NuevoComprobante, { type Prellenado } from './NuevoComprobante';
import { EstadoPill } from './EstadoPill';
import '../estilos/facturacion.css';

const PERIODOS = [
  ['hoy', 'Hoy'],
  ['ayer', 'Ayer'],
  ['7', '7 días'],
  ['30', '30 días'],
] as const;
type Periodo = (typeof PERIODOS)[number][0];

function rango(p: Periodo): [string, string] {
  const hoy = new Date();
  const menos = (d: number) => isoLocal(new Date(hoy.getTime() - d * 86_400_000));
  if (p === 'hoy') return [menos(0), menos(0)];
  if (p === 'ayer') return [menos(1), menos(1)];
  return [menos(Number(p) - 1), menos(0)];
}

function prellenadoDeLaUrl(): Prellenado | null {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  const nuevo = q.get('nuevo');
  if (nuevo !== 'boleta' && nuevo !== 'factura') return null;
  const monto = Number(q.get('monto'));
  const [refTipo, refId] = (q.get('ref') ?? '').split(':');
  return {
    tipo: nuevo,
    concepto: (q.get('concepto') ?? '').slice(0, 250),
    monto: monto > 0 ? monto : undefined,
    ref: refTipo && refId ? { tipo: refTipo.slice(0, 20), id: refId.slice(0, 80) } : undefined,
  };
}

export default function PanelComprobantes() {
  const { companyId, compania } = useSesion();
  const avisar = useAvisar();
  const [periodo, setPeriodo] = useState<Periodo>('hoy');
  const [nuevo, setNuevo] = useState<Prellenado | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargaAjustes = useCargar(async () => {
    if (!companyId) return null;
    try {
      return await leerAjustes(companyId);
    } catch (e) {
      if (e instanceof SinTablas) return 'sin_tablas' as const;
      throw e;
    }
  }, [companyId]);

  const [desde, hasta] = rango(periodo);
  const lista = useCargar(async () => {
    if (!companyId) return [];
    return leerComprobantes(companyId, desde, hasta).catch(() => [] as ComprobanteGuardado[]);
  }, [companyId, desde, hasta]);

  const ajustes = cargaAjustes.datos && cargaAjustes.datos !== 'sin_tablas' ? cargaAjustes.datos : null;

  // Abrir el formulario si se llegó desde otra pantalla con ?nuevo=…
  useEffect(() => {
    if (ajustes?.activo && !nuevo) {
      const p = prellenadoDeLaUrl();
      if (p) {
        setNuevo(p);
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ajustes?.activo]);

  const unidad = esAppointmentFamily(compania?.business_mode) ? 'ZZ' : 'NIU';

  async function hacer(c: ComprobanteGuardado, accion: 'consultar' | 'reintentar' | 'anular') {
    if (!companyId) return;
    let motivo: string | undefined;
    if (accion === 'anular') {
      const r = window.prompt(
        `¿Por qué se anula ${c.serie}-${c.numero}? (por ejemplo: error en el monto, venta devuelta)`,
        'Error en la emisión',
      );
      if (!r || r.trim().length < 3) return;
      motivo = r.trim();
    }
    setOcupado(c.id);
    try {
      const nuevoEstado = await actuar(accion, companyId, c.id, motivo);
      avisar(nuevoEstado.mensaje || 'Listo.', nuevoEstado.estado === 'error' || nuevoEstado.estado === 'rechazado' ? 'error' : 'ok');
      lista.recargar();
    } catch (e) {
      avisar((e as Error).message, 'error');
    } finally {
      setOcupado(null);
    }
  }

  async function imprimirUno(c: ComprobanteGuardado) {
    try {
      await imprimir(c, ajustes?.ticket_ancho ?? 80);
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  }

  const sub = 'Emite, imprime y anula. Cada comprobante se envía a SUNAT al momento.';

  if (cargaAjustes.datos === 'sin_tablas') {
    return (
      <main className="main">
        <div className="wrap">
          <Topbar titulo="Boletas y facturas" sub={sub} />
          <p className="vacio">
            Falta preparar la base de datos para los comprobantes (modules/facturacion/sql/0001_facturacion.sql).
          </p>
        </div>
      </main>
    );
  }

  if (cargaAjustes.error && !ajustes) {
    // Casi siempre: un empleado (Postgres solo deja al dueño y al administrador).
    return (
      <main className="main">
        <div className="wrap">
          <Topbar titulo="Boletas y facturas" sub={sub} />
          <p className="vacio">{cargaAjustes.error}</p>
        </div>
      </main>
    );
  }

  const totalAceptado = (lista.datos ?? [])
    .filter((c) => c.estado === 'aceptado')
    .reduce((s, c) => s + c.totales.total, 0);
  const porRevisar = (lista.datos ?? []).filter((c) => ['pendiente', 'error', 'por_enviar', 'anulando'].includes(c.estado)).length;

  const abrir = (tipo: TipoComprobante) => setNuevo({ tipo });

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Caja" sub={sub} />
        <SubnavCaja />

        {ajustes && (
          <div className="fe-barra">
            <button className="btn btn-primary" onClick={() => abrir('boleta')} disabled={!ajustes.activo}>
              <FilePlus2 size={16} /> Nueva boleta
            </button>
            <button className="btn btn-ghost" onClick={() => abrir('factura')} disabled={!ajustes.activo}>
              <FilePlus2 size={16} /> Nueva factura
            </button>
            <span className="fe-barra__info muted">
              {ajustes.activo ? (
                <>
                  {INFO_PROVEEDOR[ajustes.proveedor]?.nombre}
                  {' · '}
                  {ajustes.ambiente === 'produccion' && ajustes.proveedor !== 'simulado' ? 'Producción' : 'Pruebas'}
                </>
              ) : (
                'Apagado: actívalo en Ajustes › Boletas y facturas'
              )}
            </span>
            {/* La configuración (proveedor, token, series) vive en Ajustes; aquí solo se emite. */}
            <Link className="btn btn-ghost btn-sm" href="/panel/configuracion#facturacion">
              <Settings size={14} /> Configurar
            </Link>
          </div>
        )}

        <div className="filters" style={{ margin: '16px 0 12px' }}>
          {PERIODOS.map(([k, txt]) => (
            <div key={k} className={`fpill ${periodo === k ? 'active' : ''}`} onClick={() => setPeriodo(k)}>
              {txt}
            </div>
          ))}
          <span className="muted fe-resumen">
            {soles2(totalAceptado)} aceptado{porRevisar ? ` · ${porRevisar} por revisar` : ''}
          </span>
        </div>

        <div className="card fe-lista">
          {lista.cargando && !lista.datos ? (
            <p className="cargando">Cargando…</p>
          ) : !lista.datos?.length ? (
            <p className="vacio">No hay comprobantes en este periodo.</p>
          ) : (
            <ul>
              {lista.datos.map((c) => {
                const cliente =
                  c.cliente.tipoDoc === 'sin_documento'
                    ? 'Clientes varios'
                    : `${c.cliente.nombre} · ${NOMBRE_DOC_CLIENTE[c.cliente.tipoDoc]} ${c.cliente.numDoc}`;
                const enCurso = ocupado === c.id;
                return (
                  <li key={c.id} className="fe-item">
                    <div className="fe-item__dato">
                      <b>
                        {c.serie}-{c.numero}
                      </b>{' '}
                      <EstadoPill estado={c.estado} />
                      {(c.ambiente !== 'produccion' || c.proveedor === 'simulado') && <span className="badge-pill fe-prueba">Prueba</span>}
                      <small className="muted">
                        {c.fecha.split('-').reverse().join('/')} {c.hora.slice(0, 5)} · {cliente}
                      </small>
                      {c.mensaje && c.estado !== 'aceptado' && <small className="fe-item__msg">{c.mensaje}</small>}
                      {c.observaciones.length > 0 && <small className="fe-item__msg">SUNAT observó: {c.observaciones.join(' · ')}</small>}
                    </div>
                    <div className="fe-item__monto">{soles2(c.totales.total)}</div>
                    <div className="fe-item__acciones">
                      {['aceptado', 'anulado', 'anulando', 'pendiente'].includes(c.estado) && (
                        <button className="btn btn-ghost btn-sm" onClick={() => imprimirUno(c)} title="Imprimir">
                          <Printer size={14} />
                        </button>
                      )}
                      {c.estado === 'aceptado' && (
                        <a
                          className="btn btn-ghost btn-sm"
                          href={`https://wa.me/?text=${encodeURIComponent(textoWhatsApp(c))}`}
                          target="_blank"
                          rel="noopener"
                          title="Enviar por WhatsApp"
                        >
                          <MessageCircle size={14} />
                        </a>
                      )}
                      {c.pdfUrl && (
                        <a className="btn btn-ghost btn-sm" href={c.pdfUrl} target="_blank" rel="noopener" title="PDF del proveedor">
                          <ExternalLink size={14} />
                        </a>
                      )}
                      {(c.estado === 'pendiente' || c.estado === 'anulando') && (
                        <button className="btn btn-ghost btn-sm" onClick={() => hacer(c, 'consultar')} disabled={enCurso}>
                          <RefreshCw size={14} /> Consultar
                        </button>
                      )}
                      {(c.estado === 'error' || c.estado === 'por_enviar') && (
                        <button className="btn btn-ghost btn-sm" onClick={() => hacer(c, 'reintentar')} disabled={enCurso}>
                          <RefreshCw size={14} /> Reintentar
                        </button>
                      )}
                      {c.estado === 'aceptado' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => hacer(c, 'anular')} disabled={enCurso} title="Anular">
                          <Ban size={14} />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {nuevo && ajustes && companyId && (
        <NuevoComprobante
          companyId={companyId}
          ajustes={ajustes}
          unidad={unidad}
          prellenado={nuevo}
          alCerrar={() => setNuevo(null)}
          alEmitir={() => lista.recargar()}
        />
      )}
    </main>
  );
}
