/**
 * ══════════════════════════════════════════════════════════════════════════
 * TU PÁGINA · direcciones públicas
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La página que el negocio comparte con SUS clientes: catálogo, reservas,
 * inscripciones y envíos, todo bajo un mismo enlace. Por fuera se llama «Tu
 * página»; por dentro (carpetas, tablas pide_*, /api/pide) sigue siendo Pide.
 *
 * Dos hosts que sirven LO MISMO (Alvaro, 15-oct-2026):
 *
 *   tienda.vendemias.com/<negocio>   el enlace de quien vende
 *   agenda.vendemias.com/<negocio>   el de quien agenda: citas y grupos
 *
 * El panel le da a cada negocio el suyo según su business_mode (baseDe); el
 * otro también abre su página, así que nunca hay un enlace roto. Debajo:
 * /reservar (citas y grupos) y /envio (agendar un envío).
 *
 * Es un producto aparte: no depende de Mia ni de Fideliza. Ver
 * docs/PLAN-PIDE.md.
 *
 * Por dentro las rutas viven en /pide/<negocio>; el middleware traduce el
 * host (modules/pide/servidor/hosts.ts). En local no hay host aparte:
 * localhost:3000/pide/<negocio>.
 */
import { esAppointmentFamily } from '@/lib/panel/modo';
import type { BusinessMode } from '@/lib/supabase/types';

const LOCAL = 'http://localhost:3000/pide';
const sinBarra = (u: string) => u.replace(/\/+$/, '');

export const TIENDA_URL = sinBarra(process.env.NEXT_PUBLIC_TIENDA_URL || LOCAL);
export const AGENDA_URL = sinBarra(process.env.NEXT_PUBLIC_AGENDA_URL || LOCAL);

/** El host que se le da al negocio: agenda si agenda, tienda en todo lo demás. */
export const baseDe = (modo: BusinessMode | null | undefined) => (esAppointmentFamily(modo) ? AGENDA_URL : TIENDA_URL);

/** El mismo formato que el slug de Fideliza: 3–40, minúsculas, cifras y guiones. */
export const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

type Modo = BusinessMode | null | undefined;
export const urlPagina = (slug: string, modo: Modo) => `${baseDe(modo)}/${slug}`;
export const urlReservar = (slug: string, modo: Modo) => `${baseDe(modo)}/${slug}/reservar`;
export const urlEnvio = (slug: string, modo: Modo) => `${baseDe(modo)}/${slug}/envio`;
