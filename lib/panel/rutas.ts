/**
 * ══════════════════════════════════════════════════════════════════════════
 * QUÉ PANTALLAS NO DEPENDEN DE UNA COMPAÑÍA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Casi todo el panel se consulta con la compañía activa: dashboard, leads,
 * agenda, catálogo, métricas y ajustes empiezan con `if (!companyId) return`.
 * Retargeting no — su lista es de TODOS los negocios a la vez y el recorte lo
 * hace el RLS.
 *
 * Esa diferencia importa fuera de la propia pantalla, y por eso vive aquí y no
 * dentro de ella: el admin de la plataforma normalmente no es miembro de
 * ninguna empresa (ver la migración 0020), así que entra sin compañía activa.
 * La guardia de (panel)/layout.tsx lo dejaba fuera con «tu cuenta todavía no
 * tiene un negocio asignado» — un mensaje escrito para una cuenta recién
 * creada, que a él le decía que escribiera a soporte para pedir acceso a algo
 * que ya tiene.
 *
 * ⚠️ Al añadir una pantalla global hay que añadirla AQUÍ, o el admin no podrá
 * abrirla: la guardia lo devolverá a la de por defecto sin decir por qué.
 */
import { puedeUsarAsistente } from './asistente';
import { esEcommerce } from './modo';
import { rolPuede, rolesEnVigor, type Permiso, type RolNegocio } from './roles';
import type { BusinessMode } from '@/lib/supabase/types';

export const RUTAS_GLOBALES = ['/panel/retargeting', '/panel/fabrica'] as const;

/** A dónde va el admin de plataforma cuando entra sin compañía. */
export const RUTA_GLOBAL_POR_DEFECTO = '/panel/retargeting';

/** Coincidencia exacta o de subruta, para que `/panel/retargeting/x` también valga. */
export const esRutaGlobal = (ruta: string): boolean =>
  RUTAS_GLOBALES.some((r) => ruta === r || ruta.startsWith(`${r}/`));

/* ══════════════════════════════════════════════════════════════════════════
   QUÉ PANTALLA ES DE QUIÉN · la fase 4 del plan de roles
   ══════════════════════════════════════════════════════════════════════════

   Una sola tabla para las tres cosas que tienen que estar de acuerdo: el menú
   lateral, las pestañas de arriba y la guardia de (panel)/layout.tsx. Si cada
   una decidiera por su cuenta, el menú ofrecería una pantalla que la guardia
   luego tapa.

   ⚠️ Esto ESCONDE. Lo que impide son las políticas de Postgres y el bot; aquí
   solo se evita enseñar una pantalla que saldría vacía.

   Antes del corte (`rolesEnVigor()` apagado) todo sigue como siempre, y las dos
   pantallas del empleado todavía no existen para nadie.
   ══════════════════════════════════════════════════════════════════════════ */

/** Las pantallas que solo tiene el empleado. */
export const RUTA_MI_AGENDA = '/panel/mi-agenda';
export const RUTA_MI_COMISION = '/panel/mi-comision';

const con = (p: Permiso) => (rol: RolNegocio | null) => rolPuede(rol, p);

/** Prefijo de ruta → quién entra. El orden importa: gana el primero que encaja. */
const PANTALLAS: [string, (rol: RolNegocio | null) => boolean][] = [
  [RUTA_MI_AGENDA, con('agenda.mia')],
  [RUTA_MI_COMISION, con('comisiones.mia')],
  ['/panel/asistente', puedeUsarAsistente],
  ['/panel/mensajes', con('clientes.ver')],
  ['/panel/leads', con('clientes.ver')],
  ['/panel/retargeting', con('clientes.ver')],
  ['/panel/alumnos', con('clientes.ver')],
  ['/panel/agenda', con('agenda.todo')],
  // Las fichas del equipo, sus horarios y ausencias: quien lleva la agenda.
  ['/panel/equipo', con('agenda.todo')],
  ['/panel/comisiones', con('comisiones.ver')],
  ['/panel/pedidos', con('caja.ver')],
  ['/panel/caja', con('caja.ver')],
  // El empleado puede VER el catálogo (`catalogo.ver`), pero esta pantalla es la
  // de editarlo. Hasta que tenga una de solo lectura, no entra.
  ['/panel/catalogo', (rol) => rol !== 'empleado' && rolPuede(rol, 'catalogo.ver')],
  ['/panel/metricas', con('metricas.ver')],
  ['/panel/configuracion', con('bot.ver')],
  // Fideliza reparte con sus propios roles (modules/fideliza), impuestos en la base.
  ['/panel/fideliza', () => true],
  // Solo el admin de la plataforma; eso ya lo decide el menú (`soloAdmin`).
  ['/panel/fabrica', () => true],
];

/** ¿Esta persona tiene esta pantalla? */
export function rutaPermitida(ruta: string, rol: RolNegocio | null): boolean {
  const esDelEmpleado = ruta.startsWith('/panel/mi-');
  if (!rolesEnVigor()) return !esDelEmpleado;
  // El Dashboard es el resumen del negocio, con sus ingresos: del dueño.
  if (ruta === '/panel') return rolPuede(rol, 'metricas.ver');
  const pantalla = PANTALLAS.find(([p]) => ruta === p || ruta.startsWith(`${p}/`));
  // Una pantalla que nadie ha clasificado: solo el dueño. Lista blanca.
  return pantalla ? pantalla[1](rol) : rol === 'dueno';
}

/** A dónde va cada uno al entrar, y a dónde se le manda desde una pantalla que no es suya. */
export function inicioDe(rol: RolNegocio | null, modo: BusinessMode | null | undefined): string {
  if (!rolesEnVigor() || rol === 'dueno' || rol === null) return '/panel';
  if (rol === 'admin') return esEcommerce(modo) ? '/panel/pedidos' : '/panel/agenda';
  // En una tienda no hay citas que atender: al empleado le queda Fideliza.
  return esEcommerce(modo) ? '/panel/fideliza' : RUTA_MI_AGENDA;
}
