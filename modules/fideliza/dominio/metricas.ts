/**
 * ══════════════════════════════════════════════════════════════════════════
 * QUÉ SIGNIFICA CADA CIFRA DE FIDELIZA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Todas salen de loyalty_metrics() (modules/fideliza/sql/0005). Aquí está lo que
 * el panel enseña debajo de cada una: definición, fuente y lo que NO dice.
 * Un porcentaje solo se calcula si el denominador es > 0; si no, «—».
 */
export interface Metricas {
  range: { from: string; to: string };
  members: { total: number; new: number; new_activated: number; with_operation: number; suspended: number };
  repeat: Record<'30' | '60' | '90', { cohort: number; repeated: number }>;
  operations: {
    purchases: number;
    visits: number;
    refunds: number;
    adjustments: number;
    purchase_members: number;
    visit_members: number;
    gross_cents: number;
    refund_cents: number;
    units_granted: number;
  };
  rewards: { issued: number; issued_redeemed: number; redeemed: number; available_now: number; expired: number };
  recovered: number;
  funnel: { join_views: number; joins: number; card_views: number };
  devices: { by_status: Record<string, number>; opens_by_source: Record<string, number>; unavailable_opens: number };
  wallet: {
    classes: { program_id: string; state: string; review_status: string | null; last_error: string | null; last_synced_at: string | null; is_demo: boolean }[];
    passes: number;
    passes_by_state: Record<string, number>;
    pending_updates: number;
    save_links_issued: number;
    last_sync: string | null;
  };
  outbox: { pending: number; overdue: number; dead: number; oldest_pending: string | null };
  campaigns: Record<string, Record<string, number> | null>;
}

export const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : '—');

export const DEFINICIONES = {
  miembros: 'Tarjetas creadas que no se han borrado. Fuente: loyalty_members.',
  nuevos: 'Tarjetas creadas dentro del periodo (hora de Lima).',
  activacion:
    'De las tarjetas creadas en el periodo, cuántas tienen ya al menos una compra o visita registrada. No cuenta operaciones que no se registraron en caja.',
  conversion:
    'Altas / visitas a la página de alta. Solo mide quien llegó a /unirse; quien abre la página de enlaces y no pulsa no entra en el denominador.',
  repeticion:
    'Cohorte madura: miembros cuya primera operación fue hace al menos N días. «Volvieron» = tienen otra operación dentro de esos N días. Los más recientes no cuentan todavía.',
  frecuenciaCompra: 'Compras del periodo / personas distintas que compraron. Separado de las visitas.',
  frecuenciaVisita: 'Visitas del periodo / personas distintas que visitaron.',
  ticket:
    'Ventas registradas menos devoluciones, dividido entre el número de compras. Solo lo que pasó por la caja de Fideliza, no todas las ventas del negocio.',
  canje: 'De los premios emitidos en el periodo, cuántos ya se canjearon. Los emitidos al final del periodo todavía no han tenido tiempo.',
  recuperados: 'Personas que volvieron en el periodo tras 60 días o más sin ninguna operación. No dice qué las trajo.',
  cobertura:
    'Ventas registradas frente a ventas totales: NO se calcula. Fideliza no conoce las ventas totales del negocio y no hay denominador real.',
  wallet:
    'Enlaces emitidos = veces que alguien pulsó «Agregar a Google Wallet» y le dimos el enlace. NO es «guardado»: Google no nos lo confirma.',
  aperturas: 'Aperturas de placas. «QR» viene con ?o=qr; «NFC» es todo lo demás (también un enlace copiado). No prueba presencia en el local.',
  campanas:
    '«Aceptados» = el servicio de push del navegador aceptó el mensaje. No significa entregado ni leído. «Compra después» = compra registrada en los 14 días siguientes; no prueba que la causara el mensaje.',
};
