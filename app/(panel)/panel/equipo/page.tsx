'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * EQUIPO · quién atiende, en qué horario, y cuándo no está
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Lectura: `employees` y `employee_blocks`, como siempre. Escritura: cuatro
 * comandos —`upsert_employee`, `upsert_employee_block`, `delete_employee_block`
 * y el mismo `upsert_employee` con `is_active` para desactivar—.
 *
 * Tres cosas de esta pantalla que conviene no deshacer:
 *
 * 1 · SE MANDA SOLO LO QUE CAMBIÓ. `upsert_employee` es un PATCH desde el
 *     11-sep-2026: lo que no se manda se conserva. Antes, editar solo el nombre
 *     borraba el horario propio y el trabajador pasaba a heredar el del
 *     negocio, trabajando días que no trabaja. `schedule: null` es la forma
 *     explícita de pedir «que herede».
 *
 * 2 · EL HORARIO LO VALIDA EL BOT, Y SU MOTIVO SE ENSEÑA TAL CUAL. El panel
 *     comprueba lo mismo antes de mandar —para no hacer esperar a nadie por un
 *     error evidente—, pero la autoridad es el bot: si lo rechaza, useComando()
 *     pinta su mensaje, que está escrito para el dueño.
 *
 * 3 · UNA AUSENCIA NO MUEVE LAS CITAS. Mia deja de ofrecer a ese trabajador en
 *     ese intervalo, pero las citas que YA tenía siguen ahí, confirmadas, y
 *     nadie avisa al cliente. Por eso la pantalla las enseña tres veces: antes
 *     de guardar, al guardar (la lista del bot, `citas_afectadas`) y después,
 *     en cada ausencia, mientras sigan sin moverse.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CalendarClock,
  CalendarOff,
  Check,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Plus,
  Trash2,
  UserCheck,
  UserCog,
  UserX,
} from 'lucide-react';
import Topbar from '@/components/panel/Topbar';
import AvisarCliente from '@/components/panel/AvisarCliente';
import { useSesion } from '@/components/panel/Sesion';
import { useAvisar, useComando } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { diaMes, hora } from '@/lib/panel/format';
import { hoyLima } from '@/lib/panel/inscripciones';
import {
  getBloqueos,
  getCitas,
  getCompania,
  getLeads,
  getTrabajadores,
  parseSlot,
  type Cita,
  type Trabajador,
} from '@/lib/supabase/queries';
import type { ResultadoBloqueo, ResultadoModificarCita } from '@/lib/supabase/commands';
import type { ClaveDia, EmployeeBlockRow, Horario } from '@/lib/supabase/types';

const DIAS: { clave: ClaveDia; nombre: string; corto: string }[] = [
  { clave: 'monday', nombre: 'Lunes', corto: 'L' },
  { clave: 'tuesday', nombre: 'Martes', corto: 'M' },
  { clave: 'wednesday', nombre: 'Miércoles', corto: 'X' },
  { clave: 'thursday', nombre: 'Jueves', corto: 'J' },
  { clave: 'friday', nombre: 'Viernes', corto: 'V' },
  { clave: 'saturday', nombre: 'Sábado', corto: 'S' },
  { clave: 'sunday', nombre: 'Domingo', corto: 'D' },
];

/** 'YYYY-MM-DD HH:MM' en hora de Lima: el formato de `employee_blocks` y de `slot_start`. */
const ahoraLima = (): string =>
  new Date().toLocaleString('sv-SE', { timeZone: 'America/Lima' }).slice(0, 16);

/* ── Horario ────────────────────────────────────────────────────────────── */

/** Un día AUSENTE del objeto está cerrado, igual que en `companies.schedule`. */
const abierto = (h: Horario, d: ClaveDia): boolean => Boolean(h[d] && !h[d]?.closed);

/**
 * Las mismas comprobaciones que `errorDeHorario` del bot (src/utils/horario.ts),
 * con su misma redacción. Las otras que hace allí —JSON válido, claves de día,
 * formato HH:MM— no pueden fallar aquí: el editor solo produce eso.
 */
function errorDeHorario(h: Horario): string | null {
  let abiertos = 0;
  for (const { clave, nombre } of DIAS) {
    if (!abierto(h, clave)) continue;
    const d = h[clave]!;
    if (!d.open || !d.close) return `${nombre}: falta la hora de abrir o la de cerrar`;
    if (d.open >= d.close) return `${nombre}: abre (${d.open}) a la misma hora o después de cerrar (${d.close})`;
    abiertos++;
  }
  if (abiertos === 0) {
    return 'no tiene ningún día abierto: si ese trabajador no trabaja, desactívalo en vez de dejarlo sin horario';
  }
  return null;
}

/** El JSON que espera el bot: días en inglés, `{open, close}` o `{closed: true}`. */
function serializar(h: Horario): string {
  const out: Record<string, unknown> = {};
  for (const { clave } of DIAS) {
    const d = h[clave];
    if (!d) continue;
    out[clave] = d.closed ? { closed: true } : { open: d.open, close: d.close };
  }
  return JSON.stringify(out);
}

/** «L M X J V 14:00–20:00 · S 10:00–14:00». Los días con la misma franja, juntos. */
function resumen(h: Horario): string {
  const grupos = new Map<string, string[]>();
  for (const { clave, corto } of DIAS) {
    if (!abierto(h, clave)) continue;
    const franja = `${h[clave]!.open}–${h[clave]!.close}`;
    grupos.set(franja, [...(grupos.get(franja) ?? []), corto]);
  }
  return [...grupos].map(([franja, dias]) => `${dias.join(' ')} ${franja}`).join(' · ') || 'Sin días abiertos';
}

/** El horario del negocio, como punto de partida al darle a uno el suyo propio. */
function copiaDe(h: Horario): Horario {
  const out: Horario = {};
  for (const { clave } of DIAS) {
    out[clave] = abierto(h, clave)
      ? { open: h[clave]!.open ?? '09:00', close: h[clave]!.close ?? '19:00' }
      : { closed: true };
  }
  return out;
}

/* ── Ausencias ──────────────────────────────────────────────────────────── */

/**
 * Las citas que una ausencia deja colgadas.
 *
 * ⚠️ Es la consulta del bot (`getOverlappingAppointments`), copiada: citas
 * puntuales, CONFIRMADAS, de ese trabajador, que se solapan con el intervalo.
 * Las fechas son texto local de Lima y se comparan como texto, igual que allí.
 */
function citasColgadas(citas: Cita[], empleadoId: string, inicio: string, fin: string): Cita[] {
  return citas.filter(
    (c) =>
      c.employee_id === empleadoId &&
      c.status === 'confirmed' &&
      !c.recurrente &&
      Boolean(c.slot_end) &&
      c.slot_start < fin &&
      (c.slot_end ?? '') > inicio,
  );
}

/** «el 14 sep» · «del 14 sep al 20 sep» · «14 sep 09:00 → 14 sep 13:00». */
function textoRango(inicio: string, fin: string): string {
  const a = parseSlot(inicio);
  const b = parseSlot(fin);
  if (!a || !b) return `${inicio} → ${fin}`;
  if (inicio.endsWith('00:00') && fin.endsWith('23:59')) {
    return inicio.slice(0, 10) === fin.slice(0, 10) ? `el ${diaMes(a)}` : `del ${diaMes(a)} al ${diaMes(b)}`;
  }
  return `${diaMes(a)} ${hora(a)} → ${diaMes(b)} ${hora(b)}`;
}

/* ═══════════════════════════════════════════════════════════════════════ */

export default function Equipo() {
  const { companyId } = useSesion();
  const comando = useComando();
  const avisar = useAvisar();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);

  const { datos, cargando, recargar } = useCargar(async () => {
    if (!companyId) return null;
    const [empresa, trabajadores, bloqueos, citas, leads] = await Promise.all([
      getCompania(companyId),
      getTrabajadores(companyId),
      getBloqueos(companyId).catch(() => [] as EmployeeBlockRow[]),
      getCitas(companyId),
      getLeads(companyId),
    ]);
    return { empresa, trabajadores, bloqueos, citas, leads };
  }, [companyId]);

  const nombrePorLead = useMemo(
    () => new Map((datos?.leads ?? []).map((l) => [l.id, l.name || l.phone])),
    [datos],
  );

  const todos = datos?.trabajadores ?? [];
  const inactivos = todos.filter((t) => !t.activo).length;
  const visibles = todos.filter((t) => verInactivos || t.activo);
  const empresa = datos?.empresa;

  async function crear() {
    const nombre = nuevo.trim();
    if (!nombre) return;
    /* Mia valida por NOMBRE lo que el cliente pide («con Marco»): dos iguales
       la obligan a elegir por su cuenta. */
    if (todos.some((t) => t.name.trim().toLowerCase() === nombre.toLowerCase())) {
      avisar('Ya hay alguien con ese nombre. Mia reconoce al profesional por su nombre: dos iguales la confunden.', 'error');
      return;
    }
    // Sin `schedule`: el bot lo deja heredando el horario del negocio.
    await comando('upsert_employee', { employee: { name: nombre } }, `${nombre} añadido al equipo`, () => {
      setNuevo('');
      recargar();
    });
  }

  if (cargando && !datos) {
    return (
      <main className="main">
        <div className="cargando">
          <div className="spin" />
          Cargando el equipo…
        </div>
      </main>
    );
  }

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Equipo" sub="Quién atiende, en qué horario y cuándo no está" />

        {empresa && empresa.business_mode !== 'appointment' && (
          <div className="desfase" style={{ marginBottom: 14 }}>
            El equipo solo cuenta en los negocios de <b>citas</b>: es donde Mia reparte las reservas
            entre profesionales. En tu negocio lo que guardes aquí no cambia lo que ofrece.
          </div>
        )}
        {empresa?.business_mode === 'appointment' && !empresa.pideEmpleado && (
          <div className="desfase" style={{ marginBottom: 14 }}>
            Ahora mismo Mia <b>no pregunta con quién</b> quiere el cliente su cita. Se activa en{' '}
            <Link href="/panel/configuracion">Ajustes</Link> · «Preguntar por el profesional».
          </div>
        )}

        <div className="toolbar">
          <div className="search" style={{ flex: 1 }}>
            <Plus size={16} />
            <input
              placeholder="Nombre de un profesional nuevo…"
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void crear()}
            />
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => void crear()} disabled={!nuevo.trim()}>
            <Plus size={15} /> Añadir
          </button>
          {inactivos > 0 && (
            <button
              className={`btn btn-sm ${verInactivos ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setVerInactivos((v) => !v)}
            >
              {verInactivos ? 'Esconder inactivos' : `Ver inactivos (${inactivos})`}
            </button>
          )}
        </div>

        {visibles.length === 0 && (
          <p className="vacio">
            <b>{todos.length ? 'Nadie activo en el equipo' : 'Todavía no hay nadie en el equipo'}</b>
            {todos.length
              ? 'Mia no tiene a quién asignar las citas.'
              : 'Añade a quienes atienden. Cada uno puede tener su horario y sus ausencias.'}
          </p>
        )}

        {visibles.map((t) => (
          <Ficha
            key={t.id}
            t={t}
            equipo={todos}
            horarioNegocio={empresa?.horario ?? {}}
            bloqueos={(datos?.bloqueos ?? []).filter((b) => b.employee_id === t.id)}
            citas={datos?.citas ?? []}
            nombrePorLead={nombrePorLead}
            abierta={abierta === t.id}
            alAbrir={() => setAbierta((a) => (a === t.id ? null : t.id))}
            alCambiar={recargar}
          />
        ))}
      </div>
    </main>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */

function Ficha({
  t,
  equipo,
  horarioNegocio,
  bloqueos,
  citas,
  nombrePorLead,
  abierta,
  alAbrir,
  alCambiar,
}: {
  t: Trabajador;
  /** El equipo entero: hace falta para poder pasarle a otro las citas huérfanas. */
  equipo: Trabajador[];
  horarioNegocio: Horario;
  bloqueos: EmployeeBlockRow[];
  citas: Cita[];
  nombrePorLead: Map<string, string>;
  abierta: boolean;
  alAbrir: () => void;
  alCambiar: () => void;
}) {
  const comando = useComando();
  const avisar = useAvisar();

  /** `schedule` vacío = hereda el del negocio. Ver EmployeeRow. */
  const tienePropio = Boolean(t.schedule?.trim());
  const [nombre, setNombre] = useState(t.name);
  const [propio, setPropio] = useState(tienePropio);
  const [horario, setHorario] = useState<Horario>(tienePropio ? t.horario : copiaDe(horarioNegocio));
  const [guardando, setGuardando] = useState(false);

  /* El borrador se rehace SOLO al abrir: si se repintara con cada recarga,
     borraría lo que alguien está escribiendo. */
  const [abiertaAntes, setAbiertaAntes] = useState(abierta);
  if (abierta !== abiertaAntes) {
    setAbiertaAntes(abierta);
    if (abierta) {
      setNombre(t.name);
      setPropio(tienePropio);
      setHorario(tienePropio ? t.horario : copiaDe(horarioNegocio));
    }
  }

  const ahora = ahoraLima();
  const proximas = citas.filter(
    (c) => c.employee_id === t.id && c.status === 'confirmed' && !c.recurrente && c.slot_start >= ahora,
  ).length;
  const vigentes = bloqueos.filter((b) => b.end >= ahora).sort((a, b) => a.start.localeCompare(b.start));

  async function guardar() {
    /* Solo lo que cambió: es un PATCH, y mandar de más es justo lo que antes
       borraba horarios sin querer. */
    const cambios: Record<string, unknown> = {};
    if (nombre.trim() && nombre.trim() !== t.name) cambios.name = nombre.trim();

    if (propio) {
      const e = errorDeHorario(horario);
      if (e) {
        avisar(`Horario inválido: ${e}`, 'error');
        return;
      }
      const s = serializar(horario);
      if (s !== (t.schedule ?? '')) cambios.schedule = s;
    } else if (tienePropio) {
      cambios.schedule = null; // «que herede el del negocio»
    }

    if (!nombre.trim()) {
      avisar('Hace falta un nombre: es como Mia lo reconoce.', 'error');
      return;
    }
    if (!Object.keys(cambios).length) {
      avisar('No has cambiado nada.', 'espera');
      return;
    }
    setGuardando(true);
    await comando('upsert_employee', { employee: { id: t.id, ...cambios } }, 'Guardado', alCambiar);
    setGuardando(false);
  }

  async function alternarActivo() {
    if (
      t.activo &&
      proximas > 0 &&
      !window.confirm(
        `${t.name} tiene ${proximas} cita(s) confirmada(s) por delante. Desactivarlo NO las mueve ni avisa a nadie: habrá que reasignarlas a mano. ¿Desactivar igualmente?`,
      )
    ) {
      return;
    }
    // Solo `is_active`: es un PATCH, el resto se conserva tal cual.
    await comando(
      'upsert_employee',
      { employee: { id: t.id, is_active: t.activo ? 0 : 1 } },
      t.activo ? `${t.name} desactivado: Mia deja de ofrecerlo` : `${t.name} vuelve a estar activo`,
      alCambiar,
    );
  }

  return (
    <div className={`cat-item ${t.activo ? '' : 'oculto'}`}>
      <div className="cat-head" onClick={alAbrir}>
        <div className="cat-id">
          <b>{t.name}</b>
          <small>
            {tienePropio ? resumen(t.horario) : 'Horario del negocio'}
            {proximas > 0 ? ` · ${proximas} cita${proximas > 1 ? 's' : ''} por delante` : ''}
          </small>
        </div>
        {vigentes.length > 0 && (
          <span className="badge-pill" style={{ color: '#B26B00', background: '#FEF6E7' }}>
            <CalendarOff size={12} /> {vigentes.length} ausencia{vigentes.length > 1 ? 's' : ''}
          </span>
        )}
        {!t.activo && (
          <span className="badge-pill" style={{ color: 'var(--ink-soft)', background: 'var(--bg-soft)' }}>
            Inactivo
          </span>
        )}
        <button
          type="button"
          className="q-icon"
          aria-label={abierta ? 'Cerrar' : 'Editar'}
          onClick={(e) => {
            e.stopPropagation();
            alAbrir();
          }}
        >
          {abierta ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {abierta && (
        <div className="cat-body">
          <label className="field-label">Nombre</label>
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <small className="muted" style={{ fontSize: 11.5 }}>
            Mia reconoce al profesional por este nombre cuando el cliente pide «con {t.name.split(' ')[0]}».
          </small>

          <div className="sec" style={{ marginTop: 14 }}>
            <h4>
              <CalendarClock /> Horario
            </h4>
            <div className="toggle-row">
              <div className="t">
                <b>Tiene su propio horario</b>
                <small>
                  {propio
                    ? 'Mia solo lo ofrece en estas horas.'
                    : `Hereda el del negocio: ${resumen(horarioNegocio)}.`}
                </small>
              </div>
              <div
                className={`toggle ${propio ? 'on' : ''}`}
                role="switch"
                aria-checked={propio}
                onClick={() => setPropio((p) => !p)}
              />
            </div>

            {propio &&
              DIAS.map(({ clave, nombre: dia }) => {
                const d = horario[clave];
                const on = abierto(horario, clave);
                return (
                  <div className={`sched-row ${on ? '' : 'off'}`} key={clave}>
                    <b>{dia}</b>
                    <input
                      type="time"
                      value={d?.open ?? '09:00'}
                      onChange={(e) =>
                        setHorario((h) => ({ ...h, [clave]: { ...h[clave], open: e.target.value, closed: false } }))
                      }
                      disabled={!on}
                    />
                    <input
                      type="time"
                      value={d?.close ?? '19:00'}
                      onChange={(e) =>
                        setHorario((h) => ({ ...h, [clave]: { ...h[clave], close: e.target.value, closed: false } }))
                      }
                      disabled={!on}
                    />
                    <div
                      className={`toggle ${on ? 'on' : ''}`}
                      role="switch"
                      aria-checked={on}
                      onClick={() =>
                        setHorario((h) => ({
                          ...h,
                          [clave]: on
                            ? { ...h[clave], closed: true }
                            : { open: h[clave]?.open ?? '09:00', close: h[clave]?.close ?? '19:00' },
                        }))
                      }
                    />
                  </div>
                );
              })}
          </div>

          <Ausencias
            t={t}
            equipo={equipo}
            vigentes={vigentes}
            citas={citas}
            nombrePorLead={nombrePorLead}
            alCambiar={alCambiar}
          />

          <div className="nav-btns" style={{ marginTop: 18 }}>
            <button className="btn btn-ghost" onClick={() => void alternarActivo()}>
              {t.activo ? (
                <>
                  <UserX size={15} /> Desactivar
                </>
              ) : (
                <>
                  <UserCheck size={15} /> Volver a activar
                </>
              )}
            </button>
            <button className="btn btn-primary" onClick={() => void guardar()} disabled={guardando}>
              <Check size={16} /> {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */

interface Colgadas {
  rango: string;
  citas: { id: string; slot_start: string; service: string | null; lead_id: string }[];
  /** true = la lista la dio el bot. false = el bot aún no contestó y es la del panel. */
  delBot: boolean;
}

function Ausencias({
  t,
  equipo,
  vigentes,
  citas,
  nombrePorLead,
  alCambiar,
}: {
  t: Trabajador;
  equipo: Trabajador[];
  vigentes: EmployeeBlockRow[];
  citas: Cita[];
  nombrePorLead: Map<string, string>;
  alCambiar: () => void;
}) {
  const comando = useComando();
  const avisar = useAvisar();
  const hoy = hoyLima();

  const [formulario, setFormulario] = useState(false);
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [todoDia, setTodoDia] = useState(true);
  const [hIni, setHIni] = useState('09:00');
  const [hFin, setHFin] = useState('13:00');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [colgadas, setColgadas] = useState<Colgadas | null>(null);

  const inicio = `${desde} ${todoDia ? '00:00' : hIni}`;
  const fin = `${hasta} ${todoDia ? '23:59' : hFin}`;
  const valido = Boolean(desde && hasta) && inicio < fin;
  const previa = valido ? citasColgadas(citas, t.id, inicio, fin) : [];

  async function guardar() {
    if (!valido) {
      avisar('La ausencia acaba antes de empezar. Revisa las fechas.', 'error');
      return;
    }
    setEnviando(true);
    const rango = textoRango(inicio, fin);
    /* `refrescar` solo se llama si el cambio va a existir —confirmado o
       encolado—, nunca si falló. Es la forma de distinguir «el bot no contestó
       aún» de «el bot lo rechazó», que useComando devuelve igual (undefined). */
    let vaAExistir = false;
    const r = await comando<ResultadoBloqueo>(
      'upsert_employee_block',
      { block: { employee_id: t.id, start: inicio, end: fin, reason: motivo.trim() } },
      undefined,
      () => {
        vaAExistir = true;
        alCambiar();
      },
    );
    setEnviando(false);
    if (!vaAExistir) return;

    if (r) {
      const n = r.citas_afectadas.length;
      avisar(
        n ? `Ausencia guardada. ${t.name} tenía ${n} cita(s) esos días: revísalas.` : `Ausencia guardada. ${t.name} no tenía citas esos días.`,
        n ? 'espera' : 'ok',
      );
      if (n) setColgadas({ rango, citas: r.citas_afectadas, delBot: true });
    } else if (previa.length) {
      /* El bot no contestó a tiempo: el bloqueo está en la cola, pero su lista
         no llegó. La del panel es la misma consulta sobre las mismas filas, y
         no enseñar nada es lo único que no se puede hacer. */
      setColgadas({
        rango,
        citas: previa.map((c) => ({ id: c.id, slot_start: c.slot_start, service: c.service, lead_id: c.lead_id })),
        delBot: false,
      });
    }
    setFormulario(false);
    setMotivo('');
  }

  async function borrar(b: EmployeeBlockRow) {
    await comando('delete_employee_block', { id: b.id }, 'Ausencia borrada: Mia vuelve a ofrecerlo esos días', alCambiar);
  }

  return (
    <div className="sec" style={{ marginTop: 4 }}>
      <h4>
        <CalendarOff /> Ausencias
      </h4>

      {colgadas && (
        <div className="aviso-citas" role="alert">
          <b>
            <AlertTriangle size={14} /> {t.name} tenía {colgadas.citas.length} cita
            {colgadas.citas.length > 1 ? 's' : ''} {colgadas.rango}. Reasígnalas o avisa a esos clientes.
          </b>
          <p style={{ margin: '4px 0 0' }}>
            Mia ya no lo ofrece esos días, pero estas citas <b>no se han movido</b> y nadie ha avisado al
            cliente.
            {!colgadas.delBot && ' (El bot aún no ha confirmado la ausencia; la lista sale de la agenda del panel.)'}
          </p>
          <ListaCitas
            citas={colgadas.citas}
            nombrePorLead={nombrePorLead}
            equipo={equipo}
            excluir={t.id}
            alCambiar={alCambiar}
          />
          <button className="btn btn-ghost btn-sm" onClick={() => setColgadas(null)}>
            Entendido
          </button>
        </div>
      )}

      {vigentes.length === 0 && !formulario && (
        <p className="muted" style={{ fontSize: 12.5, margin: '0 0 8px' }}>
          Sin ausencias por delante.
        </p>
      )}

      {vigentes.map((b) => {
        /* Se recalcula en cada visita a propósito: el aviso de arriba se cierra,
           y esto sigue avisando mientras las citas sigan sin moverse. */
        const pendientes = citasColgadas(citas, t.id, b.start, b.end);
        return (
          <div className="ausencia" key={b.id}>
            <div className="cuando">
              <b>{textoRango(b.start, b.end)}</b>
              {b.reason ? <small className="muted"> · {b.reason}</small> : null}
              {pendientes.length > 0 && (
                <span className="badge-pill" style={{ color: '#B4232A', background: '#FFECEC', marginLeft: 8 }}>
                  {pendientes.length} cita{pendientes.length > 1 ? 's' : ''} sin mover
                </span>
              )}
            </div>
            <button type="button" className="q-icon" title="Borrar la ausencia" onClick={() => void borrar(b)}>
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}

      {formulario ? (
        <div className="form-ausencia">
          <div>
            <label className="field-label">Desde</label>
            <input
              className="input"
              type="date"
              min={hoy}
              value={desde}
              onChange={(e) => {
                setDesde(e.target.value);
                if (hasta < e.target.value) setHasta(e.target.value);
              }}
            />
          </div>
          <div>
            <label className="field-label">Hasta</label>
            <input className="input" type="date" min={desde} value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <label className="check-inline" style={{ alignSelf: 'end' }}>
            <input type="checkbox" checked={todoDia} onChange={(e) => setTodoDia(e.target.checked)} /> Días enteros
          </label>
          {!todoDia && (
            <>
              <div>
                <label className="field-label">Desde las</label>
                <input className="input" type="time" value={hIni} onChange={(e) => setHIni(e.target.value)} />
              </div>
              <div>
                <label className="field-label">Hasta las</label>
                <input className="input" type="time" value={hFin} onChange={(e) => setHFin(e.target.value)} />
              </div>
            </>
          )}
          <div className="full">
            <label className="field-label">Motivo (opcional, solo lo ves tú)</label>
            <input
              className="input"
              placeholder="Vacaciones, curso, médico…"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>

          {/* ANTES de guardar: que nadie se entere de las citas después del clic. */}
          {previa.length > 0 && (
            <div className="aviso-citas full">
              <b>
                <AlertTriangle size={14} /> {t.name} tiene {previa.length} cita{previa.length > 1 ? 's' : ''}{' '}
                {textoRango(inicio, fin)}.
              </b>
              <p style={{ margin: '4px 0 0' }}>
                Guardar la ausencia no las mueve ni avisa a nadie: tendrás que reasignarlas tú.
              </p>
              <ListaCitas
                citas={previa}
                nombrePorLead={nombrePorLead}
                equipo={equipo}
                excluir={t.id}
                alCambiar={alCambiar}
              />
            </div>
          )}

          <div className="nav-btns full">
            <button className="btn btn-ghost" onClick={() => setFormulario(false)}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={() => void guardar()} disabled={enviando || !valido}>
              <Check size={16} /> {enviando ? 'Guardando…' : 'Guardar ausencia'}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFormulario(true)}>
          <Plus size={14} /> Añadir ausencia
        </button>
      )}
    </div>
  );
}

/**
 * Las citas que se quedan huérfanas, con la salida a mano: pasárselas a otro.
 *
 * Es donde «reasignar» vale más. La alternativa es que alguien las apunte en un
 * papel y las mueva una por una desde la agenda — o que no las mueva nadie.
 */
function ListaCitas({
  citas,
  nombrePorLead,
  equipo,
  excluir,
  alCambiar,
}: {
  citas: { id: string; slot_start: string; service: string | null; lead_id: string }[];
  nombrePorLead: Map<string, string>;
  equipo: Trabajador[];
  /** El trabajador que se ausenta: pasarle a él sus propias citas no arregla nada. */
  excluir: string;
  alCambiar: () => void;
}) {
  const comando = useComando();
  const [destino, setDestino] = useState<Record<string, string>>({});
  const [enVuelo, setEnVuelo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ titulo: string; mensaje: string; waLink: string } | null>(null);

  const otros = equipo.filter((t) => t.activo && t.id !== excluir);

  async function pasar(id: string, quien: string) {
    setEnVuelo(id);
    const r = await comando<ResultadoModificarCita>(
      'modificar_cita',
      { id, accion: 'reasignar', employee_id: destino[id] },
      undefined,
      alCambiar,
    );
    setEnVuelo(null);
    // Si no cabe —ocupado, bloqueado, fuera de su horario— useComando ya ha
    // enseñado el motivo del bot y la cita sigue como estaba.
    if (r) setAviso({ titulo: `Cita de ${quien} reasignada`, mensaje: r.mensaje, waLink: r.wa_link });
  }

  return (
    <>
      {aviso && <AvisarCliente {...aviso} alCerrar={() => setAviso(null)} />}
      <ul>
        {[...citas]
          .sort((a, b) => a.slot_start.localeCompare(b.slot_start))
          .map((c) => {
            const d = parseSlot(c.slot_start);
            const quien = nombrePorLead.get(c.lead_id) ?? 'Cliente';
            return (
              <li key={c.id}>
                <b>{quien}</b>
                <span>{d ? `${diaMes(d)} · ${hora(d)}` : c.slot_start}</span>
                {c.service && <span className="muted">{c.service}</span>}
                {otros.length > 0 && (
                  <>
                    <select
                      className="select"
                      style={{ maxWidth: 150 }}
                      value={destino[c.id] ?? ''}
                      onChange={(e) => setDestino((x) => ({ ...x, [c.id]: e.target.value }))}
                    >
                      <option value="">Pasar a…</option>
                      {otros.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={!destino[c.id] || enVuelo === c.id}
                      onClick={() => void pasar(c.id, quien)}
                    >
                      <UserCog size={13} /> {enVuelo === c.id ? 'Pasando…' : 'Pasar'}
                    </button>
                  </>
                )}
                <Link className="btn btn-ghost btn-sm" href={`/panel/mensajes?lead=${c.lead_id}`}>
                  <MessageCircle size={13} /> Escribirle
                </Link>
              </li>
            );
          })}
      </ul>
    </>
  );
}
