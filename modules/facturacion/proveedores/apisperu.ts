/**
 * ══════════════════════════════════════════════════════════════════════════
 * APIsPERÚ · https://facturacion.apisperu.com/doc (OpenAPI en /swagger.json)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * NO es PSE: arma el XML, lo firma con el certificado DEL LOCAL y lo envía a
 * SUNAT con el usuario SOL secundario DEL LOCAL. Por eso cada empresa se da de
 * alta en el panel de APIsPerú (cuenta de Vendemia) con su certificado .pem y su
 * usuario SOL secundario, y allí mismo se elige beta o producción. Lo único que
 * guarda Vendemia es el token de esa empresa (no caduca, según su documentación).
 * El certificado y la clave SOL no pasan por nuestra base.
 *
 * Su JSON es el modelo Greenter: hay que mandar TODOS los montos ya calculados
 * (por línea y totales), la leyenda 1000 («SON … SOLES») y el emisor completo
 * con ubigeo en cada comprobante.
 *
 * Leído de su swagger.json el 11-nov-2026. Sin probar contra SUNAT beta: lo
 * marcado «VERIFICAR» son supuestos que hay que confirmar en las pruebas.
 */
import { CODIGO_COMPROBANTE, CODIGO_DOC_CLIENTE, LEYENDAS } from '../dominio/catalogos';
import { montoEnLetras } from '../dominio/letras';
import type { ComprobanteGuardado, ComprobanteListo, Emisor, Respuesta } from '../dominio/tipos';
import { llamar, sinRespuesta, tokenInvalido, type Credencial, type PedidoBaja, type Proveedor } from './tipos';

const BASE = 'https://facturacion.apisperu.com/api/v1';

type Cdr = { code?: string | number; description?: string; notes?: string[] | null; accepted?: boolean };
type Err = { code?: string | number; message?: string };
type Bill = { success?: boolean; error?: Err | null; cdrResponse?: Cdr | null; ticket?: string };
type Documento = { xml?: string; hash?: string; sunatResponse?: Bill };
type Estado = Bill & { code?: string };

const fechaHora = (fecha: string, hora = '00:00:00') => `${fecha}T${hora}-05:00`;

function empresa(e: Emisor) {
  return {
    ruc: e.ruc,
    razonSocial: e.razonSocial,
    nombreComercial: e.nombreComercial || e.razonSocial,
    address: {
      ubigueo: e.ubigeo,
      codigoPais: 'PE',
      departamento: e.departamento.toUpperCase(),
      provincia: e.provincia.toUpperCase(),
      distrito: e.distrito.toUpperCase(),
      urbanizacion: '-',
      direccion: e.direccion,
      codLocal: '0000',
    },
  };
}

/** Cliente sin documento (boleta < S/700). VERIFICAR con SUNAT beta: hay POS que usan '-' en vez de '0'. */
function cliente(d: ComprobanteListo) {
  const sinDoc = d.cliente.tipoDoc === 'sin_documento';
  return {
    tipoDoc: sinDoc ? '0' : CODIGO_DOC_CLIENTE[d.cliente.tipoDoc],
    numDoc: sinDoc ? '00000000' : d.cliente.numDoc,
    rznSocial: sinDoc ? 'CLIENTES VARIOS' : d.cliente.nombre.trim(),
    address: { direccion: d.cliente.direccion.trim() || '-' },
  };
}

/** El JSON de /invoice/send (boleta y factura comparten forma). Exportado para las pruebas. */
export function cuerpoApisPeru(d: ComprobanteListo) {
  const exonerado = d.regimen.tipo === 'exonerado';
  const pct = exonerado ? 0 : d.regimen.porcentaje;
  const t = d.totales;
  return {
    ublVersion: '2.1',
    tipoOperacion: '0101',
    tipoDoc: CODIGO_COMPROBANTE[d.tipo],
    serie: d.serie,
    correlativo: String(d.numero),
    fechaEmision: fechaHora(d.fecha, d.hora),
    formaPago: { moneda: d.moneda, tipo: 'Contado' },
    tipoMoneda: d.moneda,
    client: cliente(d),
    company: empresa(d.emisor),
    ...(exonerado ? { mtoOperExoneradas: t.opExoneradas } : { mtoOperGravadas: t.opGravadas }),
    mtoIGV: t.igv,
    totalImpuestos: t.igv,
    valorVenta: Math.round((t.opGravadas + t.opExoneradas) * 100) / 100,
    subTotal: t.total,
    mtoImpVenta: t.total,
    details: d.lineas.map((l, i) => ({
      codProducto: `P${String(i + 1).padStart(3, '0')}`,
      unidad: l.unidad,
      descripcion: l.descripcion.trim(),
      cantidad: l.cantidad,
      mtoValorUnitario: l.valorUnitario,
      mtoValorVenta: l.valorVenta,
      mtoBaseIgv: l.valorVenta,
      porcentajeIgv: pct,
      igv: l.igv,
      tipAfeIgv: exonerado ? 20 : 10,
      totalImpuestos: l.igv,
      mtoPrecioUnitario: l.precio,
    })),
    legends: [
      { code: '1000', value: montoEnLetras(t.total) },
      ...d.leyendas.filter((c) => LEYENDAS[c]).map((c) => ({ code: c, value: LEYENDAS[c].toUpperCase() })),
    ],
  };
}

/**
 * Códigos de SUNAT: 0 aceptado; 4000+ aceptado con observaciones; 2000–3999
 * rechazado; 0100–1999 excepción (no lo procesó: se puede reintentar). 1033 =
 * «ya fue presentado anteriormente».
 */
function porCodigo(codigo: unknown, mensaje: string, notas?: string[] | null): Respuesta | 'ya_emitido' {
  const n = Number(codigo);
  if (n === 1033) return 'ya_emitido';
  if (n === 0 || n >= 4000) return { estado: 'aceptado', mensaje, observaciones: notas ?? undefined };
  if (n >= 2000 && n < 4000) return { estado: 'rechazado', mensaje: `SUNAT lo rechazó (${codigo}): ${mensaje}` };
  return { estado: 'error', mensaje: `SUNAT no lo procesó (${codigo}): ${mensaje}` };
}

function errorHttp(r: Awaited<ReturnType<typeof llamar>>): Respuesta | null {
  if (r.status === 0) return sinRespuesta(r.texto);
  if (r.status === 401 || r.status === 403) return tokenInvalido('APIsPerú');
  if (r.status === 400 && Array.isArray(r.cuerpo)) {
    const lista = (r.cuerpo as { message?: string; field?: string }[]).slice(0, 4).map((v) => `${v.field ?? ''}: ${v.message ?? ''}`);
    return { estado: 'error', mensaje: `Datos no válidos para APIsPerú: ${lista.join('; ')}` };
  }
  if (!r.ok) return { estado: 'error', mensaje: `APIsPerú respondió ${r.status}. ${r.texto.slice(0, 160)}` };
  return null;
}

function traducirBill(b: Bill | undefined, hash?: string): Respuesta | 'ya_emitido' {
  if (!b) return { estado: 'error', mensaje: 'APIsPerú no devolvió la respuesta de SUNAT.' };
  if (b.success && b.cdrResponse) {
    const t = porCodigo(b.cdrResponse.code ?? 0, b.cdrResponse.description ?? '', b.cdrResponse.notes);
    return t === 'ya_emitido' ? t : { ...t, hash };
  }
  if (b.error) return porCodigo(b.error.code, b.error.message ?? '');
  return { estado: 'error', mensaje: 'SUNAT no contestó.' };
}

const cabeceras = (cred: Credencial) => ({ 'content-type': 'application/json', authorization: `Bearer ${cred.token}` });
const post = (cred: Credencial, ruta: string, cuerpo: unknown) =>
  llamar(`${BASE}${ruta}`, { method: 'POST', headers: cabeceras(cred), body: JSON.stringify(cuerpo) });
const get = (cred: Credencial, ruta: string, q: Record<string, string>) =>
  llamar(`${BASE}${ruta}?${new URLSearchParams(q)}`, { method: 'GET', headers: cabeceras(cred) });

export const apisperu: Proveedor = {
  id: 'apisperu',
  nombre: 'APIsPerú',
  pideUbigeo: true,
  real: true,
  // SUNAT: comunicación de baja y resumen diario, hasta 7 días calendario.
  diasParaAnular: { factura: 7, boleta: 7 },

  async emitir(d, cred) {
    const r = await post(cred, '/invoice/send', cuerpoApisPeru(d));
    const fallo = errorHttp(r);
    if (fallo) return fallo;
    const doc = r.cuerpo as Documento;
    const t = traducirBill(doc?.sunatResponse, doc?.hash);
    if (t === 'ya_emitido') return this.consultar(d, cred);
    return t;
  },

  async consultar(d, cred) {
    const r = await get(cred, '/invoice/status', {
      tipo: CODIGO_COMPROBANTE[d.tipo],
      serie: d.serie,
      numero: String(d.numero),
      ruc: d.emisor.ruc,
    });
    const fallo = errorHttp(r);
    if (fallo) return fallo;
    const t = traducirBill(r.cuerpo as Estado);
    return t === 'ya_emitido' ? { estado: 'aceptado', mensaje: 'SUNAT ya lo tenía registrado.' } : t;
  },

  async anular(d: ComprobanteGuardado, baja: PedidoBaja, cred) {
    const correlativo = String(baja.correlativo).padStart(3, '0');
    const r =
      d.tipo === 'factura'
        ? await post(cred, '/voided/send', {
            correlativo,
            fecGeneracion: fechaHora(d.fecha),
            fecComunicacion: fechaHora(baja.hoy),
            company: empresa(d.emisor),
            details: [{ tipoDoc: '01', serie: d.serie, correlativo: String(d.numero), desMotivoBaja: baja.motivo.toUpperCase() }],
          })
        : await post(cred, '/summary/send', {
            fecGeneracion: fechaHora(baja.hoy),
            fecResumen: fechaHora(d.fecha),
            correlativo,
            moneda: 'PEN',
            company: empresa(d.emisor),
            details: [
              {
                tipoDoc: '03',
                serieNro: `${d.serie}-${d.numero}`,
                estado: '3', // Catálogo 19: 3 = anulado.
                clienteTipo: cliente(d).tipoDoc,
                clienteNro: cliente(d).numDoc,
                total: d.totales.total,
                mtoOperGravadas: d.totales.opGravadas,
                mtoOperExoneradas: d.totales.opExoneradas,
                mtoOperInafectas: 0,
                mtoOtrosCargos: 0,
                mtoIGV: d.totales.igv,
              },
            ],
          });
    const fallo = errorHttp(r);
    if (fallo) return fallo.estado === 'pendiente' ? { ...fallo, estado: 'anulando' } : { ...fallo, estado: 'aceptado', mensaje: `No se pudo anular: ${fallo.mensaje}` };
    const s = (r.cuerpo as { sunatResponse?: Bill })?.sunatResponse;
    if (s?.success && s.ticket) return { estado: 'anulando', mensaje: 'SUNAT recibió la baja; falta su respuesta.', ticket: s.ticket };
    return { estado: 'aceptado', mensaje: `No se pudo anular: ${s?.error?.message ?? 'SUNAT no dio ticket.'}` };
  },

  async consultarBaja(d, cred) {
    if (!d.ticketBaja) return { estado: 'aceptado', mensaje: 'No hay baja pedida para este comprobante.' };
    const ruta = d.tipo === 'factura' ? '/voided/status' : '/summary/status';
    const r = await get(cred, ruta, { ticket: d.ticketBaja, ruc: d.emisor.ruc });
    const fallo = errorHttp(r);
    if (fallo) return { ...fallo, estado: 'anulando' };
    const s = r.cuerpo as Estado;
    // 98 = SUNAT aún lo procesa; 99 = procesado con errores.
    if (String(s?.code) === '98') return { estado: 'anulando', mensaje: 'SUNAT aún procesa la baja.' };
    const t = traducirBill(s);
    if (t !== 'ya_emitido' && t.estado === 'aceptado') return { ...t, estado: 'anulado', mensaje: 'Anulado en SUNAT.' };
    const msg = t === 'ya_emitido' ? 'La baja ya estaba registrada.' : t.mensaje;
    return t === 'ya_emitido' ? { estado: 'anulado', mensaje: msg } : { estado: 'aceptado', mensaje: `SUNAT no aceptó la baja: ${msg}` };
  },
};
