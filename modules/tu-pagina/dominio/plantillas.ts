/** La función de la página y su diseño son elecciones independientes.
 * Los valores deben coincidir con el CHECK de tu_pagina.plantilla en Postgres. */
import type { BusinessMode } from '@/lib/supabase/types';

export type TipoPagina = 'agenda' | 'tienda' | 'ambos';
export type Disposicion = 'cuadricula' | 'filas' | 'carta';
export type PlantillaGuardada = 'agenda' | 'vitrina' | 'lista' | 'carta' | 'clases' | 'envios' | 'impulso' | 'luxury' | 'restaurante';

const LUXURY: { id: PlantillaGuardada; nombre: string; describe: string } =
  { id: 'luxury', nombre: 'Luxury', describe: 'Fotografía editorial y servicios para salones y barberías.' };

export const PLANTILLAS: { id: PlantillaGuardada; nombre: string; describe: string }[] = [
  { id: 'vitrina', nombre: 'Minimalista', describe: 'Fotos grandes y tarjetas limpias.' },
  { id: 'lista', nombre: 'Editorial', describe: 'Productos fáciles de comparar.' },
  { id: 'carta', nombre: 'Clásico cálido', describe: 'Categorías y precios como una carta.' },
  { id: 'agenda', nombre: 'Nocturna', describe: 'Fondo oscuro y acentos luminosos.' },
  { id: 'impulso', nombre: 'Impulso', describe: 'Tienda deportiva con portada editorial y productos protagonistas.' },
  { id: 'restaurante', nombre: 'Carta visual', describe: 'Portada, categorías con fotos y platos listos para pedir.' },
];

/** Diseños para negocios que atienden con cita. */
export const PLANTILLAS_AGENDA: { id: PlantillaGuardada; nombre: string; describe: string }[] = [
  { id: 'agenda', nombre: 'Agenda clara', describe: 'Tarjetas blancas, espacio y reservas fáciles de encontrar.' },
  { id: 'lista', nombre: 'Agenda editorial', describe: 'Servicios en lista y una presentación más fotográfica.' },
  LUXURY,
];

export const PLANTILLAS_AMBOS: { id: PlantillaGuardada; nombre: string; describe: string }[] = [...PLANTILLAS, LUXURY];

export const plantillaValida = (valor: unknown): valor is PlantillaGuardada =>
  valor === 'vitrina' || valor === 'lista' || valor === 'carta' ||
  valor === 'agenda' || valor === 'clases' || valor === 'envios' || valor === 'impulso' || valor === 'luxury' || valor === 'restaurante';

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

/** La carta nocturna de tienda usa el ejemplo de cafetería y el pedido gastronómico. */
export const pedidoGastronomicoDe = (plantilla: PlantillaGuardada, tipo: TipoPagina): boolean =>
  plantilla === 'restaurante' || (plantilla === 'agenda' && tipo === 'tienda');

export const disposicionDe = (plantilla: PlantillaGuardada, tipo: TipoPagina): Disposicion =>
  plantilla === 'carta' ? 'carta' : plantilla === 'lista' || plantilla === 'agenda' || plantilla === 'clases'
    ? 'filas' : plantilla === 'vitrina' || plantilla === 'impulso' || plantilla === 'luxury' || plantilla === 'restaurante' ? 'cuadricula' : tipo === 'agenda' ? 'filas' : 'cuadricula';
