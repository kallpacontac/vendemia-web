/**
 * ══════════════════════════════════════════════════════════════════════════
 * QUÉ CUENTA COMO DINERO · tres preguntas sobre las mismas filas
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ingresos, comisiones y caja NO son la misma cifra, y no cuadrar entre ellas
 * es lo correcto. Lo que no puede pasar es que no se sepa por qué, así que las
 * tres definiciones viven aquí y no repartidas por las pantallas.
 *
 *   Ingresos    lo que enseñan Métricas y el dashboard. Incluye la cita
 *               CONFIRMADA que todavía no ha ocurrido.
 *   Comisión    solo lo que de verdad pasó: la cita completada.
 *   Caja        solo lo que alguien marcó cobrado.
 *
 * ── Por qué la comisión es más estricta que los ingresos ──────────────────
 *
 * Decisión de Alvaro (18-sep-2026): la comisión se devenga al COMPLETARSE la
 * cita. Pagarle a una estilista por una cita confirmada que luego se cancela
 * crea una deuda que hay que descontarle del sueldo el mes siguiente — que es
 * justo la discusión que este módulo viene a evitar. Es una cifra más baja que
 * «Ingresos» del mismo periodo, siempre, y la pantalla tiene que decirlo: si
 * no, el primer día alguien lo reporta como un fallo de cuentas.
 *
 * ⚠️ Lo que NO se toca aquí es `cuenta_ingreso`: lo calcula Postgres con
 * `estados_con_ingreso()` (migración 0019) y su lista gemela vive en el bot
 * (`src/utils/ingresos.ts`). Están duplicadas a los dos lados a propósito
 * —SQLite y Postgres no comparten código— y si algún día cambia el criterio,
 * se cambia en las dos a la vez o el bot y el panel dan cifras distintas para
 * el mismo día. Este fichero solo LEE esa decisión.
 */
import type { MovimientoRow } from '@/lib/supabase/types';

/**
 * Lo que cuenta como ingreso en Métricas y en el dashboard.
 *
 * Es un simple reenvío de lo que ya decidió la vista, y existe para que las
 * pantallas no lean `cuenta_ingreso` a pelo: el día que el criterio cambie,
 * se busca por este nombre y salen todos los sitios.
 */
export const esIngreso = (m: MovimientoRow): boolean => m.cuenta_ingreso;

/**
 * Lo que le genera comisión a quien atendió.
 *
 * Solo citas completadas. Quedan fuera:
 *   · las `confirmed` — todavía no han ocurrido (ver la cabecera);
 *   · los pedidos — `v_movimientos` trae `employee_id` vacío en esa rama,
 *     así que no se sabe quién vendió. La venta de producto no genera
 *     comisión hoy, y eso hay que decirlo en pantalla, no dejar que se
 *     deduzca de un total que no cuadra.
 *
 * ⚠️ NO exige `employee_id`. Una cita completada sin estilista asignado sigue
 * siendo trabajo hecho que alguien hizo: la pantalla la agrupa aparte («sin
 * asignar») en vez de esconderla. Descartarla aquí sería perder dinero de
 * vista en silencio, que es el modo de fallo que no queremos.
 */
export const devengaComision = (m: MovimientoRow): boolean =>
  m.fuente === 'appointment' && m.estado === 'completed';

/**
 * Lo que entró de verdad, para el cierre del día.
 *
 * El criterio es `pagado_por`, no el estado: dice QUIÉN dio el cobro por bueno
 * —el bot al verificar un voucher, una persona desde el panel, o el cron— y la
 * caja es «lo que alguien contó», no «lo que la base supone».
 *
 * ⚠️ Consecuencia a tener presente: una fila antigua, anterior a que existiera
 * `pagado_por`, puede estar en `paid` y quedarse fuera de la caja. Es
 * deliberado —preferimos una caja corta y explicable a una larga que nadie
 * puede justificar— pero la pantalla tiene que ofrecer ver esas filas, o el
 * dinero desaparece sin rastro.
 */
export const entroEnCaja = (m: MovimientoRow): boolean => m.pagado_por !== '';

/** Cobrado según el estado, pero sin constancia de quién. Ver `entroEnCaja`. */
export const cobradoSinConstancia = (m: MovimientoRow): boolean =>
  m.pagado_por === '' && m.cuenta_ingreso;

/** Suma de importes. En un solo sitio porque `importe` puede llegar como texto. */
export const suma = (movimientos: MovimientoRow[]): number =>
  movimientos.reduce((t, m) => t + (Number(m.importe) || 0), 0);
