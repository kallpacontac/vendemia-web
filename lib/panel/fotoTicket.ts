/**
 * La foto del voucher o del ticket de papel en «Generar ticket» (Mi agenda), tu-pagina 0037 + 0039.
 *
 * 26-nov-2026 (The 24/7): un solo botón para adjuntar hasta 2 fotos, y el negocio decide si van:
 * sin foto, opcional (de serie, como hasta hoy) u obligatoria. La foto NO es un cobro: la ve quien
 * cobra en «Por cobrar en caja» para comparar. Se guarda en cobro_ajustes.ticket_foto.
 */
export type ModoFotoTicket = 'apagada' | 'opcional' | 'obligatoria';

export const MODOS_FOTO_TICKET: ModoFotoTicket[] = ['apagada', 'opcional', 'obligatoria'];

/** Una del voucher (el Yape que enseñó el cliente) y otra del ticket de papel. */
export const MAX_FOTOS_TICKET = 2;

export const TEXTO_FOTO_TICKET: Record<ModoFotoTicket, { titulo: string; detalle: string }> = {
  apagada: { titulo: 'Sin foto', detalle: 'El formulario no pide ninguna foto.' },
  opcional: { titulo: 'Opcional', detalle: 'Puede adjuntar hasta 2 fotos o ninguna.' },
  obligatoria: { titulo: 'Obligatoria', detalle: 'No genera el ticket sin al menos una foto.' },
};
