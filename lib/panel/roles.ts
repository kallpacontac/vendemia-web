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
 * El bot tiene la misma tabla para el asistente (`rolEnElAsistente`, en
 * src/services/owner/operadores.ts de su repo). Si cambia aquí, cambia allí.
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
