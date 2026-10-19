/**
 * ══════════════════════════════════════════════════════════════════════════
 * MI PÁGINA · las plantillas
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Como en Fideliza: el dueño elige una plantilla y un color, y ya se ve bien.
 * Cada plantilla es un diseño cerrado —paleta, tipografía, cómo se enseña el
 * catálogo y qué va primero—, pensado para vender y no para enlaces
 * (docs/PLAN-TU-PAGINA.md §4). Los ids son los que acepta el CHECK de
 * tu_pagina.plantilla (0001): no hace falta SQL para usarlas.
 *
 * El diseño vive en estilos/publica.css bajo `.tp[data-plantilla=…]`; aquí
 * solo el catálogo de plantillas y lo que cambia la estructura.
 */
import type { BusinessMode } from '@/lib/supabase/types';

export type Plantilla = 'vitrina' | 'lista' | 'carta' | 'agenda' | 'clases' | 'envios';

/** Cómo se enseña el catálogo. */
export type Disposicion = 'cuadricula' | 'filas' | 'carta';

export interface DefPlantilla {
  id: Plantilla;
  nombre: string;
  describe: string;
  /** Para quién va mejor: se enseña en el panel. */
  para: string;
  disposicion: Disposicion;
  /** Lo primero de la portada: el catálogo o el envío. */
  primero: 'catalogo' | 'envio';
}

export const PLANTILLAS: DefPlantilla[] = [
  { id: 'vitrina', nombre: 'Vitrina', describe: 'Fotos grandes en cuadrícula, clara y limpia', para: 'Ropa, accesorios, regalos', disposicion: 'cuadricula', primero: 'catalogo' },
  { id: 'lista', nombre: 'Lista', describe: 'Filas compactas con foto pequeña, blanca', para: 'Muchos productos, lavanderías, ferreterías', disposicion: 'filas', primero: 'catalogo' },
  { id: 'carta', nombre: 'Carta', describe: 'Como un menú: por secciones, letra con serifa, sin fotos obligatorias', para: 'Comida, cafeterías, pastelerías', disposicion: 'carta', primero: 'catalogo' },
  { id: 'agenda', nombre: 'Agenda', describe: 'Oscura y elegante, la reserva primero', para: 'Barberías, salones, spas, clínicas', disposicion: 'filas', primero: 'catalogo' },
  { id: 'clases', nombre: 'Clases', describe: 'Cabecera en tu color y cupos a la vista', para: 'Academias, gimnasios, talleres', disposicion: 'filas', primero: 'catalogo' },
  { id: 'envios', nombre: 'Envíos', describe: 'El formulario de envío primero, directo', para: 'Couriers, emprendedores que despachan', disposicion: 'filas', primero: 'envio' },
];

const IDS = new Set(PLANTILLAS.map((p) => p.id));

export const esPlantilla = (v: unknown): v is Plantilla => typeof v === 'string' && IDS.has(v as Plantilla);

/** La que se propone a un negocio que todavía no eligió. */
export function plantillaPorDefecto(modo: BusinessMode | null | undefined): Plantilla {
  if (modo === 'recurring_appointment') return 'clases';
  if (modo === 'appointment') return 'agenda';
  return 'vitrina';
}

export const defPlantilla = (id: string | null | undefined, modo?: BusinessMode | null): DefPlantilla =>
  PLANTILLAS.find((p) => p.id === id) ?? PLANTILLAS.find((p) => p.id === plantillaPorDefecto(modo))!;
