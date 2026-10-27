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
 * ── Cómo se ve (Alvaro, 27-oct-2026: «práctica, intuitiva») ──────────────
 *
 * Pensada para el celular, con una mano, y con las piezas del panel (no con
 * las de la app que sirvió de modelo): la semana con el calendario de siempre
 * (.cal), y el día como lista de filas dentro de una tarjeta, cada cita con su
 * sello (badge-pill) y los mismos Vino / No vino de la Agenda del dueño. Nada
 * de resúmenes ni de números del negocio: al barbero el Dashboard no le sirve.
 *
 * Los avisos al celular (modules/avisos, 0004) abren esta pantalla con
 * `?dia=AAAA-MM-DD&cita=<id>`: cae en ese día y con esa cita marcada. El aviso
 * RECARGA la página (public/panel-sw.js), así que no hace falta sondear: lo
 * que se ve al tocarlo es lo de ahora. Al volver a la app desde otra, se
 * relee una vez.
 *
 * En una academia los grupos no tienen profesor asignado, así que todos salen
 * «Sin asignar» y los ven todos los profesores: horarios, cupos y alumnos, sin
 * importes. Es la misma regla, no una aparte.
 *
 * ⚠️ El filtro de abajo (`esMia`) repite lo que hará el RLS. No es la barrera:
 * existe para que la pantalla enseñe lo mismo antes y después del corte, y para
 * que nadie vea de más el rato que las dos cosas no estén sincronizadas.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import Topbar from '@/components/panel/Topbar';
import AvisosDelEquipo from '@/components/panel/AvisosDelEquipo';
import { useSesion } from '@/components/panel/Sesion';
import { useComando } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { esRecurrente } from '@/lib/panel/modo';
import { hora, isoLocal } from '@/lib/panel/format';
import { pideRevision, selloCumplido } from '@/lib/panel/confirmacion';
import { vocabulario } from '@/lib/panel/vocabulario';
import { claveGrupo, hoyLima, ocupa, reservando } from '@/lib/panel/inscripciones';
import { quienDeCita } from '@/lib/panel/ficha';
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

export default function MiAgendaPagina() {
  return (
    <Suspense fallback={<main className="main"><div className="wrap"><p className="vacio">Cargando tu agenda…</p></div></main>}>
      <MiAgenda />
    </Suspense>
  );
}

function MiAgenda() {
  const { companyId, compania } = useSesion();
  if (!companyId) return null;
  return esRecurrente(compania?.business_mode) ? (
    <MisClases companyId={companyId} />
  ) : (
    <MisCitas companyId={companyId} />
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */

const DIA_CORTO = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DIA_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const cap = (t: string) => t.replace(/^./, (l) => l.toUpperCase());

const deIso = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
};
const sumarDias = (iso: string, n: number) => {
  const d = deIso(iso);
  d.setDate(d.getDate() + n);
  return isoLocal(d);
};
/** El lunes de la semana de ese día. */
const lunesDe = (iso: string) => sumarDias(iso, -((deIso(iso).getDay() + 6) % 7));

const duracion = (min: number) => (min < 60 ? `${min} min` : min % 60 ? `${Math.floor(min / 60)} h ${min % 60}` : `${min / 60} h`);

/** Cuánto dura: lo que diga la cita, o lo que haya entre su inicio y su fin. */
function minutosDe(c: Cita): number {
  if (c.slot_minutes && c.slot_minutes > 0) return c.slot_minutes;
  const fin = c.slot_end ? new Date(c.slot_end.replace(' ', 'T')) : null;
  if (c.inicio && fin && !Number.isNaN(fin.getTime())) return Math.max(0, Math.round((fin.getTime() - c.inicio.getTime()) / 60000));
  return 0;
}

/**
 * El sello de la cita, con las palabras y los colores del resto del panel: lo
 * que ya pasó sale de `selloCumplido` (Vino, No vino, Presunta, Sin resolver),
 * igual que en la Agenda del dueño. Lo que viene es solo de esta pantalla.
 */
function selloDe(c: Cita, ahora: number, esProxima: boolean): { label: string; color: string; enCurso: boolean } {
  if (c.status === 'pending_payment') return { label: 'Esperando pago', color: '#B26B00', enCurso: false };
  const inicio = c.inicio?.getTime() ?? 0;
  const fin = inicio + Math.max(minutosDe(c), 15) * 60000;
  if (c.status === 'confirmed' && inicio <= ahora && ahora < fin) return { label: 'En curso', color: '#CC3A00', enCurso: true };
  if (c.status !== 'confirmed' || fin <= ahora) {
    const s = selloCumplido('appointment', c.status, c.cumplido_por);
    return { label: s.label, color: s.color, enCurso: false };
  }
  return esProxima
    ? { label: 'Próxima', color: '#CC3A00', enCurso: false }
    : { label: 'Confirmada', color: '#93938C', enCurso: false };
}

function MisCitas({ companyId }: { companyId: string }) {
  const comando = useComando();
  const { compania } = useSesion();
  const v = vocabulario(compania?.business_mode);
  const palabra = v.reserva === 'pedido' ? 'reserva' : v.reserva;
  const palabras = v.reserva === 'pedido' ? 'reservas' : v.reservas;
  const params = useSearchParams();
  const hoy = isoLocal(new Date());
  const pedido = params.get('dia');
  const foco = params.get('cita');
  const [dia, setDia] = useState(pedido && ISO.test(pedido) ? pedido : hoy);
  const [enVuelo, setEnVuelo] = useState<string | null>(null);
  // El reloj de la pantalla: «En curso» y «Sin resolver» cambian solos con la hora.
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Otro aviso con la app ya en esta pantalla: la URL cambia, el día también.
  useEffect(() => {
    if (pedido && ISO.test(pedido)) setDia(pedido);
  }, [pedido]);

  const lunes = lunesDe(dia);
  const { datos, cargando, error, releer } = useCargar(async () => {
    const [negocio, citas, clientes] = await Promise.all([
      getMiNegocio(companyId),
      getCitasDelPeriodo(companyId, lunes, sumarDias(lunes, 6)),
      getMisClientes(companyId),
    ]);
    return { lunes, negocio, citas, clientes };
  }, [companyId, lunes]);

  // Al volver a la app desde WhatsApp u otra: lo de ahora, sin esperar a nada.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'visible') {
        setAhora(Date.now());
        releer();
      }
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [releer]);

  const ficha = datos?.negocio?.tu_ficha ?? null;
  const cliente = useMemo(() => new Map((datos?.clientes ?? []).map((c) => [c.lead_id, c])), [datos]);

  // Las de la semana que me tocan: mías y sin asignar. Solo de la semana cargada:
  // al cambiar de semana, lo anterior no se queda pintado.
  const semana = useMemo(
    () =>
      (datos?.lunes === lunes ? datos.citas : []).filter(
        (c) => c.status !== 'cancelled' && (!c.employee_id || c.employee_id === ficha),
      ),
    [datos, lunes, ficha],
  );
  const delDia = semana.filter((c) => c.slot_start.slice(0, 10) === dia);
  const proxima = delDia.find(
    (c) => c.status === 'confirmed' && c.inicio !== null && c.inicio.getTime() > ahora && dia >= hoy,
  );

  // La cita del aviso: a la vista y marcada un momento.
  const marcada = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (foco && marcada.current) marcada.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [foco, datos]);

  async function marcar(c: Cita, vino: boolean) {
    setEnVuelo(c.id);
    await comando('marcar_cumplido', { tipo: 'appointment', id: c.id, vino }, vino ? 'Anotado: vino' : 'Anotado: no vino', releer);
    setEnVuelo(null);
  }

  const elegido = deIso(dia);
  const titulo = cap(`${dia === hoy ? 'hoy, ' : ''}${DIA_LARGO[elegido.getDay()]} ${elegido.getDate()} de ${MES_LARGO[elegido.getMonth()]}`);
  const porAtender = delDia.filter((c) => c.status === 'confirmed' || c.status === 'pending_payment').length;

  return (
    <main className="main">
      <div className="wrap mag">
        <Topbar titulo="Mi agenda" sub={`Tus ${palabras} y las que aún no tienen a nadie`} />

        <AvisosDelEquipo companyId={companyId} />

        {/* La semana, con el calendario del panel (.cal): hoy relleno, un punto en los días con citas. */}
        <section className="card mag-semana" aria-label="Semana">
          <div className="cal-head">
            <b>
              {cap(MES_LARGO[elegido.getMonth()])} {elegido.getFullYear()}
            </b>
            <div className="cal-nav">
              {dia !== hoy && (
                <button type="button" className="mag-hoy" onClick={() => setDia(hoy)}>
                  Hoy
                </button>
              )}
              <button type="button" onClick={() => setDia(sumarDias(dia, -7))} aria-label="Semana anterior">
                <ChevronLeft />
              </button>
              <button type="button" onClick={() => setDia(sumarDias(dia, 7))} aria-label="Semana siguiente">
                <ChevronRight />
              </button>
            </div>
          </div>
          <div className="cal">
            {DIA_CORTO.map((letra) => (
              <div key={letra} className="dow">
                {letra}
              </div>
            ))}
            {DIA_CORTO.map((_, i) => {
              const d = sumarDias(lunes, i);
              const cuantas = semana.filter((c) => c.slot_start.slice(0, 10) === d).length;
              return (
                <button
                  key={d}
                  type="button"
                  className={`day${d === hoy ? ' today' : ''}${d === dia ? ' sel' : ''}${cuantas ? ' mark' : ''}`}
                  onClick={() => setDia(d)}
                  aria-pressed={d === dia}
                  aria-label={`${DIA_LARGO[deIso(d).getDay()]} ${deIso(d).getDate()}${cuantas ? `, ${cuantas} ${cuantas === 1 ? palabra : palabras}` : ''}`}
                >
                  {deIso(d).getDate()}
                </button>
              );
            })}
          </div>
        </section>

        {error && <p className="vacio">No se pudo cargar tu agenda: {error}</p>}

        {datos && !ficha && (
          <p className="equipo-aviso">
            <b>Todavía no tienes una ficha enlazada.</b> Por eso solo ves las {palabras} sin asignar. Pídele al dueño o al
            administrador que te la ponga en Ajustes › Acceso del equipo.
          </p>
        )}

        <section className="card mia-grupo">
          <div className="card-mini-head">
            <h3>{titulo}</h3>
            {datos && delDia.length > 0 && (
              <span className="badge-pill b-mute">
                {porAtender > 0 && porAtender !== delDia.length
                  ? `${porAtender} por atender`
                  : `${delDia.length} ${delDia.length === 1 ? palabra : palabras}`}
              </span>
            )}
          </div>
          {cargando && !datos ? (
            <p className="vacio">Cargando tu agenda…</p>
          ) : delDia.length === 0 ? (
            <p className="vacio">No tienes {palabras} este día.</p>
          ) : (
            delDia.map((c) => (
              <FilaCita
                key={c.id}
                filaRef={c.id === foco ? marcada : undefined}
                c={c}
                sello={selloDe(c, ahora, c.id === proxima?.id)}
                enFoco={c.id === foco}
                cliente={cliente.get(c.lead_id)}
                negocio={datos?.negocio ?? null}
                ocupado={enVuelo === c.id}
                alMarcar={marcar}
              />
            ))
          )}
        </section>
      </div>
    </main>
  );
}

function FilaCita({
  filaRef,
  c,
  sello,
  enFoco,
  cliente,
  negocio,
  ocupado,
  alMarcar,
}: {
  filaRef?: React.Ref<HTMLDivElement>;
  c: Cita;
  sello: { label: string; color: string; enCurso: boolean };
  enFoco: boolean;
  cliente: ClienteDelEquipo | undefined;
  negocio: MiNegocio | null;
  ocupado: boolean;
  alMarcar: (c: Cita, vino: boolean) => void;
}) {
  // Se puede decir si vino de una cita que ya empezó y sigue «confirmada», y
  // corregir lo que cerró el reloj sin que nadie lo mirara (Presunta), como en la
  // Agenda del dueño.
  const empezo = c.inicio !== null && c.inicio.getTime() <= Date.now();
  const porMarcar =
    empezo && (c.status === 'confirmed' || pideRevision(selloCumplido('appointment', c.status, c.cumplido_por)));
  const quien = quienDeCita(c, cliente?.name?.trim());
  const min = minutosDe(c);
  return (
    <div ref={filaRef} className={`mia-fila${sello.enCurso ? ' mia-fila--ahora' : ''}${enFoco ? ' mia-fila--foco' : ''}`}>
      <span className="mia-hora">
        {c.inicio ? hora(c.inicio) : '—'}
        {min > 0 && <small>{duracion(min)}</small>}
      </span>
      <div className="mia-quien">
        <div className="mia-sellos">
          <span className="badge-pill" style={{ color: sello.color, background: `${sello.color}18` }}>
            {sello.label}
          </span>
          {!c.employee_id && <span className="mia-sin">Sin asignar</span>}
        </div>
        <b>{c.service || 'Sin servicio indicado'}</b>
        <small>{quien.nombre}</small>
        {quien.deQuien && <small>{quien.deQuien}</small>}
        <NotasDelCliente cliente={cliente} negocio={negocio} />
      </div>
      {porMarcar && (
        <div className="mia-acciones">
          <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => alMarcar(c, true)}>
            <Check size={14} /> Vino
          </button>
          <button type="button" className="btn btn-ghost btn-sm confirmar-no" disabled={ocupado} onClick={() => alMarcar(c, false)}>
            <X size={14} /> No vino
          </button>
        </div>
      )}
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
    const nombre = new Map(datos.clientes.map((c) => [c.lead_id, c.name?.trim()]));
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
            alumnos: datos.plazas
              .filter((p) => ocupa(p, clave, hoy))
              .map((p) => ({ id: p.id, ...quienDeCita(p, nombre.get(p.lead_id), 'Alumno') })),
            reservando: datos.plazas.filter((p) => reservando(p, clave, hoy)).length,
          };
        });
      });
  }, [datos]);

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Mis clases" sub="Los grupos de la semana y quién está inscrito" />

        <AvisosDelEquipo companyId={companyId} academia />

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
                {g.alumnos.map((a) => (
                  <li key={a.id}>
                    {a.nombre}
                    {a.deQuien && <small className="muted"> · {a.deQuien}</small>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
