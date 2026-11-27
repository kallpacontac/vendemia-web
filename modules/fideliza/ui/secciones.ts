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

/*
 * 20-nov-2026 (maqueta aprobada por Alvaro): de 7 pestañas a 5 — Inicio · Caja · Clientes ·
 * Avisos · Mi club. Avisos sale de Clientes porque es lo que el dueño tiene que encontrar sin
 * buscar; todo lo de la tarjeta (premio, diseño, QR, placas, enlaces) va junto en «Mi club», que
 * abre la pantalla única del club y deja el asistente de 6 pasos como «Opciones avanzadas».
 * Inicio pide metrics.read: el cajero no lo ve y entra directo a la Caja (ver Resumen.tsx).
 */
const SECCIONES: SeccionFideliza[] = [
  {
    label: 'Inicio',
    paginas: [
      { href: '/panel/fideliza', label: 'Resumen', permiso: 'metrics.read', modos: ['nuevo', 'enlaces', 'fidelizacion'] },
      { href: '/panel/fideliza/numeros', label: 'Números', permiso: 'metrics.read', modos: SOLO_CLUB },
    ],
  },
  { label: 'Caja', paginas: [{ href: '/panel/fideliza/caja', label: 'Caja', permiso: 'ops.record', modos: SOLO_CLUB }] },
  { label: 'Clientes', paginas: [{ href: '/panel/fideliza/clientes', label: 'Clientes', permiso: 'members.read', modos: SOLO_CLUB }] },
  // 26-nov-2026 (Alvaro: «deja claro el tema de las promociones y los referidos»): Avisos pasa a
  // ser Promociones, con todo lo que trae, hace volver y hace hablar bien. Misma dirección.
  { label: 'Promociones', paginas: [{ href: '/panel/fideliza/campanas', label: 'Promociones', permiso: 'campaigns.manage', modos: SOLO_CLUB }] },
  {
    label: 'Mi club',
    paginas: [
      { href: '/panel/fideliza/club', label: 'Tu tarjeta', permiso: 'program.edit', modos: SOLO_CLUB },
      { href: '/panel/fideliza/mi-pagina', label: 'Mis enlaces', permiso: 'links.manage', modos: CON_PAGINA },
      { href: '/panel/fideliza/placas', label: 'QR y placas', permiso: 'devices.manage', modos: CON_PAGINA },
      { href: '/panel/fideliza/enlaces', label: 'Otras páginas', permiso: 'links.manage', modos: SOLO_CLUB },
    ],
    tambien: ['/panel/fideliza/programa'],
  },
  { label: 'Ajustes', icono: 'ajustes', paginas: [{ href: '/panel/fideliza/ajustes', label: 'Ajustes', permiso: 'team.manage', modos: SOLO_CLUB }] },
];

/** Las secciones que le tocan a este negocio y a esta persona, solo con sus páginas. */
export function seccionesDe(modo: Modo, puede: (permiso: string) => boolean): SeccionFideliza[] {
  return SECCIONES.map((s) => ({
    ...s,
    // Sin club (solo página de enlaces), «Mi club» no dice nada: ahí son sus enlaces.
    label: s.label === 'Mi club' && modo !== 'fidelizacion' ? 'Mis enlaces' : s.label,
    paginas: s.paginas.filter((p) => p.modos.includes(modo) && puede(p.permiso)),
  })).filter((s) => s.paginas.length > 0);
}

export const paginaActiva = (href: string, ruta: string) => (href === '/panel/fideliza' ? ruta === href : ruta.startsWith(href));

export const seccionActiva = (s: SeccionFideliza, ruta: string) =>
  s.paginas.some((p) => paginaActiva(p.href, ruta)) || Boolean(s.tambien?.some((h) => ruta.startsWith(h)));
