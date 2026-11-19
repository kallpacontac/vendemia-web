'use client';

/**
 * El orden del menú del panel, elegido por el negocio en Ajustes (datos 0020, menu_ajustes).
 *
 * Kallpa, 18-nov-2026: «Fideliza es lo que usan: lo primero luego del Dashboard; que sea
 * configurable». Sin nada guardado, el menú de siempre (Sidebar.tsx decide por tipo de negocio).
 *
 * Reglas que el panel fuerza aunque la base diga otra cosa:
 *   · el Dashboard va primero y siempre a la vista;
 *   · Ajustes siempre a la vista y AL FINAL, justo antes de «Más» (Alvaro, 18-nov-2026); si no,
 *     no habría cómo volver a cambiar el orden;
 *   · lo que no esté en la lista va detrás, en el orden de siempre: una pantalla nueva aparece sola.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export interface OrdenMenu {
  orden: string[];
  enMas: string[];
  /** ¿El empleado ve Fideliza? (datos 0022). null/undefined = como siempre (sí). */
  equipoFideliza?: boolean | null;
}

export const SIN_ORDEN: OrdenMenu = { orden: [], enMas: [] };
export const RUTA_INICIO = '/panel';
export const RUTA_AJUSTES = '/panel/configuracion';
/** Las que no se pueden mandar a «Más». */
export const SIEMPRE_A_LA_VISTA = [RUTA_INICIO, RUTA_AJUSTES];
/** Avisa a la barra de que el orden cambió (Ajustes, al guardar). */
export const EVENTO_MENU = 'vd:menu-orden';

export const personalizado = (o: OrdenMenu) => o.orden.length > 0 || o.enMas.length > 0;

/** Las que no se mueven: el Dashboard primero y Ajustes el último. */
export const FIJAS = [RUTA_INICIO, RUTA_AJUSTES];

/**
 * `nav` en el orden elegido; lo que no está en `orden`, detrás y en su orden de siempre.
 * El Dashboard primero y Ajustes el último, diga lo que diga `orden`.
 */
export function ordenar<T extends { href: string }>(nav: T[], o: OrdenMenu): T[] {
  const pos = (href: string) => {
    if (href === RUTA_INICIO) return -1;
    if (href === RUTA_AJUSTES) return Number.POSITIVE_INFINITY;
    const i = o.orden.indexOf(href);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return nav
    .map((n, i) => ({ n, i }))
    .sort((a, b) => pos(a.n.href) - pos(b.n.href) || a.i - b.i)
    .map((x) => x.n);
}

export const vaEnMas = (href: string, o: OrdenMenu) => !SIEMPRE_A_LA_VISTA.includes(href) && o.enMas.includes(href);

function leerRespuesta(data: unknown): OrdenMenu {
  const d = (data ?? {}) as { orden?: unknown; en_mas?: unknown; equipo_fideliza?: unknown };
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const ve = typeof d.equipo_fideliza === 'boolean' ? d.equipo_fideliza : null;
  return { orden: lista(d.orden), enMas: lista(d.en_mas), equipoFideliza: ve };
}

const clave = (companyId: string) => `vd:menu:${companyId}`;

function deCache(companyId: string | null): OrdenMenu {
  if (!companyId) return SIN_ORDEN;
  try {
    const v = localStorage.getItem(clave(companyId));
    return v ? leerRespuesta(JSON.parse(v)) : SIN_ORDEN;
  } catch {
    return SIN_ORDEN;
  }
}

/**
 * El orden guardado del negocio. Toma enseguida el último visto en este navegador (para que el menú
 * no salte al entrar) y se refresca con la base. Sin la 0020 en la base, el de siempre.
 */
export function useOrdenMenu(companyId: string | null): OrdenMenu {
  // SIN_ORDEN en el primer render (igual que en el servidor); la caché entra en el efecto.
  const [orden, setOrden] = useState<OrdenMenu>(SIN_ORDEN);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    const otra = () => setVuelta((n) => n + 1);
    window.addEventListener(EVENTO_MENU, otra);
    return () => window.removeEventListener(EVENTO_MENU, otra);
  }, []);

  useEffect(() => {
    setOrden(deCache(companyId));
    if (!companyId) return;
    let vigente = true;
    void supabase()
      .rpc('menu_orden', { p_company: companyId })
      .then(({ data, error }) => {
        if (!vigente || error) return;
        const o = leerRespuesta(data);
        setOrden(o);
        try {
          localStorage.setItem(clave(companyId), JSON.stringify({ orden: o.orden, en_mas: o.enMas, equipo_fideliza: o.equipoFideliza ?? null }));
        } catch {
          /* sin almacenamiento: solo se pierde el arranque sin salto */
        }
      });
    return () => {
      vigente = false;
    };
  }, [companyId, vuelta]);

  return orden;
}

/** Guarda el orden. Con `SIN_ORDEN`, vuelve al de siempre. */
export async function guardarOrdenMenu(companyId: string, o: OrdenMenu): Promise<string | null> {
  const { error } = await supabase().rpc('menu_orden_guardar', {
    p_company: companyId,
    p_orden: o.orden,
    p_en_mas: o.enMas.filter((h) => !SIEMPRE_A_LA_VISTA.includes(h)),
  });
  if (error) {
    if (error.code === 'PGRST202' || /menu_orden_guardar/.test(error.message ?? '')) {
      return 'Falta preparar la base para esto (datos 0020). Avísanos y lo activamos.';
    }
    return error.message;
  }
  window.dispatchEvent(new Event(EVENTO_MENU));
  return null;
}

/**
 * ¿El equipo ve Fideliza? (datos 0022; The 24/7, 19-nov-2026: «Fideliza no deberían verlo los
 * empleados, que sea configurable»). Solo esconde: lo que el empleado puede hacer allí lo imponen
 * los roles de Fideliza en la base.
 */
export async function guardarFidelizaEquipo(companyId: string, ve: boolean): Promise<string | null> {
  const { error } = await supabase().rpc('menu_equipo_fideliza_guardar', { p_company: companyId, p_ve: ve });
  if (error) {
    if (error.code === 'PGRST202' || /menu_equipo_fideliza_guardar/.test(error.message ?? '')) {
      return 'Falta preparar la base para esto (modules/datos/sql/0022_fideliza_para_el_equipo.sql).';
    }
    return error.message;
  }
  window.dispatchEvent(new Event(EVENTO_MENU));
  return null;
}
