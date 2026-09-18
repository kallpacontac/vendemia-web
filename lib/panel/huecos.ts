/**
 * ══════════════════════════════════════════════════════════════════════════
 * HUECOS DE CONOCIMIENTO · lo que Mia no supo contestar
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Cada `Hueco` es un evento `KNOWLEDGE_GAP` ya parseado (ver getHuecos en
 * lib/supabase/queries.ts). Lo único que hace este fichero es agruparlos de
 * la forma en que se leen en pantalla:
 *
 *   1 · por PRODUCTO, y dentro de «del negocio» aparte — no se mezclan porque
 *       una se arregla en una ficha y la otra en las reglas del negocio.
 *   2 · dentro de cada producto, por PARECIDO entre preguntas — vienen en las
 *       palabras de cada cliente, así que "¿sirve para pelo teñido?" y "¿le
 *       puedo poner si tengo el pelo pintado?" son la misma pregunta escrita
 *       distinto, y agruparlas es lo que hace la lista legible.
 *
 * El parecido es DELIBERADAMENTE simple: normalizar (minúsculas, sin tildes,
 * sin puntuación), quitar las palabras más comunes del español y comparar
 * cuánto se solapan las que quedan. No hace falta más para lo que esto tiene
 * que hacer — agrupar variantes evidentes de la misma pregunta, no entender
 * lenguaje natural.
 */
import type { Hueco } from '@/lib/supabase/queries';

/** Palabras que no aportan al parecido: artículos, preposiciones, conjunciones… */
const VACIAS = new Set([
  'a', 'al', 'algo', 'algun', 'alguna', 'algunas', 'alguno', 'algunos', 'ante', 'antes',
  'con', 'contra', 'cual', 'cuales', 'de', 'del', 'desde', 'donde', 'durante', 'el', 'ella',
  'ellas', 'ellos', 'en', 'entre', 'era', 'es', 'esa', 'esas', 'ese', 'eso', 'esos', 'esta',
  'estas', 'este', 'esto', 'estos', 'fue', 'ha', 'hay', 'la', 'las', 'le', 'les', 'lo', 'los',
  'me', 'mi', 'mis', 'mucho', 'muy', 'nada', 'ni', 'no', 'nos', 'nosotros', 'o', 'os', 'otra',
  'otras', 'otro', 'otros', 'para', 'pero', 'poco', 'por', 'porque', 'que', 'se', 'sea', 'si',
  'sin', 'sobre', 'solo', 'su', 'sus', 'te', 'tu', 'tus', 'un', 'una', 'unas', 'uno', 'unos',
  'y', 'ya',
]);

/** A partir de qué solape (sobre el conjunto MÁS PEQUEÑO) dos preguntas cuentan como la misma. */
const UMBRAL_PARECIDO = 0.6;

function palabras(texto: string): Set<string> {
  return new Set(
    texto
      .toLowerCase()
      .normalize('NFD')
      // Quita los diacríticos que NFD separó del carácter base (á → a + ´).
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !VACIAS.has(w)),
  );
}

function solapan(a: Set<string>, b: Set<string>): boolean {
  if (!a.size || !b.size) return false;
  let comunes = 0;
  for (const w of a) if (b.has(w)) comunes++;
  return comunes / Math.min(a.size, b.size) >= UMBRAL_PARECIDO;
}

/** Una pregunta, tal como se enseña: el texto más repetido, y las demás formas de escribirla. */
export interface VarianteHueco {
  pregunta: string;
  veces: number;
  /** Todas las formas distintas agrupadas aquí, la más repetida primero. Incluye `pregunta`. */
  variantes: string[];
}

export interface GrupoHueco {
  /** '' = del negocio, no de un producto. */
  producto: string;
  veces: number;
  preguntas: VarianteHueco[];
}

interface Cluster {
  palabras: Set<string>;
  /** texto original → cuántas veces se preguntó exactamente así */
  textos: Map<string, number>;
  veces: number;
}

function agruparPorParecido(huecos: Hueco[]): VarianteHueco[] {
  // Primero, exactas (normalizadas): agrupa sin ambigüedad las que son
  // literalmente la misma pregunta, aunque cambie el orden de las palabras.
  const exactas = new Map<string, Cluster>();
  for (const h of huecos) {
    const p = palabras(h.pregunta);
    const clave = [...p].sort().join(' ');
    let c = exactas.get(clave);
    if (!c) {
      c = { palabras: p, textos: new Map(), veces: 0 };
      exactas.set(clave, c);
    }
    c.textos.set(h.pregunta, (c.textos.get(h.pregunta) ?? 0) + 1);
    c.veces += 1;
  }

  // Luego, por parecido: fusiona esos grupos exactos si comparten la mayoría
  // de sus palabras. Se procesan del más repetido al menos repetido, para que
  // el grupo grande sea el que atrae a las variantes sueltas, no al revés.
  const clusters: Cluster[] = [];
  for (const c of [...exactas.values()].sort((a, b) => b.veces - a.veces)) {
    const destino = clusters.find((k) => solapan(k.palabras, c.palabras));
    if (destino) {
      for (const w of c.palabras) destino.palabras.add(w);
      for (const [texto, veces] of c.textos) {
        destino.textos.set(texto, (destino.textos.get(texto) ?? 0) + veces);
      }
      destino.veces += c.veces;
    } else {
      clusters.push({ palabras: new Set(c.palabras), textos: new Map(c.textos), veces: c.veces });
    }
  }

  return clusters
    .map((c) => {
      const variantes = [...c.textos.entries()].sort((a, b) => b[1] - a[1]).map(([texto]) => texto);
      return { pregunta: variantes[0], veces: c.veces, variantes };
    })
    .sort((a, b) => b.veces - a.veces);
}

/**
 * Agrupa por producto (ordenado de mayor a menor) y, dentro de cada uno, por
 * parecido. El grupo «del negocio» —`producto === ''`— va SIEMPRE al final,
 * sin importar cuántas veces se haya preguntado: no compite con las fichas
 * porque no se arregla en una ficha.
 */
export function agruparHuecos(huecos: Hueco[]): GrupoHueco[] {
  const porProducto = new Map<string, Hueco[]>();
  for (const h of huecos) {
    const clave = h.producto.trim();
    const lista = porProducto.get(clave);
    if (lista) lista.push(h);
    else porProducto.set(clave, [h]);
  }

  const deProducto: GrupoHueco[] = [];
  let delNegocio: GrupoHueco | null = null;
  for (const [producto, lista] of porProducto) {
    const grupo: GrupoHueco = { producto, veces: lista.length, preguntas: agruparPorParecido(lista) };
    if (producto === '') delNegocio = grupo;
    else deProducto.push(grupo);
  }

  deProducto.sort((a, b) => b.veces - a.veces);
  return delNegocio ? [...deProducto, delNegocio] : deProducto;
}
