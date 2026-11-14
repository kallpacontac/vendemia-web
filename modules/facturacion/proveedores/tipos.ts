/**
 * ══════════════════════════════════════════════════════════════════════════
 * EL CONTRATO DE UN PROVEEDOR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Todo lo que Vendemia le pide a quien manda los comprobantes a SUNAT. Cada
 * proveedor es un fichero en esta carpeta que cumple esta interfaz; el resto del
 * sistema no sabe cuál está usando.
 *
 * Cambiar el proveedor de un local: Ajustes › Boletas y facturas › Proveedor,
 * y su token. Añadir uno nuevo: un fichero aquí + su línea en index.ts + el id
 * en dominio/tipos.ts (PROVEEDORES) y en la SQL (check de factura_ajustes).
 *
 * Reglas para quien escriba uno:
 *   · Nunca lanzar por una respuesta del proveedor: traducirla a `Respuesta`.
 *     Solo un fallo de programación debe salir como excepción.
 *   · 'error' = no llegó a SUNAT y se puede reintentar con el MISMO número.
 *     'rechazado' = SUNAT lo vio y dijo que no; ese número ya no se reutiliza.
 *   · Si el proveedor dice «ya emitido» al reintentar, consultar y devolver eso.
 */
import type { Ambiente, ComprobanteGuardado, ComprobanteListo, IdProveedor, Respuesta } from '../dominio/tipos';

export interface Credencial {
  /** El token de ESE local en el proveedor. Nunca sale del servidor. */
  token: string;
  ambiente: Ambiente;
}

/** Los datos para pedir la baja. El correlativo lo da Vendemia (factura_series). */
export interface PedidoBaja {
  motivo: string;
  /** YYYY-MM-DD de hoy, hora de Lima. */
  hoy: string;
  /** Correlativo de la comunicación del día (RA/RC), para quien lo necesite. */
  correlativo: number;
}

export interface Proveedor {
  id: IdProveedor;
  nombre: string;
  /** Si su comprobante necesita ubigeo y dirección desglosada del emisor. */
  pideUbigeo: boolean;
  /** Si sirve para emitir de verdad (el simulado no). */
  real: boolean;
  /** Días que da SUNAT/el proveedor para anular por baja; después, nota de crédito. */
  diasParaAnular: Record<'boleta' | 'factura', number>;

  emitir(doc: ComprobanteListo, cred: Credencial): Promise<Respuesta>;
  consultar(doc: ComprobanteListo, cred: Credencial): Promise<Respuesta>;
  anular(doc: ComprobanteGuardado, baja: PedidoBaja, cred: Credencial): Promise<Respuesta>;
  /** Cuando la baja quedó en 'anulando'. */
  consultarBaja(doc: ComprobanteGuardado, cred: Credencial): Promise<Respuesta>;
}

/** fetch con tiempo límite y sin caché (Next guarda los fetch del servidor si no se le dice). */
export async function llamar(
  url: string,
  init: RequestInit & { ms?: number },
): Promise<{ ok: boolean; status: number; cuerpo: unknown; texto: string } | { ok: false; status: 0; cuerpo: null; texto: string }> {
  const ctl = new AbortController();
  const reloj = setTimeout(() => ctl.abort(), init.ms ?? 25_000);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal, cache: 'no-store' });
    const texto = await r.text();
    let cuerpo: unknown = null;
    try {
      cuerpo = texto ? JSON.parse(texto) : null;
    } catch {
      cuerpo = null;
    }
    return { ok: r.ok, status: r.status, cuerpo, texto };
  } catch (e) {
    const tiempo = (e as Error)?.name === 'AbortError';
    return { ok: false, status: 0, cuerpo: null, texto: tiempo ? 'tiempo' : String((e as Error)?.message ?? e) };
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Una llamada que no llegó a contestar. Si se cortó por tiempo, el proveedor
 * pudo haberlo recibido: queda 'pendiente' para que se CONSULTE antes de
 * reintentar. Si ni conectó, es 'error' y se reintenta.
 */
export const sinRespuesta = (texto: string): Respuesta =>
  texto === 'tiempo'
    ? { estado: 'pendiente', mensaje: 'El proveedor tardó demasiado en contestar. Consulta el estado en un momento.' }
    : { estado: 'error', mensaje: 'No pudimos conectar con el proveedor de facturación. Inténtalo otra vez.' };

export const tokenInvalido = (nombre: string): Respuesta => ({
  estado: 'error',
  mensaje: `${nombre} no aceptó el token. Revísalo en Ajustes › Boletas y facturas.`,
});
