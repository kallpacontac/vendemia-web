'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * MI COMISIÓN · la del empleado, y solo la suya
 * ══════════════════════════════════════════════════════════════════════════
 *
 * El número sale del MISMO cálculo que la pantalla de Comisiones del dueño
 * (`calcularComisiones`, lib/panel/comisiones.ts). No hay un segundo cálculo:
 * con sueldos de por medio, dos sitios que suman lo mismo acaban dando dos
 * cifras, y eso es una discusión.
 *
 * Lo que cambia es lo que se le da de comer:
 *
 *   · solo SUS citas (el filtro de abajo, y tras el corte, el RLS);
 *   · solo SU porcentaje: `equipo_fichas` trae `comision_pct` únicamente en la
 *     ficha propia;
 *   · el catálogo de `catalogo_del_equipo`, CON `comision_pct` y
 *     `comision_monto` de cada servicio (migración 0043 del bot): la comisión
 *     del servicio gana a la de la ficha, y sin ellos esta cifra no coincidiría
 *     con la del dueño. La 0043 se aplica antes del corte.
 *
 * Solo devenga la cita COMPLETADA, igual que para el dueño.
 */
import { useMemo, useState } from 'react';
import Topbar from '@/components/panel/Topbar';
import { supabase } from '@/lib/supabase/client';
import { useSesion } from '@/components/panel/Sesion';
import { useCargar } from '@/components/panel/useCargar';
import { useSondeo } from '@/components/panel/useSondeo';
import Link from 'next/link';
import { calcularComisiones } from '@/lib/panel/comisiones';
import { desdeDeCuentas, solesExactos } from '@/lib/panel/cierres';
import { diaMes, hora, isoLocal, soles } from '@/lib/panel/format';
import { PERIODOS, rango, type Periodo } from '@/lib/panel/periodos';
import {
  getCatalogoDelEquipo,
  getCitasDelPeriodo,
  getEquipoFichas,
  getMiNegocio,
  getComisionesCongeladas,
  getServiciosDeCitas,
} from '@/lib/supabase/queries';

export default function MiComision() {
  const { companyId } = useSesion();
  // Los mismos periodos que ve el dueño en Comisiones: así las dos cifras cuadran.
  const [periodo, setPeriodo] = useState<Periodo>('quincena');
  const { desde, hasta } = rango(periodo);

  const { datos, cargando, error, releer } = useCargar(async () => {
    if (!companyId) return null;
    const [negocio, citas, fichas, catalogo] = await Promise.all([
      getMiNegocio(companyId),
      getCitasDelPeriodo(companyId, desde, hasta),
      getEquipoFichas(companyId),
      getCatalogoDelEquipo(companyId),
    ]);
    const ficha = negocio?.tu_ficha ?? null;
    // Solo las suyas. Una cita sin asignar no es de nadie: no le cuenta a él.
    const mias = ficha ? citas.filter((c) => c.employee_id === ficha) : [];
    const ids = mias.map((c) => c.id);
    const [lineas, congeladas] = await Promise.all([getServiciosDeCitas(ids), getComisionesCongeladas(ids)]);
    return { ficha, mias, lineas, congeladas, fichas, catalogo };
  }, [companyId, desde, hasta]);

  const cobro = useCargar(() => (companyId ? porCobrar(companyId) : Promise.resolve(null)), [companyId]);
  // Cada cita que la caja cobra suma sola, sin recargar (19-nov, The 24/7).
  useSondeo(() => {
    releer();
    cobro.releer();
  }, 30_000);

  const resumen = useMemo(() => {
    if (!datos?.ficha) return null;
    const mia = datos.fichas.find((f) => f.es_la_tuya);
    const r = calcularComisiones(
      datos.mias,
      datos.lineas,
      datos.catalogo,
      [{ id: datos.ficha, comision_pct: mia?.comision_pct ?? 0 }],
      new Date(),
      datos.congeladas,
    );
    const yo = r.profesionales.find((p) => p.employeeId === datos.ficha) ?? null;
    return {
      pct: Number(mia?.comision_pct ?? 0),
      yo,
      sinMarcar: r.sinMarcar,
    };
  }, [datos]);

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Mi comisión" sub="Lo que te deben y lo que has ganado" />

        {error && <p className="vacio">No se pudo cargar tu comisión: {error}</p>}
        {cargando && !datos && <p className="vacio">Calculando…</p>}

        {datos && !datos.ficha && (
          <p className="equipo-aviso">
            <b>Todavía no tienes una ficha enlazada.</b> Sin ella no hay citas tuyas que contar. Pídele al dueño o al
            administrador que te la ponga en Ajustes › Acceso del equipo.
          </p>
        )}

        {/* ── POR COBRAR: lo que te deben hoy, el mismo número que ve el dueño ── */}
        {cobro.datos && (
          <section className="card mi-cobro" aria-label="Por cobrar">
            <small className="mi-cobro__rotulo">{cobro.datos.aCobrar < 0 ? 'Debes' : 'Por cobrar'}</small>
            <b className={`mi-cobro__monto${cobro.datos.aCobrar < 0 ? ' mi-cobro__monto--debe' : ''}`}>{solesExactos(Math.abs(cobro.datos.aCobrar))}</b>
            <p className="mi-cobro__cuenta">
              {cobro.datos.atenciones} {cobro.datos.atenciones === 1 ? 'atención' : 'atenciones'} · comisión {solesExactos(cobro.datos.comision)}
              {cobro.datos.adelantado > 0 && <> · <span className="mi-cobro__menos">adelantos − {solesExactos(cobro.datos.adelantado)}</span></>}
            </p>
            {cobro.datos.aCobrar < 0 && <p className="mi-cobro__nota">Se te adelantó más de lo que llevas: se descuenta de lo próximo.</p>}
            <div className="mi-cobro__pie">
              <span>Hoy llevas <b>{soles(cobro.datos.hoy)}</b></span>
              {cobro.datos.ultimo
                ? <span>Último pago: <b>{solesExactos(cobro.datos.ultimo.pagado)}</b> el {diaMes(new Date(cobro.datos.ultimo.pagado_at))} ({cobro.datos.ultimo.metodo})</span>
                : <span className="muted">Desde el {diaMes(new Date(`${cobro.datos.desde}T12:00`))}</span>}
            </div>
            {resumen && resumen.sinMarcar.citas > 0 && (
              <p className="mi-cobro__ojo">
                {resumen.sinMarcar.citas} {resumen.sinMarcar.citas === 1 ? 'cita pasada no cuenta' : 'citas pasadas no cuentan'} hasta que
                marques si vino. <Link href="/panel/mi-agenda">Márcalas en Mi agenda</Link>.
              </p>
            )}
          </section>
        )}

        {resumen && (
          <>
            <h2 className="mi-seccion">Lo que has ganado</h2>
        <div className="filters" role="tablist" aria-label="Periodo" style={{ marginBottom: 14 }}>
          {PERIODOS.map(([k, txt]) => (
            <button key={k} type="button" role="tab" aria-selected={periodo === k} className={`fpill ${periodo === k ? 'active' : ''}`}
              onClick={() => setPeriodo(k)}>
              {txt}
            </button>
          ))}
          <span className="muted" style={{ fontSize: 12.5, alignSelf: 'center', marginLeft: 6 }}>
            {desde === hasta ? diaMes(new Date(`${desde}T12:00`)) : `del ${diaMes(new Date(`${desde}T12:00`))} al ${diaMes(new Date(`${hasta}T12:00`))}`}
          </span>
        </div>

            <div className="card mia-grupo">
              <small className="muted" style={{ fontSize: 12.5, fontWeight: 700 }}>{PERIODOS.find(([k]) => k === periodo)?.[1]}</small>
              <h3 style={{ fontSize: 30, margin: '2px 0 4px' }}>{soles(resumen.yo?.comision ?? 0)}</h3>
              <p className="muted" style={{ fontSize: 13 }}>
                {resumen.yo?.citas ?? 0} {resumen.yo?.citas === 1 ? 'atención' : 'atenciones'}
                {resumen.yo ? ` · ${soles(resumen.yo.facturado)} en servicios` : ''}
                {resumen.pct > 0 && ` · tu comisión general es del ${resumen.pct}%`}
              </p>
            </div>

            <div className="card mia-grupo">
              <h3>Detalle</h3>
              {!resumen.yo || resumen.yo.lineas.length === 0 ? (
                <p className="vacio">No hay citas atendidas en estas fechas.</p>
              ) : (
                [...resumen.yo.lineas].sort((a, b) => (b.cita.inicio?.getTime() ?? 0) - (a.cita.inicio?.getTime() ?? 0)).map((l, i) => (
                  <div className="mia-fila" key={i}>
                    <span className="mia-hora">{l.cita.inicio ? diaMes(l.cita.inicio) : '—'}</span>
                    <div className="mia-quien">
                      <b>{l.nombre}</b>
                      <small>
                        {l.cita.inicio ? hora(l.cita.inicio) : ''}
                        {l.pct !== null ? ` · ${l.pct}% de ${soles(l.precio)}` : l.regla === 'fija' ? ' · comisión fija' : ''}
                      </small>
                    </div>
                    <div className="mia-acciones">
                      <b>{soles(l.comision)}</b>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

/**
 * Lo que se le debe al barbero ahora: la MISMA cuenta que «Por pagar a tu equipo» del dueño
 * (lib/panel/cierres.ts): la comisión de sus citas atendidas que ningún pago cubre, menos sus
 * adelantos que ningún pago descontó, desde el mismo día (desdeDeCuentas). Sus pagos y adelantos
 * llegan por mi_por_cobrar (datos 0015); sin ella, null y la tarjeta no sale.
 */
async function porCobrar(companyId: string) {
  const { data, error } = await supabase().rpc('mi_por_cobrar', { p_company: companyId });
  if (error || !data) return null;
  const d = data as {
    ficha: string | null;
    primero: string | null;
    cierres: { citas: string[]; adelantos: string[]; pagado: number; metodo: string; pagado_at: string }[];
    adelantos: { id: string; fecha: string; importe: number }[];
  };
  if (!d.ficha) return null;
  const hoy = new Date();
  const desde = desdeDeCuentas(d.primero, hoy);
  const [citas, fichas, catalogo] = await Promise.all([
    getCitasDelPeriodo(companyId, desde, isoLocal(hoy)),
    getEquipoFichas(companyId),
    getCatalogoDelEquipo(companyId),
  ]);
  const pagadas = new Set(d.cierres.flatMap((c) => c.citas));
  const mias = citas.filter((c) => c.employee_id === d.ficha);
  const ids = mias.map((c) => c.id);
  const [lineas, congeladas] = await Promise.all([getServiciosDeCitas(ids), getComisionesCongeladas(ids)]);
  const pct = fichas.find((f) => f.es_la_tuya)?.comision_pct ?? 0;
  const r = calcularComisiones(mias, lineas, catalogo, [{ id: d.ficha, comision_pct: pct }], hoy, congeladas);
  const todas = r.profesionales.find((p) => p.employeeId === d.ficha)?.lineas ?? [];
  const lineasSinPagar = todas.filter((l) => !pagadas.has(l.cita.id));
  const hoyIso = isoLocal(hoy);
  const comision = Math.round(lineasSinPagar.reduce((t, l) => t + l.comision, 0) * 100) / 100;
  const adelantado = Math.round(d.adelantos.filter((g) => g.fecha >= desde).reduce((t, g) => t + Number(g.importe ?? 0), 0) * 100) / 100;
  return {
    desde,
    comision,
    adelantado,
    aCobrar: Math.round((comision - adelantado) * 100) / 100,
    atenciones: new Set(lineasSinPagar.map((l) => l.cita.id)).size,
    // Lo de hoy, pagado o no: lo que mira al cerrar el día.
    hoy: todas.filter((l) => l.cita.slot_start.startsWith(hoyIso)).reduce((t, l) => t + l.comision, 0),
    ultimo: d.cierres[0] ? { ...d.cierres[0], pagado: Number(d.cierres[0].pagado) } : null,
  };
}
