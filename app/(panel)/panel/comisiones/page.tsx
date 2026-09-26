'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * COMISIONES · cuánto le toca a cada profesional
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Lo que un salón cuadra a mano en Excel cada quincena. El cálculo vive en
 * lib/panel/comisiones.ts —aquí solo se pinta— y las tarifas se ponen en
 * Equipo (la del profesional) y en el Catálogo (la de un servicio, que gana).
 *
 * Tres cosas que esta pantalla TIENE que decir, porque si no se reportan como
 * fallos:
 *
 *   1. La comisión es menor que los ingresos del mismo periodo, siempre: solo
 *      cuentan las citas COMPLETADAS, y los ingresos cuentan también las
 *      confirmadas que aún no han ocurrido.
 *   2. Cuántas citas pasadas siguen sin marcar y cuánto suman. Con
 *      `asumir_asistencia` apagado (el defecto) nadie las da por atendidas
 *      solas, así que un salón recién empezado ve comisiones en cero hasta
 *      que marca «Vino» en la Agenda.
 *   3. Los dos límites: una cita, un profesional; y la venta de producto no
 *      genera comisión.
 *
 * Solo para negocios de citas: son los que tienen profesionales que atienden.
 */
import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, ChevronUp, Download, Percent, Scissors, Wallet } from 'lucide-react';
import Topbar from '@/components/panel/Topbar';
import { useSesion } from '@/components/panel/Sesion';
import { useCargar } from '@/components/panel/useCargar';
import { diaMes, isoLocal, soles } from '@/lib/panel/format';
import { esCita } from '@/lib/panel/modo';
import { calcularComisiones, type Regla } from '@/lib/panel/comisiones';
import {
  getCatalogo,
  getCitasDelPeriodo,
  getServiciosDeCitas,
  getTrabajadores,
} from '@/lib/supabase/queries';

type Periodo = 'quincena' | 'quincena-anterior' | 'mes' | 'mes-anterior';

const PERIODOS: [Periodo, string][] = [
  ['quincena', 'Esta quincena'],
  ['quincena-anterior', 'Quincena anterior'],
  ['mes', 'Este mes'],
  ['mes-anterior', 'Mes anterior'],
];

/**
 * Quincenas del 1 al 15 y del 16 a fin de mes, que es como se paga en Perú.
 * Fechas locales ('YYYY-MM-DD'): el bot guarda `slot_start` en hora de Lima.
 */
function rango(p: Periodo, hoy = new Date()): { desde: string; hasta: string } {
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  const finDe = (yy: number, mm: number) => new Date(yy, mm + 1, 0);
  if (p === 'mes') return { desde: isoLocal(new Date(y, m, 1)), hasta: isoLocal(finDe(y, m)) };
  if (p === 'mes-anterior') return { desde: isoLocal(new Date(y, m - 1, 1)), hasta: isoLocal(finDe(y, m - 1)) };
  const primera = hoy.getDate() <= 15;
  if (p === 'quincena') {
    return primera
      ? { desde: isoLocal(new Date(y, m, 1)), hasta: isoLocal(new Date(y, m, 15)) }
      : { desde: isoLocal(new Date(y, m, 16)), hasta: isoLocal(finDe(y, m)) };
  }
  // quincena anterior
  return primera
    ? { desde: isoLocal(new Date(y, m - 1, 16)), hasta: isoLocal(finDe(y, m - 1)) }
    : { desde: isoLocal(new Date(y, m, 1)), hasta: isoLocal(new Date(y, m, 15)) };
}

const REGLA: Record<Regla, string> = {
  fija: 'fija del servicio',
  servicio: '% del servicio',
  profesional: '% del profesional',
  sin: 'sin tarifa',
};

export default function Comisiones() {
  const { companyId, compania } = useSesion();
  const [periodo, setPeriodo] = useState<Periodo>('quincena');
  const [abierto, setAbierto] = useState<string | null>(null);
  const { desde, hasta } = rango(periodo);

  const { datos, cargando, error } = useCargar(async () => {
    if (!companyId) return null;
    const [citas, trabajadores, catalogo] = await Promise.all([
      getCitasDelPeriodo(companyId, desde, hasta),
      getTrabajadores(companyId),
      getCatalogo(companyId),
    ]);
    const lineas = await getServiciosDeCitas(citas.map((c) => c.id));
    return { citas, lineas, trabajadores, catalogo };
  }, [companyId, desde, hasta]);

  const resumen = useMemo(
    () =>
      datos
        ? calcularComisiones(datos.citas, datos.lineas, datos.catalogo, datos.trabajadores)
        : null,
    [datos],
  );
  const nombre = useMemo(
    () => new Map((datos?.trabajadores ?? []).map((t) => [t.id, t.name])),
    [datos],
  );
  const hayTarifas =
    (datos?.trabajadores ?? []).some((t) => (t.comision_pct ?? 0) > 0) ||
    (datos?.catalogo ?? []).some((c) => c.comision_pct != null || c.comision_monto != null);

  const citasAtendidas = resumen?.profesionales.reduce((t, p) => t + p.citas, 0) ?? 0;
  const facturado = resumen?.profesionales.reduce((t, p) => t + p.facturado, 0) ?? 0;

  function descargar() {
    if (!resumen) return;
    const filas = [['Profesional', 'Fecha', 'Servicio', 'Precio', 'Regla', 'Comision']].concat(
      resumen.profesionales.flatMap((p) =>
        p.lineas.map((l) => [
          p.employeeId ? (nombre.get(p.employeeId) ?? p.employeeId) : 'Sin asignar',
          l.cita.slot_start,
          l.nombre,
          l.precio.toFixed(2),
          REGLA[l.regla] + (l.pct != null ? ` (${l.pct}%)` : ''),
          l.comision.toFixed(2),
        ]),
      ),
    );
    const csv = filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    // El BOM es lo que hace que Excel en Windows no destroce las tildes.
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `comisiones-${desde}-a-${hasta}.csv`;
    a.click();
  }

  if (compania && !esCita(compania.business_mode)) {
    return (
      <main className="main">
        <div className="wrap">
          <Topbar titulo="Comisiones" sub="Cuánto le toca a cada profesional" />
          <p className="vacio">
            Las comisiones son de los negocios de citas: los que tienen profesionales que atienden.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Comisiones" sub="Cuánto le toca a cada profesional, por las citas que atendió" />

        <div className="filters" style={{ marginBottom: 16 }}>
          {PERIODOS.map(([k, txt]) => (
            <div key={k} className={`fpill ${periodo === k ? 'active' : ''}`} onClick={() => setPeriodo(k)}>
              {txt}
            </div>
          ))}
          <span className="muted" style={{ fontSize: 12.5, alignSelf: 'center', marginLeft: 6 }}>
            del {diaMes(new Date(`${desde}T12:00`))} al {diaMes(new Date(`${hasta}T12:00`))}
          </span>
        </div>

        <div className="mini-row">
          <div className="mini">
            <div className="ic" style={{ background: 'var(--brand-soft)', color: 'var(--brand-txt)' }}>
              <Percent size={20} />
            </div>
            <div>
              <b>{soles(resumen?.total ?? 0)}</b>
              <small>Comisiones del periodo</small>
            </div>
          </div>
          <div className="mini">
            <div className="ic" style={{ background: '#E8FBF2', color: '#0FA968' }}>
              <Scissors size={20} />
            </div>
            <div>
              <b>{citasAtendidas}</b>
              <small>Citas atendidas</small>
            </div>
          </div>
          <div className="mini">
            <div className="ic" style={{ background: '#F3EEFF', color: '#A78BFA' }}>
              <Wallet size={20} />
            </div>
            <div>
              <b>{soles(facturado)}</b>
              <small>Facturado en esas citas</small>
            </div>
          </div>
        </div>

        {/* 2 · Lo que explica un total en cero. */}
        {(resumen?.sinMarcar.citas ?? 0) > 0 && (
          <div className="desfase" style={{ marginBottom: 14 }}>
            <AlertTriangle size={15} style={{ verticalAlign: -2 }} />{' '}
            <b>
              {resumen!.sinMarcar.citas} cita{resumen!.sinMarcar.citas > 1 ? 's' : ''} de este periodo ya
              pasaron y nadie ha dicho si vino el cliente
            </b>{' '}
            ({soles(resumen!.sinMarcar.importe)}). No generan comisión hasta marcarlas como «Vino» en{' '}
            <Link href="/panel/agenda" style={{ fontWeight: 700 }}>
              Agenda → Ya pasaron
            </Link>
            .
          </div>
        )}

        {datos && !hayTarifas && (
          <div className="desfase" style={{ marginBottom: 14 }}>
            Todavía no hay ninguna tarifa puesta, así que todo sale a S/ 0. Ponle su % a cada profesional en{' '}
            <Link href="/panel/equipo" style={{ fontWeight: 700 }}>
              Equipo
            </Link>
            , o una comisión propia a un servicio en el{' '}
            <Link href="/panel/catalogo" style={{ fontWeight: 700 }}>
              Catálogo
            </Link>
            .
          </div>
        )}

        <div className="table-card">
          <div className="card-head" style={{ padding: '14px 18px' }}>
            <h3>Por profesional</h3>
            {resumen && resumen.profesionales.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={descargar}>
                <Download size={14} /> Descargar detalle
              </button>
            )}
          </div>
          {cargando && !datos ? (
            <p className="vacio">Calculando…</p>
          ) : error ? (
            <p className="vacio">No se pudieron cargar las citas: {error}</p>
          ) : !resumen || resumen.profesionales.length === 0 ? (
            <p className="vacio">Ninguna cita atendida en este periodo todavía.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Profesional</th>
                  <th>Citas</th>
                  <th>Facturado</th>
                  <th>Comisión</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {resumen.profesionales.map((p) => {
                  const clave = p.employeeId || '·sin·';
                  const esteAbierto = abierto === clave;
                  return (
                    <Fragment key={clave}>
                      <tr style={{ cursor: 'pointer' }} onClick={() => setAbierto(esteAbierto ? null : clave)}>
                        <td data-label="Profesional">
                          <b>{p.employeeId ? (nombre.get(p.employeeId) ?? 'Profesional borrado') : 'Sin asignar'}</b>
                          {p.sinTarifa > 0 && (
                            <small style={{ display: 'block', color: '#B26B00' }}>
                              {p.sinTarifa} servicio{p.sinTarifa > 1 ? 's' : ''} sin tarifa (S/ 0)
                            </small>
                          )}
                          {!p.employeeId && (
                            <small className="muted" style={{ display: 'block' }}>
                              Citas atendidas sin profesional: asígnalas para que cuenten.
                            </small>
                          )}
                        </td>
                        <td data-label="Citas">{p.citas}</td>
                        <td data-label="Facturado">{soles(p.facturado)}</td>
                        <td data-label="Comisión">
                          <b>{soles(p.comision)}</b>
                        </td>
                        <td>{esteAbierto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
                      </tr>
                      {esteAbierto &&
                        p.lineas.map((l, i) => (
                          <tr key={`${clave}-${i}`} className="fila-detalle">
                            <td className="muted" data-label="Fecha">
                              {l.cita.inicio ? diaMes(l.cita.inicio) : l.cita.slot_start.slice(0, 10)}
                            </td>
                            <td data-label="Servicio">{l.nombre}</td>
                            <td data-label="Precio">{soles(l.precio)}</td>
                            <td data-label="Comisión">
                              {soles(l.comision)}{' '}
                              <small className="muted">
                                · {REGLA[l.regla]}
                                {l.pct != null ? ` ${l.pct} %` : ''}
                              </small>
                            </td>
                            <td />
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* 1 y 3 · Lo que hace que esta cifra no cuadre con otras, dicho antes de que alguien lo pregunte. */}
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.7, marginTop: 14 }}>
          <p>
            <b>Por qué es menos que los ingresos:</b> aquí solo cuentan las citas marcadas como atendidas. Los
            ingresos de Métricas cuentan también las confirmadas que todavía no han ocurrido.
          </p>
          <p>
            <b>Una cita, un profesional:</b> si en la misma cita atendieron dos personas, toda la comisión va a
            quien figura en la cita. <b>La venta de productos no genera comisión:</b> no consta quién la hizo.
          </p>
        </div>
      </div>
    </main>
  );
}
