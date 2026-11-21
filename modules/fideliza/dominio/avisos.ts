/**
 * Los avisos que salen solos, con su texto de fábrica. Un solo sitio para la pantalla de Avisos
 * y para el alta del club, que los deja PRENDIDOS al publicar por primera vez (maqueta aprobada
 * por Alvaro el 20-nov-2026: «los avisos ya quedan prendidos; no hay nada que configurar»).
 *
 * Solo las tres campañas que no repiten nada: el aviso al sumar un sello (avisarSello) y al ganar
 * el premio (avisarPremio) ya salen siempre, sin campaña. Por eso «Premio disponible»
 * (reward_available) no se prende: duplicaría el aviso del premio (ver kallpa-campanas.sql).
 */

export type PlantillaAuto = 'welcome' | 'return_reminder' | 'winback';

export interface DatosClub {
  negocio: string;
  club: string;
  premio: string;
}

interface Base {
  nombre: string;
  cuando: string;
  titulo: (d: DatosClub) => string;
  texto: (d: DatosClub) => string;
  config: Record<string, number>;
}

const corto = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t);
const minus = (t: string) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);

export const AVISOS_AUTO: Record<PlantillaAuto, Base> = {
  welcome: {
    nombre: 'Bienvenida',
    cuando: 'Una vez, cuando alguien acepta los avisos en su tarjeta.',
    titulo: (d) => `¡Ya eres del ${d.club || 'club'}!`,
    texto: (d) => (d.premio ? `Cada visita suma para tu ${minus(d.premio)}.` : 'Cada visita suma para tu premio.'),
    config: { max_per_30d: 2 },
  },
  return_reminder: {
    nombre: '¿Te toca volver?',
    cuando: 'Cuando pasan los días que elijas desde su última visita.',
    titulo: () => '¿Te toca volver?',
    texto: (d) => `Te esperamos esta semana en ${d.negocio || 'el local'}. Sigue sumando para tu premio.`,
    config: { cycle_days: 21, max_per_30d: 2 },
  },
  winback: {
    nombre: 'Te extrañamos',
    cuando: 'Cuando alguien lleva muchos días sin venir. Como mucho una vez cada 90 días.',
    titulo: (d) => `Te extrañamos en ${d.negocio || 'el local'}`,
    texto: () => 'Tu tarjeta sigue aquí con tus sellos. Ven esta semana.',
    config: { inactive_days: 45, max_per_30d: 2 },
  },
};

/** El aviso de fábrica, listo para `campana.guardar` (títulos de 60 y textos de 160 como máximo). */
export function avisoDeFabrica(t: PlantillaAuto, d: DatosClub) {
  const b = AVISOS_AUTO[t];
  return { title: corto(b.titulo(d), 60), body: corto(b.texto(d), 160), config: { ...b.config } };
}

/** Los días que se eligen tocando, sin escribir números. */
export const DIAS_VOLVER = [14, 21, 30, 45];
export const DIAS_EXTRANAMOS = [30, 45, 60, 90];
