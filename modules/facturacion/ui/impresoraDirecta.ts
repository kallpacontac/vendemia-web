'use client';
/**
 * Impresión DIRECTA a la ticketera, sin app de por medio (19-nov-2026, The 24/7: la boleta salía con
 * «Versión gratuita de PrintDin · Sólo para uso personal», que mete la app de impresión de la tablet).
 *
 * Chrome (Android y computadora) habla solo con la ticketera:
 *   · Bluetooth: solo si la ticketera tiene Bluetooth «de bajo consumo» (BLE). Muchas chinas solo
 *     tienen el clásico, y ese Chrome no lo ve: por eso Ajustes tiene «Buscar» como prueba.
 *   · USB: con cable (en la tablet, adaptador OTG).
 * Se imprime la MISMA imagen del ticket que va por WhatsApp (ticketImagen.ts), en blanco y negro,
 * con la orden de imagen ESC/POS (GS v 0) que entienden casi todas las ticketeras.
 *
 * Es de ESTE equipo (la tablet que tiene la ticketera al lado), no del negocio: se guarda en el
 * navegador. Sin guardar nada, o si falla la lectura, imprime como siempre (ventana de Android).
 */

export type ModoImpresion = 'sistema' | 'bluetooth' | 'usb';

export interface ConfigImpresora {
  modo: ModoImpresion;
  /** El nombre que dio la ticketera al elegirla (para mostrarlo). */
  nombre?: string;
  /** Id del Bluetooth, para volver a encontrarla sin preguntar. */
  id?: string;
}

const CLAVE = 'vendemia:impresora';

export function leerConfig(): ConfigImpresora {
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE) || 'null') as ConfigImpresora | null;
    if (c && (c.modo === 'bluetooth' || c.modo === 'usb')) return c;
  } catch {
    /* sin almacenamiento: como siempre */
  }
  return { modo: 'sistema' };
}

export function guardarConfig(c: ConfigImpresora) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(c));
  } catch {
    /* sin almacenamiento: se queda solo en esta visita */
  }
}

/** ¿Hay que imprimir directo? (Se mira dentro del clic, antes de abrir ventanas.) */
export const imprimeDirecto = () => leerConfig().modo !== 'sistema';

/* ── Lo mínimo de Web Bluetooth / WebUSB (no están en los tipos de TypeScript) ── */

interface Caracteristica {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValue(d: Uint8Array): Promise<void>;
  writeValueWithoutResponse?(d: Uint8Array): Promise<void>;
}
interface Servicio {
  getCharacteristics(): Promise<Caracteristica[]>;
}
interface Gatt {
  connected: boolean;
  connect(): Promise<Gatt>;
  disconnect(): void;
  getPrimaryServices(): Promise<Servicio[]>;
}
interface DispositivoBt {
  id: string;
  name?: string;
  gatt?: Gatt;
}
interface Bluetooth {
  requestDevice(o: { acceptAllDevices: boolean; optionalServices: string[] }): Promise<DispositivoBt>;
  getDevices?(): Promise<DispositivoBt[]>;
}
interface Extremo {
  direction: 'in' | 'out';
  type: string;
  endpointNumber: number;
}
interface InterfazUsb {
  interfaceNumber: number;
  alternate: { interfaceClass: number; endpoints: Extremo[] };
}
interface DispositivoUsb {
  productName?: string;
  manufacturerName?: string;
  opened: boolean;
  configuration: { interfaces: InterfazUsb[] } | null;
  open(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  transferOut(extremo: number, d: Uint8Array): Promise<unknown>;
}
interface Usb {
  requestDevice(o: { filters: object[] }): Promise<DispositivoUsb>;
  getDevices(): Promise<DispositivoUsb[]>;
}

const bt = (): Bluetooth | null => (typeof navigator !== 'undefined' && (navigator as unknown as { bluetooth?: Bluetooth }).bluetooth) || null;
const usb = (): Usb | null => (typeof navigator !== 'undefined' && (navigator as unknown as { usb?: Usb }).usb) || null;

export const hayBluetooth = () => !!bt();
export const hayUsb = () => !!usb();

/** Los servicios por donde reciben datos las ticketeras BLE más comunes (chinas, Xprinter, MTP, etc.). */
const SERVICIOS_BLE = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
  '0000ae00-0000-1000-8000-00805f9b34fb',
  '0000ffe5-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
];

/* ── Bluetooth ── */

let btElegido: DispositivoBt | null = null;
let btCanal: Caracteristica | null = null;

async function canalDe(d: DispositivoBt): Promise<Caracteristica> {
  if (!d.gatt) throw new Error('Esta impresora no acepta conexión directa por Bluetooth.');
  const gatt = d.gatt.connected ? d.gatt : await d.gatt.connect();
  const servicios = await gatt.getPrimaryServices().catch(() => [] as Servicio[]);
  for (const s of servicios) {
    const cs = await s.getCharacteristics().catch(() => [] as Caracteristica[]);
    const c = cs.find((x) => x.properties.writeWithoutResponse) ?? cs.find((x) => x.properties.write);
    if (c) return c;
  }
  gatt.disconnect();
  throw new Error(
    `«${d.name || 'Ese equipo'}» se conectó, pero no recibe impresiones por Bluetooth directo. Prueba con cable USB o deja «Como siempre».`,
  );
}

/** Abre el buscador de Chrome. Si la ticketera NO sale en la lista, no tiene Bluetooth BLE. */
export async function elegirBluetooth(): Promise<ConfigImpresora> {
  const b = bt();
  if (!b) throw new Error('Este navegador no imprime directo por Bluetooth. Usa Chrome en Android o en la computadora.');
  let d: DispositivoBt;
  try {
    d = await b.requestDevice({ acceptAllDevices: true, optionalServices: SERVICIOS_BLE });
  } catch (e) {
    if ((e as Error).name === 'NotFoundError') throw new Error('No elegiste ninguna. Si la ticketera no salía en la lista, no tiene Bluetooth directo: usa cable USB.');
    throw e;
  }
  btCanal = await canalDe(d);
  btElegido = d;
  const c: ConfigImpresora = { modo: 'bluetooth', nombre: d.name || 'Ticketera Bluetooth', id: d.id };
  guardarConfig(c);
  return c;
}

/**
 * La ticketera ya elegida. Si Chrome la recuerda (getDevices) no pregunta; si no, abre el buscador
 * otra vez: por eso esto va lo PRIMERO del clic, antes de preparar la imagen.
 */
async function canalBluetooth(conf: ConfigImpresora): Promise<Caracteristica> {
  const b = bt();
  if (!b) throw new Error('Este navegador no imprime directo por Bluetooth. En Ajustes › Boletas pon «Como siempre».');
  if (btElegido && btCanal && btElegido.gatt?.connected) return btCanal;
  if (!btElegido && b.getDevices) {
    const ds = await b.getDevices().catch(() => [] as DispositivoBt[]);
    btElegido = ds.find((x) => x.id === conf.id) ?? null;
  }
  if (!btElegido) {
    btElegido = await b.requestDevice({ acceptAllDevices: true, optionalServices: SERVICIOS_BLE });
  }
  try {
    btCanal = await canalDe(btElegido);
  } catch (e) {
    btElegido = null;
    btCanal = null;
    throw new Error(`No se conectó con ${conf.nombre || 'la ticketera'}: revisa que esté prendida y cerca. (${(e as Error).message})`);
  }
  return btCanal;
}

async function mandarBluetooth(c: Caracteristica, datos: Uint8Array) {
  const sinRespuesta = c.properties.writeWithoutResponse && typeof c.writeValueWithoutResponse === 'function';
  const trozo = sinRespuesta ? 100 : 180;
  for (let i = 0; i < datos.length; i += trozo) {
    const parte = datos.slice(i, i + trozo);
    if (sinRespuesta) {
      await c.writeValueWithoutResponse!(parte);
      // La ticketera no avisa: un respiro para no llenarle la memoria.
      if ((i / trozo) % 8 === 7) await new Promise((r) => setTimeout(r, 25));
    } else {
      await c.writeValue(parte);
    }
  }
}

/* ── USB ── */

let usbListo: { d: DispositivoUsb; extremo: number } | null = null;

async function abrirUsb(d: DispositivoUsb): Promise<{ d: DispositivoUsb; extremo: number }> {
  if (!d.opened) await d.open();
  if (!d.configuration) await d.selectConfiguration(1);
  const ifs = d.configuration?.interfaces ?? [];
  // La de impresora (clase 7) primero; si no, cualquiera con salida «bulk».
  const orden = [...ifs.filter((i) => i.alternate.interfaceClass === 7), ...ifs.filter((i) => i.alternate.interfaceClass !== 7)];
  for (const i of orden) {
    const salida = i.alternate.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk');
    if (!salida) continue;
    try {
      await d.claimInterface(i.interfaceNumber);
      return { d, extremo: salida.endpointNumber };
    } catch {
      /* la usa otro: probar la siguiente */
    }
  }
  throw new Error('Ese equipo USB no recibe impresiones. Revisa que sea la ticketera.');
}

export async function elegirUsb(): Promise<ConfigImpresora> {
  const u = usb();
  if (!u) throw new Error('Este navegador no imprime directo por USB. Usa Chrome en Android o en la computadora.');
  let d: DispositivoUsb;
  try {
    d = await u.requestDevice({ filters: [] });
  } catch (e) {
    if ((e as Error).name === 'NotFoundError') throw new Error('No elegiste ninguna. Revisa el cable (en la tablet, con adaptador OTG) y que la ticketera esté prendida.');
    throw e;
  }
  usbListo = await abrirUsb(d);
  const c: ConfigImpresora = { modo: 'usb', nombre: [d.manufacturerName, d.productName].filter(Boolean).join(' ') || 'Ticketera USB' };
  guardarConfig(c);
  return c;
}

async function canalUsb(): Promise<{ d: DispositivoUsb; extremo: number }> {
  const u = usb();
  if (!u) throw new Error('Este navegador no imprime directo por USB. En Ajustes › Boletas pon «Como siempre».');
  if (usbListo?.d.opened) return usbListo;
  const ds = await u.getDevices();
  if (!ds.length) throw new Error('No encuentro la ticketera por USB: revisa el cable y vuelve a elegirla en Ajustes › Boletas.');
  let ultimo: unknown = null;
  for (const d of ds) {
    try {
      usbListo = await abrirUsb(d);
      return usbListo;
    } catch (e) {
      ultimo = e;
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error('No se pudo abrir la ticketera USB.');
}

/* ── La imagen → órdenes ESC/POS ── */

/** Puntos que imprime cada ancho de papel (8 por mm): 80 mm → 72 mm útiles; 58 mm → 48 mm. */
const PUNTOS = { 80: 576, 58: 384 } as const;

async function cargar(fuente: Blob | HTMLCanvasElement): Promise<CanvasImageSource & { width: number; height: number }> {
  if (fuente instanceof HTMLCanvasElement) return fuente;
  const url = URL.createObjectURL(fuente);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // La imagen ya está decodificada.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** La imagen en blanco y negro, al ancho de la ticketera, como GS v 0 en franjas. */
export async function ordenesDeImagen(fuente: Blob | HTMLCanvasElement, anchoMm: 58 | 80): Promise<Uint8Array> {
  const img = await cargar(fuente);
  const ancho = PUNTOS[anchoMm];
  const alto = Math.max(1, Math.round((img.height * ancho) / img.width));
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('El navegador no pudo preparar el ticket.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, ancho, alto);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, ancho, alto);
  const px = ctx.getImageData(0, 0, ancho, alto).data;

  const bytesFila = ancho / 8;
  const partes: number[][] = [[0x1b, 0x40]]; // ESC @: empezar limpio
  const FRANJA = 128; // filas por orden: las ticketeras baratas no aguantan una imagen entera de golpe
  for (let y0 = 0; y0 < alto; y0 += FRANJA) {
    const filas = Math.min(FRANJA, alto - y0);
    const p = [0x1d, 0x76, 0x30, 0x00, bytesFila & 0xff, bytesFila >> 8, filas & 0xff, filas >> 8];
    for (let y = y0; y < y0 + filas; y++) {
      for (let bx = 0; bx < bytesFila; bx++) {
        let b = 0;
        for (let k = 0; k < 8; k++) {
          const i = (y * ancho + bx * 8 + k) * 4;
          const luz = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          if (luz < 170) b |= 0x80 >> k;
        }
        p.push(b);
      }
    }
    partes.push(p);
  }
  partes.push([0x1b, 0x64, 0x04]); // avanzar 4 líneas para cortar a mano
  partes.push([0x1d, 0x56, 0x42, 0x00]); // cortar (la que no tiene cuchilla lo ignora)
  const total = partes.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of partes) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/**
 * Imprime directo. `imagen` es la promesa del ticket como imagen: se pide la ticketera PRIMERO
 * (el buscador de Bluetooth exige estar dentro del clic) y luego se espera la imagen.
 */
export async function imprimirDirecto(imagen: Promise<Blob | HTMLCanvasElement | null>, anchoMm: 58 | 80) {
  const conf = leerConfig();
  if (conf.modo === 'bluetooth') {
    const canal = await canalBluetooth(conf);
    const fuente = await imagen;
    if (!fuente) throw new Error('No se pudo preparar el ticket para imprimir.');
    await mandarBluetooth(canal, await ordenesDeImagen(fuente, anchoMm));
  } else if (conf.modo === 'usb') {
    const canal = await canalUsb();
    const fuente = await imagen;
    if (!fuente) throw new Error('No se pudo preparar el ticket para imprimir.');
    await canal.d.transferOut(canal.extremo, await ordenesDeImagen(fuente, anchoMm));
  } else {
    throw new Error('No hay impresora directa elegida.');
  }
}

/** Un ticket corto para probar desde Ajustes. */
export function ticketDePrueba(negocio: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 576;
  c.height = 300;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText(negocio || 'Vendemia', 288, 60);
  ctx.font = '26px sans-serif';
  ctx.fillText('Prueba de impresión directa', 288, 120);
  ctx.fillText(new Date().toLocaleString('es-PE'), 288, 165);
  ctx.font = '22px sans-serif';
  ctx.fillText('Si lees esto, ya no hace falta otra app.', 288, 230);
  return c;
}
