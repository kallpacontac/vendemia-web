/**
 * ══════════════════════════════════════════════════════════════════════════
 * QUIÉN ES QUIÉN DENTRO DE UN NEGOCIO
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Un negocio tiene tres clases de persona (Alvaro, 13-oct-2026), y aparte
 * estamos nosotros:
 *
 *   dueno     el dueño del negocio
 *   admin     el administrador: lleva el día a día sin ser el dueño
 *   empleado  el barbero, la estilista, el profesor: según el tipo de negocio
 *   —         superadmin: el equipo de Vendemia. NO es un rol de aquí: sale de
 *             `platform_admins` (`esAdminPlataforma` en Sesion.tsx), porque no
 *             pertenece a ningún negocio.
 *
 * ── De dónde sale ────────────────────────────────────────────────────────
 *
 * De `memberships.role`:
 *
 *   owner  → dueno
 *   admin  → admin     ⚠️ Este valor TODAVÍA NO LO CREA NADIE: ni «Acceso del
 *                      equipo» ni el bot. Hasta que exista el alta de
 *                      administradores, en la práctica solo hay dueños y
 *                      empleados.
 *   member → empleado  Lo confirmó Alvaro el 13-oct-2026: quien se da de alta
 *                      en «Acceso del equipo» es un empleado. (Antes se leía
 *                      como administrador, porque esa persona lo veía todo;
 *                      era una suposición, no estaba escrito en ningún sitio.)
 *   agent  → empleado
 *   otro   → empleado  Ante un rol que no se conoce, el que menos ve.
 *
 * ⚠️ Esta tabla vive en TRES sitios y tienen que decir lo mismo. Si cambia
 * aquí, cambia en los otros dos:
 *
 *   · `rol_en()` en Postgres (migración 0041 del bot);
 *   · `rolDeNegocio` en `src/utils/roles.ts` del bot;
 *   · esta función.
 *
 * ⚠️ ESTO SOLO SIRVE PARA ESCONDER. Hoy el RLS deja leer todas las tablas a
 * cualquier miembro y el bot solo mira el rol en el asistente y al dar de alta
 * usuarios: un `empleado` al que el menú no le enseñe la Caja la sigue pudiendo
 * leer. Lo que aquí se esconda hay que imponerlo también en Postgres y en el
 * bot, o es decoración.
 */
export type RolNegocio = 'dueno' | 'admin' | 'empleado';

export function rolDeNegocio(rol: string | null | undefined): RolNegocio | null {
  if (!rol) return null;
  if (rol === 'owner') return 'dueno';
  if (rol === 'admin') return 'admin';
  return 'empleado';
}

/** Cómo se llama cada `memberships.role` en pantalla. */
export function nombreDeRol(rol: string | null | undefined): string {
  const r = rolDeNegocio(rol);
  return r === 'dueno' ? 'Dueño' : r === 'admin' ? 'Administrador' : 'Empleado';
}

/* ── Qué puede cada rol ─────────────────────────────────────────────────── */

export type Permiso =
  | 'agenda.todo'
  | 'agenda.mia'
  | 'equipo.ver'
  | 'clientes.ver'
  | 'caja.ver'
  /** Las comisiones de TODOS. La propia es `comisiones.mia`. */
  | 'comisiones.ver'
  | 'comisiones.mia'
  | 'metricas.ver'
  | 'catalogo.ver'
  | 'plan.ver'
  | 'bot.ver';

/**
 * Copia de `rol_puede()` (migración 0041 del bot). La autoridad es aquella: en
 * el corte, las políticas de Postgres preguntan allí, no aquí.
 *
 * ⚠️ HOY NO ESCONDE NADA. Hasta el corte —una semana después de que los dueños
 * vean el aviso— el panel sigue enseñándoselo todo a todos, que es lo que la
 * base les deja leer. Está aquí para que ese día el menú y las pantallas
 * pregunten a una sola tabla, y para que sea la misma que la de la base.
 */
const MATRIZ: Record<RolNegocio, readonly Permiso[]> = {
  dueno: [
    'agenda.todo', 'equipo.ver', 'clientes.ver', 'caja.ver', 'comisiones.ver',
    'metricas.ver', 'catalogo.ver', 'plan.ver', 'bot.ver',
  ],
  admin: [
    'agenda.todo', 'equipo.ver', 'clientes.ver', 'caja.ver', 'comisiones.ver',
    'catalogo.ver', 'plan.ver', 'bot.ver',
  ],
  empleado: ['agenda.mia', 'equipo.ver', 'comisiones.mia', 'catalogo.ver'],
};

export const rolPuede = (rol: RolNegocio | null, permiso: Permiso): boolean =>
  rol !== null && MATRIZ[rol].includes(permiso);
