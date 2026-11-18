/**
 * ══════════════════════════════════════════════════════════════════════════
 * EL SELLO DE LA TARJETA, SOLO, AL COBRAR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Alvaro (17-nov-2026, The 24/7): «ya tiene la cita… ¿es automático? Se registra con su número y
 * se suma un sello, ¿correcto?». Hasta hoy no: la cita y la tarjeta no se hablaban, y el cajero
 * tenía que ir a Fideliza a buscarlo. Ahora, al cobrar en la Caja una atención de un cliente con
 * celular, si ese celular tiene tarjeta en este negocio se le suma su sello (o sus puntos) solo.
 *
 *   · Una vez por cita, pase lo que pase: la clave de idempotencia es la cita
 *     (`cita-<id>`). Cobrar dos veces, reintentar o cobrar en dos partes no suma dos sellos.
 *   · Por el mismo camino que la Caja de Fideliza (caja.buscar + caja.registrar), con sus
 *     permisos y sus reglas: la base decide cuánto suma y si sale premio.
 *   · Sin tarjeta, o con dos tarjetas en el mismo celular, no se suma nada y se dice por qué.
 *   · Nunca tumba el cobro: si algo falla, el cobro ya está hecho y solo se avisa.
 */
import { accion, mensaje } from '@/modules/fideliza/cliente/api';
import { unidades, type TipoRegla } from '@/modules/fideliza/dominio/formato';

interface Miembro {
  id: string;
  alias: string | null;
  balance: number;
  threshold: number | null;
  rule_type: TipoRegla | null;
}

interface Resultado {
  status?: string;
  units?: number;
  rewards_issued?: number;
  member: Miembro;
}

export type SelloResultado = { tono: 'ok' | 'espera'; texto: string } | null;

/** Suma el sello de esta cita a la tarjeta de ese celular. null = no había a quién (sin celular). */
export async function sumarSelloDeCita(
  companyId: string,
  telefono: string | null | undefined,
  citaId: string,
  totalSoles: number,
): Promise<SelloResultado> {
  const tel = (telefono ?? '').replace(/\D/g, '');
  if (tel.length < 9) return null;
  try {
    const encontrados = await accion<Miembro[]>('caja.buscar', { companyId, q: tel.slice(-9) });
    if (encontrados.length === 0) {
      return { tono: 'espera', texto: 'Ese cliente aún no tiene tarjeta: créala en «Escanear tarjeta» › Nuevo cliente.' };
    }
    if (encontrados.length > 1) {
      return { tono: 'espera', texto: 'Ese celular tiene más de una tarjeta: suma el sello en «Escanear tarjeta», eligiendo la suya.' };
    }
    const m = encontrados[0];
    const r = await accion<Resultado>('caja.registrar', {
      companyId,
      memberId: m.id,
      kind: m.rule_type === 'visits' ? 'visit' : 'purchase',
      amountCents: Math.max(0, Math.round(totalSoles * 100)),
      locationId: null,
      externalRef: null,
      idempotencyKey: `cita-${citaId}`.slice(0, 80),
    });
    const quien = r.member.alias?.trim() || 'su tarjeta';
    if (r.status === 'replayed') return { tono: 'espera', texto: `Esta atención ya había sumado en la tarjeta de ${quien}.` };
    const tipo = r.member.rule_type;
    const saldo = r.member.threshold ? `${unidades(r.member.balance, tipo)} de ${unidades(r.member.threshold, tipo)}` : unidades(r.member.balance, tipo);
    return {
      tono: 'ok',
      texto: r.rewards_issued
        ? `¡${quien} ganó su premio! Se lo das en «Escanear tarjeta».`
        : r.units
          ? `Tarjeta de ${quien}: +${unidades(r.units, tipo)} (lleva ${saldo}).`
          : `Tarjeta de ${quien}: registrada, sin sumar (por debajo del mínimo).`,
    };
  } catch (e) {
    return { tono: 'espera', texto: `Cobrado, pero el sello no se sumó: ${mensaje(e)}. Súmalo en «Escanear tarjeta».` };
  }
}
