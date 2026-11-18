/**
 * Las tres clases de cosas del catálogo de un negocio de citas (18-nov-2026, The 24/7: «el
 * catálogo debe ser un filtro claro, explícito, intuitivo: servicio / productos estéticos /
 * comidas y bebidas»).
 *
 * No es un campo nuevo: sale de los dos que ya hay.
 *   · catalog.tipo: '' = servicio (se reserva); 'producto' = se vende.
 *   · catalog.familia: entre los productos, «Bebidas», «Comidas»… son comidas y bebidas; lo
 *     demás («Productos de barbería», ceras, geles) son productos estéticos.
 * Al elegir la clase en la ficha se guardan los dos (familiaParaGuardar), sin pisar un nombre
 * de familia que ya era de esa clase.
 */
export type Categoria = 'servicio' | 'estetico' | 'consumo';

const ES_CONSUMO = /bebida|comida|snack|gaseosa|cerveza|agua|jugo|refresco|caf[eé]|piqueo|dulce|golosina/i;

export const CATEGORIAS: { clave: Categoria; nombre: string; uno: string; pista: string }[] = [
  { clave: 'servicio', nombre: 'Servicios', uno: 'Servicio', pista: 'Se reserva: ocupa una hora en la agenda.' },
  { clave: 'estetico', nombre: 'Productos estéticos', uno: 'Producto estético', pista: 'Ceras, geles, shampoo… Se vende en caja, con stock.' },
  { clave: 'consumo', nombre: 'Comidas y bebidas', uno: 'Comida o bebida', pista: 'Gaseosas, cervezas, agua, snacks… Se vende en caja.' },
];

export function categoriaDe(i: { tipo?: string | null; familia?: string | null }): Categoria {
  if (i.tipo !== 'producto') return 'servicio';
  return ES_CONSUMO.test(i.familia ?? '') ? 'consumo' : 'estetico';
}

/** El tipo y la familia que se guardan al elegir una clase. */
export function familiaParaGuardar(c: Categoria, familiaActual: string): { tipo: '' | 'producto'; familia: string } {
  if (c === 'servicio') return { tipo: '', familia: categoriaDe({ tipo: 'producto', familia: familiaActual }) === 'consumo' ? '' : familiaActual };
  const yaEs = familiaActual.trim() && categoriaDe({ tipo: 'producto', familia: familiaActual }) === c;
  return { tipo: 'producto', familia: yaEs ? familiaActual : c === 'consumo' ? 'Comidas y bebidas' : 'Productos estéticos' };
}
