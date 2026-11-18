'use client';

/**
 * Ver una sede o todo el negocio (17-nov-2026, The 24/7: «no veo las dos sedes… cuál tiene cita y
 * cuál no, la caja y las métricas por sede o todo»).
 *
 *   · Las sedes son las de Mi página (secciones.citas.sedes, tu-pagina 0023). Con menos de 2 no sale
 *     nada y todo sigue como siempre.
 *   · La elección se recuerda en este aparato y es LA MISMA en Agenda y Caja: Jhony elige «Premium»
 *     una vez y lo ve en las dos.
 *   · Una cita sin sede (las de antes de la 0023) solo cuenta en «Todas».
 */
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, MapPin } from 'lucide-react';
import { useCargar } from '@/components/panel/useCargar';
import { supabase } from '@/lib/supabase/client';
import { sedesDe, type Sede } from '@/modules/tu-pagina/dominio/adelantoCitas';

/** Las sedes de Mi página. [] si no hay o no se pudo leer. */
export function useSedes(companyId: string | null | undefined): Sede[] {
  const { datos } = useCargar(async () => {
    if (!companyId) return [];
    const r = await supabase().from('tu_pagina').select('secciones').eq('company_id', companyId).maybeSingle();
    return sedesDe((r.data as { secciones?: { citas?: unknown } } | null)?.secciones?.citas);
  }, [companyId]);
  return datos ?? [];
}

const clave = (companyId: string) => `vm-sede:${companyId}`;
/** El aviso a las demás piezas de la pantalla: la cabecera elige, Agenda y Caja se enteran al instante. */
const EVENTO = 'vm-sede';

/**
 * La sede elegida ('' = todas), recordada en este aparato y LA MISMA en todo el panel: se elige
 * una vez arriba, en la cabecera (SedeGlobal), y Agenda y Caja la siguen sin recargar. Si ya no
 * existe, vuelve a «Todas».
 */
export function useSedeElegida(companyId: string | null | undefined, sedes: Sede[]): [string, (s: string) => void] {
  const [sede, setSede] = useState('');
  useEffect(() => {
    if (!companyId) return;
    try {
      setSede(localStorage.getItem(clave(companyId)) ?? '');
    } catch {
      /* sin almacenamiento: «Todas» */
    }
    const alCambiar = (e: Event) => {
      const d = (e as CustomEvent<{ companyId: string; sede: string }>).detail;
      if (d?.companyId === companyId) setSede(d.sede);
    };
    // Otra pestaña del mismo aparato.
    const alGuardar = (e: StorageEvent) => {
      if (e.key === clave(companyId)) setSede(e.newValue ?? '');
    };
    window.addEventListener(EVENTO, alCambiar);
    window.addEventListener('storage', alGuardar);
    return () => {
      window.removeEventListener(EVENTO, alCambiar);
      window.removeEventListener('storage', alGuardar);
    };
  }, [companyId]);
  const valida = sede && sedes.some((s) => s.nombre === sede) ? sede : '';
  const elegir = (s: string) => {
    setSede(s);
    if (!companyId) return;
    try {
      localStorage.setItem(clave(companyId), s);
    } catch {
      /* solo para esta visita */
    }
    window.dispatchEvent(new CustomEvent(EVENTO, { detail: { companyId, sede: s } }));
  };
  return [sedes.length >= 2 ? valida : '', elegir];
}

/** «Huallaga 646 · 24/7 Premium» → «Huallaga 646»: en una línea con fecha y servicio, el nombre entero no cabe. */
export const sedeCorta = (s: string | null | undefined) => (s ?? '').split(' · ')[0].trim();

/** ¿Esta cita es de la sede elegida? Con '' (todas), siempre. */
export const esDeSede = (c: { sede?: string | null }, sede: string) => !sede || (c.sede ?? '') === sede;

/** La sede de cada cita, para los pagos que no traen la suya. */
export async function sedesDeCitas(ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  const mapa = new Map<string, string>();
  for (let i = 0; i < unicos.length; i += 300) {
    const { data, error } = await supabase().from('appointments').select('id, sede').in('id', unicos.slice(i, i + 300));
    if (error) throw error;
    for (const a of (data ?? []) as { id: string; sede?: string | null }[]) mapa.set(a.id, a.sede ?? '');
  }
  return mapa;
}

/** «Todas · Huallaga 625 · 24/7 Premium», con un número al lado si se pasa `cuenta`. */
export default function SelectorSede({ sedes, valor, alCambiar, cuenta, etiqueta }: {
  sedes: Sede[];
  valor: string;
  alCambiar: (s: string) => void;
  /** Lo que se cuenta en cada una (p. ej. citas de hoy). '' = todas. */
  cuenta?: (sede: string) => number;
  /** Qué es el número: «hoy», «citas»… */
  etiqueta?: string;
}) {
  if (sedes.length < 2) return null;
  const opciones = ['', ...sedes.map((s) => s.nombre)];
  return (
    <div className="chip-tabs selector-sede" role="tablist" aria-label="Ver sede"
      style={{ display: 'grid', gridTemplateColumns: `repeat(${opciones.length}, minmax(0, 1fr))`, width: '100%', maxWidth: 760, margin: '10px 0' }}>
      {opciones.map((s) => (
        <button key={s || 'todas'} type="button" role="tab" aria-selected={valor === s} className={valor === s ? 'active' : ''}
          onClick={() => alCambiar(s)} style={{ display: 'grid', justifyItems: 'center', alignContent: 'center', gap: 1, minWidth: 0, minHeight: 42, padding: '7px 8px', lineHeight: 1.2, ...(valor === s ? { color: '#fff' } : {}) }}>
          <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s ? s : <><MapPin size={12} aria-hidden="true" style={{ verticalAlign: '-1px', marginRight: 3 }} />Todas</>}
          </span>
          {cuenta && <small style={{ fontWeight: 600, opacity: 0.8, fontSize: 11.5 }}>{cuenta(s)}{etiqueta ? ` ${etiqueta}` : ''}</small>}
        </button>
      ))}
    </div>
  );
}

/**
 * El selector de sede de la cabecera (17-nov-2026, Alvaro: «un selector global y de ahí se
 * filtra»). Un solo sitio, arriba a la derecha, en vez de una barra de tres botones en cada
 * pantalla. Solo sale con 2 sedes o más.
 */
export function SedeGlobal({ companyId }: { companyId: string | null | undefined }) {
  const sedes = useSedes(companyId);
  const [sede, elegir] = useSedeElegida(companyId, sedes);
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);
  if (sedes.length < 2) return null;
  const opciones = ['', ...sedes.map((s) => s.nombre)];
  return (
    <div className="sede-global" ref={caja}>
      <button type="button" className={`sede-global__boton${sede ? ' con-sede' : ''}`} aria-haspopup="listbox" aria-expanded={abierto}
        aria-label={`Sede: ${sede || 'todas'}. Cambiar`} onClick={() => setAbierto((a) => !a)}>
        <MapPin size={16} />
        <span>{sede ? sedeCorta(sede) : 'Todas las sedes'}</span>
        <ChevronDown size={15} />
      </button>
      {abierto && (
        <ul className="sede-global__menu" role="listbox" aria-label="Ver sede">
          {opciones.map((o) => (
            <li key={o || 'todas'}>
              <button type="button" role="option" aria-selected={sede === o} className={sede === o ? 'on' : ''}
                onClick={() => { elegir(o); setAbierto(false); }}>
                <span>
                  <b>{o ? sedeCorta(o) : 'Todas las sedes'}</b>
                  <small>{o ? o.split(' · ').slice(1).join(' · ') || o : 'Todo el negocio junto'}</small>
                </span>
                {sede === o && <Check size={16} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
