import 'server-only';
import { unstable_cache } from 'next/cache';
import { rpc, servidor, log } from '@/modules/tu-pagina/servidor/supabase';
import { urlUnirse } from '@/modules/fideliza/dominio/config';
import { fraseRegla } from '@/modules/fideliza/dominio/formato';
import { selloValido, trazoSello } from '@/modules/fideliza/dominio/sellos';
import type { Negocio } from '@/modules/fideliza/servidor/html';
import { tarjetaActiva, type TarjetaPublica } from '@/modules/tu-pagina/dominio/tarjeta';
import type { PaginaPublica } from '@/modules/tu-pagina/servidor/pagina';

/**
 * La tarjeta de puntos que enseña la página, o null si el dueño no la encendió o
 * su programa no está activo. Cacheada con la misma etiqueta que la página: al
 * guardar Mi página se refresca; si cambian el premio en Fideliza, al minuto.
 * Un fallo de Fideliza nunca tumba la página: la sección no sale y ya.
 */
export async function tarjetaDe(p: Pick<PaginaPublica, 'slug' | 'secciones'>): Promise<TarjetaPublica | null> {
  const c = p.secciones.fideliza;
  if (!tarjetaActiva(c)) return null;
  return unstable_cache(
    async () => {
      try {
        const n = await rpc<Negocio>(servidor(), 'loyalty_srv_business', { p_slug: c.slug, p_event: null });
        if (n.status !== 'ok' || !n.program) return null;
        const estilo = typeof n.brand.style === 'object' && n.brand.style ? n.brand.style : {};
        const sello = selloValido((estilo as { sello?: unknown }).sello);
        const conCasillas = n.program.rule_type !== 'points' && n.program.threshold > 0 && n.program.threshold <= 12;
        return {
          nombre: n.program.name,
          regla: fraseRegla(n.program),
          premio: n.program.reward,
          meta: conCasillas ? n.program.threshold : 0,
          trazo: trazoSello(sello),
          url: urlUnirse(c.slug),
        };
      } catch (e) {
        log('tu_pagina_tarjeta_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
        return null;
      }
    },
    ['tu-pagina-tarjeta', p.slug, c.slug],
    { tags: [`tu-pagina:${p.slug}`], revalidate: 60 },
  )();
}
