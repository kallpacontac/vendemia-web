/**
 * ══════════════════════════════════════════════════════════════════════════
 * VIGENCIA DE UNA PROMO · cuándo se puede OFRECER un producto
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ ESTA REGLA ES LA DEL BOT, COPIADA (`src/utils/vigencia.ts`). No la
 * «mejores» aquí: si el panel dijera «vigente hoy» y el bot no lo ofreciera
 * —o al revés—, el dueño dejaría de fiarse de los dos.
 *
 * `catalog.promo_vigencia` es texto con JSON. Vacío = siempre, que es lo que
 * tienen todas las filas de hoy: quien no lo rellene no nota ningún cambio.
 *
 *   ''                                                         → siempre
 *   {"tipo":"mensual","dia_desde":1,"dia_hasta":15}            → todos los meses
 *   {"tipo":"rango","desde":"2026-11-10","hasta":"2026-11-20"} → una sola vez
 *
 * ⚠️ NO ES `vigencia_meses`, aunque se llamen casi igual. Aquel dice cuántos
 * meses DURA lo que el cliente compra; este, la ventana en la que está A LA
 * VENTA. Un pack de 3 meses que solo se vende la primera quincena usa los dos a
 * la vez, con valores que no tienen nada que ver entre sí.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────
 * El Pack Promo Cyber de kallpa llevaba su condición escrita en la descripción,
 * en prosa, y el prompt tenía una regla a juego que mandaba mirar la fecha.
 * Medido el 17-sep-2026, dos días pasada la ventana, el bot lo ofreció como
 * vigente en 5 de 5 respuestas: una dijo «válido hasta el 15 de cada mes» y lo
 * siguió ofreciendo en la misma frase. Leía la condición, la repetía y no la
 * aplicaba.
 *
 * Ahora la decisión no es del modelo: un producto fuera de ventana NO ENTRA al
 * prompt ni a la tool que lista servicios. Y eso es justo lo que hace que esta
 * pantalla importe — mientras el dueño no rellene el campo, la promo caducada
 * se sigue ofreciendo.
 */
import { diaMes } from './format';

/** Una ventana que se repite cada mes, por día del mes (1–31, inclusive). */
export interface VigenciaMensual {
  tipo: 'mensual';
  dia_desde: number;
  dia_hasta: number;
}
/** Una ventana de una sola vez, en fechas ISO inclusive por los dos lados. */
export interface VigenciaRango {
  tipo: 'rango';
  desde: string;
  hasta: string;
}
export type Vigencia = VigenciaMensual | VigenciaRango;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lee el campo. Cualquier cosa que no entienda → `null` (= siempre vigente).
 *
 * ⚠️ Esa indulgencia es del bot y es deliberada: el fallo caro es el contrario
 * —que una errata apague en silencio el producto que más margen deja y nadie se
 * entere hasta que el mes cierra flojo—. Un producto de más se ve en el chat el
 * primer día; uno de menos, no se ve nunca.
 *
 * La consecuencia para el panel: una errata NO salta por ningún lado, así que
 * la ventana se valida ANTES de encolar (ver `errorVigencia`) y el JSON se
 * construye desde los controles, nunca a mano.
 */
export function parseVigencia(raw: string | null | undefined): Vigencia | null {
  if (!raw?.trim()) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;

  if (o.tipo === 'mensual') {
    const d = Number(o.dia_desde);
    const h = Number(o.dia_hasta);
    if (!Number.isInteger(d) || !Number.isInteger(h)) return null;
    if (d < 1 || d > 31 || h < 1 || h > 31) return null;
    return { tipo: 'mensual', dia_desde: d, dia_hasta: h };
  }
  if (o.tipo === 'rango') {
    if (typeof o.desde !== 'string' || typeof o.hasta !== 'string') return null;
    if (!ISO.test(o.desde) || !ISO.test(o.hasta)) return null;
    return { tipo: 'rango', desde: o.desde, hasta: o.hasta };
  }
  return null;
}

/**
 * ¿Está vigente este día? `hoy` en 'YYYY-MM-DD' (hora de Lima: `hoyLima()`).
 *
 * Se pasa como argumento en vez de leer el reloj aquí para que sea pura: la
 * ventana del 1 al 15 hay que poder probarla el día 16.
 */
export function vigenteHoy(raw: string | null | undefined, hoy: string): boolean {
  const v = parseVigencia(raw);
  if (!v) return true; // sin ventana configurada = siempre

  if (v.tipo === 'rango') return hoy >= v.desde && hoy <= v.hasta; // ISO ordena como texto

  const dia = Number(hoy.slice(8, 10));
  if (!Number.isInteger(dia)) return true; // fecha ilegible: no apagues el producto por eso
  // Una ventana que CRUZA el cambio de mes («del 28 al 3») es normal —una
  // quincena de pagos— y con la comparación ingenua (28 <= dia <= 3) no se
  // cumple nunca: la promo quedaría apagada siempre y en silencio. Cuando
  // desde > hasta, la ventana son los dos EXTREMOS del mes, no el hueco.
  return v.dia_desde <= v.dia_hasta
    ? dia >= v.dia_desde && dia <= v.dia_hasta
    : dia >= v.dia_desde || dia <= v.dia_hasta;
}

/* ═══════════════════════════════════════════════════════════════════════
   Lo que necesita el formulario: tres estados, nunca un textarea de JSON
   ═══════════════════════════════════════════════════════════════════════ */

export type ModoVigencia = 'siempre' | 'mensual' | 'rango';

/** El campo, abierto en controles. Se guarda una CADENA, no este objeto. */
export interface BorradorVigencia {
  modo: ModoVigencia;
  /** '1'–'31'. Se quedan puestos al cambiar de modo, para poder volver. */
  dia_desde: string;
  dia_hasta: string;
  /** ISO 'YYYY-MM-DD'. */
  desde: string;
  hasta: string;
}

/** Los días que ofrece el desplegable. Texto libre no: se teclea un 0 o un 32. */
export const DIAS_DEL_MES = Array.from({ length: 31 }, (_, i) => i + 1);

/**
 * La fila guardada → los controles.
 *
 * Un valor que `parseVigencia` no entiende cae en «Siempre», que es justo lo
 * que el bot está haciendo con él. Guardar entonces lo normaliza a `''` y deja
 * de haber un JSON roto durmiendo en la fila.
 */
export function borradorVigencia(raw: string | null | undefined): BorradorVigencia {
  const v = parseVigencia(raw);
  return {
    modo: v?.tipo ?? 'siempre',
    dia_desde: String(v?.tipo === 'mensual' ? v.dia_desde : 1),
    dia_hasta: String(v?.tipo === 'mensual' ? v.dia_hasta : 15),
    desde: v?.tipo === 'rango' ? v.desde : '',
    hasta: v?.tipo === 'rango' ? v.hasta : '',
  };
}

/** Los controles → lo que se guarda. `''` en «Siempre»: limpia el campo. */
export function construirVigencia(b: BorradorVigencia): string {
  if (b.modo === 'mensual') {
    return JSON.stringify({
      tipo: 'mensual',
      dia_desde: Number(b.dia_desde),
      dia_hasta: Number(b.dia_hasta),
    });
  }
  if (b.modo === 'rango') {
    return JSON.stringify({ tipo: 'rango', desde: b.desde, hasta: b.hasta });
  }
  return '';
}

/**
 * Qué impide guardar, en la frase que se le enseña. `null` = adelante.
 *
 * ⚠️ `dia_desde` MAYOR que `dia_hasta` NO es un error: «del 28 al 3» es una
 * quincena de pagos normal y el bot la entiende como los dos extremos del mes.
 * No se valida, y sobre todo no se le da la vuelta a los números.
 *
 * En un rango sí lo es: con `desde` posterior a `hasta` la promo no estaría
 * vigente ni un solo día, y eso no es lo que nadie quiso escribir.
 */
export function errorVigencia(b: BorradorVigencia): string | null {
  if (b.modo === 'mensual') {
    const d = Number(b.dia_desde);
    const h = Number(b.dia_hasta);
    if (!Number.isInteger(d) || !Number.isInteger(h) || d < 1 || d > 31 || h < 1 || h > 31) {
      return 'Los días del mes van del 1 al 31.';
    }
    return null;
  }
  if (b.modo === 'rango') {
    if (!b.desde || !b.hasta) return 'Pon las dos fechas: desde cuándo y hasta cuándo se ofrece.';
    if (!ISO.test(b.desde) || !ISO.test(b.hasta)) {
      return 'Las fechas no se entienden. Elígelas en el calendario.';
    }
    if (b.desde > b.hasta) {
      return 'La fecha de fin es anterior a la de inicio: así la promo no estaría vigente ningún día.';
    }
    return null;
  }
  return null;
}

/** 'YYYY-MM-DD' → «10 nov 2026». En local: `new Date(iso)` se va a UTC y baila. */
const fecha = (iso: string): string => {
  const [a, m, d] = iso.split('-').map(Number);
  return `${diaMes(new Date(a, m - 1, d))} ${a}`;
};

/** La ventana en una frase, para el texto de ayuda del campo. */
export function describirVentana(raw: string | null | undefined): string {
  const v = parseVigencia(raw);
  if (!v) return 'Se puede ofrecer todo el año.';
  if (v.tipo === 'rango') return `Solo del ${fecha(v.desde)} al ${fecha(v.hasta)}, una vez.`;
  return v.dia_desde <= v.dia_hasta
    ? `Todos los meses, del día ${v.dia_desde} al ${v.dia_hasta}.`
    : `Todos los meses, del día ${v.dia_desde} a fin de mes y del 1 al ${v.dia_hasta}.`;
}
