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
import { iconosDeAviso } from '@/lib/panel/marcaPropia';
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
  /** Con marca propia, el logo del negocio en vez del de Vendemia (lib/panel/marcaPropia.ts). */
  icon?: string;
  badge?: string;
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

/** « a las 2:36 pm» (hora de Lima) de un timestamptz del lector, o nada si no se entiende. */
export function horaDeAviso(cuando: unknown): string {
  const d = typeof cuando === 'string' ? new Date(cuando) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const hora = d.toLocaleTimeString('en-US', { timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit', hour12: true });
  return ` a las ${hora.replace(' AM', ' am').replace(' PM', ' pm')}`;
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

/** La ficha de una cita en la Agenda: el aviso no trae su id (avisos 0001), sí el cliente y la hora. */
export function urlFicha(lead: string, slot: unknown): string {
  const hora = typeof slot === 'string' ? slot.slice(0, 16) : '';
  return lead && SLOT.test(hora)
    ? `/panel/agenda?lead=${encodeURIComponent(lead)}&slot=${encodeURIComponent(hora)}`
    : '/panel/agenda';
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

  // Recordatorio: un comprobante de la página lleva 15 min sin revisar (tu-pagina 0032). Va solo y
  // también por correo (/api/avisos/despachar), porque el cliente está esperando.
  if (e.datos.clase === 'comprobante_esperando') {
    const minutos = Number(e.datos.minutos) || 15;
    return {
      title: n === 1 ? `${prefijo}${quien} espera que confirmes su pago` : `${prefijo}${n} clientes esperan que confirmes su pago`,
      body: n === 1
        ? `Subió su comprobante${Number(e.datos.monto) ? ` de ${soles(e.datos.monto)}` : ''} hace ${minutos} min (${String(e.datos.servicio ?? 'su reserva')}, ${cuandoSlot(e.datos.slot) || String(e.datos.slot ?? '').slice(0, 16)}). Mira tu Yape y apruébalo en la Agenda.`
        : 'Sus comprobantes llevan más de 15 min sin revisar. Mira tu Yape y apruébalos en la Agenda.',
      url: '/panel/agenda',
      tag: `${e.company_id}:comprobante_espera`,
    };
  }

  // Lo que leyó Vendemia Caja en el aviso de Yape, Plin o del banco (lector 0001). A diferencia de
  // una captura, esto SÍ dice que el dinero llegó: lo dice la cuenta del negocio. Va aparte de los
  // comprobantes (ver planificar) y cada pago se apila en la bandeja: uno no tapa al otro.
  if (e.datos.clase === 'lector') {
    const origen = (x: EventoPendiente) => String(x.datos.origen || 'Yape');
    const nombre = (x: EventoPendiente) => {
      const s = String(x.datos.nombre ?? '').trim().toLowerCase().replace(/\b\p{L}/gu, (l) => l.toUpperCase());
      return s ? ` de ${s}` : '';
    };
    const total = eventos.reduce((t, x) => t + (Number(x.datos.monto) || 0), 0);
    // lector 0002: a qué cita fue, o que hay que elegirla.
    const QUE: Record<string, string> = {
      cobrada: 'cobrada', confirmada: 'reserva confirmada', a_cuenta: 'a cuenta', parcial: 'a cuenta del adelanto', cotejado: 'comprobante cotejado',
    };
    const cita = typeof e.datos.cita === 'string' && e.datos.cita ? String(e.datos.cliente_cita || 'una cita') : '';
    return n === 1
      ? {
          title: `${prefijo}${origen(e)} · ${soles(e.datos.monto)}${cita ? ` · ${cita}` : ''}`,
          body: cita
            ? `✓ ${cap(QUE[String(e.datos.resultado)] ?? "asignado")}: llegó${nombre(e)}${horaDeAviso(e.datos.cuando)}.`
            : e.datos.dudoso
              ? `Llegó${nombre(e)}${horaDeAviso(e.datos.cuando)}. ¿De qué cita es? Elígela en Caja › Cierre del día.`
              : `Llegó${nombre(e)}${horaDeAviso(e.datos.cuando)}. No es de ninguna cita por cobrar: queda como venta suelta.`,
          url: cita ? '/panel/agenda' : '/panel/caja?ver=cierre',
          tag: `${e.company_id}:lector:${e.id}`,
        }
      : {
          title: `${prefijo}${n} pagos llegaron · ${soles(total)}`,
          body: eventos.slice(0, 3).map((x) => `${origen(x)} ${soles(x.datos.monto)}${nombre(x)}`).join(' · '),
          url: '/panel/agenda',
          tag: `${e.company_id}:lector:${e.id}`,
        };
  }

  // avisos 0006 · El barbero marcó «Atendido» y falta cobrar: a la caja, con la misma frase que la
  // pantalla («Por cobrar en caja»). Va con los pagos (su preferencia) pero en su propio aviso.
  if (e.datos.clase === 'por_cobrar') {
    const total = eventos.reduce((t, x) => t + (Number(x.datos.monto) || 0), 0);
    const barbero = typeof e.datos.barbero === 'string' && e.datos.barbero ? e.datos.barbero : '';
    return n === 1
      ? {
          title: `${prefijo}Por cobrar en caja · ${String(e.datos.servicio || 'Atención')}`,
          body: [barbero && `Atendió ${barbero}`, quien, soles(e.datos.monto)].filter(Boolean).join(' · '),
          url: '/panel/caja',
          tag: `${e.company_id}:por_cobrar`,
        }
      : {
          title: `${prefijo}${n} por cobrar en caja · ${soles(total)}`,
          body: eventos.slice(0, 3).map((x) => `${String(x.datos.servicio || 'Atención')}${x.datos.barbero ? ` (${String(x.datos.barbero)})` : ''}`).join(' · '),
          url: '/panel/caja',
          tag: `${e.company_id}:por_cobrar`,
        };
  }

  // avisos 0006 · Al barbero: le cobraron su atención (toda) o una parte. Sin teléfonos.
  if (e.datos.clase === 'cobro') {
    const url = '/panel/mi-agenda';
    const quienEs = atendido(e, 'Cliente');
    const servicio = String(e.datos.servicio || 'Atención');
    if (n > 1) {
      const partes = eventos.filter((x) => x.datos.que === 'cobrada').reduce((t, x) => t + (Number(x.datos.parte) || 0), 0);
      return {
        title: `${prefijo}${n} cobros de tu agenda`,
        body: partes > 0 ? `Tu parte suma ${soles(partes)}.` : 'Ábrela para verlos.',
        url,
        tag: `${e.company_id}:cobro`,
      };
    }
    if (e.datos.que === 'abono') {
      return {
        title: `${prefijo}Pagó ${soles(e.datos.pagado)} · falta ${soles(e.datos.falta)}`,
        body: `${servicio} · ${quienEs}. Sigue «Por cobrar en caja».`,
        url,
        tag: `${e.company_id}:cobro:${String(e.datos.cita ?? '')}`,
      };
    }
    const parte = e.datos.parte === null || e.datos.parte === undefined ? null : Number(e.datos.parte);
    return {
      title: `${prefijo}Cobrado · ${servicio}`,
      body: `${parte !== null && Number.isFinite(parte) ? `Tu parte ${soles(parte)}` : `Se cobró ${soles(e.datos.monto)}`} · ${quienEs}`,
      url,
      tag: `${e.company_id}:cobro:${String(e.datos.cita ?? '')}`,
    };
  }

  // Un comprobante subido en la página que tiene que mirar una persona (tu-pagina 0017).
  if (e.datos.clase === 'comprobante_por_revisar') {
    return {
      title: n === 1 ? `${prefijo}Comprobante por revisar` : `${prefijo}${n} comprobantes por revisar`,
      body: n === 1 ? `${String(e.datos.servicio ?? 'Una cancha')} · ${String(e.datos.slot ?? '').slice(0, 16)}. Apruébalo o recházalo para confirmar la reserva.` : 'Apruébalos o recházalos para confirmar las reservas.',
      url: '/panel/agenda',
      tag,
    };
  }

  // Lo que piden desde el QR de una mesa (tu-pagina 0015): sin importes ni teléfonos, porque
  // le llega también al equipo. Va a /panel/mesas y un llamado nuevo de esa mesa reemplaza al anterior.
  if (e.datos.clase === 'web_mesa') {
    const url = '/panel/mesas';
    if (n > 1) return { title: `${prefijo}${n} llamados de mesas`, body: 'Ábrelos para ver qué necesita cada una.', url, tag: `${e.company_id}:mesa` };
    const mesa = `${typeof e.datos.salon === 'string' && e.datos.salon ? `${e.datos.salon} · ` : ''}Mesa ${String(e.datos.mesa ?? '')}`;
    const detalle = typeof e.datos.detalle === 'string' ? e.datos.detalle : '';
    const que: Record<string, string> = {
      mozo: 'Llama al mozo', cuenta: 'Pide la cuenta', pedido: 'Quiere pedir: ya eligieron', requerimiento: detalle || 'Necesita algo', sugerencia: 'Dejó una sugerencia',
    };
    return {
      title: `${prefijo}${mesa}`,
      body: `${que[String(e.datos.que)] ?? 'Necesita atención'}${Number(e.datos.repeticion) > 0 ? ' (insiste)' : ''}`,
      url,
      tag: `${e.company_id}:mesa:${String(e.datos.salon ?? '')}:${String(e.datos.mesa ?? '')}`,
    };
  }
  const lead = typeof e.datos.lead_id === 'string' ? e.datos.lead_id : '';

  switch (e.tipo) {
    case 'reserva': {
      // Se liberó una cancha que alguien esperaba (Mi página › Avísame, tu-pagina 0011): a
      // quién avisar está en esa pestaña. Va con las reservas para no pedir otra preferencia.
      const libres = eventos.filter((x) => x.datos.clase === 'cancha_libre');
      if (libres.length === n) {
        const esperan = libres.reduce((t, x) => t + (Number(x.datos.esperan) || 0), 0);
        return {
          title: n === 1 ? `${prefijo}Se liberó ${String(e.datos.servicio ?? 'una cancha')}` : `${prefijo}Se liberaron ${n} canchas`,
          body: n === 1
            ? `${cuandoSlot(e.datos.slot)} · ${esperan === 1 ? '1 persona la esperaba' : `${esperan} personas la esperaban`}. Avísales por WhatsApp.`
            : `${esperan} personas esperaban. Avísales por WhatsApp.`,
          url: '/panel/tu-pagina?ver=avisame',
          tag: `${tag}:libre`,
        };
      }
      // Todo pedido, de Mia o de la página, se ve en /panel/pedidos (la página, en su
      // pestaña); las reservas de la página sin agenda en la nube, en Mi página › Reservas.
      // Los envíos (web_envio, tu-pagina 0010) también se ven allí: cuentan como pedido.
      const esEnvioEv = (x: EventoPendiente) => x.datos.clase === 'web_envio';
      const esPedidoEv = (x: EventoPendiente) =>
        x.datos.clase === 'pedido' || x.datos.clase === 'web_pedido' || esEnvioEv(x);
      const pedidos = eventos.filter(esPedidoEv).length;
      const envios = eventos.filter(esEnvioEv).length;
      const esPedido = pedidos === n;
      // Lo que llega desde Mi página (pedidos_web / reservas_web / envios): sin lead, con el nombre que escribió.
      const web = eventos.filter((x) => String(x.datos.clase ?? '').startsWith('web_'));
      if (envios === n) {
        if (n > 1) return { title: `${prefijo}${n} pedidos para recoger`, body: 'Ábrelos para imprimir las etiquetas.', url: '/panel/pedidos?ver=envios', tag };
        const bultos = Number(e.datos.bultos) || 1;
        const franja = e.datos.franja === 'manana' ? 'mañana' : e.datos.franja === 'tarde' ? 'tarde' : '';
        return {
          title: `${prefijo}Pedido para recoger · ${String(e.datos.codigo ?? '')}`,
          body: [
            typeof e.datos.nombre === 'string' ? e.datos.nombre : 'Un cliente',
            typeof e.datos.distrito === 'string' ? e.datos.distrito : '',
            `${bultos} ${bultos === 1 ? 'bulto' : 'bultos'}`,
            franja && `recojo por la ${franja}`,
          ].filter(Boolean).join(' · '),
          url: typeof e.datos.codigo === 'string' ? `/panel/pedidos?envio=${encodeURIComponent(e.datos.codigo)}` : '/panel/pedidos?ver=envios',
          tag,
        };
      }
      // Un pedido es un pedido aunque el negocio sea de citas, y al revés.
      const palabra = esPedido ? 'pedido' : v.reserva === 'pedido' ? 'reserva' : v.reserva;
      const plural = esPedido ? 'pedidos' : v.reserva === 'pedido' ? 'reservas' : v.reservas;
      const a = esPedido ? 'o' : palabra === 'pedido' ? 'o' : v.a;
      // Lo primero que se quiere saber de una reserva es CUÁNDO (21-nov-2026): va en el título.
      // Por dónde llegó (Mia o la página) no se dice: al dueño le da igual.
      const horas = eventos.map((x) => cuandoSlot(x.datos.slot)).filter(Boolean);
      if (web.length === n) {
        const nombre = typeof e.datos.nombre === 'string' ? e.datos.nombre : 'Un cliente';
        const detalle = esPedido ? soles(e.datos.total) : typeof e.datos.servicio === 'string' ? e.datos.servicio : '';
        const cuando = !esPedido && n === 1 ? cuandoSlot(e.datos.slot) : '';
        return {
          title: n === 1 ? `${prefijo}Nuev${a} ${palabra}${cuando ? ` · ${cuando}` : ''}` : `${prefijo}${n} ${plural} nuev${a}s`,
          body: n === 1
            ? `${nombre}${detalle ? ` · ${detalle}` : ''}`
            : horas.length ? `${cap(horas.slice(0, 3).join(' · '))}${horas.length > 3 ? '…' : ''}` : `Ábre${a === 'o' ? 'los' : 'las'} para confirmarl${a}s.`,
          url: esPedido
            ? envios ? '/panel/pedidos' : '/panel/pedidos?ver=pagina'
            : pedidos === 0 ? '/panel/tu-pagina?ver=reservas' : '/panel',
          tag,
        };
      }
      if (n === 1) {
        const detalle = esPedido
          ? soles(e.datos.total)
          : typeof e.datos.servicio === 'string'
            ? e.datos.servicio
            : '';
        const cuando = esPedido ? '' : cuandoSlot(e.datos.slot);
        return {
          title: `${prefijo}Nuev${a} ${palabra}${cuando ? ` · ${cuando}` : ''}`,
          body: `${quien}${detalle ? ` · ${detalle}` : ''}`,
          // La ficha de la reserva en la Agenda (FichaReserva): validar el pago, escribir al
          // cliente y avisar al barbero. Antes abría el chat (23-nov-2026, Alvaro).
          url: esPedido ? '/panel/pedidos' : urlFicha(lead, e.datos.slot),
          tag,
        };
      }
      return {
        title: `${prefijo}${n} ${plural} nuev${a}s`,
        body: horas.length
          ? `${cap(horas.slice(0, 3).join(' · '))}${horas.length > 3 ? '…' : ''}`
          : `Ábre${a === 'o' ? 'los' : 'las'} para ver el detalle.`,
        // Mezcla de pedidos y reservas, o reservas de la página con citas de Mia: no hay
        // una sola pantalla donde estén todas.
        url: esPedido ? '/panel/pedidos' : pedidos === 0 && !web.length ? '/panel/agenda' : '/panel',
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
              // «Validado», no «recibido»: una captura no prueba que el dinero llegó (17-nov-2026).
              title: `${prefijo}Pago validado · ${soles(e.datos.monto)}`,
              body: `El comprobante de ${quien} cuadra. Mira en tu Yape o Plin que llegó.`,
              url: e.datos.cita ? '/panel/agenda' : '/panel/caja',
              tag,
            };
      }
      return {
        title: porRevisar ? `${prefijo}${n} pagos · ${porRevisar} por revisar` : `${prefijo}${n} pagos validados · ${soles(total)}`,
        body: porRevisar ? 'Hay comprobantes que necesitan que los confirmes.' : 'Los comprobantes cuadran. Mira en tu Yape o Plin que llegaron.',
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
      // Una mesa llamando no se mezcla con las reservas o la agenda del mismo tipo de aviso.
      const aparte: Record<string, string> = { web_mesa: 'mesa', comprobante_esperando: 'espera', lector: 'lector', por_cobrar: 'por_cobrar', cobro: 'cobro' };
      const clave = `${d.id}|${e.company_id}|${aparte[String(e.datos.clase)] ?? e.tipo}`;
      const g = grupos.get(clave) ?? { destino: d, eventos: [] };
      g.eventos.push(e);
      grupos.set(clave, g);
    }
  }
  const envios: Envio[] = [...grupos.values()].map((g) => ({
    destino: g.destino,
    mensaje: { ...redactar(g.eventos), ...iconosDeAviso(g.eventos[0].company_id) },
  }));
  for (const r of resumenes) {
    const m = redactarResumen(r);
    if (m) envios.push({ destino: r, mensaje: m });
  }
  return envios;
}
