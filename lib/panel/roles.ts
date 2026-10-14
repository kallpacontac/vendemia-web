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
  | 'bot.ver'
  /** `companies` entera (la 0043 del bot). El empleado lee su negocio por `mi_negocio`. */
  | 'negocio.ver'
  /** Los `commands` de todo el negocio (la 0043). El empleado, solo los suyos. */
  | 'comandos.ver';

/**
 * Copia de `rol_puede()` (migraciones 0041 y 0043 del bot). La autoridad es aquella: en
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
    'metricas.ver', 'catalogo.ver', 'plan.ver', 'bot.ver', 'negocio.ver', 'comandos.ver',
  ],
  admin: [
    'agenda.todo', 'equipo.ver', 'clientes.ver', 'caja.ver', 'comisiones.ver',
    'catalogo.ver', 'plan.ver', 'bot.ver', 'negocio.ver', 'comandos.ver',
  ],
  empleado: ['agenda.mia', 'equipo.ver', 'comisiones.mia', 'catalogo.ver'],
};

export const rolPuede = (rol: RolNegocio | null, permiso: Permiso): boolean =>
  rol !== null && MATRIZ[rol].includes(permiso);

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ¿YA RIGE EL REPARTO POR ROLES? · el interruptor del corte
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Es una variable de entorno y no una constante a propósito: el corte se hace
 * en Vercel poniendo `NEXT_PUBLIC_ROLES_EN_VIGOR=1` y redesplegando, el MISMO
 * día en que el bot activa sus políticas (la fase 4 de docs/PLAN-ROLES.md). Sin
 * tocar código, y se deshace igual de rápido.
 *
 * Mientras esté apagada, el panel se comporta como siempre: todo el que entra
 * lo ve todo, que es lo que la base le deja leer. Todo lo de la fase 4 —el
 * menú por rol, las pantallas del empleado— pregunta aquí antes.
 *
 * ⚠️ Los dos lados tienen que ir juntos. Encendida aquí con la base sin
 * cortar, el panel esconde pero los datos siguen leyéndose a mano. Al revés
 * —la base cortada y esto apagado— es peor: al empleado le saldrían las
 * pantallas de siempre, vacías.
 */
export const rolesEnVigor = (): boolean => process.env.NEXT_PUBLIC_ROLES_EN_VIGOR === '1';

/** Lo que pregunta la pantalla. Antes del corte, sí a todo; después, la matriz. */
export const puedeVer = (rol: RolNegocio | null, permiso: Permiso): boolean =>
  !rolesEnVigor() || rolPuede(rol, permiso);

/**
 * ¿Se le enseñan en solo lectura los campos que solo cambia el dueño? Son los
 * métodos de pago, los teléfonos del negocio y los % de comisión: el bot no se
 * los aplica a nadie más y devuelve `sin_permiso`. Ofrecérselos editables al
 * administrador era invitarle a un «esto solo lo cambia el dueño» al guardar.
 *
 * Antes del corte, nadie. Al admin de la plataforma (rol `null`) tampoco: es
 * soporte, y quien decide si se aplica es el bot.
 */
export const soloLeeLoDelDueno = (rol: RolNegocio | null): boolean =>
  rolesEnVigor() && (rol === 'admin' || rol === 'empleado');

/* ── El corte ───────────────────────────────────────────────────────────── */

/**
 * El día en que cada persona pasa a ver solo lo que le toca (la fase 4 del
 * plan, docs/PLAN-ROLES.md). `null` = no hay corte anunciado y el aviso no sale.
 *
 * Regla de Alvaro (13-oct-2026): UNA SEMANA después de que los dueños vean el
 * aviso. Está puesto para que esto llegue a producción el 13 o el 14 de
 * octubre; ⚠️ si se despliega más tarde, hay que mover esta fecha, o el aviso
 * prometerá menos de una semana.
 *
 * ⚠️ Esto solo ANUNCIA. El corte no ocurre solo al llegar el día: lo despliegan
 * a mano el bot (políticas y comandos) y el panel, y entonces esta constante y
 * el aviso se quitan.
 */
export const CORTE_DE_ROLES: string | null = '2026-10-21';

/** El corte anunciado, listo para escribir: «21 de octubre». `null` si no hay. */
export function corteDeRoles(ahora: Date = new Date()): { dia: string; pasado: boolean } | null {
  // Con el corte ya hecho no hay nada que anunciar: el aviso se quita solo.
  if (!CORTE_DE_ROLES || rolesEnVigor()) return null;
  // A mediodía de Lima: así el día no baila con la zona horaria de quien mira.
  const fecha = new Date(`${CORTE_DE_ROLES}T12:00:00-05:00`);
  if (Number.isNaN(fecha.getTime())) return null;
  const dia = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', timeZone: 'America/Lima' }).format(fecha);
  return { dia, pasado: ahora.getTime() > fecha.getTime() + 12 * 3600 * 1000 };
}
