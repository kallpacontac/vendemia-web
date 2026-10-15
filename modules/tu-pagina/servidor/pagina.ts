import 'server-only';
import { unstable_cache } from 'next/cache';
import { rpc, servidor, log } from '@/modules/tu-pagina/servidor/supabase';
import { SLUG } from '@/modules/tu-pagina/dominio/config';

export interface Secciones {
  catalogo?: boolean;
  reservar?: boolean;
  envios?: boolean;
}

export interface PaginaPublica {
  slug: string;
  version: number;
  titulo: string;
  frase: string;
  whatsapp: string;
  secciones: Secciones;
  plantilla: string;
  color: string;
  logo_url: string | null;
  portada_url: string | null;
  distritos: string[];
}

/**
 * La página publicada de un negocio, o null. Cacheada por slug: abrirla no
 * consulta la base en cada visita. Al publicar desde el panel se invalida la
 * etiqueta `tu-pagina:<slug>` (modules/tu-pagina/servidor/rutas/publicar.ts); el minuto
 * de `revalidate` es solo la red de seguridad.
 */
export async function paginaDe(slug: string): Promise<PaginaPublica | null> {
  const s = slug.toLowerCase();
  if (!SLUG.test(s)) return null;
  return unstable_cache(
    async () => {
      try {
        const r = await rpc<{ status: string } & PaginaPublica>(servidor(), 'tu_pagina_srv', { p_slug: s });
        return r.status === 'ok' ? r : null;
      } catch (e) {
        log('tu_pagina_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
        throw e;
      }
    },
    ['tu-pagina', s],
    { tags: [`tu-pagina:${s}`], revalidate: 60 },
  )();
}
