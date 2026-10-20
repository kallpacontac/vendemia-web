/** La función de la página y su diseño son elecciones independientes.
 * Los seis valores siguen siendo los aceptados por tu_pagina.plantilla en Postgres. */
import type { BusinessMode } from '@/lib/supabase/types';

export type TipoPagina = 'agenda' | 'tienda' | 'ambos';
export type Disposicion = 'cuadricula' | 'filas' | 'carta';
export type PlantillaGuardada = 'agenda' | 'vitrina' | 'lista' | 'carta' | 'clases' | 'envios';

export const PLANTILLAS: { id: PlantillaGuardada; nombre: string; describe: string }[] = [
  { id: 'vitrina', nombre: 'Minimalista', describe: 'Fotos grandes y tarjetas limpias.' },
  { id: 'lista', nombre: 'Editorial', describe: 'Productos fáciles de comparar.' },
  { id: 'carta', nombre: 'Clásico cálido', describe: 'Categorías y precios como una carta.' },
  { id: 'agenda', nombre: 'Nocturna', describe: 'Fondo oscuro y acentos luminosos.' },
];

export const plantillaValida = (valor: unknown): valor is PlantillaGuardada =>
  valor === 'vitrina' || valor === 'lista' || valor === 'carta' ||
  valor === 'agenda' || valor === 'clases' || valor === 'envios';

export const EXPERIENCIAS: { id: TipoPagina; nombre: string; describe: string }[] = [
  { id: 'agenda', nombre: 'Agenda', describe: 'Reservas claras, con servicios, día y hora.' },
  { id: 'tienda', nombre: 'Tienda', describe: 'Fotos protagonistas y pedidos sencillos.' },
  { id: 'ambos', nombre: 'Agenda y tienda', describe: 'Reservas primero y productos en su propia sección.' },
];

export const tipoPagina = (secciones: { catalogo?: boolean; reservar?: boolean }): TipoPagina =>
  secciones.catalogo && secciones.reservar ? 'ambos' : secciones.reservar ? 'agenda' : 'tienda';

export const tipoPorDefecto = (modo: BusinessMode | null | undefined): TipoPagina =>
  modo === 'ecommerce' ? 'tienda' : 'agenda';

/** Sugerencia inicial; cambiar la función no sobrescribe un diseño elegido. */
export const plantillaPorDefecto = (tipo: TipoPagina): PlantillaGuardada =>
  tipo === 'agenda' ? 'agenda' : tipo === 'ambos' ? 'lista' : 'vitrina';

export const disposicionDe = (plantilla: PlantillaGuardada, tipo: TipoPagina): Disposicion =>
  plantilla === 'carta' ? 'carta' : plantilla === 'lista' || plantilla === 'agenda' || plantilla === 'clases'
    ? 'filas' : plantilla === 'vitrina' ? 'cuadricula' : tipo === 'agenda' ? 'filas' : 'cuadricula';
