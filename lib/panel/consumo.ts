/**
 * ══════════════════════════════════════════════════════════════════════════
 * CONSUMO · cuántas conversaciones van este mes y qué le toca al dueño
 * ══════════════════════════════════════════════════════════════════════════
 *
 * El panel NO cuenta nada: lee lo que escribe el bot en `consumo_mensual`,
 * que es quien decide si una conversación entra en el plan, en una recarga o
 * en la gracia (ver docs/prompt-bot-consumo-y-topes.md). Si el panel volviera a
 * contar por su lado —leads por día, por ejemplo— bastaría un número de prueba
 * o un reinicio del bot para que las dos cifras discreparan, y el dueño vería
 * «te quedan 40» mientras Mia ya le está pasando las conversaciones.
 *
 * ORDEN EN QUE SE GASTA: plan → recargas → gracia. Quien pagó una recarga la
 * usa antes que el colchón gratuito; la gracia queda para no cortar a nadie un
 * día de mucho movimiento.
 */
import { AVISOS, GRACIA, PLANES, miles, type PlanId } from '@/lib/planes';

export interface Consumo {
  plan: PlanId;
  /** 'YYYY-MM', en hora de Lima. */
  mes: string;
  /** Conversaciones del mes, TODAS: plan + recarga + gracia. */
  conversaciones: number;
  /** De esas, cuántas se pagaron con recarga. */
  deRecarga: number;
  /** De esas, cuántas entraron en la gracia. */
  deGracia: number;
  /** Conversaciones nuevas que Mia pasó al dueño por estar todo agotado. */
  derivadas: number;
  /** Lo que queda en recargas vigentes (no caducadas). */
  saldoRecargas: number;
}

export type Nivel = 'ok' | 'aviso' | 'recarga' | 'gracia' | 'agotado';

export interface EstadoConsumo {
  nivel: Nivel;
  tope: number;
  /** Las que cuentan contra el plan, sin pasar del tope. */
  delPlan: number;
  /** 0–100, solo del plan: la barra se llena con el plan, no con la gracia. */
  pct: number;
  /** Lo que queda del plan este mes. */
  quedanPlan: number;
  graciaTotal: number;
  quedanGracia: number;
  titulo: string;
  detalle: string;
  /** ¿Enseñar el botón de recargar? */
  ofrecerRecarga: boolean;
}

export function estadoConsumo(c: Consumo): EstadoConsumo {
  const tope = PLANES[c.plan].tope;
  const graciaTotal = Math.round(tope * GRACIA);
  // Lo del plan es lo que no fue ni recarga ni gracia. Se recorta al tope por
  // si el bot y el tope del panel no coinciden (alguien cambió un número en
  // un lado y no en el otro): mejor una barra llena que una al 130 %.
  const delPlan = Math.min(tope, Math.max(0, c.conversaciones - c.deRecarga - c.deGracia));
  const quedanPlan = tope - delPlan;
  const quedanGracia = Math.max(0, graciaTotal - c.deGracia);
  const pct = tope > 0 ? Math.round((delPlan / tope) * 100) : 0;

  const base = { tope, delPlan, pct, quedanPlan, graciaTotal, quedanGracia };

  if (quedanPlan > 0) {
    const aviso = delPlan >= tope * AVISOS[0];
    return {
      ...base,
      nivel: aviso ? 'aviso' : 'ok',
      titulo: `${miles(delPlan)} de ${miles(tope)} conversaciones`,
      detalle: aviso
        ? c.saldoRecargas > 0
          ? `Te quedan ${miles(quedanPlan)} este mes, y ${miles(c.saldoRecargas)} de recarga para cuando se acaben.`
          : `Te quedan ${miles(quedanPlan)} este mes. Si vas a necesitar más, recarga ahora y Mia no se detiene.`
        : `Te quedan ${miles(quedanPlan)} este mes en tu plan ${PLANES[c.plan].nombre}.`,
      ofrecerRecarga: aviso && c.saldoRecargas === 0,
    };
  }

  if (c.saldoRecargas > 0) {
    return {
      ...base,
      nivel: 'recarga',
      titulo: 'Usando tu recarga',
      detalle: `Tu plan de este mes ya se usó entero. Te quedan ${miles(c.saldoRecargas)} conversaciones de recarga.`,
      ofrecerRecarga: false,
    };
  }

  if (quedanGracia > 0) {
    return {
      ...base,
      nivel: 'gracia',
      titulo: 'Usando la gracia sin costo',
      detalle: `Tu plan de este mes ya se usó entero. Mia sigue atendiendo ${miles(quedanGracia)} conversaciones más sin costo; después pasará las nuevas a ti.`,
      ofrecerRecarga: true,
    };
  }

  return {
    ...base,
    nivel: 'agotado',
    titulo: 'Mia te está pasando las conversaciones nuevas',
    detalle: `Terminó las que ya había empezado, pero las nuevas te llegan a ti${c.derivadas > 0 ? ` (${miles(c.derivadas)} hasta ahora)` : ''}. Recarga y vuelve a atenderlas al momento.`,
    ofrecerRecarga: true,
  };
}
