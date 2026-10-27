/**
 * ══════════════════════════════════════════════════════════════════════════
 * AVISOS AL DUEÑO · qué se manda a cada celular (sin red, solo texto)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Recibe lo que devuelve panel_push_srv_pendientes y decide los envíos. Es la
 * mitad de la mesura que vive en código (la otra está en SQL: tipos por
 * preferencia, silencio, anti-avalancha y dedupe):
 *
 *   · Lo del mismo tipo que llega junto se AGRUPA en un solo aviso por
 *     celular: «3 citas nuevas», no tres avisos.
 *   · El texto usa las palabras del negocio (cita/clase/pedido), como el panel.
 *   · Cada aviso abre la pantalla donde se actúa, no el inicio.
 *   · `tag` por negocio y tipo: un aviso nuevo del mismo tipo REEMPLAZA al
 *     anterior en la bandeja en vez de apilarse.
 */
import { vocabulario } from '@/lib/panel/vocabulario';
import type { BusinessMode } from '@/lib/supabase/types';

export type TipoAviso =
  | 'pago'
  | 'reserva'
  | 'whatsapp'
  | 'plan'
  | 'persona'
  | 'stock'
  | 'por_aprobar'
  /** Al empleado: un cambio en SU agenda (0004). Sin importes ni teléfonos. */
  | 'mi_agenda'
  | 'recordatorio';

export interface Destino {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface EventoPendiente {
  id: number;
  company_id: string;
  tipo: TipoAviso;
  datos: Record<string, unknown>;
  negocio: string | null;
  modo: BusinessMode | null;
  cliente: string | null;
  destinos: Destino[];
}

export interface Resumen extends Destino {
  negocio: string | null;
  modo: BusinessMode | null;
  conteos: Partial<Record<TipoAviso, number>>;
}

export interface Mensaje {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface Envio {
  destino: Destino;
  mensaje: Mensaje;
}

const soles = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) ? `S/ ${Number.isInteger(v) ? v : v.toFixed(2)}` : '';
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const SLOT = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

/** «4:30 pm» de un slot "YYYY-MM-DD HH:MM". `''` si no es una hora. */
export function horaDeSlot(slot: unknown): string {
  const m = typeof slot === 'string' ? SLOT.exec(slot) : null;
  if (!m) return '';
  const h = Number(m[4]);
  return `${h % 12 || 12}:${m[5]} ${h < 12 ? 'am' : 'pm'}`;
}

/**
 * «hoy 4:30 pm», «mañana 9:00 am», «jue 30 oct 5:00 pm». El slot es hora de Lima
 * y el servidor no lo es: «hoy» se calcula en Lima, no con la fecha del servidor.
 */
export function cuandoSlot(slot: unknown, ahora: Date = new Date()): string {
  const m = typeof slot === 'string' ? SLOT.exec(slot) : null;
  if (!m) return '';
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(ahora).split('-').map(Number);
  const dia = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const dif = Math.round((dia - Date.UTC(hoy[0], hoy[1] - 1, hoy[2])) / 86_400_000);
  const fecha =
    dif === 0
      ? 'hoy'
      : dif === 1
        ? 'mañana'
        : `${DIAS[new Date(dia).getUTCDay()]} ${Number(m[3])} ${MESES[Number(m[2]) - 1]}`;
  return `${fecha} ${horaDeSlot(slot)}`;
}

/** Dónde abre un aviso del equipo: Mi agenda, en el día de la cita y con ella marcada. */
function urlMiAgenda(eventos: EventoPendiente[]): string {
  const slots = eventos.map((x) => String(x.datos.slot ?? '')).filter((s) => SLOT.test(s)).sort();
  if (!slots.length) return '/panel/mi-agenda';
  const cita = eventos.length === 1 && typeof eventos[0].datos.cita === 'string' ? `&cita=${encodeURIComponent(eventos[0].datos.cita)}` : '';
  return `/panel/mi-agenda?dia=${slots[0].slice(0, 10)}${cita}`;
}

/** El nombre de quien se atiende, sin teléfono: el beneficiario si lo hay («Jorge»), si no el cliente. */
const atendido = (e: EventoPendiente, sinNombre: string) =>
  (typeof e.datos.beneficiario === 'string' && e.datos.beneficiario) || e.cliente || sinNombre;

/** Un aviso para un grupo de eventos del mismo negocio y tipo. */
export function redactar(eventos: EventoPendiente[]): Mensaje {
  const e = eventos[0];
  const n = eventos.length;
  const v = vocabulario(e.modo);
  const quien = e.cliente || 'Un cliente';
  const prefijo = e.negocio ? `${e.negocio} · ` : '';
  const tag = `${e.company_id}:${e.tipo}`;
  const lead = typeof e.datos.lead_id === 'string' ? e.datos.lead_id : '';

  switch (e.tipo) {
    case 'reserva': {
      // Lo que llega desde Tu página (pedidos_web / reservas_web): sin lead, con el nombre que escribió.
      const web = eventos.filter((x) => String(x.datos.clase ?? '').startsWith('web_'));
      if (web.length === n) {
        const nombre = typeof e.datos.nombre === 'string' ? e.datos.nombre : 'Un cliente';
        const esPedido = e.datos.clase === 'web_pedido';
        const detalle = esPedido ? soles(e.datos.total) : typeof e.datos.servicio === 'string' ? e.datos.servicio : '';
        return {
          title: n === 1 ? `${prefijo}${esPedido ? 'Pedido' : 'Reserva'} desde tu página` : `${prefijo}${n} nuevos desde tu página`,
          body: n === 1 ? `${nombre}${detalle ? ` · ${detalle}` : ''}` : 'Ábrelos para confirmarlos.',
          url: '/panel/tu-pagina',
          tag,
        };
      }
      const pedidos = eventos.filter((x) => x.datos.clase === 'pedido').length;
      const esPedido = pedidos === n;
      // Un pedido es un pedido aunque el negocio sea de citas, y al revés.
      const palabra = esPedido ? 'pedido' : v.reserva === 'pedido' ? 'reserva' : v.reserva;
      const plural = esPedido ? 'pedidos' : v.reserva === 'pedido' ? 'reservas' : v.reservas;
      const a = esPedido ? 'o' : palabra === 'pedido' ? 'o' : v.a;
      if (n === 1) {
        const detalle = esPedido
          ? soles(e.datos.total)
          : typeof e.datos.servicio === 'string'
            ? e.datos.servicio
            : '';
        return {
          title: `${prefijo}Nuev${a} ${palabra}`,
          body: `${quien}${detalle ? ` · ${detalle}` : ''}`,
          url: esPedido ? '/panel/pedidos' : lead ? `/panel/mensajes?lead=${lead}` : '/panel/agenda',
          tag,
        };
      }
      return {
        title: `${prefijo}${n} ${plural} nuev${a}s`,
        body: `Mia ${a === 'o' ? 'los' : 'las'} cerró mientras atendías. Ábre${a === 'o' ? 'los' : 'las'} para ver el detalle.`,
        url: esPedido ? '/panel/pedidos' : '/panel/agenda',
        tag,
      };
    }
    case 'pago': {
      const porRevisar = eventos.filter((x) => !Number(x.datos.verificado)).length;
      const total = eventos.reduce((t, x) => t + (Number(x.datos.monto) || 0), 0);
      if (n === 1) {
        return porRevisar
          ? {
              title: `${prefijo}Pago por revisar`,
              body: `${quien} envió un comprobante${Number(e.datos.monto) ? ` de ${soles(e.datos.monto)}` : ''}. Confírmalo antes de darlo por bueno.`,
              url: lead ? `/panel/mensajes?lead=${lead}` : '/panel/caja',
              tag,
            }
          : {
              title: `${prefijo}Pago recibido · ${soles(e.datos.monto)}`,
              body: `Mia verificó el comprobante de ${quien}.`,
              url: '/panel/caja',
              tag,
            };
      }
      return {
        title: porRevisar ? `${prefijo}${n} pagos · ${porRevisar} por revisar` : `${prefijo}${n} pagos recibidos · ${soles(total)}`,
        body: porRevisar ? 'Hay comprobantes que necesitan que los confirmes.' : 'Mia verificó los comprobantes.',
        url: '/panel/caja',
        tag,
      };
    }
    case 'whatsapp':
      return {
        title: `${prefijo}Mia está desconectada de WhatsApp`,
        body: 'Tus clientes no están recibiendo respuesta. Abre el panel para volver a vincular el número.',
        url: '/panel',
        tag,
      };
    case 'plan': {
      const nivel = Math.max(...eventos.map((x) => Number(x.datos.nivel) || 0));
      return nivel >= 100
        ? {
            title: `${prefijo}Usaste todas las conversaciones del mes`,
            body: 'Mia sigue con la gracia y luego te pasará las nuevas. Recarga y no se detiene.',
            url: '/panel',
            tag,
          }
        : {
            title: `${prefijo}Vas por el 80 % de tu plan`,
            body: 'Si vas a necesitar más conversaciones este mes, recarga desde el panel.',
            url: '/panel',
            tag,
          };
    }
    case 'persona':
      return n === 1
        ? {
            title: `${prefijo}${cap(quien)} quiere hablar con una persona`,
            body: 'Mia le dijo que alguien del equipo le responde. Está esperando.',
            url: lead ? `/panel/mensajes?lead=${lead}` : '/panel/mensajes',
            tag,
          }
        : {
            title: `${prefijo}${n} clientes esperan a una persona`,
            body: 'Mia los derivó. Están esperando respuesta.',
            url: '/panel/mensajes',
            tag,
          };
    case 'stock': {
      // Solo llega a quien pidió el aviso (datos.para, 0003). Al tocarlo, Mia con la
      // pregunta de cuánto pedir lista para enviar: no se envía sola.
      const nombre = (x: EventoPendiente) =>
        [x.datos.producto, x.datos.opcion].filter((t) => typeof t === 'string' && t).join(' · ');
      if (n === 1) {
        const quedan = Number(e.datos.quedan);
        const pregunta = `¿Cuánto pido del producto ${String(e.datos.producto ?? '')}?`;
        return {
          title: `${prefijo}${nombre(e)}: ${quedan === 0 ? 'se agotó' : `quedan ${quedan}`}`,
          body: `Llegó al mínimo que pediste (${Number(e.datos.minimo)}). Toca para ver cuánto pedir.`,
          url: `/panel/asistente?pregunta=${encodeURIComponent(pregunta)}`,
          // Por producto: el aviso de la gorra no tapa en la bandeja al del polo.
          tag: `${tag}:${String(e.datos.catalog_id ?? '')}:${String(e.datos.opcion ?? '')}`,
        };
      }
      const nombres = eventos.map(nombre).filter(Boolean);
      return {
        title: `${prefijo}${n} productos llegaron a su mínimo`,
        body: `${nombres.slice(0, 3).join(', ')}${nombres.length > 3 ? ' y más' : ''}.`,
        url: `/panel/asistente?pregunta=${encodeURIComponent('¿Qué tengo que comprar esta semana?')}`,
        tag,
      };
    }
    case 'mi_agenda': {
      // Un pedido es de la tienda: aquí todo es lo que se agenda (cita, reserva, clase).
      const palabra = v.reserva === 'pedido' ? 'reserva' : v.reserva;
      const url = urlMiAgenda(eventos);
      if (n > 1) {
        const horas = eventos.map((x) => cuandoSlot(x.datos.slot)).filter(Boolean);
        return {
          title: `${prefijo}${n} cambios en tu agenda`,
          body: horas.length ? `${cap(horas.slice(0, 3).join(' · '))}${horas.length > 3 ? '…' : ''}` : 'Ábrela para verlos.',
          url,
          tag,
        };
      }
      const quien = atendido(e, cap(v.persona));
      const cuando = cuandoSlot(e.datos.slot);
      const servicio = typeof e.datos.servicio === 'string' ? e.datos.servicio : '';
      const detalle = [quien, servicio].filter(Boolean).join(' · ');
      const unaTag = `${tag}:${String(e.datos.cita ?? '')}`;
      // Academia: no hay hora, hay grupo. Lo único que avisa es un alumno nuevo.
      if (e.datos.recurrente) {
        return {
          title: `${prefijo}Nuevo ${v.persona}${servicio ? ` en ${servicio}` : ''}`,
          body: quien,
          url: '/panel/mi-agenda',
          tag: unaTag,
        };
      }
      const sinAsignar = !e.datos.empleado;
      switch (e.datos.que) {
        case 'nueva':
          return {
            title: sinAsignar
              ? `${prefijo}${cap(palabra)} sin asignar · ${cuando}`
              : `${prefijo}Nuev${v.a} ${palabra} · ${cuando}`,
            body: sinAsignar ? `${detalle}. Todavía no la atiende nadie.` : detalle,
            url,
            tag: unaTag,
          };
        case 'asignada':
          return { title: `${prefijo}Te asignaron ${v.una} ${palabra} · ${cuando}`, body: detalle, url, tag: unaTag };
        case 'quitada':
          return {
            title: `${prefijo}${cap(v.la)} ${palabra} de ${cuando} pasó a otra persona`,
            body: `${detalle}. Ya no está en tu agenda.`,
            url,
            tag: unaTag,
          };
        case 'movida': {
          const antes = cuandoSlot(e.datos.antes);
          return {
            title: `${prefijo}Se movió tu ${palabra} · ahora ${cuando}`,
            body: antes ? `${detalle}. Antes: ${antes}.` : detalle,
            url,
            tag: unaTag,
          };
        }
        case 'cancelada':
          return { title: `${prefijo}Se canceló tu ${palabra} de ${cuando}`, body: detalle, url, tag: unaTag };
        default:
          return { title: `${prefijo}Cambió tu ${palabra} de ${cuando}`, body: detalle, url, tag: unaTag };
      }
    }
    case 'recordatorio': {
      const palabra = v.reserva === 'pedido' ? 'reserva' : v.reserva;
      const url = urlMiAgenda(eventos);
      if (n > 1) {
        return {
          title: `${prefijo}En 15 min: ${n} ${v.reserva === 'pedido' ? 'reservas' : v.reservas}`,
          body: eventos.map((x) => `${horaDeSlot(x.datos.slot)} ${atendido(x, cap(v.persona))}`).join(' · '),
          url,
          tag,
        };
      }
      const servicio = typeof e.datos.servicio === 'string' ? e.datos.servicio : '';
      return {
        title: `${prefijo}Tu ${palabra} de las ${horaDeSlot(e.datos.slot)} empieza en 15 min`,
        body: [atendido(e, cap(v.persona)), servicio].filter(Boolean).join(' · '),
        url,
        tag: `${tag}:${String(e.datos.cita ?? '')}`,
      };
    }
    case 'por_aprobar':
      return n === 1
        ? {
            title: `${prefijo}Mia preparó un mensaje para ${e.cliente || 'un cliente'}`,
            body: 'Revísalo en su chat y apruébalo para que salga.',
            url: lead ? `/panel/mensajes?lead=${lead}` : '/panel/mensajes?filtro=por_aprobar',
            tag,
          }
        : {
            title: `${prefijo}Mia preparó ${n} mensajes para aprobar`,
            body: 'Cada uno está en el chat de su cliente. Nada sale hasta que lo apruebes.',
            url: '/panel/mensajes?filtro=por_aprobar',
            tag,
          };
  }
}

const NOMBRE_RESUMEN: Record<TipoAviso, (n: number, r: Resumen) => string> = {
  reserva: (n, r) => {
    const v = vocabulario(r.modo);
    return `${n} ${n === 1 ? v.reserva : v.reservas}`;
  },
  pago: (n) => `${n} ${n === 1 ? 'pago' : 'pagos'}`,
  persona: (n) => `${n} ${n === 1 ? 'cliente pidió' : 'clientes pidieron'} una persona`,
  whatsapp: () => 'WhatsApp se desconectó',
  plan: () => 'aviso del plan',
  stock: (n) => `${n} ${n === 1 ? 'producto llegó' : 'productos llegaron'} a su mínimo`,
  por_aprobar: (n) => `${n} ${n === 1 ? 'mensaje' : 'mensajes'} de Mia por aprobar`,
  // Son del empleado y no entran en el resumen del dueño (0004); por si un día llegan.
  mi_agenda: (n) => `${n} ${n === 1 ? 'cambio' : 'cambios'} en la agenda del equipo`,
  recordatorio: (n) => `${n} ${n === 1 ? 'recordatorio' : 'recordatorios'}`,
};

/** El resumen de la mañana: UN aviso con lo que pasó durante el silencio. */
export function redactarResumen(r: Resumen): Mensaje | null {
  const partes = (Object.entries(r.conteos) as [TipoAviso, number][])
    .filter(([, n]) => n > 0)
    .map(([t, n]) => NOMBRE_RESUMEN[t](n, r));
  if (!partes.length) return null; // Noche tranquila: no se manda nada.
  return {
    title: `${r.negocio ? `${r.negocio} · ` : ''}Mientras descansabas`,
    body: `${cap(partes.join(', '))}.`,
    url: '/panel',
    tag: `${r.id}:resumen`,
  };
}

/**
 * Todos los envíos de una tanda: por cada celular, un aviso por (negocio,
 * tipo) con todos sus eventos agrupados, más los resúmenes.
 */
export function planificar(eventos: EventoPendiente[], resumenes: Resumen[]): Envio[] {
  const grupos = new Map<string, { destino: Destino; eventos: EventoPendiente[] }>();
  for (const e of eventos) {
    for (const d of e.destinos) {
      const clave = `${d.id}|${e.company_id}|${e.tipo}`;
      const g = grupos.get(clave) ?? { destino: d, eventos: [] };
      g.eventos.push(e);
      grupos.set(clave, g);
    }
  }
  const envios: Envio[] = [...grupos.values()].map((g) => ({ destino: g.destino, mensaje: redactar(g.eventos) }));
  for (const r of resumenes) {
    const m = redactarResumen(r);
    if (m) envios.push({ destino: r, mensaje: m });
  }
  return envios;
}
