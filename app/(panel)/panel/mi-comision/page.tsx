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
import { useSesion } from '@/components/panel/Sesion';
import { useCargar } from '@/components/panel/useCargar';
import { calcularComisiones } from '@/lib/panel/comisiones';
import { diaMes, hora, isoLocal, soles } from '@/lib/panel/format';
import {
  getCatalogoDelEquipo,
  getCitasDelPeriodo,
  getEquipoFichas,
  getMiNegocio,
  getServiciosDeCitas,
} from '@/lib/supabase/queries';

export default function MiComision() {
  const { companyId } = useSesion();
  const hoy = new Date();
  const [desde, setDesde] = useState(isoLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)));
  const [hasta, setHasta] = useState(isoLocal(hoy));

  const { datos, cargando, error } = useCargar(async () => {
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
    const lineas = await getServiciosDeCitas(mias.map((c) => c.id));
    return { ficha, mias, lineas, fichas, catalogo };
  }, [companyId, desde, hasta]);

  const resumen = useMemo(() => {
    if (!datos?.ficha) return null;
    const mia = datos.fichas.find((f) => f.es_la_tuya);
    const r = calcularComisiones(
      datos.mias,
      datos.lineas,
      datos.catalogo,
      [{ id: datos.ficha, comision_pct: mia?.comision_pct ?? 0 }],
    );
    return {
      pct: Number(mia?.comision_pct ?? 0),
      yo: r.profesionales.find((p) => p.employeeId === datos.ficha) ?? null,
      sinMarcar: r.sinMarcar,
    };
  }, [datos]);

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Mi comisión" sub="Lo que llevas ganado con las citas que atendiste" />

        <div className="mia-dia">
          <span className="muted" style={{ fontSize: 13 }}>Del</span>
          <input type="date" value={desde} max={hasta} onChange={(e) => e.target.value && setDesde(e.target.value)} aria-label="Desde" />
          <span className="muted" style={{ fontSize: 13 }}>al</span>
          <input type="date" value={hasta} min={desde} onChange={(e) => e.target.value && setHasta(e.target.value)} aria-label="Hasta" />
        </div>

        {error && <p className="vacio">No se pudo cargar tu comisión: {error}</p>}
        {cargando && !datos && <p className="vacio">Calculando…</p>}

        {datos && !datos.ficha && (
          <p className="equipo-aviso">
            <b>Todavía no tienes una ficha enlazada.</b> Sin ella no hay citas tuyas que contar. Pídele al dueño o al
            administrador que te la ponga en Ajustes › Acceso del equipo.
          </p>
        )}

        {resumen && (
          <>
            <div className="card mia-grupo">
              <h3>{soles(resumen.yo?.comision ?? 0)}</h3>
              <p className="muted" style={{ fontSize: 13 }}>
                {resumen.yo?.citas ?? 0} {resumen.yo?.citas === 1 ? 'cita atendida' : 'citas atendidas'}
                {resumen.pct > 0 && ` · tu comisión general es del ${resumen.pct}%`}
              </p>
              {resumen.sinMarcar.citas > 0 && (
                <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                  Tienes {resumen.sinMarcar.citas} {resumen.sinMarcar.citas === 1 ? 'cita pasada' : 'citas pasadas'} sin
                  marcar si el cliente vino. Hasta que se marquen no cuentan: hazlo en Mi agenda.
                </p>
              )}
            </div>

            <div className="card mia-grupo">
              <h3>Detalle</h3>
              {!resumen.yo || resumen.yo.lineas.length === 0 ? (
                <p className="vacio">No hay citas atendidas en estas fechas.</p>
              ) : (
                resumen.yo.lineas.map((l, i) => (
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
