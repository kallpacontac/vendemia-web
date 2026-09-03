'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * AGENDA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La rejilla se calcula en el navegador cruzando horario + citas + bloqueos
 * (ver lib/panel/agenda.ts). Es una foto para mirar: aquí no se reserva.
 *
 * El panel de muestra tenía una "vista cliente" con celdas pulsables que
 * enseñaban un toast de reserva. No se puede sostener: las reservas públicas
 * viven en el bot (`POST /public/:companyId/book`), que no es alcanzable desde
 * internet, y no hay ningún comando de Supabase que cree una cita. La vista
 * cliente se queda —enseña lo mismo que ve el cliente cuando le pregunta a
 * Mia— pero sin botón que prometa algo que no ocurre.
 *
 * Los negocios recurrentes no tienen rejilla: sus citas son "sched:<franja>",
 * no una hora concreta, así que se enseñan como grupos con su ocupación.
 */
import { useMemo, useState } from 'react';
import { Briefcase, CalendarCheck, CheckCircle, ChevronLeft, ChevronRight, Flame, User } from 'lucide-react';
import Topbar from '@/components/panel/Topbar';
import { useSesion } from '@/components/panel/Sesion';
import { useCargar } from '@/components/panel/useCargar';
import { construirSemana, lunesDe } from '@/lib/panel/agenda';
import { diaMes } from '@/lib/panel/format';
import {
  getBloqueos,
  getCatalogo,
  getCitas,
  getCompania,
  getLeads,
  getTrabajadores,
} from '@/lib/supabase/queries';
import { json } from '@/lib/supabase/parse';
import type { FranjaRecurrente } from '@/lib/supabase/types';

export default function Agenda() {
  const { companyId } = useSesion();
  const [offset, setOffset] = useState(0);
  const [vista, setVista] = useState<'negocio' | 'cliente'>('negocio');

  const { datos, cargando } = useCargar(async () => {
    if (!companyId) return null;
    const [empresa, citas, leads, trabajadores, bloqueos, catalogo] = await Promise.all([
      getCompania(companyId),
      getCitas(companyId),
      getLeads(companyId),
      getTrabajadores(companyId),
      getBloqueos(companyId).catch(() => []),
      getCatalogo(companyId),
    ]);
    return { empresa, citas, leads, trabajadores, bloqueos, catalogo };
  }, [companyId]);

  const semana = useMemo(() => {
    if (!datos?.empresa) return null;
    return construirSemana(offset, {
      citas: datos.citas,
      nombrePorLead: new Map(datos.leads.map((l) => [l.id, l.name || l.phone])),
      nombrePorTrabajador: new Map(datos.trabajadores.map((t) => [t.id, t.name])),
      bloqueos: datos.bloqueos,
      horario: datos.empresa.horario,
      slotMinutos: datos.empresa.slot_minutes ?? 30,
    });
  }, [datos, offset]);

  const esRecurrente = datos?.empresa?.business_mode === 'recurring_appointment';

  if (cargando && !datos) {
    return (
      <main className="main">
        <div className="cargando">
          <div className="spin" />
          Cargando la agenda…
        </div>
      </main>
    );
  }

  const ocupacion = semana?.totales.capacidad
    ? Math.round((semana.totales.reservado / semana.totales.capacidad) * 100)
    : 0;

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Agenda" sub="Disponibilidad y reservas" />

        <div className="summary">
          <div className="sm">
            <div className="ic" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
              <CalendarCheck size={18} />
            </div>
            <div>
              <b>{semana?.totales.reservado ?? 0}</b>
              <small>Reservas esta semana</small>
            </div>
          </div>
          <div className="sm">
            <div className="ic" style={{ background: '#E8FBF2', color: '#0FA968' }}>
              <CheckCircle size={18} />
            </div>
            <div>
              <b>{semana?.totales.libre ?? 0}</b>
              <small>Cupos libres</small>
            </div>
          </div>
          <div className="sm">
            <div className="ic" style={{ background: '#FFECEF', color: '#FF5B79' }}>
              <Flame size={18} />
            </div>
            <div>
              <b>{ocupacion}%</b>
              <small>Ocupación</small>
            </div>
          </div>
        </div>

        {esRecurrente ? (
          <Recurrentes catalogo={datos?.catalogo ?? []} citas={datos?.citas ?? []} />
        ) : (
          <>
            <div className="agenda-head">
              <div className="week-nav">
                <div className="nb" onClick={() => setOffset((o) => o - 1)}>
                  <ChevronLeft size={16} />
                </div>
                <b>
                  {offset === 0 && 'Esta semana · '}
                  {diaMes(lunesDe(offset))} – {diaMes(new Date(lunesDe(offset).getTime() + 6 * 864e5))}
                </b>
                <div className="nb" onClick={() => setOffset((o) => o + 1)}>
                  <ChevronRight size={16} />
                </div>
              </div>
              <div className="view-toggle">
                <button className={vista === 'negocio' ? 'active' : ''} onClick={() => setVista('negocio')}>
                  <Briefcase size={15} /> Vista negocio
                </button>
                <button className={vista === 'cliente' ? 'active' : ''} onClick={() => setVista('cliente')}>
                  <User size={15} /> Vista cliente
                </button>
              </div>
            </div>

            <div className="legend2">
              {vista === 'negocio' ? (
                <>
                  <span>
                    <i style={{ background: 'var(--brand)' }} />
                    Reservado
                  </span>
                  <span>
                    <i style={{ background: 'var(--bg-soft)', border: '1px dashed var(--line-2)' }} />
                    Libre
                  </span>
                  <span>
                    <i style={{ background: '#E7E7E1' }} />
                    Cerrado
                  </span>
                </>
              ) : (
                <>
                  <span>
                    <i style={{ background: 'var(--brand-soft)', border: '1px solid var(--brand)' }} />
                    Disponible
                  </span>
                  <span>
                    <i style={{ background: '#FFECEF', border: '1px solid #FBD0D8' }} />
                    Copado
                  </span>
                  <span>
                    <i style={{ background: '#E7E7E1' }} />
                    Cerrado
                  </span>
                </>
              )}
            </div>

            <div className="cal-scroll">
              <div className="cal-grid">
                <div />
                {semana?.dias.map((d) => (
                  <div className={`gh ${d.esHoy ? 'today' : ''}`} key={d.iso}>
                    <div className="wd">{d.weekday.replace('.', '')}</div>
                    <div className="dt">{d.fecha.getDate()}</div>
                  </div>
                ))}

                {semana?.horas.map((hora, i) => (
                  <FilaDeHoras key={hora} hora={hora}>
                    {semana.dias.map((d) => (
                      <Celda key={d.iso + hora} hueco={d.huecos[i]} vista={vista} />
                    ))}
                  </FilaDeHoras>
                ))}
              </div>
            </div>

            {semana && semana.horas.length === 0 && (
              <div className="vacio">
                <b>No hay horario configurado</b>
                Define los días y las horas de atención en Ajustes y la rejilla aparece sola.
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

/** La rejilla es un grid plano: cada fila es la etiqueta de la hora y sus 7 celdas. */
function FilaDeHoras({ hora, children }: { hora: string; children: React.ReactNode }) {
  return (
    <>
      <div className="hourlbl">{hora}</div>
      {children}
    </>
  );
}

function Celda({
  hueco,
  vista,
}: {
  hueco: ReturnType<typeof construirSemana>['dias'][number]['huecos'][number];
  vista: 'negocio' | 'cliente';
}) {
  if (hueco.cerrado) return <div className="cell closed">—</div>;

  if (vista === 'negocio') {
    if (hueco.reservas.length > 0) {
      return (
        <div className="cell" style={{ gap: 4 }}>
          {hueco.reservas.slice(0, 2).map((r) => (
            <div className="bk" key={r.id}>
              <b>{r.cliente}</b>
              <span className="sv">{r.servicio}</span>
              {r.trabajador && <span className="bb">{r.trabajador}</span>}
            </div>
          ))}
          {hueco.reservas.length > 2 && <div className="more">+{hueco.reservas.length - 2} más</div>}
        </div>
      );
    }
    if (hueco.bloqueo !== null) {
      return (
        <div className="cell closed" title={hueco.bloqueo ?? ''}>
          Bloqueado
        </div>
      );
    }
    if (hueco.pasado) return <div className="cell past" />;
    return <div className="cell free">Libre</div>;
  }

  if (hueco.pasado) return <div className="cell past" />;
  if (hueco.libres > 0 && hueco.bloqueo === null) {
    return (
      <div className="cell avail" style={{ cursor: 'default' }}>
        Disponible
        <span className="sl">
          {hueco.libres} cupo{hueco.libres > 1 ? 's' : ''}
        </span>
      </div>
    );
  }
  return <div className="cell full">Copado</div>;
}

/**
 * Negocios recurrentes: las plazas son de un grupo semanal, no de una hora.
 * `slot_start` vale "sched:<id>" y la franja vive en catalog.schedule_slots.
 */
function Recurrentes({
  catalogo,
  citas,
}: {
  catalogo: { id: string; name: string; schedule_slots: string | null }[];
  citas: { slot_start: string; status: string | null }[];
}) {
  const DIAS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const franjas = catalogo.flatMap((c) =>
    json<FranjaRecurrente[]>(c.schedule_slots, []).map((f) => ({ ...f, servicio: c.name })),
  );

  if (!franjas.length) {
    return (
      <div className="vacio">
        <b>Este negocio es de grupos recurrentes</b>
        Todavía no hay franjas definidas en el catálogo.
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Grupos de la semana</h3>
      </div>
      {franjas.map((f) => {
        const inscritos = citas.filter(
          (c) => c.slot_start === `sched:${f.id}` && c.status !== 'cancelled',
        ).length;
        const sinLimite = f.capacity === -1;
        const pct = sinLimite ? 0 : Math.min(100, Math.round((inscritos / (f.capacity || 1)) * 100));
        return (
          <div className="slotbar" key={f.id}>
            <div className="lab">
              <b>
                {f.label} · {f.days.map((d) => DIAS[d]).join('-')} {f.time}
              </b>
              <span>{sinLimite ? `${inscritos} inscritos` : `${inscritos}/${f.capacity}`}</span>
            </div>
            <div className="track">
              <div
                className="fill"
                style={{
                  width: `${sinLimite ? 100 : pct}%`,
                  background: pct >= 100 ? 'var(--hot)' : pct >= 70 ? 'var(--warm)' : 'var(--bot-on)',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
