import 'server-only';
import { randomBytes } from 'node:crypto';
import { NO_CACHE, cuerpo, huellaIp, limitar, log } from '@/modules/fideliza/servidor/http';
import { ErrorRpc, rpc, servidor } from '@/modules/fideliza/servidor/supabase';
import { FaltaConfiguracion } from '@/modules/fideliza/servidor/entorno';
import { comprobar, esUuid } from '../dominio/firma';

/**
 * Las dos rutas de Vendemia Caja (la app Android del celular del negocio). SQL en
 * modules/lector/sql/0001_lector_de_pagos.sql.
 *
 *   · POST /api/caja/vincular {codigo, dispositivo, modelo} → {url, clave, negocio}
 *     Canjea el código que el dueño pidió en el panel. La clave se genera aquí y viaja UNA vez.
 *   · POST /api/caja/aviso — lo que manda el celular, firmado (ver dominio/firma.ts).
 *     410 = el celular se desvinculó desde el panel: la app deja de enviar.
 *
 * Las respuestas son para el celular: texto corto en `error`, sin detalles internos.
 */

const responder = (datos: unknown, status = 200) => Response.json(datos, { status, headers: NO_CACHE });
const error = (texto: string, status: number) => responder({ error: texto }, status);
const BASE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://vendemias.com').replace(/\/$/, '');

function caida(e: unknown, ruta: string) {
  if (e instanceof FaltaConfiguracion) {
    log('lector_config', { ruta, variable: e.variable });
    return error('El servidor no está listo. Avísanos.', 503);
  }
  log('lector_error', { ruta, mensaje: e instanceof Error ? e.message : String(e) });
  return error('No se pudo. Se reintenta solo.', 500);
}

export async function vincular(req: Request) {
  try {
    // Contra quien prueba códigos al azar: 10 intentos por IP cada 10 minutos.
    if (!(await limitar(`lector_vincular:${huellaIp(req)}`, 10, 600))) {
      return error('Demasiados intentos. Espera unos minutos.', 429);
    }
    const b = (await cuerpo(req, 2_000)) as Record<string, unknown>;
    const codigo = typeof b.codigo === 'string' ? b.codigo : '';
    if (!esUuid(b.dispositivo) || codigo.replace(/[^A-Za-z0-9]/g, '').length !== 6) {
      return error('Escribe el código de 6 letras y números que sale en el panel.', 400);
    }
    const clave = randomBytes(32).toString('hex');
    const r = await rpc<{ negocio: string; company_id: string }>(servidor(), 'lector_srv_vincular', {
      p_codigo: codigo,
      p_dispositivo: b.dispositivo,
      p_clave: clave,
      p_modelo: typeof b.modelo === 'string' ? b.modelo.slice(0, 80) : '',
    });
    log('lector_vinculado', { company: r.company_id });
    return responder({ url: `${BASE()}/api/caja/aviso`, clave, negocio: r.negocio });
  } catch (e) {
    // P0001 = el raise del SQL, con el texto para la persona («Ese código no vale o ya caducó…»).
    if (e instanceof ErrorRpc && e.code === 'P0001') return error(e.message, 400);
    if (e instanceof Error && e.message === 'loyalty:invalid_input') return error('Petición no válida.', 400);
    return caida(e, 'vincular');
  }
}

/** Clave de cada celular, 5 min en memoria: un latido no tiene que ir a la base dos veces. */
const claves = new Map<string, { clave: string; revocado: boolean; hasta: number }>();

async function claveDe(dispositivo: string) {
  const enCache = claves.get(dispositivo);
  if (enCache && enCache.hasta > Date.now()) return enCache;
  const r = await rpc<{ clave: string; revocado: boolean } | null>(servidor(), 'lector_srv_clave', { p_dispositivo: dispositivo });
  if (!r) return null;
  const v = { ...r, hasta: Date.now() + 5 * 60_000 };
  if (claves.size > 2_000) claves.clear();
  claves.set(dispositivo, v);
  return v;
}

export async function aviso(req: Request) {
  try {
    const dispositivo = req.headers.get('x-vendemia-dispositivo');
    const texto = await req.text();
    if (!esUuid(dispositivo) || texto.length > 8_000) return error('Petición no válida.', 400);
    const c = await claveDe(dispositivo);
    if (!c) return error('Este celular no está vinculado.', 410);
    const firma = comprobar(c.clave, req.headers.get('x-vendemia-fecha'), req.headers.get('x-vendemia-firma'), texto);
    if (firma === 'fecha') return error('La hora del celular está mal. Ponla en automática.', 401);
    if (firma !== 'ok') return error('Firma no válida.', 401);
    // Después de la firma: un desvinculado no puede saber si su clave sigue valiendo.
    if (c.revocado) {
      claves.delete(dispositivo);
      return error('Este celular se desconectó desde el panel.', 410);
    }

    let datos: Record<string, unknown>;
    try {
      datos = JSON.parse(texto);
    } catch {
      return error('Petición no válida.', 400);
    }
    const tipo = datos.tipo === 'latido' ? 'latido' : datos.tipo === 'aviso' ? 'aviso' : null;
    if (!tipo) return error('Petición no válida.', 400);
    // Los simulados de la versión de prueba no llegan al panel ni avisan a nadie.
    if (tipo === 'aviso' && datos.prueba === true) return responder({ ok: true, nuevo: false });

    const r = await rpc<{ nuevo: boolean }>(servidor(), 'lector_srv_recibir', {
      p_dispositivo: dispositivo,
      p_tipo: tipo,
      p_datos: datos,
    });
    return responder({ ok: true, nuevo: r.nuevo });
  } catch (e) {
    if (e instanceof ErrorRpc && e.code === '42501') {
      claves.delete(req.headers.get('x-vendemia-dispositivo') ?? '');
      return error('Este celular se desconectó desde el panel.', 410);
    }
    return caida(e, 'aviso');
  }
}
