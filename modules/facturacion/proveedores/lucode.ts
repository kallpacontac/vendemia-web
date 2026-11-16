/**
 * ══════════════════════════════════════════════════════════════════════════
 * LUCODE (APISUNAT) · https://docs.apisunat.pe
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Dice ser PSE: genera el XML, lo firma con SU certificado y lo manda a SUNAT.
 * El local solo lo autoriza como proveedor en su clave SOL y nos da el token
 * que le sale en el módulo «Organizaciones» de Lucode (uno por RUC, el mismo
 * para pruebas y producción según su documentación).
 *
 * Su JSON es plano (no UBL): valor unitario SIN IGV con 6 decimales, el
 * porcentaje como texto y el total con 2. Calcula el IGV él mismo; nosotros le
 * mandamos el total que ya cuadra con lo cobrado (dominio/montos.ts).
 *
 * Leído de su documentación el 11-nov-2026 y repasado página por página el
 * 16-nov-2026 (docs.apisunat.pe/facturacion/factura-electronica y hermanas):
 * campos, boleta sin DNI, exonerado con leyendas, 10,5 % como "10.50",
 * status, voided, plazos (3 días factura, 5 boleta) y el texto «emitido
 * anteriormente» coinciden. Sin probar contra su sandbox: lo marcado
 * «VERIFICAR» son huecos o contradicciones de sus páginas.
 */
import { CODIGO_DOC_CLIENTE } from '../dominio/catalogos';
import type { ComprobanteListo, EstadoComprobante, Respuesta } from '../dominio/tipos';
import { llamar, sinRespuesta, tokenInvalido, type Credencial, type PedidoBaja, type Proveedor } from './tipos';

const BASE = { pruebas: 'https://sandbox.apisunat.pe', produccion: 'https://app.apisunat.pe' } as const;

type Cuerpo = {
  success?: boolean;
  message?: string;
  payload?: {
    estado?: string;
    hash?: string;
    xml?: string | null;
    cdr?: string | null;
    pdf?: { ticket?: string | null; a4?: string | null } | null;
    [campo: string]: unknown;
  };
};

const porcentaje = (p: number) => (Number.isInteger(p) ? String(p) : p.toFixed(2));

/** El JSON de /api/v3/documents. Exportado para las pruebas. */
export function cuerpoLucode(d: ComprobanteListo) {
  const exonerado = d.regimen.tipo === 'exonerado';
  const sinDoc = d.cliente.tipoDoc === 'sin_documento';
  return {
    documento: d.tipo,
    serie: d.serie,
    numero: d.numero,
    fecha_de_emision: d.fecha,
    // Su tabla de factura la marca obligatoria (*) aunque su ejemplo no la trae. Al contado
    // vence el mismo día. VERIFICAR en el sandbox que no la rechace.
    ...(d.tipo === 'factura' ? { fecha_de_vencimiento: d.fecha } : {}),
    hora_de_emision: d.hora,
    moneda: d.moneda,
    tipo_operacion: '0101',
    // Boleta a «Clientes varios»: así lo pide su página «Boleta sin DNI».
    cliente_tipo_de_documento: sinDoc ? '1' : CODIGO_DOC_CLIENTE[d.cliente.tipoDoc],
    cliente_numero_de_documento: sinDoc ? '99999999' : d.cliente.numDoc,
    cliente_denominacion: sinDoc ? 'CLIENTE VARIOS' : d.cliente.nombre.trim(),
    cliente_direccion: d.cliente.direccion.trim() || '-',
    items: d.lineas.map((l) => ({
      unidad_de_medida: l.unidad,
      descripcion: l.descripcion.trim(),
      cantidad: String(l.cantidad),
      valor_unitario: l.valorUnitario.toFixed(6),
      porcentaje_igv: exonerado ? '0' : porcentaje(d.regimen.porcentaje),
      codigo_tipo_afectacion_igv: exonerado ? '20' : '10',
      nombre_tributo: exonerado ? 'EXO' : 'IGV',
    })),
    ...(d.leyendas.length ? { leyendas: d.leyendas } : {}),
    total: d.totales.total.toFixed(2),
  };
}

function estadoDe(e: string | undefined): EstadoComprobante {
  const s = (e ?? '').toUpperCase();
  if (s === 'ACEPTADO') return 'aceptado';
  if (s === 'RECHAZADO') return 'rechazado';
  if (s.startsWith('ANUL')) return 'anulado';
  return 'pendiente';
}

/** Los errores de campo vienen como payload: { campo: ['mensaje'] }. */
function detalle(c: Cuerpo | null): string {
  const p = c?.payload;
  if (!p || typeof p !== 'object') return '';
  const msgs = Object.entries(p)
    .filter(([, v]) => Array.isArray(v))
    .flatMap(([k, v]) => (v as unknown[]).map((m) => `${k}: ${String(m)}`));
  return msgs.length ? ` (${msgs.slice(0, 4).join('; ')})` : '';
}

/** Exportado para las pruebas. */
export function traducir(r: Awaited<ReturnType<typeof llamar>>): Respuesta | 'ya_emitido' {
  if (r.status === 0) return sinRespuesta(r.texto);
  if (r.status === 401) return tokenInvalido('Lucode');
  const c = r.cuerpo as Cuerpo | null;
  // Su respuesta del resumen diario trae payload.estado pero NO «success»: un 2xx con estado
  // también es éxito (si no, una baja de boleta recibida se tomaba por fallida).
  const exito = c?.success === true || (r.status >= 200 && r.status < 300 && c?.success !== false);
  if (exito && c?.payload && typeof c.payload.estado === 'string') {
    const p = c.payload;
    return {
      estado: estadoDe(p.estado),
      mensaje: c.message ?? '',
      hash: p.hash ?? undefined,
      xmlUrl: p.xml ?? undefined,
      cdrUrl: p.cdr ?? undefined,
      pdfUrl: p.pdf?.ticket ?? p.pdf?.a4 ?? undefined,
    };
  }
  const msg = c?.message ?? (r.texto.slice(0, 200) || `Lucode respondió ${r.status}`);
  if (/emitid[oa] anteriormente/i.test(msg)) return 'ya_emitido';
  return { estado: 'error', mensaje: `${msg}${detalle(c)}` };
}

const cabeceras = (cred: Credencial) => ({ 'content-type': 'application/json', authorization: `Bearer ${cred.token}` });

async function post(cred: Credencial, ruta: string, cuerpo: unknown) {
  return llamar(`${BASE[cred.ambiente]}${ruta}`, { method: 'POST', headers: cabeceras(cred), body: JSON.stringify(cuerpo) });
}

export const lucode: Proveedor = {
  id: 'lucode',
  nombre: 'Lucode',
  pideUbigeo: false,
  real: true,
  // Su documentación: la factura se anula hasta 3 días después; la boleta, por resumen, hasta 5.
  diasParaAnular: { factura: 3, boleta: 5 },

  async emitir(d, cred) {
    const t = traducir(await post(cred, '/api/v3/documents', cuerpoLucode(d)));
    // Un reintento de algo que sí llegó: no es un error, es saber cómo quedó.
    if (t === 'ya_emitido') return this.consultar(d, cred);
    return t;
  },

  async consultar(d, cred) {
    const t = traducir(await post(cred, '/api/v3/status', { documento: d.tipo, serie: d.serie, numero: d.numero }));
    return t === 'ya_emitido' ? { estado: 'pendiente', mensaje: '' } : t;
  },

  async anular(d, baja: PedidoBaja, cred) {
    // VERIFICAR: dos de sus páginas (configuración y «Anular boleta») dicen /api/v3/daily-summary con
    // accion_resumen: 'anular'; la de «Resumen diario» dice /api/test/daily-summary con
    // tipo_operacion: 'anulacion'. Seguimos a las dos que coinciden.
    const r =
      d.tipo === 'factura'
        ? await post(cred, '/api/v3/voided', {
            documento: 'comunicacion_baja',
            motivo: baja.motivo,
            documento_afectado: { documento: 'factura', serie: d.serie, numero: String(d.numero) },
          })
        : await post(cred, '/api/v3/daily-summary', {
            documento: 'resumen_diario',
            documentos_afectados: [{ accion_resumen: 'anular', documento: 'boleta', serie: d.serie, numero: String(d.numero) }],
          });
    const t = traducir(r);
    if (t === 'ya_emitido') return { estado: 'anulando', mensaje: 'La baja ya estaba pedida.' };
    if (t.estado === 'aceptado' || t.estado === 'anulado') return { ...t, estado: 'anulado' };
    if (t.estado === 'pendiente') return { ...t, estado: 'anulando' };
    // Rechazada o con error: el comprobante sigue vivo.
    return { estado: 'aceptado', mensaje: `No se pudo anular: ${t.mensaje}` };
  },

  async consultarBaja(d, cred) {
    // VERIFICAR: no documentan cómo consultar una baja (/status solo acepta factura, boleta, notas y
    // guías; la baja responde PENDIENTE sin ticket). Preguntamos por el comprobante.
    const t = await this.consultar(d, cred);
    if (t.estado === 'anulado') return t;
    if (t.estado === 'error') return { ...t, estado: 'anulando' };
    return { estado: 'anulando', mensaje: 'Lucode aún no confirma la baja. Vuelve a consultar más tarde.' };
  },
};
