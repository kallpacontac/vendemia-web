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

export type TipoAviso = 'pago' | 'reserva' | 'whatsapp' | 'plan' | 'persona';

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
