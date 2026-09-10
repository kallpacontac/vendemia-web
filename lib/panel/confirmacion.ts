/**
 * ══════════════════════════════════════════════════════════════════════════
 * QUIÉN DIO ESTO POR BUENO
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `pagado_por` y `cumplido_por` (migración 0024) no añaden estados: dicen la
 * PROCEDENCIA del estado que ya existía. Y esa procedencia cambia lo que se
 * puede afirmar.
 *
 * El caso que lo justifica todo: **`completed` no significa «vino»**. Lo pone un
 * cron 120 minutos después de la hora, asumiendo asistencia salvo que alguien
 * marque `no_show`. Significa *«pasó la hora y nadie dijo lo contrario»*. Hasta
 * la 0024, una `completed` puesta por el reloj era indistinguible de una que
 * confirmó una persona mirando.
 *
 * ── ⚠️ LA TRAMPA: `''` NO ES «SIN CONFIRMAR» ─────────────────────────────────
 *
 * Las filas anteriores a la migración NO se rellenaron hacia atrás. En
 * producción hay una cita `completed` con `cumplido_por = ''`: casi con
 * seguridad la cerró el cron, pero *casi con seguridad* no es un hecho, y el
 * panel no puede afirmarlo.
 *
 * Por eso son TRES grados y no dos. Si se funden, el primer informe cuenta como
 * confirmadas unas citas que no miró nadie:
 *
 *   completed + 'panel' → CONFIRMADA   (lo dijo una persona)
 *   completed + 'cron'  → PRESUNTA     (lo supuso el reloj)
 *   completed + ''      → NO CONSTA    (fila histórica, no se sabe)
 *
 * `pendiente` es distinto de los tres: ahí el estado ni siquiera dice que haya
 * pasado nada todavía.
 */

/* ── Estados que significan «esto ya se cobró» ──────────────────────────────
   Copiados de estados_con_ingreso() / estados_cita_con_ingreso() de la 0019,
   que es el criterio de dinero del sistema. ⚠️ Si allí cambian, cambian aquí:
   esto NO entra en ningún cálculo de facturación —es descriptivo— pero enseñar
   "sin cobrar" sobre algo que la vista de ingresos ya cuenta es peor que no
   enseñar nada. Ver la nota de [[ingresos-que-cuentan]] en la 0019.            */
const PEDIDO_COBRADO = new Set(['paid', 'delivered', 'completed']);
const CITA_COBRADA = new Set(['confirmed', 'completed']);

/** Estados que significan «esto ya se cumplió»: entregado, o atendido. */
const PEDIDO_CUMPLIDO = new Set(['delivered']);
/** `no_show` TAMBIÉN es cumplimiento resuelto: se sabe qué pasó, y fue que no vino. */
const CITA_CUMPLIDA = new Set(['completed', 'no_show']);

export type Tipo = 'order' | 'appointment';

/**
 * `pendiente`  el estado no dice que haya pasado todavía
 * `confirmado` lo afirmó una persona desde el panel — es un hecho
 * `presunto`   lo cerró el cron por vencimiento de la hora — es una suposición
 * `verificado` el bot comprobó la captura del pago (visión + reglas + dedupe)
 * `sinDato`    el estado dice que pasó, pero la fila es anterior a la 0024
 */
export type Grado = 'pendiente' | 'confirmado' | 'presunto' | 'verificado' | 'sinDato';

export interface Sello {
  grado: Grado;
  label: string;
  color: string;
  /** Texto largo para el `title`: por qué esa palabra y no otra. */
  ayuda: string;
}

const PENDIENTE_PAGO: Sello = {
  grado: 'pendiente',
  label: 'Sin cobrar',
  color: '#B26B00',
  ayuda: 'Todavía no consta el cobro.',
};

const PENDIENTE_CUMPLIDO: Sello = {
  grado: 'pendiente',
  label: 'Sin resolver',
  color: '#B26B00',
  ayuda: 'Todavía no se sabe si vino.',
};

/**
 * ¿Cómo de fiable es «esto está cobrado»?
 *
 * ⚠️ 'panel' y 'voucher' NO son lo mismo y no pueden verse igual. El bot
 * verifica la captura —visión, reglas y deduplicación de operación e imagen—;
 * una persona marcándolo a mano no ha comprobado nada. El día que las cuentas
 * no cuadren, lo primero que se pregunta es cuál de los dos estaba respaldado.
 */
export function selloPagado(tipo: Tipo, estado: string | null, pagadoPor: string | null): Sello {
  const cobrado = tipo === 'order' ? PEDIDO_COBRADO : CITA_COBRADA;
  if (!estado || !cobrado.has(estado)) return PENDIENTE_PAGO;

  switch (pagadoPor) {
    case 'voucher':
      return {
        grado: 'verificado',
        label: 'Cobrado',
        color: '#0FA968',
        ayuda: 'El bot verificó la captura del pago: visión, reglas y control de duplicados.',
      };
    case 'panel':
      return {
        grado: 'confirmado',
        label: 'Cobrado a mano',
        color: '#3B82F6',
        ayuda: 'Lo dio por cobrado una persona desde el panel. No lo ha verificado nadie.',
      };
    default:
      return {
        grado: 'sinDato',
        label: 'Cobrado · no consta quién',
        color: '#93938C',
        ayuda:
          'El estado dice cobrado, pero esta fila es anterior a que se guardara la procedencia. No se sabe quién lo dio por bueno.',
      };
  }
}

/**
 * ¿Cómo de fiable es «esto se cumplió»?
 *
 * Es el sello que más importa, porque es donde vive la presunción del cron.
 */
export function selloCumplido(tipo: Tipo, estado: string | null, cumplidoPor: string | null): Sello {
  const cumplido = tipo === 'order' ? PEDIDO_CUMPLIDO : CITA_CUMPLIDA;
  if (!estado || !cumplido.has(estado)) return PENDIENTE_CUMPLIDO;

  const noVino = estado === 'no_show';

  switch (cumplidoPor) {
    case 'panel':
      return {
        grado: 'confirmado',
        label: noVino ? 'No vino' : tipo === 'order' ? 'Entregado' : 'Vino',
        color: noVino ? '#E5484D' : '#0FA968',
        ayuda: 'Lo confirmó una persona. Es un hecho.',
      };
    case 'cron':
      return {
        grado: 'presunto',
        label: 'Presunta',
        color: '#B26B00',
        ayuda:
          'La cerró el reloj 2 h después de la hora, dando por hecho que vino porque nadie dijo lo contrario. Si no vino, corrígelo: la cifra deja de mentir.',
      };
    default:
      return {
        grado: 'sinDato',
        label: 'No consta',
        color: '#93938C',
        ayuda:
          'El estado dice que se cumplió, pero es una fila anterior a que se guardara la procedencia. Probablemente la cerró el reloj, pero no se puede afirmar.',
      };
  }
}

/** ¿Merece la pena enseñar el botón de cobrar? */
export const faltaCobrar = (tipo: Tipo, estado: string | null): boolean =>
  selloPagado(tipo, estado, null).grado === 'pendiente';

/**
 * ¿Pide esta fila que alguien la mire?
 *
 * Las `presunto` y las `sinDato` SÍ: son las dos que el dueño puede convertir en
 * un hecho con un clic, y la regla de diseño de esta función es que se vean
 * distintas de las confirmadas. Si `cron` y `panel` se pintan igual, nadie
 * corrige nada y la columna entera no sirve para nada.
 */
export const pideRevision = (s: Sello): boolean => s.grado === 'presunto' || s.grado === 'sinDato';

/* ── El recuento honesto ────────────────────────────────────────────────────
   Nunca «12 atendidas» a secas: la cifra útil es la que separa lo que confirmó
   alguien de lo que supuso un reloj.                                          */

export interface Reparto {
  total: number;
  confirmadas: number;
  presuntas: number;
  sinDato: number;
}

export function repartoCumplido(
  filas: { status: string | null; cumplido_por?: string | null }[],
  tipo: Tipo = 'appointment',
): Reparto {
  const r: Reparto = { total: 0, confirmadas: 0, presuntas: 0, sinDato: 0 };
  for (const f of filas) {
    const s = selloCumplido(tipo, f.status, f.cumplido_por ?? '');
    if (s.grado === 'pendiente') continue;
    r.total += 1;
    if (s.grado === 'confirmado') r.confirmadas += 1;
    else if (s.grado === 'presunto') r.presuntas += 1;
    else r.sinDato += 1;
  }
  return r;
}

/** "2 confirmadas · 9 presuntas · 1 sin dato". Omite los ceros. */
export function textoReparto(r: Reparto): string {
  const partes: string[] = [];
  if (r.confirmadas) partes.push(`${r.confirmadas} confirmadas`);
  if (r.presuntas) partes.push(`${r.presuntas} presuntas`);
  if (r.sinDato) partes.push(`${r.sinDato} sin dato`);
  return partes.join(' · ');
}
