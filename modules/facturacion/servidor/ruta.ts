import 'server-only';
/**
 * ══════════════════════════════════════════════════════════════════════════
 * POST /api/facturacion · emitir, consultar, reintentar, anular y guardar Ajustes
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Con la sesión del panel (Authorization: Bearer <jwt>). Leer Ajustes y la
 * lista lo hace el navegador directamente (factura_ajustes_leer, factura_lista):
 * por aquí solo pasa lo que necesita el token del proveedor o cálculo fiable.
 *
 * El reparto de poder:
 *   · Con el jwt del usuario (deUsuario): todo lo que decide QUIÉN puede. Postgres
 *     comprueba dueño/administrador y asigna el número.
 *   · Con la clave del servidor (servidor()): leer el token cifrado y apuntar lo
 *     que respondió SUNAT. Nadie puede marcar «aceptado» desde el navegador.
 *
 * El proveedor de cada comprobante es el que quedó guardado al emitirlo, no el
 * elegido hoy: consultar o anular algo de Lucode sigue yendo a Lucode aunque el
 * local se haya pasado a APIsPerú.
 */
import { z } from 'zod';
import { deUsuario, servidor, rpc, ErrorRpc } from '@/modules/fideliza/servidor/supabase';
import { FaltaConfiguracion } from '@/modules/fideliza/servidor/entorno';
import { log } from '@/modules/fideliza/servidor/http';
import { comprobanteDe, emisorDe, regimenDe } from '../dominio/fila';
import { calcular, leyendasDe, mismoMonto } from '../dominio/montos';
import { erroresCliente, erroresEmisor, erroresLineas, rucValido, soloDigitos } from '../dominio/validar';
import { PROVEEDORES, type Cliente, type ComprobanteGuardado, type LineaEntrada, type Respuesta } from '../dominio/tipos';
import { proveedor, type Credencial } from '../proveedores';
import { cifrar, descifrar, SinClaveDeCifrado } from './cifrado';

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const fallo = (mensaje: string, status = 400) => responder({ status: 'error', mensaje }, status);

class Problema extends Error {
  constructor(mensaje: string, public status = 400) {
    super(mensaje);
  }
}

// ── Lo que llega ───────────────────────────────────────────────────────────────

const company = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

const clienteZ = z.object({
  tipoDoc: z.enum(['dni', 'ruc', 'ce', 'sin_documento']),
  numDoc: z.string().max(15).default(''),
  nombre: z.string().max(200).default(''),
  direccion: z.string().max(250).default(''),
});

const lineaZ = z.object({
  descripcion: z.string().trim().min(1).max(250),
  cantidad: z.number().positive().max(1_000_000),
  precio: z.number().positive().max(1_000_000),
  unidad: z.enum(['NIU', 'ZZ']).default('NIU'),
});

const ajustesZ = z.object({
  activo: z.boolean(),
  proveedor: z.enum(PROVEEDORES),
  ambiente: z.enum(['pruebas', 'produccion']),
  ruc: z.string().max(11),
  razon_social: z.string().max(200),
  nombre_comercial: z.string().max(200),
  direccion: z.string().max(250),
  ubigeo: z.string().max(6),
  departamento: z.string().max(60),
  provincia: z.string().max(60),
  distrito: z.string().max(60),
  serie_boleta: z.string().regex(/^B[A-Z0-9]{3}$/, 'La serie de boletas es B y 3 caracteres (B001).'),
  serie_factura: z.string().regex(/^F[A-Z0-9]{3}$/, 'La serie de facturas es F y 3 caracteres (F001).'),
  igv_tipo: z.enum(['gravado', 'mype', 'exonerado']),
  igv_porcentaje: z.number().positive().max(30),
  leyenda_amazonia: z.enum(['2001', '2002', 'ambas']).nullable(),
  ticket_ancho: z.union([z.literal(58), z.literal(80)]),
  ultimo_boleta: z.number().int().min(0).optional(),
  ultimo_factura: z.number().int().min(0).optional(),
});

const pedidoZ = z.discriminatedUnion('accion', [
  z.object({
    accion: z.literal('guardar_ajustes'),
    companyId: company,
    datos: ajustesZ,
    /** undefined/null = no tocar; '' = borrar; texto = el token nuevo. */
    token: z.string().max(3000).nullable().optional(),
  }),
  z.object({
    accion: z.literal('emitir'),
    companyId: company,
    clave: z.string().min(8).max(64),
    tipo: z.enum(['boleta', 'factura']),
    cliente: clienteZ,
    lineas: z.array(lineaZ).min(1).max(100),
    /** Solo si el local tiene «ambas» leyendas de Amazonía: las de este comprobante. */
    leyendas: z.array(z.enum(['2001', '2002'])).max(2).optional(),
    ref: z.object({ tipo: z.string().max(20), id: z.string().max(80) }).optional(),
  }),
  z.object({ accion: z.enum(['consultar', 'reintentar']), companyId: company, id: z.string().uuid() }),
  z.object({ accion: z.literal('anular'), companyId: company, id: z.string().uuid(), motivo: z.string().trim().min(3).max(100) }),
]);

type Pedido = z.infer<typeof pedidoZ>;
type Fila = Record<string, unknown>;

// ── Ayudas ─────────────────────────────────────────────────────────────────────

function limpiarCliente(c: z.infer<typeof clienteZ>): Cliente {
  if (c.tipoDoc === 'sin_documento') return { tipoDoc: 'sin_documento', numDoc: '', nombre: '', direccion: '' };
  const num = c.tipoDoc === 'ce' ? c.numDoc.trim().toUpperCase() : soloDigitos(c.numDoc);
  return { tipoDoc: c.tipoDoc, numDoc: num, nombre: c.nombre.trim(), direccion: c.direccion.trim() };
}

const limpiarLineas = (ls: z.infer<typeof lineaZ>[]): LineaEntrada[] =>
  ls.map((l) => ({
    descripcion: l.descripcion.trim(),
    cantidad: Math.round(l.cantidad * 1000) / 1000,
    precio: Math.round(l.precio * 100) / 100,
    unidad: l.unidad,
  }));

const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

function diasDesde(fecha: string): number {
  const a = Date.parse(`${fecha}T12:00:00Z`);
  const b = Date.parse(`${hoyLima()}T12:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** La credencial del proveedor con el que se emitió ESTE comprobante. */
function credencialDe(fila: Fila, c: ComprobanteGuardado): Credencial {
  const p = proveedor(c.proveedor);
  if (!p) throw new Problema('Proveedor de facturación desconocido.');
  if (!p.real) {
    if (c.ambiente === 'produccion') throw new Problema('La prueba local no se puede usar en producción.');
    return { token: '', ambiente: c.ambiente };
  }
  const cifrado = typeof fila.token_cifrado === 'string' ? fila.token_cifrado : '';
  if (!cifrado) throw new Problema(`Falta el token de ${p.nombre}. Pégalo en Ajustes › Boletas y facturas.`);
  return { token: descifrar(cifrado), ambiente: c.ambiente };
}

async function apuntar(id: string, r: Respuesta): Promise<Fila> {
  return rpc<Fila>(servidor(), 'factura_srv_resultado', {
    p_id: id,
    p_datos: {
      estado: r.estado,
      mensaje: r.mensaje,
      observaciones: r.observaciones ?? null,
      hash: r.hash ?? '',
      xml_url: r.xmlUrl ?? '',
      cdr_url: r.cdrUrl ?? '',
      pdf_url: r.pdfUrl ?? '',
      ticket: r.ticket ?? '',
    },
  });
}

async function cargar(id: string): Promise<{ fila: Fila; c: ComprobanteGuardado }> {
  const fila = await rpc<Fila | null>(servidor(), 'factura_srv_cargar', { p_id: id });
  if (!fila) throw new Problema('No encontramos ese comprobante.', 404);
  return { fila, c: comprobanteDe(fila) };
}

/** Manda (o vuelve a mandar con el MISMO número) un comprobante guardado. */
async function enviar(id: string): Promise<Fila> {
  const { fila, c } = await cargar(id);
  // Los montos guardados tienen que salir otra vez de las líneas: nadie los tocó por el camino.
  const otra = calcular(c.lineas, c.regimen);
  if (!mismoMonto(otra.totales.total, c.totales.total) || !mismoMonto(otra.totales.igv, c.totales.igv)) {
    return apuntar(id, { estado: 'error', mensaje: 'Los montos guardados no cuadran con las líneas. Emite uno nuevo.' });
  }
  const p = proveedor(c.proveedor)!;
  let r: Respuesta;
  try {
    r = await p.emitir({ ...c, lineas: otra.lineas }, credencialDe(fila, c));
  } catch (e) {
    if (e instanceof Problema) r = { estado: 'error', mensaje: e.message };
    else throw e;
  }
  log('factura_emitir', { proveedor: c.proveedor, ambiente: c.ambiente, estado: r.estado });
  return apuntar(id, r);
}

// ── Acciones ───────────────────────────────────────────────────────────────────

async function guardarAjustes(jwt: string, p: Extract<Pedido, { accion: 'guardar_ajustes' }>) {
  const d = { ...p.datos, ruc: soloDigitos(p.datos.ruc), ubigeo: soloDigitos(p.datos.ubigeo) };
  const info = proveedor(d.proveedor)!;
  if (d.activo) {
    const problemas = erroresEmisor(emisorDe(d), info.pideUbigeo);
    if (problemas.length) throw new Problema(problemas.join(' '));
    if (!info.real && d.ambiente === 'produccion') throw new Problema('La prueba local no envía a SUNAT: elige Lucode o APIsPerú para producción.');
  } else if (d.ruc && !rucValido(d.ruc)) {
    throw new Problema('El RUC del negocio no es válido.');
  }
  if (d.igv_tipo === 'exonerado' && !d.leyenda_amazonia) {
    throw new Problema('Elige si el local vende bienes o servicios en la Amazonía (va como leyenda en el comprobante).');
  }

  const token = p.token === undefined || p.token === null ? null : p.token.trim() === '' ? '' : cifrar(p.token.trim());
  const pista = p.token ? p.token.trim().slice(-4) : '';

  const sb = deUsuario(jwt);
  if (d.activo && info.real && token === null) {
    const actual = await rpc<{ tokens?: Record<string, string> }>(sb, 'factura_ajustes_leer', { p_company: p.companyId });
    if (!actual.tokens?.[d.proveedor]) throw new Problema(`Para activar con ${info.nombre} pega su token.`);
  }
  if (d.activo && info.real && token === '') throw new Problema('No se puede quitar el token y dejar las boletas activas.');

  return rpc<Fila>(sb, 'factura_ajustes_guardar', {
    p_company: p.companyId,
    p_datos: d,
    p_token_cifrado: token,
    p_token_pista: pista,
  });
}

async function emitir(jwt: string, p: Extract<Pedido, { accion: 'emitir' }>) {
  const sb = deUsuario(jwt);
  const a = await rpc<Fila>(sb, 'factura_ajustes_leer', { p_company: p.companyId });
  if (!a.activo) throw new Problema('Las boletas y facturas no están activas. Actívalas en Ajustes.');
  const info = proveedor(String(a.proveedor));
  if (!info) throw new Problema('Proveedor de facturación desconocido.');
  const problemasEmisor = erroresEmisor(emisorDe(a), info.pideUbigeo);
  if (problemasEmisor.length) throw new Problema(`Completa los Ajustes: ${problemasEmisor.join(' ')}`);

  const cliente = limpiarCliente(p.cliente);
  const entrada = limpiarLineas(p.lineas);
  const regimen = regimenDe(a);
  const { lineas, totales } = calcular(entrada, regimen);
  const problemas = [...erroresLineas(entrada), ...erroresCliente(p.tipo, cliente, totales.total)];
  const leyendas = leyendasDe(regimen, p.leyendas);
  if (regimen.leyendaAmazonia === 'ambas' && !leyendas.length) {
    problemas.push('Di si vendiste servicios, productos o los dos (va como leyenda en el comprobante).');
  }
  if (problemas.length) throw new Problema(problemas.join(' '));

  const r = await rpc<{ id: string; repetido: boolean }>(sb, 'factura_reservar', {
    p_company: p.companyId,
    p_doc: {
      clave: p.clave,
      tipo: p.tipo,
      cliente,
      lineas,
      op_gravadas: totales.opGravadas,
      op_exoneradas: totales.opExoneradas,
      igv: totales.igv,
      total: totales.total,
      // Postgres comprueba que sea la tasa de hoy antes de dar número.
      igv_porcentaje: regimen.porcentaje,
      leyendas,
      ref_tipo: p.ref?.tipo ?? '',
      ref_id: p.ref?.id ?? '',
    },
  });
  if (r.repetido) {
    // Doble clic: si el primero ya salió, no se manda otra vez.
    const ya = await rpc<Fila>(sb, 'factura_uno', { p_company: p.companyId, p_id: r.id });
    if (!['por_enviar', 'error'].includes(String(ya.estado))) return ya;
  }
  return enviar(r.id);
}

async function consultar(jwt: string, companyId: string, id: string, reintentar: boolean) {
  const uno = await rpc<Fila>(deUsuario(jwt), 'factura_uno', { p_company: companyId, p_id: id });
  const estado = String(uno.estado);
  if (reintentar && (estado === 'error' || estado === 'por_enviar')) return enviar(id);

  const { fila, c } = await cargar(id);
  const p = proveedor(c.proveedor);
  if (!p) throw new Problema('Proveedor de facturación desconocido.');
  if (estado === 'aceptado' || estado === 'anulado' || estado === 'rechazado') {
    // Ya es definitivo: preguntar no cambia nada y gasta llamadas.
    return uno;
  }
  const cred = credencialDe(fila, c);
  const r = estado === 'anulando' ? await p.consultarBaja(c, cred) : await p.consultar(c, cred);
  // Si quedó en error de verdad (p. ej. «no registrado»), un 'por_enviar' sigue siendo reintentable.
  return apuntar(id, r);
}

async function anular(jwt: string, p: Extract<Pedido, { accion: 'anular' }>) {
  const sb = deUsuario(jwt);
  const uno = comprobanteDe(await rpc<Fila>(sb, 'factura_uno', { p_company: p.companyId, p_id: p.id }));
  const prov = proveedor(uno.proveedor);
  if (!prov) throw new Problema('Proveedor de facturación desconocido.');
  const dias = prov.diasParaAnular[uno.tipo];
  if (diasDesde(uno.fecha) > dias) {
    throw new Problema(
      `Pasaron más de ${dias} días: ${uno.tipo === 'factura' ? 'esta factura' : 'esta boleta'} ya no se anula por baja, se corrige con una nota de crédito (todavía no la hace Vendemia; emítela en el panel de ${prov.nombre}).`,
    );
  }
  const baja = await rpc<{ correlativo: number; hoy: string }>(sb, 'factura_pedir_baja', {
    p_company: p.companyId,
    p_id: p.id,
    p_motivo: p.motivo,
  });
  const { fila, c } = await cargar(p.id);
  const r = await prov.anular(c, { motivo: p.motivo, hoy: String(baja.hoy).slice(0, 10), correlativo: baja.correlativo }, credencialDe(fila, c));
  log('factura_anular', { proveedor: c.proveedor, estado: r.estado });
  return apuntar(p.id, r);
}

// ── La ruta ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const jwt = req.headers.get('authorization')?.replace(/^Bearer /i, '');
  if (!jwt) return fallo('Tu sesión terminó. Vuelve a entrar al panel.', 401);
  const crudo = await req.json().catch(() => null);
  const leido = pedidoZ.safeParse(crudo);
  if (!leido.success) {
    const primero = leido.error.issues[0];
    return fallo(primero?.message && !/^(Expected|Required|Invalid)/.test(primero.message) ? primero.message : 'Revisa los datos del comprobante.');
  }
  const p = leido.data;
  try {
    switch (p.accion) {
      case 'guardar_ajustes':
        return responder({ status: 'ok', ajustes: await guardarAjustes(jwt, p) });
      case 'emitir':
        return responder({ status: 'ok', comprobante: await emitir(jwt, p) });
      case 'consultar':
      case 'reintentar':
        return responder({ status: 'ok', comprobante: await consultar(jwt, p.companyId, p.id, p.accion === 'reintentar') });
      case 'anular':
        return responder({ status: 'ok', comprobante: await anular(jwt, p) });
    }
  } catch (e) {
    if (e instanceof Problema) return fallo(e.message, e.status);
    if (e instanceof ErrorRpc) return fallo(e.message, e.code === '42501' ? 403 : 400);
    if (e instanceof SinClaveDeCifrado || e instanceof FaltaConfiguracion) {
      log('factura_config', { mensaje: (e as Error).message });
      return fallo('Falta configurar el servidor de Vendemia para facturar. Avísanos.', 500);
    }
    log('factura_error', { accion: p.accion, error: String((e as Error)?.message ?? e).slice(0, 300) });
    return fallo('Algo falló al hablar con el proveedor. Revisa la lista: si quedó «pendiente», consúltalo en un momento.', 500);
  }
}
