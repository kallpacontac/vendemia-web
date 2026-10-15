/**
 * ══════════════════════════════════════════════════════════════════════════
 * PIDE · direcciones públicas
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La página que el negocio comparte con SUS clientes: catálogo, reservas,
 * inscripciones y envíos, todo bajo un mismo enlace.
 *
 *   pide.vendemias.com/<negocio>            portada y catálogo
 *   pide.vendemias.com/<negocio>/reservar   citas y grupos
 *   pide.vendemias.com/<negocio>/envio      agendar un envío
 *
 * Es un producto aparte: no depende de Mia ni de Fideliza. Ver
 * docs/PLAN-PIDE.md.
 *
 * Por dentro las rutas viven en /pide/<negocio>; el middleware traduce el
 * host (modules/pide/servidor/hosts.ts). En local no hay host aparte:
 * localhost:3000/pide/<negocio>.
 */
export const PIDE_URL = (process.env.NEXT_PUBLIC_PIDE_URL || 'http://localhost:3000/pide').replace(/\/+$/, '');

/** El mismo formato que el slug de Fideliza: 3–40, minúsculas, cifras y guiones. */
export const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export const urlPagina = (slug: string) => `${PIDE_URL}/${slug}`;
export const urlReservar = (slug: string) => `${PIDE_URL}/${slug}/reservar`;
export const urlEnvio = (slug: string) => `${PIDE_URL}/${slug}/envio`;
