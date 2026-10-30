'use client';

/**
 * Lo que hace la página del negocio (Agenda, Tienda o Las dos), para el resto
 * del panel. Desde el 19-oct-2026 lo decide la página y no `business_mode`: una
 * tienda cuya página reserva necesita la Agenda en el menú y la duración en el
 * catálogo; un salón cuya página vende necesita Pedidos.
 *
 * Sin página publicada (o si no se puede leer), nada: el panel sigue al modo.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export interface LoQueHaceLaPagina {
  vende: boolean;
  reserva: boolean;
  /** «Agendar un envío»: los recojos se ven en Pedidos. */
  envios: boolean;
}

const NADA: LoQueHaceLaPagina = { vende: false, reserva: false, envios: false };

export async function getLoQueHaceLaPagina(companyId: string): Promise<LoQueHaceLaPagina> {
  try {
    const { data } = await supabase().from('tu_pagina').select('publicada, secciones').eq('company_id', companyId).maybeSingle();
    const s = (data?.publicada ? data.secciones : null) as { catalogo?: boolean; reservar?: boolean; envios?: boolean } | null;
    return { vende: Boolean(s?.catalogo), reserva: Boolean(s?.reservar), envios: Boolean(s?.envios) };
  } catch {
    return NADA;
  }
}

export function useLoQueHaceLaPagina(companyId: string | null | undefined): LoQueHaceLaPagina {
  const [lo, setLo] = useState<LoQueHaceLaPagina>(NADA);
  useEffect(() => {
    if (!companyId) return setLo(NADA);
    let vigente = true;
    void getLoQueHaceLaPagina(companyId).then((x) => vigente && setLo(x));
    return () => {
      vigente = false;
    };
  }, [companyId]);
  return lo;
}
