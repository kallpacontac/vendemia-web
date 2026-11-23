/**
 * ══════════════════════════════════════════════════════════════════════════
 * EL VALOR DEL CLUB · «Plata que volvió» y «Escríbeles hoy»
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ideas 3 y 4 de la maqueta aprobada por Alvaro (20-nov-2026): que el dueño vea en soles lo que
 * le trae el club y a quién escribirle hoy para que vuelva. Funciones puras sobre lo que el panel
 * ya lee por RLS (las visitas de la caja y las tarjetas): no hace falta SQL nuevo.
 *
 *   · «Volvió»: una visita que NO es la primera de ese cliente (en los datos que se leen, dos
 *     años). La plata es solo lo que la caja anotó con importe; sin importe se cuentan visitas.
 *   · «Recuperado»: volvió este mes después de más de 30 días sin venir.
 *   · El mes es el del calendario en Lima, y se compara con los MISMOS días del mes anterior
 *     (del 1 al día de hoy), para no comparar medio mes con uno entero.
 *
 * «Escríbeles hoy» es una lista corta, uno por uno, para escribir por WhatsApp desde el número
 * del dueño. A propósito no hay «enviar a todos»: escribir en masa a quien no habló primero es lo
 * que hace que WhatsApp bloquee el número (ver app/(panel)/panel/retargeting/page.tsx).
 */
import { segmentoDe, type Visita } from './numeros';

const DIA = 86_400_000;
const ZONA = 'America/Lima';
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** Más de esto sin venir y volver = recuperado. */
export const DIAS_RECUPERADO = 30;

/** El instante de las 00:00 en Lima de una fecha AAAA-MM-DD. */
const inicioLima = (aaaaMmDd: string) => Date.parse(`${aaaaMmDd}T00:00:00-05:00`);

export interface PlataQueVolvio {
  mes: string;
  mesAnterior: string;
  /** Céntimos de las visitas de quien volvió, este mes. */
  plata: number;
  /** Lo mismo, del 1 al mismo día del mes anterior. */
  plataAntes: number;
  visitas: number;
  visitasAntes: number;
  clientes: number;
  /** Cuántas de esas visitas tienen importe. 0 = la caja no anota importes: se enseñan visitas. */
  conImporte: number;
  /** Por semana del mes (días 1–7, 8–14, 15–21, 22 al final): céntimos, o visitas si no hay importes. */
  semanas: number[];
  /** La semana en curso (0–3). */
  semanaActual: number;
  recuperados: { clientes: number; plata: number };
}

export function plataQueVolvio(visitas: Visita[], ahora = Date.now()): PlataQueVolvio {
  const hoy = fmtDia.format(new Date(ahora));
  const [a, m, d] = hoy.split('-').map(Number);
  const desde = inicioLima(`${a}-${String(m).padStart(2, '0')}-01`);
  const [aA, mA] = m === 1 ? [a - 1, 12] : [a, m - 1];
  const diasMesAnterior = new Date(Date.UTC(aA, mA, 0)).getUTCDate();
  const desdeAntes = inicioLima(`${aA}-${String(mA).padStart(2, '0')}-01`);
  const hastaAntes = desdeAntes + Math.min(d, diasMesAnterior) * DIA;

  // Las fechas de cada cliente, en orden: la primera nunca cuenta como «volvió».
  const porMiembro = new Map<string, number[]>();
  for (const v of visitas) {
    const t = Date.parse(v.created_at);
    if (Number.isNaN(t) || t > ahora) continue;
    const l = porMiembro.get(v.member_id);
    if (l) l.push(t);
    else porMiembro.set(v.member_id, [t]);
  }
  for (const l of porMiembro.values()) l.sort((x, y) => x - y);

  let plata = 0, plataAntes = 0, visitasN = 0, visitasAntes = 0, conImporte = 0;
  const clientes = new Set<string>();
  const semanasPlata = [0, 0, 0, 0];
  const semanasVisitas = [0, 0, 0, 0];
  const recuperados = new Map<string, number>();
  for (const v of visitas) {
    const t = Date.parse(v.created_at);
    if (Number.isNaN(t) || t > ahora) continue;
    const f = porMiembro.get(v.member_id)!;
    const i = f.indexOf(t);
    if (i <= 0) continue; // su primera visita: no volvió, llegó
    const monto = Math.max(0, v.amount_cents ?? 0);
    if (t >= desde) {
      plata += monto;
      visitasN++;
      if (monto > 0) conImporte++;
      clientes.add(v.member_id);
      const s = Math.min(3, Math.floor((t - desde) / (7 * DIA)));
      semanasPlata[s] += monto;
      semanasVisitas[s]++;
      // Recuperado: su visita anterior fue hace más de 30 días (o ya lo era este mes).
      if (recuperados.has(v.member_id) || t - f[i - 1] > DIAS_RECUPERADO * DIA) {
        recuperados.set(v.member_id, (recuperados.get(v.member_id) ?? 0) + monto);
      }
    } else if (t >= desdeAntes && t < hastaAntes) {
      plataAntes += monto;
      visitasAntes++;
    }
  }

  return {
    mes: MESES[m - 1],
    mesAnterior: MESES[mA - 1],
    plata,
    plataAntes,
    visitas: visitasN,
    visitasAntes,
    clientes: clientes.size,
    conImporte,
    semanas: conImporte ? semanasPlata : semanasVisitas,
    semanaActual: Math.min(3, Math.floor((ahora - desde) / (7 * DIA))),
    recuperados: { clientes: recuperados.size, plata: [...recuperados.values()].reduce((s, x) => s + x, 0) },
  };
}

/* ── Escríbeles hoy ─────────────────────────────────────────────────────── */

export interface MiembroParaEscribir {
  id: string;
  alias: string | null;
  created_at: string;
  rewards_available: number;
  /** 0017: una línea de la tarjeta apunta a su persona; esas no se listan. */
  parent_member_id?: string | null;
}

export type Motivo = 'premio' | 'atrasado' | 'una_vez' | 'sin_venir' | 'dormido';

export interface Candidato {
  id: string;
  nombre: string | null;
  motivo: Motivo;
  /** Días desde su última visita (o desde que sacó la tarjeta, si nunca vino). */
  dias: number;
}

const ORDEN: Motivo[] = ['premio', 'atrasado', 'una_vez', 'sin_venir', 'dormido'];

/**
 * A quién escribirle hoy, en orden: quien tiene un premio sin usar, quien se está atrasando
 * (los más recientes primero: son los más fáciles de traer), quien vino una sola vez, quien sacó
 * la tarjeta y no vino, y quien dejó de venir hace poco. Nunca quien ya se escribió en los
 * últimos 14 días. Devuelve hasta `max` (la pantalla enseña 5 de los que tengan celular).
 */
export function aQuienEscribir(
  visitas: Visita[],
  miembros: MiembroParaEscribir[],
  escritos: Record<string, string>,
  ahora = Date.now(),
  max = 12,
): Candidato[] {
  const porMiembro = new Map<string, number[]>();
  for (const v of visitas) {
    const t = Date.parse(v.created_at);
    if (Number.isNaN(t) || t > ahora) continue;
    const l = porMiembro.get(v.member_id);
    if (l) l.push(t);
    else porMiembro.set(v.member_id, [t]);
  }
  const lista: Candidato[] = [];
  for (const mb of miembros) {
    if (mb.parent_member_id) continue;
    const escrito = escritos[mb.id] ? Date.parse(escritos[mb.id]) : NaN;
    if (!Number.isNaN(escrito) && ahora - escrito < 14 * DIA) continue;
    const f = porMiembro.get(mb.id) ?? [];
    const ultima = f.length ? Math.max(...f) : null;
    const dias = Math.floor((ahora - (ultima ?? Date.parse(mb.created_at))) / DIA);
    const nombre = mb.alias?.trim() || null;
    if (mb.rewards_available > 0) {
      lista.push({ id: mb.id, nombre, motivo: 'premio', dias });
      continue;
    }
    if (!f.length) {
      if (dias >= 3 && dias <= 30) lista.push({ id: mb.id, nombre, motivo: 'sin_venir', dias });
      continue;
    }
    const seg = segmentoDe(f, ahora);
    if (seg === 'atrasados') lista.push({ id: mb.id, nombre, motivo: 'atrasado', dias });
    else if (seg === 'no_regresaron' && dias <= 120) lista.push({ id: mb.id, nombre, motivo: 'una_vez', dias });
    else if (seg === 'dormidos' && dias <= 120) lista.push({ id: mb.id, nombre, motivo: 'dormido', dias });
  }
  lista.sort((x, y) => ORDEN.indexOf(x.motivo) - ORDEN.indexOf(y.motivo) || x.dias - y.dias);
  return lista.slice(0, max);
}

/** El motivo, como lo lee el dueño. */
export function motivoTexto(c: Candidato): string {
  const d = c.dias === 1 ? '1 día' : `${c.dias} días`;
  switch (c.motivo) {
    case 'premio': return 'Tiene su premio sin usar';
    case 'atrasado': return `${d} sin venir`;
    case 'una_vez': return `Vino una vez, hace ${d}`;
    case 'sin_venir': return `Sacó su tarjeta hace ${d} y no vino`;
    case 'dormido': return `${d} sin venir`;
  }
}

/** El mensaje ya armado. El dueño lo puede cambiar antes de abrir WhatsApp. */
export function mensajePara(c: Candidato, d: { negocio: string; club: string; premio: string }): string {
  const hola = c.nombre ? `Hola ${c.nombre.split(/\s+/)[0]}` : 'Hola';
  const negocio = d.negocio || 'nuestro local';
  const premio = d.premio ? d.premio.charAt(0).toLowerCase() + d.premio.slice(1) : 'tu premio';
  switch (c.motivo) {
    case 'premio': return `${hola} 👋 Tu ${premio} te espera en ${negocio}. ¿Cuándo vienes por él?`;
    case 'atrasado': return `${hola}, hace ${c.dias} días que no te vemos por ${negocio}. Tu tarjeta sigue sumando para tu ${premio}. ¿Te esperamos esta semana?`;
    case 'una_vez': return `${hola}, gracias por venir a ${negocio}. Tu tarjeta ya tiene tu primer sello: ¿cuándo vuelves por el siguiente?`;
    case 'sin_venir': return `${hola}, ya tienes tu tarjeta del ${d.club || `club de ${negocio}`}. Tu primera visita ya suma para tu ${premio}. ¿Cuándo te esperamos?`;
    case 'dormido': return `${hola}, te extrañamos en ${negocio}. Tu tarjeta sigue aquí con tus sellos. ¿Te animas a volver esta semana?`;
  }
}

/** El enlace de WhatsApp con el mensaje. null si el número no sirve. */
export function enlaceWhatsapp(telefono: string, mensaje: string): string | null {
  let n = telefono.replace(/\D/g, '');
  if (n.length === 9 && n.startsWith('9')) n = `51${n}`; // celular peruano sin prefijo
  if (n.length < 10 || n.length > 15) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(mensaje)}`;
}
