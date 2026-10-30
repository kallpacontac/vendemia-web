/**
 * ══════════════════════════════════════════════════════════════════════════
 * TUS NÚMEROS · quién viene, cada cuánto, cuándo, y quién dejó de venir
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Funciones puras sobre las visitas (operaciones de compra o visita de la
 * caja) y las altas de tarjetas. El panel las lee por RLS y calcula aquí:
 * no hace falta SQL nuevo. Horas y días, en hora de Lima.
 *
 * Una «visita» es una operación de compra o de visita; las devoluciones y los
 * ajustes no cuentan como venir al local.
 */

export interface Visita {
  member_id: string;
  created_at: string;
}
export interface Alta {
  id: string;
  created_at: string;
}

const DIA = 86_400_000;
const ZONA = 'America/Lima';
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
const DOW: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** Día de la semana (0 = lunes) y hora (0–23) en Lima. */
export function diaYHora(iso: string): { dia: number; hora: number } {
  const partes = Object.fromEntries(fmtHora.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return { dia: DOW[partes.weekday] ?? 0, hora: Number(partes.hour) % 24 };
}

export type Segmento = 'nuevos' | 'fieles' | 'regulares' | 'atrasados' | 'dormidos' | 'no_regresaron' | 'sin_visitas';

export const SEGMENTOS: { id: Segmento; nombre: string; describe: string; tono: 'ok' | 'info' | 'alerta' | 'peligro' | 'neutro' }[] = [
  { id: 'nuevos', nombre: 'Nuevos', describe: 'Una visita en los últimos 30 días', tono: 'info' },
  { id: 'fieles', nombre: 'Fieles', describe: '5 visitas o más y siguen viniendo', tono: 'ok' },
  { id: 'regulares', nombre: 'Regulares', describe: 'Vienen a su ritmo', tono: 'ok' },
  { id: 'atrasados', nombre: 'Atrasados', describe: 'Pasó 1,5 veces su ritmo (y al menos dos semanas)', tono: 'alerta' },
  { id: 'dormidos', nombre: 'Dormidos', describe: 'Pasó 3 veces su ritmo o más de 90 días', tono: 'peligro' },
  { id: 'no_regresaron', nombre: 'No regresaron', describe: 'Vinieron una vez, hace más de 30 días', tono: 'neutro' },
  { id: 'sin_visitas', nombre: 'Sin visitas', describe: 'Crearon su tarjeta y aún no compran', tono: 'neutro' },
];

/** El segmento de un cliente según sus visitas (ordenadas o no) y la fecha de corte. */
export function segmentoDe(fechas: number[], ahora: number): Segmento {
  if (!fechas.length) return 'sin_visitas';
  const f = [...fechas].sort((a, b) => a - b);
  const desdeUltima = (ahora - f[f.length - 1]) / DIA;
  if (f.length === 1) return desdeUltima <= 30 ? 'nuevos' : 'no_regresaron';
  // El ritmo: la mediana de días entre visitas (un día como mínimo).
  const huecos = f.slice(1).map((t, i) => Math.max(1, (t - f[i]) / DIA)).sort((a, b) => a - b);
  const ritmo = huecos[Math.floor(huecos.length / 2)];
  if (desdeUltima > 90 || desdeUltima > ritmo * 3) return 'dormidos';
  if (desdeUltima > Math.max(ritmo * 1.5, 14)) return 'atrasados';
  return f.length >= 5 ? 'fieles' : 'regulares';
}

export interface Numeros {
  dias: number;
  miembros: number;
  vinieron: number;
  vinieronAntes: number;
  visitas: number;
  visitasAntes: number;
  nuevos: number;
  nuevosAntes: number;
  /** % de quienes vinieron por primera vez (con 30 días de margen) que volvieron en 30 días. null sin base. */
  regresan: number | null;
  regresanAntes: number | null;
  semanas: { desde: string; primera: number; regresan: number }[];
  /** [dia 0–6][hora 0–23] */
  calor: number[][];
  horaPico: { dia: number; hora: number; visitas: number } | null;
  segmentos: Record<Segmento, number>;
}

/**
 * @param visitas  las del último año (o más), de compra o visita.
 * @param altas    todas las tarjetas vivas (id y fecha de alta).
 * @param dias     el periodo que se mira (30, 90, 365).
 */
export function calcularNumeros(visitas: Visita[], altas: Alta[], dias: number, ahora = Date.now()): Numeros {
  const desde = ahora - dias * DIA;
  const desdeAntes = desde - dias * DIA;
  const porMiembro = new Map<string, number[]>();
  for (const v of visitas) {
    const t = Date.parse(v.created_at);
    if (Number.isNaN(t) || t > ahora) continue;
    const l = porMiembro.get(v.member_id);
    if (l) l.push(t);
    else porMiembro.set(v.member_id, [t]);
  }
  for (const l of porMiembro.values()) l.sort((a, b) => a - b);

  const en = (t: number, a: number, b: number) => t >= a && t < b;
  let visitasP = 0;
  let visitasA = 0;
  const vinieronP = new Set<string>();
  const vinieronA = new Set<string>();
  const calor = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  for (const v of visitas) {
    const t = Date.parse(v.created_at);
    if (en(t, desde, ahora + 1)) {
      visitasP++;
      vinieronP.add(v.member_id);
      const { dia, hora } = diaYHora(v.created_at);
      calor[dia][hora]++;
    } else if (en(t, desdeAntes, desde)) {
      visitasA++;
      vinieronA.add(v.member_id);
    }
  }

  // Regresan: la cohorte de primeras visitas de un periodo igual de largo que
  // termina 30 días antes (para que todos hayan tenido 30 días para volver).
  const regreso = (a: number, b: number) => {
    let base = 0;
    let volvieron = 0;
    for (const f of porMiembro.values()) {
      const primera = f[0];
      if (!en(primera, a - 30 * DIA, b - 30 * DIA)) continue;
      base++;
      if (f.length > 1 && f[1] - primera <= 30 * DIA) volvieron++;
    }
    return base ? Math.round((volvieron / base) * 100) : null;
  };

  // Últimas 12 semanas (lunes a domingo en Lima), separando la primera visita de cada cliente.
  const hoy = fmtDia.format(new Date(ahora));
  const dowHoy = diaYHora(new Date(ahora).toISOString()).dia;
  const lunes = Date.parse(`${hoy}T00:00:00-05:00`) - dowHoy * DIA;
  const semanas = Array.from({ length: 12 }, (_, i) => {
    const ini = lunes - (11 - i) * 7 * DIA;
    return { ini, desde: fmtDia.format(new Date(ini + 12 * 3600_000)), primera: 0, regresan: 0 };
  });
  const primeraDe = new Map<string, number>();
  for (const [id, f] of porMiembro) primeraDe.set(id, f[0]);
  for (const v of visitas) {
    const t = Date.parse(v.created_at);
    const i = Math.floor((t - semanas[0].ini) / (7 * DIA));
    if (i < 0 || i > 11 || t > ahora) continue;
    if (primeraDe.get(v.member_id) === t) semanas[i].primera++;
    else semanas[i].regresan++;
  }

  let horaPico: Numeros['horaPico'] = null;
  calor.forEach((fila, dia) =>
    fila.forEach((n, hora) => {
      if (n > 0 && (!horaPico || n > horaPico.visitas)) horaPico = { dia, hora, visitas: n };
    }),
  );

  const segmentos = Object.fromEntries(SEGMENTOS.map((s) => [s.id, 0])) as Record<Segmento, number>;
  for (const a of altas) segmentos[segmentoDe(porMiembro.get(a.id) ?? [], ahora)]++;

  return {
    dias,
    miembros: altas.length,
    vinieron: vinieronP.size,
    vinieronAntes: vinieronA.size,
    visitas: visitasP,
    visitasAntes: visitasA,
    nuevos: altas.filter((a) => en(Date.parse(a.created_at), desde, ahora + 1)).length,
    nuevosAntes: altas.filter((a) => en(Date.parse(a.created_at), desdeAntes, desde)).length,
    regresan: regreso(desde, ahora + 1),
    regresanAntes: regreso(desdeAntes, desde),
    semanas: semanas.map(({ desde: d, primera, regresan }) => ({ desde: d, primera, regresan })),
    calor,
    horaPico,
    segmentos,
  };
}

export const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
