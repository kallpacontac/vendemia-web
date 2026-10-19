import 'server-only';
import { unstable_cache } from 'next/cache';
import { rpc, servidor, log } from '@/modules/tu-pagina/servidor/supabase';
import { SLUG } from '@/modules/tu-pagina/dominio/config';
import { armarEscaparate, type DatosCrudos, type Escaparate, type ComoSeOfrece } from '@/modules/tu-pagina/dominio/tienda';

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
 *
 * Se cachea lo crudo y se arma fuera: qué es cada ítem (Agenda, Tienda o Las
 * dos, y lo marcado) viene de la página, no de esta caché.
 */
export async function escaparateDe(slug: string, como?: ComoSeOfrece): Promise<Escaparate | null> {
  const s = slug.toLowerCase();
  if (!SLUG.test(s)) return null;
  const d = await unstable_cache(
    async () => {
      try {
        return await datosFrescos(s);
      } catch (e) {
        log('tu_pagina_escaparate_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
        return null;
      }
    },
    ['tu-pagina-datos', s],
    { tags: [`tu-pagina:${s}`], revalidate: 15 },
  )();
  return d ? armarEscaparate(d, como) : null;
}
