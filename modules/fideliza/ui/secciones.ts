/**
 * Las secciones de Fideliza: pocas arriba, y lo que va junto, dentro de su
 * sección. Las direcciones no cambian: hay enlaces y placas impresas que llevan
 * a ellas. Cada página se enseña a quien puede usarla (la cajera, a lo suyo: caja
 * y clientes), y el permiso de verdad lo sigue poniendo el servidor.
 */
import type { Modo } from './Contexto';

export interface PaginaFideliza {
  href: string;
  label: string;
  permiso: string;
  modos: Modo[];
}

export interface SeccionFideliza {
  label: string;
  icono?: 'ajustes';
  paginas: PaginaFideliza[];
  /** Pantallas de la sección que no tienen pestaña propia. */
  tambien?: string[];
}

const SOLO_CLUB: Modo[] = ['fidelizacion'];
const CON_PAGINA: Modo[] = ['enlaces', 'fidelizacion'];

const SECCIONES: SeccionFideliza[] = [
  { label: 'Inicio', paginas: [{ href: '/panel/fideliza', label: 'Inicio', permiso: 'program.read', modos: ['nuevo', 'enlaces', 'fidelizacion'] }] },
  { label: 'Caja', paginas: [{ href: '/panel/fideliza/caja', label: 'Caja', permiso: 'ops.record', modos: SOLO_CLUB }] },
  {
    label: 'Clientes',
    paginas: [
      { href: '/panel/fideliza/clientes', label: 'Mis clientes', permiso: 'members.read', modos: SOLO_CLUB },
      { href: '/panel/fideliza/campanas', label: 'Campañas', permiso: 'campaigns.manage', modos: SOLO_CLUB },
    ],
  },
  { label: 'Números', paginas: [{ href: '/panel/fideliza/numeros', label: 'Números', permiso: 'metrics.read', modos: SOLO_CLUB }] },
  {
    label: 'Tarjeta de puntos',
    paginas: [{ href: '/panel/fideliza/programa', label: 'Tarjeta de puntos', permiso: 'program.edit', modos: SOLO_CLUB }],
    tambien: ['/panel/fideliza/club'],
  },
  {
    label: 'Enlaces y QR',
    paginas: [
      { href: '/panel/fideliza/mi-pagina', label: 'Mis enlaces', permiso: 'links.manage', modos: CON_PAGINA },
      { href: '/panel/fideliza/placas', label: 'Placas y QR', permiso: 'devices.manage', modos: CON_PAGINA },
      { href: '/panel/fideliza/enlaces', label: 'Otras páginas', permiso: 'links.manage', modos: SOLO_CLUB },
    ],
  },
  { label: 'Ajustes', icono: 'ajustes', paginas: [{ href: '/panel/fideliza/ajustes', label: 'Ajustes', permiso: 'wallet.manage', modos: SOLO_CLUB }] },
];

/** Las secciones que le tocan a este negocio y a esta persona, solo con sus páginas. */
export function seccionesDe(modo: Modo, puede: (permiso: string) => boolean): SeccionFideliza[] {
  return SECCIONES.map((s) => ({ ...s, paginas: s.paginas.filter((p) => p.modos.includes(modo) && puede(p.permiso)) })).filter((s) => s.paginas.length > 0);
}

export const paginaActiva = (href: string, ruta: string) => (href === '/panel/fideliza' ? ruta === href : ruta.startsWith(href));

export const seccionActiva = (s: SeccionFideliza, ruta: string) =>
  s.paginas.some((p) => paginaActiva(p.href, ruta)) || Boolean(s.tambien?.some((h) => ruta.startsWith(h)));
