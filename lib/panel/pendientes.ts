/**
 * ══════════════════════════════════════════════════════════════════════════
 * LO GUARDADO SE VE, AUNQUE EL BOT NO LO HAYA APLICADO TODAVÍA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * El catálogo se guarda sin esperar al bot (ver `useGuardar`): el cambio entra
 * en la cola `commands` y el bot lo aplica cuando lo recoge — al instante si
 * está encendido, o al volver si estaba caído. Mientras tanto, la base sigue
 * teniendo el valor viejo.
 *
 * Esto pinta los comandos de la cola ENCIMA de lo que hay en la base, para que
 * lo guardado se vea desde el primer momento.
 *
 * ⚠️ Por qué desde la cola y no desde memoria: un cambio pintado solo en el
 * estado de React desaparece al recargar la página, y reaparece cuando el bot lo
 * aplica. Eso se lee exactamente como «no se guardó» — el problema que esto
 * viene a quitar. La cola vive en Supabase: sobrevive a recargas, a cambiar de
 * pantalla y a cerrar el portátil.
 *
 * Tres estados de un comando, tres tratamientos:
 *
 *   pending / processing → se pinta encima y la ficha lleva «aplicándose»
 *   done (hace < 3 min)  → se pinta encima SIN aviso: ya está aplicado, pero el
 *                          espejo puede no haberlo publicado aún. Ver
 *                          VENTANA_ESPEJO_MS.
 *   error                → NO se pinta, y se cuenta: el bot lo rechazó y la
 *                          pantalla no puede fingir que existe.
 */
import { bool, json } from '@/lib/supabase/parse';
import type { CatalogMediaRow } from '@/lib/supabase/types';
import type { ComandoCatalogo, ItemCatalogo } from '@/lib/supabase/queries';

/** Prefijo de los ids que todavía no existen en la base. */
const PREFIJO = 'pendiente:';

/**
 * ¿Es algo recién guardado que aún no tiene id de verdad?
 *
 * ⚠️ Sobre esas filas NO se puede actuar: marcar como principal o borrar una foto
 * con un id que la base no conoce acaba en un error del bot que no se parece en
 * nada a la causa. La pantalla desactiva sus botones hasta que llegue la real.
 */
export const esPendiente = (id: string): boolean => id.startsWith(PREFIJO);

export interface Superpuesto {
  items: ItemCatalogo[];
  medios: Record<string, CatalogMediaRow[]>;
  /** Productos con algún cambio que el bot aún no ha aplicado. */
  aplicandose: Set<string>;
  /** Cambios que el bot rechazó hace poco. */
  fallidos: ComandoCatalogo[];
  /** ¿Hay algo que todavía pueda cambiar? Mientras sí, la pantalla vuelve a mirar. */
  enVuelo: boolean;
}

/** Los campos de `upsert_catalog_item` que se copian tal cual sobre la ficha. */
const CAMPOS_ITEM = [
  'name',
  'description',
  'price',
  'currency',
  'is_active',
  'stock',
  'max_discount',
  'duration_minutes',
  'capacity',
  'package_services',
  'vigencia_meses',
] as const;

export function superponer(
  itemsBase: ItemCatalogo[],
  mediosBase: Record<string, CatalogMediaRow[]>,
  comandos: ComandoCatalogo[],
): Superpuesto {
  // Copias: los datos de useCargar no se tocan. Su huella decide si una
  // recarga trajo algo nuevo, y mutarlos aquí la falsearía.
  const items = itemsBase.map((i) => ({ ...i }));
  const medios: Record<string, CatalogMediaRow[]> = Object.fromEntries(
    Object.entries(mediosBase).map(([k, v]) => [k, v.map((m) => ({ ...m }))]),
  );

  const aplicandose = new Set<string>();
  const fallidos: ComandoCatalogo[] = [];
  let enVuelo = false;

  /** Dónde vive una foto: la lista de su producto. */
  const buscarMedio = (id: string): [string, number] | null => {
    for (const [catId, lista] of Object.entries(medios)) {
      const i = lista.findIndex((m) => m.id === id);
      if (i >= 0) return [catId, i];
    }
    return null;
  };

  for (const c of comandos) {
    if (c.status === 'error') {
      fallidos.push(c);
      continue;
    }
    const sinAplicar = c.status === 'pending' || c.status === 'processing';
    // Los `done` recientes también cuentan como "en vuelo": el espejo puede
    // estar a punto de publicarlos, y hasta entonces hay que seguir mirando.
    enVuelo = true;
    const p = c.payload ?? {};

    switch (c.type) {
      case 'upsert_catalog_item': {
        const it = (p.item ?? {}) as Record<string, unknown>;
        const id = typeof it.id === 'string' ? it.id : null;

        if (id) {
          const destino = items.find((i) => i.id === id);
          if (!destino) break;
          const d = destino as unknown as Record<string, unknown>;
          for (const k of CAMPOS_ITEM) if (k in it) d[k] = it[k];
          destino.activo = bool(destino.is_active as number | null, true);
          destino.paquete = json<string[]>(destino.package_services as string | null, []);
          if (sinAplicar) aplicandose.add(id);
          break;
        }

        /**
         * Producto NUEVO: todavía no tiene id. Se reconoce por el nombre, que
         * es único por construcción —Mia pide los productos por nombre y la
         * pantalla ya impide crear dos iguales—. Si la fila real ya llegó por el
         * espejo, no se pinta una segunda.
         */
        const nombre = String(it.name ?? '').trim();
        if (!nombre) break;
        if (items.some((i) => i.name.trim().toLowerCase() === nombre.toLowerCase())) break;
        const nuevo = {
          id: `${PREFIJO}${c.id}`,
          name: nombre,
          description: (it.description as string | null) ?? null,
          price: (it.price as number | null) ?? 0,
          currency: (it.currency as string | null) ?? 'PEN',
          is_active: 1,
          stock: null,
          max_discount: null,
          duration_minutes: null,
          capacity: null,
          package_services: '[]',
          activo: true,
          paquete: [],
        } as unknown as ItemCatalogo;
        items.push(nuevo);
        aplicandose.add(nuevo.id);
        break;
      }

      case 'delete_catalog_item': {
        // Borrado LÓGICO en el bot: is_active a 0. Aquí igual.
        const destino = items.find((i) => i.id === p.id);
        if (!destino) break;
        destino.is_active = 0 as ItemCatalogo['is_active'];
        destino.activo = false;
        if (sinAplicar) aplicandose.add(destino.id);
        break;
      }

      case 'upsert_catalog_media': {
        const catId = String(p.catalog_id ?? '');
        const url = String(p.url ?? '');
        if (!catId || !url) break;
        const lista = (medios[catId] ??= []);

        if (typeof p.id === 'string') {
          // Sustituir: mismo sitio, fichero nuevo. Es lo que hace el bot.
          const donde = buscarMedio(p.id);
          if (donde) {
            const m = medios[donde[0]][donde[1]];
            m.url = url;
            m.media_type = (p.media_type as CatalogMediaRow['media_type']) ?? m.media_type;
          }
        } else if (!lista.some((m) => m.url === url)) {
          // Nueva. Si la real ya llegó con la misma URL, no se duplica.
          const ultimo = Math.max(0, ...lista.map((m) => m.sort_order ?? 0));
          lista.push({
            id: `${PREFIJO}${c.id}`,
            catalog_id: catId,
            url,
            media_type: (p.media_type as CatalogMediaRow['media_type']) ?? 'image',
            sort_order: ultimo + 1,
            is_primary: 0,
          } as unknown as CatalogMediaRow);
        }
        if (sinAplicar) aplicandose.add(catId);
        break;
      }

      case 'delete_catalog_media': {
        const donde = typeof p.id === 'string' ? buscarMedio(p.id) : null;
        if (!donde) break;
        medios[donde[0]].splice(donde[1], 1);
        if (sinAplicar) aplicandose.add(donde[0]);
        break;
      }

      case 'set_primary_media': {
        // El bot desmarca las demás del mismo producto en la misma operación:
        // aquí igual, o se verían dos ★ a la vez.
        const donde = typeof p.id === 'string' ? buscarMedio(p.id) : null;
        if (!donde) break;
        for (const m of medios[donde[0]]) {
          m.is_primary = (m.id === p.id ? 1 : 0) as CatalogMediaRow['is_primary'];
        }
        if (sinAplicar) aplicandose.add(donde[0]);
        break;
      }
    }
  }

  return { items, medios, aplicandose, fallidos, enVuelo };
}
