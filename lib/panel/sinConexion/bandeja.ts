/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA BANDEJA · lo que la Caja anotó sin internet, esperando a subir
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Vive en IndexedDB y no en localStorage: aguanta fotos (el comprobante de un
 * Yape), no tiene el tope de 5 MB y no bloquea la pantalla al escribir.
 *
 * Cada operación lleva un id propio (uuid) que viaja hasta Postgres
 * (`sin_conexion_aplicar`, modules/datos/sql/0024): subirla dos veces cuenta
 * una. Por eso nunca se cambia el id de una operación, ni al reintentar.
 *
 * ⚠️ Es de ESTE celular. Otro celular de la misma caja tiene su bandeja y el
 * servidor no sabe de ninguna hasta que suben. Lo que aquí se guarda va por
 * usuario: si entra otra persona, no sube lo de la anterior a su nombre.
 */

/** `pago` = «Registrar pago», la seña o lo que faltaba (datos 0036). */
export type TipoOperacion = 'ticket' | 'cobro' | 'gasto' | 'ingreso' | 'pago';

export interface Operacion {
  id: string;
  company: string;
  usuario: string;
  tipo: TipoOperacion;
  /** Lo que recibe sin_conexion_aplicar como p_datos. */
  datos: Record<string, unknown>;
  /** Cuándo pasó de verdad (ISO). Es la hora con la que entra en la caja. */
  ocurrioEn: string;
  /** La foto del comprobante tomada sin red: se sube antes que la operación. */
  foto?: Blob | null;
  /** Para enseñarla sin entender `datos`: «Corte + Barba · Carlos», S/ 35, yape. */
  resumen: { texto: string; importe: number; metodo?: string; salida?: boolean };
  /** La cita que se cobra (tipo cobro): para sacarla de «Listos para cobrar» mientras tanto. */
  citaId?: string;
  estado: 'pendiente' | 'rechazada';
  error?: string;
  intentos: number;
}

const BD = 'vendemia-sin-conexion';
const ALMACEN = 'operaciones';

let abierta: Promise<IDBDatabase> | null = null;
function abrir(): Promise<IDBDatabase> {
  if (abierta) return abierta;
  abierta = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Este navegador no guarda datos sin conexión.'));
    const pet = indexedDB.open(BD, 1);
    pet.onupgradeneeded = () => {
      const db = pet.result;
      if (!db.objectStoreNames.contains(ALMACEN)) db.createObjectStore(ALMACEN, { keyPath: 'id' });
    };
    pet.onsuccess = () => resolve(pet.result);
    pet.onerror = () => reject(pet.error ?? new Error('No se pudo abrir el almacén del celular.'));
  });
  abierta.catch(() => {
    abierta = null;
  });
  return abierta;
}

function enTx<T>(modo: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return abrir().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(ALMACEN, modo);
        const pet = f(tx.objectStore(ALMACEN));
        let valor: T | undefined;
        if (pet) pet.onsuccess = () => (valor = pet.result);
        tx.oncomplete = () => resolve(valor);
        tx.onerror = () => reject(tx.error ?? new Error('No se pudo guardar en el celular.'));
        tx.onabort = () => reject(tx.error ?? new Error('No se pudo guardar en el celular.'));
      }),
  );
}

/* ── Avisar a la pantalla (y a las otras pestañas) de que algo cambió ── */

const oyentes = new Set<() => void>();
let canal: BroadcastChannel | null = null;
function avisarCambio() {
  oyentes.forEach((f) => f());
  try {
    canal?.postMessage('cambio');
  } catch {
    /* sin canal entre pestañas */
  }
}
export function oirBandeja(f: () => void): () => void {
  if (!canal && typeof BroadcastChannel !== 'undefined') {
    canal = new BroadcastChannel('vm-sin-conexion');
    canal.onmessage = () => oyentes.forEach((g) => g());
  }
  oyentes.add(f);
  return () => oyentes.delete(f);
}

/* ── Lo que se puede hacer ── */

export async function guardarOperacion(op: Operacion): Promise<void> {
  await enTx('readwrite', (s) => s.put(op));
  avisarCambio();
  // Que el navegador no la borre por falta de espacio (sobre todo iPhone).
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* sin permiso: sigue funcionando */
  }
}

export async function listarOperaciones(usuario?: string): Promise<Operacion[]> {
  const todas = ((await enTx<Operacion[]>('readonly', (s) => s.getAll() as IDBRequest<Operacion[]>)) ?? []) as Operacion[];
  return todas.filter((o) => !usuario || o.usuario === usuario).sort((a, b) => a.ocurrioEn.localeCompare(b.ocurrioEn));
}

export async function quitarOperacion(id: string): Promise<void> {
  await enTx('readwrite', (s) => s.delete(id));
  avisarCambio();
}

export async function actualizarOperacion(id: string, cambio: Partial<Operacion>): Promise<void> {
  const op = (await enTx<Operacion>('readonly', (s) => s.get(id) as IDBRequest<Operacion>)) as Operacion | undefined;
  if (!op) return;
  await enTx('readwrite', (s) => s.put({ ...op, ...cambio, id: op.id }));
  avisarCambio();
}

export const nuevoId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
