/**
 * Lo que dice la foto de un Yape o Plin, SIN IA (26-nov-2026, Alvaro: «si podemos no usar IA, para que
 * salga gratis»). Recibe el texto que sacó el lector de texto gratuito (Tesseract, servidor/ocr.ts) y
 * devuelve la misma LecturaComprobante que la IA, con lo que se pudo leer.
 *
 * Solo hace falta lo que sirve para cruzar la foto con el Yape que llegó al celular de cobros: el MONTO,
 * la HORA y, en Yape, el CÓDIGO DE SEGURIDAD. Lo demás (operación, destino) se lee si se puede.
 *
 * Lo que se lee mal por la foto de una pantalla (probado 26-nov con una foto girada y borrosa):
 *   · los dos puntos de la hora se pierden: «05 42 p. m» → 5:42 pm;
 *   · los dígitos del código salen separados: «4 7 2»;
 *   · la S de «S/» sale como 5 o $;
 *   · los asteriscos del número salen como puntos o letras sueltas.
 * Lo que no se entiende queda en null: nunca se adivina. Sin monto, la foto no se leyó (null).
 */
import type { LecturaComprobante } from '@/modules/tu-pagina/dominio/comprobante';

const MESES: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, set: 9, sep: 9, oct: 10, nov: 11, dic: 12,
};
const dos = (n: number) => String(n).padStart(2, '0');

/** «1,250.50» · «1.250,50» · «30» · «30.00» · «30,5» → número. null si no es un importe. */
export function importe(s: string): number | null {
  const t = s.replace(/\s/g, '');
  let n: number;
  if (/^\d{1,3}([.,]\d{3})+([.,]\d{1,2})?$/.test(t)) {
    // Con miles: el último separador seguido de 1-2 dígitos es el decimal.
    const m = t.match(/^(.*?)(?:[.,](\d{1,2}))?$/)!;
    n = Number(m[1].replace(/[.,]/g, '') + (m[2] ? `.${m[2]}` : ''));
  } else {
    n = Number(t.replace(',', '.'));
  }
  return Number.isFinite(n) && n > 0 && n < 100_000 ? Math.round(n * 100) / 100 : null;
}

/** El importe de la foto: el primero con «S/» (el grande de arriba), o con «Monto». */
export function montoDe(texto: string): number | null {
  const re = /(?:^|[^A-Za-z0-9])(?:S|5|\$)\s*\/\s*\.?\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d{1,5}(?:[.,]\d{1,2})?)(?!\d)/g;
  for (const m of texto.matchAll(re)) {
    const n = importe(m[1]);
    if (n !== null) return n;
  }
  const m = texto.match(/monto\D{0,12}(\d{1,5}(?:[.,]\d{1,2})?)(?!\d)/i);
  return m ? importe(m[1]) : null;
}

/** La hora de un texto que viene justo después de la fecha: «05:42 p. m.», «05 42 p. m», «17:42». */
function horaDe(s: string): { h: number; m: number } | null {
  const r = s.match(/^\D{0,6}?(\d{1,2})\s*[:.;\s]\s*(\d{2})(?!\d)\s*(?:([ap])\.?\s*m\b\.?)?/i);
  if (!r) return null;
  let h = Number(r[1]);
  const m = Number(r[2]);
  const ap = r[3]?.toLowerCase();
  if (m > 59 || h > 23 || (ap && (h < 1 || h > 12))) return null;
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  return { h, m };
}

/**
 * La fecha y la hora del pago, en ISO con la hora de Perú (-05:00). Sin fecha legible, una hora
 * con «:» o con am/pm se toma de `hoy` (el cruce con el Yape es de minutos: da igual el día).
 */
export function fechaHoraDe(texto: string, hoy: Date = new Date()): string | null {
  const t = texto.replace(/\s+/g, ' ');
  // «26 nov. 2026», «26 de noviembre de 2026», «26/11/2026», «26-11-26».
  const conMes = /(\d{1,2})\s*(?:de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|set|sep|oct|nov|dic)[a-zñ]*\.?\s*(?:de\s+|del\s+)?(\d{4})/i;
  const numerica = /(\d{1,2})\s*[/-]\s*(\d{1,2})\s*[/-]\s*(\d{2,4})/;
  let d: number | null = null, mes: number | null = null, anio: number | null = null, fin = -1;
  const a = t.match(conMes);
  const b = t.match(numerica);
  const usa = a && (!b || (a.index ?? 0) <= (b.index ?? 0)) ? 'mes' : b ? 'num' : null;
  if (usa === 'mes' && a) {
    d = Number(a[1]); mes = MESES[a[2].toLowerCase().slice(0, 3)]; anio = Number(a[3]); fin = (a.index ?? 0) + a[0].length;
  } else if (usa === 'num' && b) {
    d = Number(b[1]); mes = Number(b[2]); anio = Number(b[3]); if (anio < 100) anio += 2000; fin = (b.index ?? 0) + b[0].length;
  }
  let hm = fin >= 0 ? horaDe(t.slice(fin, fin + 30).replace(/^[\s|,\-–·]+/, '')) : null;
  if (!hm) {
    // Sin fecha (o la hora en otro sitio): solo una hora inequívoca.
    const r = t.match(/(?<!\d)(\d{1,2}):(\d{2})(?!\d)\s*(?:([ap])\.?\s*m\b\.?)?/i) ?? t.match(/(?<!\d)(\d{1,2})\s(\d{2})\s*([ap])\.?\s*m\b/i);
    if (r) hm = horaDe(`${r[1]}:${r[2]}${r[3] ? ` ${r[3]}m` : ''}`);
  }
  if (!hm) return null;
  if (d === null || !mes || !anio || d < 1 || d > 31 || mes > 12) {
    const lima = new Date(hoy.getTime() - 5 * 3_600_000);
    d = lima.getUTCDate(); mes = lima.getUTCMonth() + 1; anio = lima.getUTCFullYear();
  }
  return `${anio}-${dos(mes)}-${dos(d)}T${dos(hm.h)}:${dos(hm.m)}:00-05:00`;
}

/**
 * Yape: «Código de seguridad 472» o «4 7 2». En modo «texto suelto» Tesseract a veces deja el valor
 * ANTES de la etiqueta («472 Código de seguridad», visto el 26-nov): también vale, pegado a ella.
 */
export function codigoDe(texto: string): string | null {
  const t = texto.replace(/\s+/g, ' ');
  const despues = t.match(/c[oó]d(?:igo|\.)?\s*«?\s*(?:de\s*)?segur\w*\D{0,12}(?<!\d)(\d)\s?(\d)\s?(\d)(?!\s?\d)/i);
  if (despues) return `${despues[1]}${despues[2]}${despues[3]}`;
  const antes = t.match(/(?<![\d\s]\d|\d)(\d)\s?(\d)\s?(\d)\s{0,2}c[oó]d(?:igo|\.)?\s*«?\s*(?:de\s*)?segur/i);
  return antes ? `${antes[1]}${antes[2]}${antes[3]}` : null;
}

export function operacionDe(texto: string): string | null {
  const t = texto.replace(/\s+/g, ' ');
  const m = t.match(/operaci[oó]n\D{0,14}(\d{5,20})/i) ?? t.match(/(?<!\d)(\d{5,20})\s{0,2}(?:n(?:ro|°|º)\.?\s*de\s*)?operaci[oó]n/i);
  return m ? m[1] : null;
}

/** Los últimos dígitos del número al que se pagó: «*** *** 118», «Nro. de celular … 118». */
export function destinoDe(texto: string): string {
  const t = texto.replace(/\s+/g, ' ');
  const m = t.match(/\*[\s*.•·]*\*[\s*.•·]*(\d{3,4})(?!\d)/) ?? t.match(/celular\D{0,25}?(\d{3,4})(?!\d)/i);
  return m ? m[1] : '';
}

export function appDe(texto: string): LecturaComprobante['app'] {
  if (/yape/i.test(texto)) return 'yape';
  if (/plin/i.test(texto)) return 'plin';
  if (/transfer|interbank|bbva|scotiabank|\bbcp\b|cci\b/i.test(texto)) return 'transfer';
  return 'unknown';
}

export function estadoDe(texto: string): string {
  if (/rechaz|fall[oó]|no se pudo|cancelad/i.test(texto)) return 'rechazado';
  if (/pendiente|en proceso/i.test(texto)) return 'pendiente';
  if (/yapeaste|plineaste|enviaste|pago exitoso|operaci[oó]n exitosa|transferencia exitosa|pagaste|listo/i.test(texto)) return 'completado';
  return 'unknown';
}

/** El texto de la foto → la lectura. null si no se ve un importe: la foto no se pudo leer. */
export function leerVoucher(texto: string, hoy: Date = new Date()): LecturaComprobante | null {
  const monto = montoDe(texto);
  if (monto === null) return null;
  return {
    esComprobante: true,
    app: appDe(texto),
    estado: estadoDe(texto),
    monto,
    destino: destinoDe(texto),
    fechaHora: fechaHoraDe(texto, hoy),
    operacion: operacionDe(texto),
    codigoSeguridad: appDe(texto) === 'yape' ? codigoDe(texto) : null,
    senales: [],
  };
}

/** Junta dos lecturas del mismo voucher (dos pasadas): lo que falte en una lo pone la otra. */
export function juntar(a: LecturaComprobante | null, b: LecturaComprobante | null): LecturaComprobante | null {
  if (!a) return b;
  if (!b) return a;
  return {
    ...a,
    app: a.app !== 'unknown' ? a.app : b.app,
    estado: a.estado !== 'unknown' ? a.estado : b.estado,
    destino: a.destino || b.destino,
    fechaHora: a.fechaHora ?? b.fechaHora,
    operacion: a.operacion ?? b.operacion,
    codigoSeguridad: a.codigoSeguridad ?? b.codigoSeguridad,
  };
}

/**
 * La decisión para el cobro del barbero con el celular de cobros: lo que decide es que la foto cuadre
 * con el Yape que llegó DE VERDAD (lector 0003), no la foto sola. Sin IA, un dígito mal leído del número
 * de destino no puede tumbar un cobro bueno: solo se rechaza un pago que dice que falló.
 */
export function decisionSinIA(l: LecturaComprobante | null): 'aprobar' | 'revisar' | 'rechazar' {
  if (!l) return 'revisar';
  if (l.estado === 'rechazado' || l.estado === 'pendiente') return 'rechazar';
  return l.monto !== null && l.fechaHora ? 'aprobar' : 'revisar';
}
