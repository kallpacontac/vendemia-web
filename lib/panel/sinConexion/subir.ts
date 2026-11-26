/**
 * ══════════════════════════════════════════════════════════════════════════
 * APLICAR O ANOTAR · y subir lo anotado cuando vuelve la conexión
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Las cuatro operaciones de la Caja que funcionan sin internet (ticket cobrado,
 * cobro de una cita, gasto, ingreso) van SIEMPRE por `sin_conexion_aplicar`
 * (modules/datos/sql/0025) con un id hecho en el celular, haya red o no. Así el
 * camino con red y el sin red son el mismo y no hay duplicados posibles: si la
 * red se corta justo al enviar, la operación se guarda con ESE id y al subirla
 * Postgres reconoce que ya entró.
 *
 * Solo el dueño y el administrador (decisión de Alvaro, 19-nov-2026). El
 * empleado sigue por el camino de siempre y sin red recibe un error.
 *
 * Mientras la 0025 no esté en la base (PGRST202) o la agenda la lleve el bot
 * (55000), con red se vuelve al camino de antes (`antigua`): nada se rompe.
 */
import { supabase } from '@/lib/supabase/client';
import { encolarSinEsperar } from '@/lib/supabase/commands';
import type { RolNegocio } from '@/lib/panel/roles';
import { demoActivo } from '@/lib/panel/demo';
import { esErrorDeRed, marcarEnLinea, marcarSinRed, sinRed } from './red';
import {
  actualizarOperacion,
  guardarOperacion,
  listarOperaciones,
  nuevoId,
  quitarOperacion,
  type Operacion,
} from './bandeja';

export { nuevoId };

/** ¿Esta persona puede anotar sin conexión en este negocio? */
export const puedeSinConexion = (rol: RolNegocio | null | undefined): boolean => rol === 'dueno' || rol === 'admin';

type ErrorPg = { code?: string; message?: string } | null;

const faltaFuncion = (e: ErrorPg) =>
  e?.code === 'PGRST202' || /sin_conexion_aplicar/.test(e?.message ?? '')
  // Una base sin la migración de ESE tipo (p. ej. `pago` sin la 0036): es lo mismo, falta instalar.
  || /no se puede anotar sin conexión/.test(e?.message ?? '');

/** Sin la migración de un tipo (0025, o la 0036 para `pago`): ese tipo no se vuelve a probar en 5 minutos. */
const sinFuncionHasta = new Map<string, number>();

export type Resultado<T> =
  | { como: 'aplicada'; r: T }
  /** Guardada en el celular: se sube sola. */
  | { como: 'anotada' }
  /** Con red y sin la 0025, o agenda del bot: que la pantalla use su camino de siempre. */
  | { como: 'antigua' }
  | { como: 'error'; mensaje: string };

export type NuevaOperacion = Omit<Operacion, 'estado' | 'intentos' | 'id' | 'ocurrioEn'> & { id?: string; ocurrioEn?: string };

async function anotar(op: NuevaOperacion & { id: string; ocurrioEn: string }): Promise<Resultado<never>> {
  try {
    await guardarOperacion({ ...op, estado: 'pendiente', intentos: 0 });
    pedirSubida();
    return { como: 'anotada' };
  } catch (e) {
    return { como: 'error', mensaje: e instanceof Error ? e.message : 'No se pudo guardar en este celular.' };
  }
}

function llamar(op: { company: string; id: string; tipo: string; datos: Record<string, unknown>; ocurrioEn: string }) {
  return supabase().rpc('sin_conexion_aplicar', {
    p_company: op.company,
    p_op: op.id,
    p_tipo: op.tipo,
    p_datos: op.datos,
    p_ocurrio_en: op.ocurrioEn,
  });
}

export async function aplicarOAnotar<T = Record<string, unknown>>(nueva: NuevaOperacion, rol: RolNegocio | null): Promise<Resultado<T>> {
  // En demo no se escribe nada: el camino de siempre (useComando) lo frena y lo dice.
  if (!puedeSinConexion(rol) || demoActivo()) return { como: 'antigua' };
  const op = { ...nueva, id: nueva.id ?? nuevoId(), ocurrioEn: nueva.ocurrioEn ?? new Date().toISOString() };
  // Con foto tomada sin red, o sin red ya sabida: directo a la bandeja (la foto se sube antes).
  if (op.foto || sinRed()) return anotar(op);
  if (Date.now() < (sinFuncionHasta.get(op.tipo) ?? 0)) return { como: 'antigua' };
  try {
    const { data, error } = await llamar(op);
    if (!error) {
      marcarEnLinea();
      return { como: 'aplicada', r: data as T };
    }
    if (esErrorDeRed(error)) {
      marcarSinRed();
      return anotar(op);
    }
    if (faltaFuncion(error)) {
      sinFuncionHasta.set(op.tipo, Date.now() + 5 * 60_000);
      return { como: 'antigua' };
    }
    if (error.code === '55000') return { como: 'antigua' };
    return { como: 'error', mensaje: error.message };
  } catch (e) {
    if (esErrorDeRed(e)) {
      marcarSinRed();
      return anotar(op);
    }
    return { como: 'error', mensaje: e instanceof Error ? e.message : 'No se pudo guardar.' };
  }
}

/* ══ Subir lo anotado ═══════════════════════════════════════════════════════ */

export interface Subida {
  subidas: number;
  rechazadas: number;
  /** Lo que conviene contar: «la cita de las 4:30 ya estaba cobrada». */
  notas: string[];
  /** La 0025 aún no está en la base: lo anotado espera. */
  faltaInstalar: boolean;
}

const vacia = (): Subida => ({ subidas: 0, rechazadas: 0, notas: [], faltaInstalar: false });

let enCurso: Promise<Subida> | null = null;
const oyentesSubida = new Set<() => void>();
/** Que el proveedor suba en cuanto pueda (tras anotar algo con red). */
function pedirSubida() {
  oyentesSubida.forEach((f) => f());
}
export function oirPedidoDeSubida(f: () => void): () => void {
  oyentesSubida.add(f);
  return () => oyentesSubida.delete(f);
}

export function subirPendientes(usuario: string): Promise<Subida> {
  if (enCurso) return enCurso;
  const tarea = async () => {
    try {
      return await subirTodas(usuario);
    } finally {
      enCurso = null;
    }
  };
  // Dos pestañas abiertas: una sola sube (el id ya evita duplicados; esto evita el trabajo doble).
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  enCurso = locks ? (locks.request('vm-subir-bandeja', tarea) as unknown as Promise<Subida>) : tarea();
  return enCurso;
}

async function subirTodas(usuario: string): Promise<Subida> {
  const res = vacia();
  if (!usuario) return res;
  const ops = (await listarOperaciones(usuario).catch(() => [] as Operacion[])).filter((o) => o.estado === 'pendiente');
  if (!ops.length) return res;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return res;

  // La sesión viva (renueva el token si caducó mientras no había red). Otra persona: no se sube.
  const { data } = await supabase().auth.getSession();
  const sesion = data.session;
  if (!sesion || sesion.user.id !== usuario) return res;

  for (const op of ops) {
    const datos = { ...op.datos };
    if (op.foto) {
      const foto = await subirFoto(op.company, op.foto, sesion.access_token);
      if (foto === 'red') {
        marcarSinRed();
        return res;
      }
      if ('error' in foto) {
        await rechazar(op, foto.error);
        res.rechazadas++;
        continue;
      }
      datos.foto = foto;
      // Ya subida: si lo que sigue falla, no se vuelve a subir la misma foto.
      await actualizarOperacion(op.id, { datos, foto: null });
    }
    let respuesta: { data: unknown; error: ErrorPg };
    try {
      respuesta = await llamar({ ...op, datos });
    } catch (e) {
      respuesta = { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
    }
    const { data: r, error } = respuesta;
    if (error && esErrorDeRed(error)) {
      marcarSinRed();
      return res;
    }
    if (error && faltaFuncion(error)) {
      // Esta queda esperando (no se rechaza) y las demás siguen: puede faltar solo la de su tipo.
      res.faltaInstalar = true;
      continue;
    }
    if (error?.code === '55000' && (op.tipo === 'cobro' || op.tipo === 'gasto' || op.tipo === 'pago')) {
      // La agenda la lleva el bot: por su cola, donde marcar_pagado, upsert_gasto con id y registrar_pago
      // (por el id del comando) no cuentan dos veces.
      try {
        if (op.tipo === 'cobro') await encolarSinEsperar(op.company, 'marcar_pagado', { tipo: 'appointment', ...datos });
        else if (op.tipo === 'pago') await encolarSinEsperar(op.company, 'registrar_pago', datos);
        else await encolarSinEsperar(op.company, 'upsert_gasto', { gasto: datos.gasto });
        await quitarOperacion(op.id);
        res.subidas++;
      } catch (e) {
        if (esErrorDeRed(e)) return res;
        await rechazar(op, e instanceof Error ? e.message : 'No se pudo subir.');
        res.rechazadas++;
      }
      continue;
    }
    if (error) {
      await rechazar(op, error.message ?? 'No se pudo subir.');
      res.rechazadas++;
      continue;
    }
    marcarEnLinea();
    await quitarOperacion(op.id);
    res.subidas++;
    const v = (r ?? {}) as { cambio?: boolean; duplicado?: boolean };
    if (op.tipo === 'cobro' && v.cambio === false && !v.duplicado) {
      res.notas.push(`${op.resumen.texto}: ya estaba cobrada, no se contó dos veces.`);
    }
  }
  return res;
}

function rechazar(op: Operacion, error: string) {
  return actualizarOperacion(op.id, { estado: 'rechazada', error, intentos: op.intentos + 1 });
}

/** Otra vez a la cola: tras corregir lo que la rechazó (el stock, la hora del celular…). */
export function reintentar(id: string) {
  return actualizarOperacion(id, { estado: 'pendiente', error: undefined }).then(pedirSubida);
}

/** La misma subida que hace FotoDelPago, más tarde. */
async function subirFoto(
  company: string,
  foto: Blob,
  token: string,
): Promise<'red' | { error: string } | { url: string; hash: string; operacion: string }> {
  const form = new FormData();
  form.append('companyId', company);
  form.append('archivo', foto, 'pago.jpg');
  let r: Response;
  try {
    r = await fetch('/api/cobros/foto', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  } catch {
    return 'red';
  }
  if (r.status >= 500 && r.status !== 503) return { error: 'No se pudo leer la foto del pago.' };
  if (r.status === 503) return 'red';
  const j = (await r.json().catch(() => null)) as { status?: string; mensaje?: string; url?: string; hash?: string; operacion?: string } | null;
  if (!r.ok || !j || j.status !== 'ok' || !j.url) return { error: j?.mensaje ?? 'No se pudo leer la foto del pago.' };
  return { url: j.url, hash: j.hash ?? '', operacion: j.operacion ?? '' };
}
