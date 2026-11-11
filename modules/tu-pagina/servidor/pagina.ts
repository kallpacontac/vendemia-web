import 'server-only';
import { unstable_cache } from 'next/cache';
import { rpc, servidor, log } from '@/modules/tu-pagina/servidor/supabase';
import { SLUG } from '@/modules/tu-pagina/dominio/config';
import type { TiposDePagina } from '@/modules/tu-pagina/dominio/tienda';
import type { Proveedor } from '@/modules/tu-pagina/dominio/reclamos';
import type { AparienciaPagina } from '@/modules/tu-pagina/dominio/apariencia';
import type { ConfigCanchas } from '@/modules/tu-pagina/dominio/canchas';
import type { AjustesCarta } from '@/modules/tu-pagina/dominio/mesa';
import type { ConfigTarjeta } from '@/modules/tu-pagina/dominio/tarjeta';
import type { CobroPedidos } from '@/modules/tu-pagina/dominio/cobroPedidos';

export interface Secciones {
  catalogo?: boolean;
  reservar?: boolean;
  envios?: boolean;
  /** Qué es cada cosa del catálogo en esta página, si no es lo que diría el modo (dominio/tienda.ts). */
  tipos?: TiposDePagina;
  apariencia?: AparienciaPagina;
  /** Libro de Reclamaciones Virtual encendido (sql/0006). Con `proveedor` completo. */
  reclamos?: boolean;
  proveedor?: Partial<Proveedor>;
  /** Tabla de canchas por horas y precio de noche (dominio/canchas.ts). */
  canchas?: ConfigCanchas;
  /** Favoritos, precio de antes, horario y nombre en inglés de cada plato (dominio/mesa.ts). */
  carta?: AjustesCarta;
  /** La tarjeta de puntos de Fideliza en la página (dominio/tarjeta.ts). */
  fideliza?: ConfigTarjeta;
  /** Cómo cobra los pedidos (dominio/cobroPedidos.ts). Lo guarda pedido_cobro_guardar (sql/0020). */
  cobroPedidos?: CobroPedidos;
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
