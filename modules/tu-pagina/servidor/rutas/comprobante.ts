/**
 * POST /api/tu-pagina/publico/comprobante · el cliente sube su captura en la página.
 *
 * Ruta pública: nada de lo que llega se da por bueno. Para tocar una reserva hay que saber su
 * código Y el celular con el que se hizo. Orden: límite por IP → reserva viva → el archivo es
 * una imagen de verdad → repetida → leer (si el negocio valida solo) → decidir sin IA
 * (dominio/comprobante.ts) → Postgres, con el candado del negocio, guarda y confirma.
 *
 * Las respuestas nunca llevan errores de los servicios externos: solo los mensajes de MENSAJES.
 */
import { createHash } from 'crypto';
import { SLUG } from '@/modules/tu-pagina/dominio/config';
import { MENSAJES, evaluarLectura, tipoDeImagen, type LecturaComprobante } from '@/modules/tu-pagina/dominio/comprobante';
import { huellaIp, limitar, log, rpc, servidor } from '@/modules/tu-pagina/servidor/supabase';
import { guardarComprobante, leerComprobante, puedeLeer } from '@/modules/tu-pagina/servidor/comprobanteExterno';

const MB = 1024 * 1024;
const MAX_BYTES = 4 * MB;

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const fallo = (mensaje: string, status = 400) => responder({ status: 'error', mensaje }, status);

interface Cita {
  status: string;
  company_id?: string;
  validacion?: string;
  numeros?: string[];
  /** sql/0032: cuándo se hizo la reserva y si ese celular ya mandó un pago que no llegó. */
  reservada_ms?: number | null;
  sospechoso?: boolean;
}

interface Registro {
  status: string;
  resultado?: 'confirmada' | 'parcial' | 'a_cuenta' | 'cobrada' | 'revisar' | 'rechazado';
  motivo?: string;
  operacion?: string;
  pagado?: number;
  total?: number;
  falta?: number;
  minimo?: number;
}

const MOTIVO_BUSQUEDA: Record<string, string> = {
  not_found: MENSAJES.noEncontrada,
  vencida: MENSAJES.vencida,
  cobrada: MENSAJES.yaCobrada,
  demasiados: MENSAJES.demasiados,
};

export async function POST(req: Request) {
  try {
    if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES + MB) return fallo(MENSAJES.archivoGrande, 413);
    if (!(await limitar(`ip:${huellaIp(req)}:tu-pagina-comprobante`, 12, 3600))) return fallo(MENSAJES.muchosIntentos, 429);

    const form = await req.formData().catch(() => null);
    const slug = String(form?.get('slug') ?? '').toLowerCase();
    const codigo = String(form?.get('codigo') ?? '').trim().toUpperCase();
    const telefono = String(form?.get('telefono') ?? '');
    const archivo = form?.get('archivo');
    if (!SLUG.test(slug) || !/^R-[0-9A-Z]{4}$/.test(codigo) || telefono.replace(/\D/g, '').length < 9) return fallo(MENSAJES.noEncontrada);
    if (String(form?.get('web') ?? '') !== '') return fallo(MENSAJES.noEncontrada);
    if (!(archivo instanceof Blob) || archivo.size === 0) return fallo(MENSAJES.archivoInvalido);
    if (archivo.size > MAX_BYTES) return fallo(MENSAJES.archivoGrande, 413);

    const db = servidor();
    const args = { p_slug: slug, p_codigo: codigo, p_telefono: telefono };
    const cita = await rpc<Cita>(db, 'comprobante_srv_buscar', args);
    if (cita.status !== 'ok') return fallo(MOTIVO_BUSQUEDA[cita.status] ?? MENSAJES.noEncontrada, cita.status === 'not_found' ? 404 : 409);

    const imagen = Buffer.from(await archivo.arrayBuffer());
    const tipo = tipoDeImagen(imagen);
    if (!tipo) return fallo(MENSAJES.archivoInvalido);
    const hash = createHash('sha256').update(imagen).digest('hex');

    // Antes de gastar en leerla o guardarla. Postgres lo vuelve a mirar con el candado.
    const previa = await rpc<{ status: string }>(db, 'comprobante_srv_repetido', { ...args, p_hash: hash });
    if (previa.status === 'repetida') return fallo(MENSAJES.repetida, 409);

    // Con el celular de cobros conectado (lector 0002, Alvaro 24-nov): la IA solo LEE monto y hora; nunca
    // confirma. Confirma el aviso que llega al celular, cruzado por monto y hora (±3 min). Se lee aunque
    // la validación del negocio sea manual: sin la hora, el cruce es mucho menos preciso.
    const conLector = await rpc<boolean>(db, 'lector_srv_activo', { p_slug: slug }).catch(() => false);
    const manual = (!conLector && cita.validacion === 'manual') || !puedeLeer();
    const [lectura, url] = await Promise.all<[Promise<LecturaComprobante | null>, Promise<string>]>([
      manual ? Promise.resolve(null) : leerComprobante(imagen, tipo),
      guardarComprobante(imagen, tipo, cita.company_id ?? slug),
    ]);
    const evaluada = manual
      ? { decision: 'revisar' as const, motivo: 'Lo revisas tú: la validación automática está apagada.' }
      : evaluarLectura(lectura, cita.numeros ?? [], Date.now(), { reservadaMs: Number(cita.reservada_ms) || null, sospechoso: cita.sospechoso === true });
    // Con lector: lo que la IA aprobaría queda «por revisar» hasta que llegue el aviso; lo que rechaza
    // (no es un comprobante, pago a otro número, antiguo) se rechaza igual.
    const { decision, motivo } = conLector && evaluada.decision === 'aprobar'
      ? { decision: 'revisar' as const, motivo: 'Esperando que el pago llegue al celular de cobros.' }
      : evaluada;
    // Sin captura guardada nadie podría revisarla: se pide de nuevo antes que dejar al dueño a ciegas.
    if (decision === 'revisar' && !url) return fallo(MENSAJES.noGuardado, 503);

    const r = await rpc<Registro>(db, 'comprobante_srv_registrar', {
      ...args,
      p_datos: {
        url, hash, decision, motivo,
        monto: lectura?.monto ?? null,
        metodo: lectura?.app === 'yape' || lectura?.app === 'plin' ? lectura.app : '',
        operacion: lectura?.operacion ?? '',
        destino: lectura?.destino ?? '',
        fecha_pago: lectura?.fechaHora ?? '',
        codigo_seguridad: lectura?.codigoSeguridad ?? '',
      },
    });
    if (r.status === 'repetida') return fallo(MENSAJES.repetida, 409);
    if (r.status === 'operacion_repetida') return fallo(MENSAJES.operacionRepetida(r.operacion ?? ''), 409);
    if (r.status !== 'ok') return fallo(MOTIVO_BUSQUEDA[r.status] ?? MENSAJES.noGuardado, 409);
    // ¿Ya tiene la tarjeta de puntos? Para invitarlo si no (sql/0022). Sin la 0022 o si falla,
    // no se sabe (undefined) y la página decide sola; nunca tumba el comprobante ya guardado.
    let tieneTarjeta: boolean | undefined;
    if (r.resultado !== 'rechazado') {
      const t = await rpc<{ status: string; club?: boolean; tiene?: boolean }>(db, 'tu_pagina_srv_tiene_tarjeta', args).catch(() => null);
      if (t?.status === 'ok' && t.club) tieneTarjeta = Boolean(t.tiene);
    }
    return responder({ status: 'ok', resultado: r.resultado, motivo: r.resultado === 'rechazado' ? r.motivo : undefined, pagado: r.pagado, total: r.total, falta: r.falta, minimo: r.minimo, operacion: lectura?.operacion || undefined, tieneTarjeta });
  } catch (e) {
    log('tu_pagina_comprobante_error', { tipo: e instanceof Error ? e.name : 'x' });
    return fallo(MENSAJES.noGuardado, 503);
  }
}
