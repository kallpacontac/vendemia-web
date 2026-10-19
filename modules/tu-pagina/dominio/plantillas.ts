/** Tres experiencias públicas. Los valores de plantilla en Postgres se mantienen
 * por compatibilidad con páginas publicadas; el tipo de página decide el diseño. */
import type { BusinessMode } from '@/lib/supabase/types';

export type TipoPagina = 'agenda' | 'tienda' | 'ambos';
export type Disposicion = 'cuadricula' | 'filas' | 'carta';
export type PlantillaGuardada = 'agenda' | 'vitrina' | 'lista';

export const EXPERIENCIAS: { id: TipoPagina; nombre: string; describe: string }[] = [
  { id: 'agenda', nombre: 'Agenda', describe: 'Reservas claras, con servicios, día y hora.' },
  { id: 'tienda', nombre: 'Tienda', describe: 'Fotos protagonistas y pedidos sencillos.' },
  { id: 'ambos', nombre: 'Agenda y tienda', describe: 'Reservas primero y productos en su propia sección.' },
];

export const tipoPagina = (secciones: { catalogo?: boolean; reservar?: boolean }): TipoPagina =>
  secciones.catalogo && secciones.reservar ? 'ambos' : secciones.reservar ? 'agenda' : 'tienda';

export const tipoPorDefecto = (modo: BusinessMode | null | undefined): TipoPagina =>
  modo === 'ecommerce' ? 'tienda' : 'agenda';

/** Valores aceptados por el CHECK existente de tu_pagina.plantilla. */
export const plantillaGuardada = (tipo: TipoPagina): PlantillaGuardada =>
  tipo === 'agenda' ? 'agenda' : tipo === 'ambos' ? 'lista' : 'vitrina';
