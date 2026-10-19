import 'server-only';
import { unstable_cache } from 'next/cache';
import { rpc, servidor, log } from '@/modules/tu-pagina/servidor/supabase';
import { SLUG } from '@/modules/tu-pagina/dominio/config';
import { armarEscaparate, type DatosCrudos, type Escaparate } from '@/modules/tu-pagina/dominio/tienda';

/** Lo crudo, recién leído de la base. Las rutas que reservan lo usan sin caché. */
export async function datosFrescos(slug: string): Promise<DatosCrudos | null> {
  const s = slug.toLowerCase();
  if (!SLUG.test(s)) return null;
  const r = await rpc<{ status: string } & DatosCrudos>(servidor(), 'tu_pagina_srv_datos', { p_slug: s });
  return r.status === 'ok' ? r : null;
}

/**
 * El escaparate para pintar la página. Caché corta (15 s) con la misma etiqueta
 * que la página: publicar, pedir o reservar la vacían al momento; los cambios
 * del catálogo hechos en el panel llegan como mucho 15 s tarde.
 */
export async function escaparateDe(slug: string): Promise<Escaparate | null> {
  const s = slug.toLowerCase();
  if (!SLUG.test(s)) return null;
  return unstable_cache(
    async () => {
      try {
        const d = await datosFrescos(s);
        return d ? armarEscaparate(d) : null;
      } catch (e) {
        log('tu_pagina_escaparate_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
        return null;
      }
    },
    ['tu-pagina-escaparate', s],
    { tags: [`tu-pagina:${s}`], revalidate: 15 },
  )();
}
