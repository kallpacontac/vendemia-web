/**
 * ══════════════════════════════════════════════════════════════════════════
 * FOTO DEL COMPROBANTE AL COBRAR · la opción de cada negocio (10-nov-2026)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Configuración › Negocio › «Comprobante al cobrar». Vive en Postgres
 * (cobro_ajustes, modules/datos/sql/0010), no en `companies`: el bot no la
 * conoce, así que no puede pisarla ni rechazarla. Solo la cambia el dueño.
 *
 *   · apagada      el panel no ofrece la foto.
 *   · opcional     «Foto del pago» en Registrar pago, Cobrada y Validar pago.
 *   · obligatoria  igual, y Postgres no registra un cobro por Yape, Plin o
 *                  transferencia sin su foto (v2_foto_pago_validar). El panel
 *                  lo pide antes para no dejar a nadie con un error.
 *
 * La regla de verdad es la de Postgres; esto solo decide qué se enseña.
 * Sin React ni red: se prueba solo.
 */

export type ModoFotoPago = 'apagada' | 'opcional' | 'obligatoria';

export const MODOS_FOTO_PAGO: ModoFotoPago[] = ['apagada', 'opcional', 'obligatoria'];

export interface CobroFoto {
  modo: ModoFotoPago;
  /**
   * La agenda la lleva Postgres. Con el bot, el cobro va por su cola y la foto
   * no tiene dónde guardarse: se trata como apagada.
   */
  nube: boolean;
  /** Sin la 0010 en la base: se adivina como antes (foto solo en canchas). */
  sinMigrar?: boolean;
}

/** La foto que el servidor subió y leyó (POST /api/cobros/foto). */
export interface FotoPago {
  url: string;
  hash: string;
  operacion: string;
  leida: boolean;
  decision: 'aprobar' | 'revisar' | 'rechazar';
  motivo: string;
  monto: number | null;
  metodo: string;
  destino: string;
}

/** Lo que viaja con el cobro: Postgres vuelve a comprobarlo todo. */
export const fotoParaCobro = (f: FotoPago | null) => (f ? { url: f.url, hash: f.hash, operacion: f.operacion } : undefined);

/** Efectivo y contra entrega nunca piden foto: no hay comprobante que fotografiar. */
export const METODOS_SIN_FOTO = ['cash', 'cod'];

export const esModoFotoPago = (v: unknown): v is ModoFotoPago =>
  typeof v === 'string' && (MODOS_FOTO_PAGO as string[]).includes(v);

/** ¿Se ofrece la foto en este negocio? */
export const ofreceFoto = (c: CobroFoto | null | undefined): boolean => Boolean(c && c.nube && c.modo !== 'apagada');

/** ¿Este cobro no se puede registrar sin foto? */
export const exigeFoto = (c: CobroFoto | null | undefined, metodo: string): boolean =>
  ofreceFoto(c) && c!.modo === 'obligatoria' && !METODOS_SIN_FOTO.includes(metodo);

/** ¿Tiene sentido pedir la foto para este método? (con efectivo, ni se ofrece). */
export const fotoParaMetodo = (c: CobroFoto | null | undefined, metodo: string): boolean =>
  ofreceFoto(c) && !METODOS_SIN_FOTO.includes(metodo);

/**
 * Lo que devuelve cobro_foto_modo, o la suposición de antes si la 0010 aún no
 * se corrió: las canchas tenían la foto (opcional) y nadie más.
 */
export function leerCobroFoto(data: unknown, error: { code?: string; message?: string } | null, canchas: boolean): CobroFoto {
  if (error) {
    const sinFuncion = error.code === 'PGRST202' || /cobro_foto_modo/.test(error.message ?? '');
    return { modo: sinFuncion && canchas ? 'opcional' : 'apagada', nube: true, sinMigrar: sinFuncion };
  }
  const d = (data ?? {}) as { modo?: unknown; nube?: unknown };
  return { modo: esModoFotoPago(d.modo) ? d.modo : 'apagada', nube: d.nube === true };
}

/** Lo que se lee en Configuración, en una línea por opción. */
export const TEXTO_MODO: Record<ModoFotoPago, { titulo: string; detalle: string }> = {
  apagada: {
    titulo: 'Sin foto',
    detalle: 'Se cobra como siempre: monto y método, sin adjuntar nada.',
  },
  opcional: {
    titulo: 'Foto opcional',
    detalle: 'Al cobrar aparece «Foto del pago». Se lee sola, rellena monto y método y queda guardada.',
  },
  obligatoria: {
    titulo: 'Foto obligatoria',
    detalle: 'Ningún cobro por Yape, Plin o transferencia se registra sin su foto. El efectivo no la pide.',
  },
};
