'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * MI AGENDA · lo que ve el empleado (barbero, estilista, profesor)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Es una pantalla aparte de la Agenda, y no una Agenda «recortada», por una
 * razón concreta: aquella lee `leads`, `employees` y `companies`, y tras el
 * corte de roles esas tablas le devuelven CERO filas al empleado. Esta lee lo
 * que sí le toca (lib/supabase/queries.ts, «Lo que lee el empleado»).
 *
 * ── Qué ve (Alvaro, 13-oct-2026) ─────────────────────────────────────────
 *
 *   · Sus citas, y las que no tienen a nadie asignado. Una cita sin empleado la
 *     ven TODOS, marcada «Sin asignar», hasta que alguien la asigne.
 *   · Del cliente: el nombre, las notas del salón, las notas de Mia y los
 *     campos propios que el dueño marcó «Lo ve el empleado». Nada de contacto.
 *   · No cobra: marca «vino» o «no vino». El cobro lo apunta la caja.
 *
 * En una academia los grupos no tienen profesor asignado, así que todos salen
 * «Sin asignar» y los ven todos los profesores: horarios, cupos y alumnos, sin
 * importes. Es la misma regla, no una aparte.
 *
 * ⚠️ El filtro de abajo (`esMia`) repite lo que hará el RLS. No es la barrera:
 * existe para que la pantalla enseñe lo mismo antes y después del corte, y para
 * que nadie vea de más el rato que las dos cosas no estén sincronizadas.
 */
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Topbar from '@/components/panel/Topbar';
import { useSesion } from '@/components/panel/Sesion';
import { useComando } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { esRecurrente } from '@/lib/panel/modo';
import { diaMes, hora, isoLocal } from '@/lib/panel/format';
import { claveGrupo, hoyLima, ocupa, reservando } from '@/lib/panel/inscripciones';
import {
  getCatalogoDelEquipo,
  getCitasDelPeriodo,
  getInscripcionesVivas,
  getMiNegocio,
  getMisClientes,
  type Cita,
  type ClienteDelEquipo,
  type MiNegocio,
} from '@/lib/supabase/queries';
import type { FranjaRecurrente } from '@/lib/supabase/types';

export default function MiAgenda() {
  const { companyId, compania } = useSesion();
  if (!companyId) return null;
  return esRecurrente(compania?.business_mode) ? (
    <MisClases companyId={companyId} />
  ) : (
    <MisCitas companyId={companyId} />
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */

const ESTADO: Record<string, string> = {
  confirmed: 'Confirmada',
  pending_payment: 'Esperando pago',
  completed: 'Vino',
  no_show: 'No vino',
};

function MisCitas({ companyId }: { companyId: string }) {
  const comando = useComando();
  const hoy = isoLocal(new Date());
  const [dia, setDia] = useState(hoy);
  const [enVuelo, setEnVuelo] = useState<string | null>(null);

  const { datos, cargando, error, releer } = useCargar(async () => {
    const [negocio, citas, clientes] = await Promise.all([
      getMiNegocio(companyId),
      getCitasDelPeriodo(companyId, dia, dia),
      getMisClientes(companyId),
    ]);
    return { dia, negocio, citas, clientes };
  }, [companyId, dia]);

  const ficha = datos?.negocio?.tu_ficha ?? null;
  const cliente = useMemo(() => new Map((datos?.clientes ?? []).map((c) => [c.lead_id, c])), [datos]);

  // Solo las de este día: al cambiar de fecha, lo anterior no se queda pintado.
  const citas = (datos?.dia === dia ? datos.citas : []).filter((c) => c.status !== 'cancelled');
  const mias = citas.filter((c) => Boolean(c.employee_id) && c.employee_id === ficha);
  const sinAsignar = citas.filter((c) => !c.employee_id);

  async function marcar(c: Cita, vino: boolean) {
    setEnVuelo(c.id);
    await comando('marcar_cumplido', { tipo: 'appointment', id: c.id, vino }, vino ? 'Anotado: vino' : 'Anotado: no vino', releer);
    setEnVuelo(null);
  }

  const mover = (delta: number) => {
    const [a, m, d] = dia.split('-').map(Number);
    setDia(isoLocal(new Date(a, m - 1, d + delta)));
  };
  const [a, m, d] = dia.split('-').map(Number);

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Mi agenda" sub={dia === hoy ? `Hoy, ${diaMes(new Date(a, m - 1, d))}` : diaMes(new Date(a, m - 1, d))} />

        <div className="mia-dia">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => mover(-1)} aria-label="Día anterior">
            <ChevronLeft size={16} />
          </button>
          <input type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} aria-label="Día" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => mover(1)} aria-label="Día siguiente">
            <ChevronRight size={16} />
          </button>
          {dia !== hoy && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDia(hoy)}>
              Hoy
            </button>
          )}
        </div>

        {error && <p className="vacio">No se pudo cargar tu agenda: {error}</p>}
        {cargando && !datos && <p className="vacio">Cargando tu agenda…</p>}

        {datos && !ficha && (
          <p className="equipo-aviso">
            <b>Todavía no tienes una ficha enlazada.</b> Por eso solo ves las citas sin asignar. Pídele al dueño o al
            administrador que te la ponga en Ajustes › Acceso del equipo.
          </p>
        )}

        {datos && (
          <>
            <div className="card mia-grupo">
              <h3>Mis citas</h3>
              {mias.length === 0 ? (
                <p className="vacio">No tienes citas este día.</p>
              ) : (
                mias.map((c) => (
                  <FilaCita key={c.id} c={c} cliente={cliente.get(c.lead_id)} negocio={datos.negocio} ocupado={enVuelo === c.id} alMarcar={marcar} />
                ))
              )}
            </div>

            {sinAsignar.length > 0 && (
              <div className="card mia-grupo">
                <h3>Sin asignar</h3>
                <p className="muted" style={{ fontSize: 12.5 }}>
                  No tienen a nadie puesto todavía: las ve todo el equipo hasta que se asignen.
                </p>
                {sinAsignar.map((c) => (
                  <FilaCita key={c.id} c={c} cliente={cliente.get(c.lead_id)} negocio={datos.negocio} ocupado={enVuelo === c.id} alMarcar={marcar} sinAsignar />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function FilaCita({
  c,
  cliente,
  negocio,
  ocupado,
  alMarcar,
  sinAsignar = false,
}: {
  c: Cita;
  cliente: ClienteDelEquipo | undefined;
  negocio: MiNegocio | null;
  ocupado: boolean;
  alMarcar: (c: Cita, vino: boolean) => void;
  sinAsignar?: boolean;
}) {
  // Solo se puede decir si vino de una cita que ya empezó y sigue «confirmada».
  const porMarcar = c.status === 'confirmed' && c.inicio !== null && c.inicio.getTime() <= Date.now();
  return (
    <div className="mia-fila">
      <span className="mia-hora">{c.inicio ? hora(c.inicio) : '—'}</span>
      <div className="mia-quien">
        <b>
          {cliente?.name?.trim() || 'Cliente'}
          {sinAsignar && <span className="mia-sin">Sin asignar</span>}
        </b>
        {c.service && <small>{c.service}</small>}
        <NotasDelCliente cliente={cliente} negocio={negocio} />
      </div>
      <div className="mia-acciones">
        {porMarcar ? (
          <>
            <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => alMarcar(c, true)}>
              Vino
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => alMarcar(c, false)}>
              No vino
            </button>
          </>
        ) : (
          <span className="mia-estado">{ESTADO[c.status ?? ''] ?? ''}</span>
        )}
      </div>
    </div>
  );
}

/**
 * Lo que el empleado sabe del cliente antes de atenderlo. Plegado: son notas,
 * no la cita. Las claves de `custom_data` se rotulan con la pregunta que el
 * dueño escribió; una clave sin pregunta no debería llegar, y si llega se
 * enseña con su nombre.
 */
function NotasDelCliente({ cliente, negocio }: { cliente: ClienteDelEquipo | undefined; negocio: MiNegocio | null }) {
  if (!cliente) return null;
  const rotulo = new Map((negocio?.campos_visibles ?? []).map((c) => [c.field_key, c.question]));
  const campos = Object.entries(cliente.custom_data ?? {}).filter(([, v]) => v !== null && v !== '');
  const salon = cliente.notas_salon?.trim();
  const mia = cliente.customer_notes?.trim();
  if (!salon && !mia && campos.length === 0) return null;

  return (
    <details className="mia-notas">
      <summary>Ver notas</summary>
      <dl>
        {salon && (
          <div>
            <dt>Notas del local</dt>
            <dd>{salon}</dd>
          </div>
        )}
        {mia && (
          <div>
            <dt>Lo que apuntó Mia</dt>
            <dd>{mia}</dd>
          </div>
        )}
        {campos.map(([clave, valor]) => (
          <div key={clave}>
            <dt>{rotulo.get(clave) ?? clave}</dt>
            <dd>{String(valor)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * La academia: los grupos semanales, con sus alumnos. Sin mensualidades ni
 * deudas, y sin pasar lista: hoy una inscripción es de un periodo, no de un
 * día, así que no hay dónde apuntar quién vino a cada clase.
 *
 * Quién ocupa plaza se cuenta con la MISMA regla que el bot (`ocupa`, en
 * lib/panel/inscripciones.ts), para que el profesor no vea un cupo distinto
 * del que Mia da por bueno.
 */
function MisClases({ companyId }: { companyId: string }) {
  const { datos, cargando, error } = useCargar(async () => {
    const [catalogo, plazas, clientes] = await Promise.all([
      getCatalogoDelEquipo(companyId),
      getInscripcionesVivas(companyId),
      getMisClientes(companyId),
    ]);
    return { catalogo, plazas, clientes };
  }, [companyId]);

  const grupos = useMemo(() => {
    if (!datos) return [];
    const hoy = hoyLima();
    const nombre = new Map(datos.clientes.map((c) => [c.lead_id, c.name?.trim() || 'Alumno']));
    return datos.catalogo
      .filter((item) => Number(item.is_active ?? 1) !== 0)
      .flatMap((item) => {
        let franjas: FranjaRecurrente[] = [];
        try {
          franjas = JSON.parse(item.schedule_slots || '[]') as FranjaRecurrente[];
        } catch {
          /* un JSON roto no tumba la pantalla: ese nivel sale sin grupos */
        }
        return franjas.map((f) => {
          const clave = claveGrupo(item.id, f.id);
          return {
            clave,
            nivel: item.name,
            franja: f,
            alumnos: datos.plazas.filter((p) => ocupa(p, clave, hoy)).map((p) => nombre.get(p.lead_id) ?? 'Alumno'),
            reservando: datos.plazas.filter((p) => reservando(p, clave, hoy)).length,
          };
        });
      });
  }, [datos]);

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Mis clases" sub="Los grupos de la semana y quién está inscrito" />

        {error && <p className="vacio">No se pudieron cargar las clases: {error}</p>}
        {cargando && !datos && <p className="vacio">Cargando las clases…</p>}
        {datos && grupos.length === 0 && <p className="vacio">Todavía no hay grupos creados.</p>}

        {grupos.map((g) => (
          <div className="card mia-grupo" key={g.clave}>
            <h3>
              {g.nivel} · {g.franja.label}
              {/* Hoy ningún grupo tiene profesor: por eso los ven todos. */}
              <span className="mia-sin">Sin asignar</span>
            </h3>
            <p className="muted" style={{ fontSize: 12.5 }}>
              {g.franja.days.map((d) => DIAS[d] ?? '').join(' · ')} · {g.franja.time} ·{' '}
              {g.franja.capacity > 0 ? `${g.alumnos.length} de ${g.franja.capacity} plazas` : `${g.alumnos.length} inscritos`}
              {g.reservando > 0 && ` · ${g.reservando} reservando`}
            </p>
            {g.alumnos.length === 0 ? (
              <p className="vacio">Nadie inscrito todavía.</p>
            ) : (
              <ul className="mia-alumnos">
                {g.alumnos.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
