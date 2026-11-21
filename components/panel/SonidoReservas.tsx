'use client';

/**
 * Suena cuando entra una reserva o un pedido con el panel abierto (21-nov-2026).
 *
 * Para la computadora o la tablet del mostrador: el aviso push suena en el celular que lo
 * activó, pero la pantalla que se queda abierta todo el día no tenía cómo avisar. Cada 20 s
 * cuenta las citas, pedidos y reservas de la página; si un total cambia, pide sus ids, y lo
 * que no estaba antes es nuevo y suena (lib/panel/sonidoAviso.ts).
 *
 *   · Un solo sonido por dispositivo: si ESTE dispositivo ya recibe los avisos push de
 *     reservas, suena el push y esto calla.
 *   · Lo que agenda el propio panel no suena (marcarPropias en commands.ts).
 *   · La primera vuelta solo apunta lo que ya había: abrir el panel no suena.
 *   · Si el navegador no deja sonar (nadie ha tocado la página) o la pestaña está escondida,
 *     la pestaña dice «(1) Nueva reserva» y el ícono de la app instalada lleva el número.
 *   · Dueño y administrador, como la campana. Se apaga en Ajustes › Avisos (por dispositivo).
 *
 * Cada consulta aguanta que su tabla no exista o que el rol no la vea: esa fuente se ignora.
 */
import { useEffect, useRef } from 'react';
import { useSesion } from './Sesion';
import { supabase } from '@/lib/supabase/client';
import { isoLocal } from '@/lib/panel/format';
import { suscripcionActual } from '@/lib/panel/suscribirAvisos';
import { vocabulario } from '@/lib/panel/vocabulario';
import { EVENTO_PREF, esPropia, prepararAudio, sonarAviso, sonidoActivo } from '@/lib/panel/sonidoAviso';

const CADA_MS = 20_000;
/** Con la pestaña escondida, una de cada tres vueltas (~1 min): el navegador frena igual. */
const VUELTAS_ESCONDIDA = 3;
/** Cada 5 min se piden las listas aunque los totales no cambien (una cancelada + una nueva). */
const LISTA_CADA_MS = 5 * 60_000;

type Fuente = 'citas' | 'pedidos' | 'pedidos_web' | 'reservas_web';
type Consulta = PromiseLike<{ data: unknown; error: unknown; count?: number | null }>;

/**
 * Cada fuente, en dos consultas: el TOTAL (sin filas: lo de cada vuelta, casi gratis) y la
 * LISTA de ids (solo cuando el total cambia). Rendimiento, 21-nov-2026: pedir los ids de todas
 * las citas futuras cada 20 s eran miles de filas por minuto en un negocio con agenda llena.
 */
function fuentes(companyId: string): Record<Fuente, { total: () => Consulta; lista: () => Consulta }> {
  const sb = supabase();
  const hoy = isoLocal(new Date());
  const ayer = () => new Date(Date.now() - 86_400_000).toISOString();
  // Las vivas de hoy en adelante; «sched:…» (clases) entra porque 's' > '2'.
  const citas = (sel: string, head: boolean) =>
    sb.from('appointments').select(sel, head ? { count: 'exact', head: true } : undefined).eq('company_id', companyId)
      .in('status', ['confirmed', 'pending_payment']).gte('slot_start', `${hoy} 00:00`);
  return {
    citas: { total: () => citas('id', true), lista: () => citas('id', false).limit(5000) },
    pedidos: {
      total: () => sb.from('orders').select('id', { count: 'exact', head: true }).eq('company_id', companyId).neq('status', 'cancelled'),
      lista: () => sb.from('orders').select('id').eq('company_id', companyId).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(50),
    },
    pedidos_web: {
      total: () => sb.from('pedidos_web').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
      lista: () => sb.from('pedidos_web').select('id').eq('company_id', companyId).gte('creado_at', ayer()).limit(500),
    },
    reservas_web: {
      total: () => sb.from('reservas_web').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
      lista: () => sb.from('reservas_web').select('id').eq('company_id', companyId).gte('creado_at', ayer()).limit(500),
    },
  };
}

async function contar(q: Consulta): Promise<number | undefined> {
  try {
    const r = await q;
    return r.error || typeof r.count !== 'number' ? undefined : r.count;
  } catch {
    return undefined;
  }
}

async function listar(q: Consulta): Promise<string[] | undefined> {
  try {
    const r = await q;
    if (r.error || !Array.isArray(r.data)) return undefined;
    return (r.data as { id: unknown }[]).map((x) => String(x.id));
  } catch {
    return undefined;
  }
}

export default function SonidoReservas() {
  const { companyId, rol, compania, canchas } = useSesion();
  const modo = compania?.business_mode ?? null;
  const ve = Boolean(companyId) && rol !== 'empleado';
  const vistos = useRef<Partial<Record<Fuente, Set<string>>>>({});
  const sinVer = useRef(0);
  const tituloOriginal = useRef<string | null>(null);

  useEffect(() => {
    if (!ve || !companyId) return;
    prepararAudio();
    vistos.current = {};
    let vivo = true;
    let activo = sonidoActivo();
    // ¿Este dispositivo ya recibe el push de reservas? Entonces suena el push, no esto.
    let conPush = false;
    let pushMirado = 0;
    const mirarPush = async () => {
      if (Date.now() - pushMirado < 5 * 60_000) return;
      pushMirado = Date.now();
      try {
        const s = await suscripcionActual(companyId);
        conPush = Boolean(s?.fila && (s.fila.prefs as Record<string, boolean> | undefined)?.reserva !== false);
      } catch {
        conPush = false;
      }
    };

    const v = vocabulario(modo, { canchas });
    // Lo de cada negocio: «Nueva cita», «Nueva clase», «Nuevo pedido» (tienda).
    const a = v.reserva === 'pedido' ? 'o' : v.a;

    const limpiarTitulo = () => {
      sinVer.current = 0;
      if (tituloOriginal.current !== null) {
        if (document.title.startsWith('(')) document.title = tituloOriginal.current;
        tituloOriginal.current = null;
      }
      try {
        void (navigator as Navigator & { clearAppBadge?: () => Promise<void> }).clearAppBadge?.();
      } catch {
        /* sin insignia */
      }
    };
    const marcarTitulo = (n: number) => {
      sinVer.current += n;
      if (tituloOriginal.current === null) tituloOriginal.current = document.title;
      const que = sinVer.current === 1 ? `Nuev${a} ${v.reserva}` : `Nuev${a}s ${v.reservas}`;
      document.title = `(${sinVer.current}) ${que} · ${tituloOriginal.current}`;
      try {
        void (navigator as Navigator & { setAppBadge?: (n: number) => Promise<void> }).setAppBadge?.(sinVer.current);
      } catch {
        /* sin insignia */
      }
    };
    const alVolver = () => {
      if (document.visibilityState === 'visible') limpiarTitulo();
    };

    const totales: Partial<Record<Fuente, number>> = {};
    let listasAt = 0;
    let tic = 0;
    const vuelta = async (forzar = false) => {
      tic++;
      if (!forzar && document.visibilityState !== 'visible' && tic % VUELTAS_ESCONDIDA !== 0) return;
      const fs = fuentes(companyId);
      const todas = forzar || Date.now() - listasAt > LISTA_CADA_MS;
      if (todas) listasAt = Date.now();
      let nuevas = 0;
      await Promise.all((Object.keys(fs) as Fuente[]).map(async (f) => {
        const total = await contar(fs[f].total());
        if (total === undefined) return; // tabla que no existe o que este rol no ve
        const cambio = totales[f] !== total;
        totales[f] = total;
        if (!cambio && !todas) return;
        const lista = await listar(fs[f].lista());
        if (!lista || !vivo) return;
        const antes = vistos.current[f];
        // Primera respuesta de esta fuente: solo se apunta lo que ya había.
        if (antes) for (const id of lista) if (!antes.has(id) && !esPropia(id)) nuevas++;
        const set = antes ?? new Set<string>();
        for (const id of lista) set.add(id);
        vistos.current[f] = set;
      }));
      if (!vivo || !nuevas || !activo) return;
      await mirarPush();
      if (conPush) return;
      const sono = sonarAviso();
      if (!sono || document.visibilityState !== 'visible') marcarTitulo(nuevas);
    };

    const alCambiarPref = () => {
      activo = sonidoActivo();
      pushMirado = 0;
    };

    void mirarPush();
    void vuelta(true);
    const t = setInterval(() => void vuelta(), CADA_MS);
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    window.addEventListener('pointerdown', alVolver, { passive: true });
    window.addEventListener(EVENTO_PREF, alCambiarPref);
    return () => {
      vivo = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
      window.removeEventListener('pointerdown', alVolver);
      window.removeEventListener(EVENTO_PREF, alCambiarPref);
      limpiarTitulo();
    };
  }, [ve, companyId, modo, canchas]);

  return null;
}
