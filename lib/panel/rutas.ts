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

export const RUTAS_GLOBALES = ['/panel/retargeting'] as const;

/** A dónde va el admin de plataforma cuando entra sin compañía. */
export const RUTA_GLOBAL_POR_DEFECTO = '/panel/retargeting';

/** Coincidencia exacta o de subruta, para que `/panel/retargeting/x` también valga. */
export const esRutaGlobal = (ruta: string): boolean =>
  RUTAS_GLOBALES.some((r) => ruta === r || ruta.startsWith(`${r}/`));
