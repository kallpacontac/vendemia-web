/**
 * ══════════════════════════════════════════════════════════════════════════
 * MODO DEMO · datos inventados para enseñar el panel
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ ESTO NO SIEMBRA LA BASE DE DATOS, Y NO PUEDE HACERLO.
 *
 * El panel LEE tablas y vistas; lo único que puede escribir es una fila en
 * `commands`. Los GRANT de Postgres no permiten otra cosa, así que no hay forma
 * de meter pedidos o citas de mentira en Supabase desde aquí — y menos mal:
 * datos sembrados en producción contaminan la facturación real y no hay quien
 * los distinga después. Ya pasó con `barberia-01`, donde 446 de 447 citas las
 * creó un script de siembra y sus S/9.205 dejaron de servir para juzgar si una
 * cifra del panel era plausible.
 *
 * Así que el modo demo vive ENTERO en el navegador: las funciones de
 * queries.ts devuelven esto en vez de ir a Supabase. Se apaga y no queda
 * rastro, porque nunca hubo nada que borrar.
 *
 * Dos garantías que lo hacen seguro de enseñar delante de un cliente:
 *
 *   1 · No se escribe nada. `useComando()` rechaza cualquier comando mientras
 *       el modo está activo — ver components/panel/Avisos.tsx.
 *   2 · No se puede confundir con lo real. Hay una banda fija en pantalla, y
 *       está en todas las pantallas porque vive en el layout.
 *
 * ── Por qué los datos son deterministas ──────────────────────────────────
 *
 * Un PRNG con semilla fija, no `Math.random()`. Dos motivos, y los dos se ven
 * en una demo: el dashboard y las métricas leen conjuntos distintos y tienen
 * que contar LA MISMA historia —si los ingresos del dashboard no cuadran con
 * los de métricas, alguien lo va a notar— y recargar la página a media
 * presentación no puede cambiar las cifras delante de quien mira.
 */
import type {
  AppointmentStatus,
  CatalogMediaRow,
  DailyMetricRow,
  EmployeeBlockRow,
  Horario,
  LeadIntent,
  LeadStatus,
  OrderStatus,
  ProductoIngreso,
  PuntoDia,
  PuntoIngreso,
  PuntoIntencion,
  PuntoPedidos,
  RetargetingRow,
} from '@/lib/supabase/types';
import type {
  Cita,
  ItemCatalogo,
  Lead,
  Mensaje,
  Pedido,
  Trabajador,
} from '@/lib/supabase/queries';

/* ── El interruptor ─────────────────────────────────────────────────────── */

const CLAVE = 'vendemia_demo';

/**
 * ⚠️ Se lee de localStorage en cada llamada, no de un módulo en memoria.
 *
 * Las funciones de queries.ts no son componentes y no pueden suscribirse a un
 * contexto de React. Leer el interruptor aquí es lo que permite interceptar en
 * un solo sitio por consulta, con una línea, sin plumbing por todo el panel.
 */
export function demoActivo(): boolean {
  try {
    return localStorage.getItem(CLAVE) === '1';
  } catch {
    // Ventana privada o cookies bloqueadas: sin almacenamiento, no hay demo.
    return false;
  }
}

/**
 * Enciende o apaga y RECARGA la página.
 *
 * La recarga es deliberada y no es pereza: cada pantalla tiene sus datos ya
 * cargados en su propio `useCargar`, y no hay ningún camino que los invalide
 * todos a la vez. Recargar garantiza que no queda ni una cifra real mezclada
 * con las de mentira — que es exactamente el fallo que no te puedes permitir
 * delante de un cliente.
 */
export function alternarDemo(): void {
  try {
    const nuevo = demoActivo() ? '0' : '1';
    localStorage.setItem(CLAVE, nuevo);
  } catch {
    /* sin almacenamiento no hay nada que alternar */
  }
  window.location.reload();
}

/* ── Azar con semilla ───────────────────────────────────────────────────── */

/** mulberry32: pequeño, determinista y suficiente para pintar una demo. */
function generador(semilla: number): () => number {
  let a = semilla;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = generador(20260910);
const entre = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const de = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];

/* ── Fechas ─────────────────────────────────────────────────────────────── */

const HOY = new Date();
HOY.setHours(0, 0, 0, 0);

const dia = (offset: number): Date => {
  const d = new Date(HOY);
  d.setDate(d.getDate() + offset);
  return d;
};

const iso = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const ts = (d: Date): number => Math.floor(d.getTime() / 1000);

/* ── Nombres ────────────────────────────────────────────────────────────── */

const NOMBRES = [
  'Lucía Ramírez', 'Carlos Quispe', 'Ana Torres', 'Miguel Ángel Rojas', 'Sofía Mendoza',
  'Diego Salazar', 'Valeria Ríos', 'Jorge Castillo', 'Camila Vargas', 'Andrés Peralta',
  'Fernanda Cruz', 'Ricardo Núñez', 'Daniela Espinoza', 'Sebastián Flores', 'Paola Guzmán',
  'Martín Chávez', 'Rocío Delgado', 'Álvaro Bustamante', 'Gabriela Ponce', 'Iván Cárdenas',
  'Milagros Zapata', 'Hugo Villanueva', 'Patricia Alarcón', 'Renzo Ibáñez', 'Carla Moreno',
  'Bruno Paredes', 'Elena Sandoval', 'Óscar Maldonado', 'Julia Herrera', 'Nicolás Reyes',
];

const telefonoDe = (i: number) => `519${String(87000000 + i * 137).slice(0, 8)}`;

/* ── Catálogo ───────────────────────────────────────────────────────────── */

const SERVICIOS = [
  { name: 'Corte clásico', price: 35, duration: 30 },
  { name: 'Corte + barba', price: 55, duration: 45 },
  { name: 'Coloración', price: 120, duration: 90 },
  { name: 'Tratamiento capilar', price: 80, duration: 60 },
  { name: 'Perfilado de barba', price: 25, duration: 20 },
  { name: 'Pack novio', price: 180, duration: 120 },
];

let cacheCatalogo: ItemCatalogo[] | null = null;

export function catalogoDemo(companyId: string): ItemCatalogo[] {
  if (cacheCatalogo) return cacheCatalogo;
  cacheCatalogo = SERVICIOS.map((s, i) => ({
    id: `demo-cat-${i}`,
    company_id: companyId,
    name: s.name,
    description: `${s.name} — servicio de demostración.`,
    price: s.price,
    currency: 'PEN',
    stock: null,
    max_discount: null,
    duration_minutes: s.duration,
    capacity: null,
    is_active: 1,
    package_services: '[]',
    schedule_slots: null,
    created_at: ts(dia(-120)),
    created_ts: dia(-120).toISOString(),
    activo: true,
    paquete: [],
  })) as unknown as ItemCatalogo[];
  return cacheCatalogo;
}

/* ── Trabajadores ───────────────────────────────────────────────────────── */

const EQUIPO = ['Marco Salinas', 'Lucía Fernández', 'Diego Ramos'];

export function trabajadoresDemo(companyId: string): Trabajador[] {
  return EQUIPO.map((name, i) => ({
    id: `demo-emp-${i}`,
    company_id: companyId,
    name,
    is_active: 1,
    schedule: '',
    activo: true,
    horario: {} as Horario,
  })) as unknown as Trabajador[];
}

export const bloqueosDemo = (): EmployeeBlockRow[] => [];

/* ── Leads ──────────────────────────────────────────────────────────────── */

/** Ponderado hacia lo positivo: esto es una demo, no una auditoría. */
const INTENCIONES: LeadIntent[] = [
  'purchase_ready', 'purchase_ready', 'purchase_ready',
  'quote', 'quote',
  'inquiry',
  'support',
];

let cacheLeads: Lead[] | null = null;

export function leadsDemo(companyId: string): Lead[] {
  if (cacheLeads) return cacheLeads;

  const out: Lead[] = [];
  let n = 0;
  // 30 días hacia atrás, con más leads cuanto más reciente: la curva sube.
  for (let d = 29; d >= 0; d--) {
    const cuantos = Math.max(1, Math.round((30 - d) / 6) + entre(0, 2));
    for (let k = 0; k < cuantos; k++) {
      const nombre = NOMBRES[n % NOMBRES.length];
      const fecha = dia(-d);
      fecha.setHours(entre(9, 20), entre(0, 59), 0, 0);
      const intent = de(INTENCIONES);
      const status: LeadStatus =
        intent === 'purchase_ready' ? (rnd() < 0.72 ? 'paid' : 'contacted') : rnd() < 0.3 ? 'contacted' : 'new';
      out.push({
        id: `demo-lead-${n}`,
        company_id: companyId,
        phone: telefonoDe(n),
        name: nombre,
        customer_email: null,
        customer_address: null,
        status,
        intent,
        bot_active: 1,
        handoff_at: null,
        custom_data: '{}',
        customer_notes: null,
        last_message: de([
          '¿Tienen cupo para el sábado?',
          'Perfecto, ya te hago el Yape',
          '¿Cuánto sale el corte con barba?',
          'Gracias! nos vemos el jueves',
          '¿Atienden hoy hasta qué hora?',
        ]),
        created_at: ts(fecha),
        created_ts: fecha.toISOString(),
        botActivo: true,
        enManual: false,
        creado: fecha,
        datos: {},
      } as unknown as Lead);
      n++;
    }
  }
  cacheLeads = out;
  return out;
}

/* ── Citas ──────────────────────────────────────────────────────────────── */

/**
 * Leads agrupados por el día en que entraron.
 *
 * ⚠️ Esto NO es un detalle de realismo, decide una cifra de portada. La
 * conversión del dashboard cuenta, de los leads creados HOY, cuántos tienen ya
 * una cita en pie o un pedido cobrado (ver lib/panel/conversion.ts). Si las
 * citas apuntaran a leads al azar, la conversión saldría cerca de 0 % y la demo
 * enseñaría el peor número posible justo en la tarjeta más visible.
 *
 * Atando cada cita a un lead de SU MISMO DÍA, la conversión sale alta y además
 * es cierta dentro de la ficción: el cliente escribió y reservó el mismo día,
 * que es lo que de verdad hace la gente.
 */
function leadsPorDia(leads: Lead[]): Map<string, Lead[]> {
  const m = new Map<string, Lead[]>();
  for (const l of leads) {
    if (!l.creado) continue;
    const k = iso(l.creado);
    const a = m.get(k) ?? [];
    a.push(l);
    m.set(k, a);
  }
  return m;
}

let cacheCitas: Cita[] | null = null;

export function citasDemo(companyId: string): Cita[] {
  if (cacheCitas) return cacheCitas;

  const leads = leadsDemo(companyId);
  const porDia = leadsPorDia(leads);
  const out: Cita[] = [];
  let n = 0;

  /**
   * De -14 a +10 días. El pasado se rellena con estados MEZCLADOS a propósito:
   * la sección «Citas que ya pasaron» de la agenda no tendría nada que enseñar
   * si todo estuviera confirmado, y es una de las cosas que más luce.
   */
  for (let d = -14; d <= 10; d++) {
    const fecha = dia(d);
    const finde = fecha.getDay() === 0;
    if (finde) continue;
    const cuantas = d <= 0 ? entre(3, 6) : entre(2, 5);

    for (let k = 0; k < cuantas; k++) {
      const hora = entre(9, 18);
      const minuto = de([0, 30]);
      const servicio = de(SERVICIOS);
      /* Del mismo día si lo hay — ver leadsPorDia() y por qué importa. Las citas
         futuras las reserva gente que escribió hoy o ayer, así que para d > 0 se
         busca entre los leads recientes. */
      const mismoDia = porDia.get(iso(d > 0 ? HOY : fecha)) ?? [];
      const lead = mismoDia.length ? mismoDia[k % mismoDia.length] : leads[(n * 7) % leads.length];

      let status: AppointmentStatus;
      let cumplidoPor = '';
      if (d > 0) {
        status = 'confirmed';
      } else {
        const r = rnd();
        if (r < 0.55) {
          status = 'completed';
          cumplidoPor = 'panel';
        } else if (r < 0.85) {
          status = 'completed';
          cumplidoPor = 'cron';
        } else if (r < 0.93) {
          status = 'no_show';
          cumplidoPor = 'panel';
        } else {
          status = 'completed';
          cumplidoPor = '';
        }
      }

      const inicio = new Date(fecha);
      inicio.setHours(hora, minuto, 0, 0);
      const fin = new Date(inicio.getTime() + servicio.duration * 60000);
      const p = (x: number) => String(x).padStart(2, '0');
      const txt = (x: Date) => `${iso(x)} ${p(x.getHours())}:${p(x.getMinutes())}`;

      out.push({
        id: `demo-cita-${n}`,
        company_id: companyId,
        lead_id: lead.id,
        slot_start: txt(inicio),
        slot_end: txt(fin),
        status,
        slot_minutes: servicio.duration,
        employee_id: `demo-emp-${n % EQUIPO.length}`,
        service: servicio.name,
        created_at: ts(dia(d - entre(1, 5))),
        created_ts: dia(d - entre(1, 5)).toISOString(),
        pagado_por: status === 'no_show' ? '' : rnd() < 0.6 ? 'voucher' : 'panel',
        cumplido_por: cumplidoPor,
        inicio,
        recurrente: false,
      } as unknown as Cita);
      n++;
    }
  }
  cacheCitas = out;
  return out;
}

/* ── Pedidos ────────────────────────────────────────────────────────────── */

let cachePedidos: Pedido[] | null = null;

export function pedidosDemo(companyId: string): Pedido[] {
  if (cachePedidos) return cachePedidos;

  const leads = leadsDemo(companyId);
  const porDia = leadsPorDia(leads);
  const out: Pedido[] = [];

  for (let n = 0; n < 34; n++) {
    const d = entre(0, 29);
    const fecha = dia(-d);
    fecha.setHours(entre(10, 20), entre(0, 59), 0, 0);
    /* Mismo motivo que en las citas: el pedido lo hace alguien que escribió ese
       día, o la conversión del dashboard sale plana. */
    const mismoDia = porDia.get(iso(fecha)) ?? [];
    const cuantos = entre(1, 3);
    const articulos = Array.from({ length: cuantos }, () => {
      const s = de(SERVICIOS);
      return { name: s.name, price: s.price, quantity: entre(1, 2), catalog_item_id: undefined };
    });
    const total = articulos.reduce((s, a) => s + a.price * a.quantity, 0);

    // Mayoría cobrados: la demo tiene que verse sana, pero con 4-5 sin cobrar
    // para que la pantalla de Pedidos tenga algo que hacer.
    const r = rnd();
    const status: OrderStatus = r < 0.68 ? 'paid' : r < 0.85 ? 'delivered' : 'pending';

    out.push({
      id: `demo-ped-${n}`,
      company_id: companyId,
      lead_id: (mismoDia.length ? mismoDia[n % mismoDia.length] : leads[(n * 5) % leads.length]).id,
      status,
      items: JSON.stringify(articulos),
      total,
      discount: 0,
      payment_method: de(['yape', 'plin', 'cash']),
      voucher_url: null,
      delivery_address: null,
      delivery_option: null,
      delivery_time: null,
      created_at: ts(fecha),
      created_ts: fecha.toISOString(),
      pagado_por: status === 'pending' ? '' : rnd() < 0.7 ? 'voucher' : 'panel',
      cumplido_por: status === 'delivered' ? 'panel' : '',
      articulos,
      creado: fecha,
    } as unknown as Pedido);
  }

  cachePedidos = out.sort((a, b) => (b.creado?.getTime() ?? 0) - (a.creado?.getTime() ?? 0));
  return cachePedidos;
}

/* ── Series y métricas ──────────────────────────────────────────────────── */

/**
 * Todas las series se derivan de `leadsDemo`, `citasDemo` y `pedidosDemo`, no
 * se inventan aparte. Es lo que hace que el dashboard y las métricas cuenten la
 * misma historia: si se generaran por separado, los ingresos del gráfico no
 * cuadrarían con los de la tarjeta y sería lo primero que alguien notaría.
 */
function ingresosPorFecha(companyId: string): Map<string, number> {
  const m = new Map<string, number>();
  const suma = (k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

  for (const p of pedidosDemo(companyId)) {
    if (p.status === 'paid' || p.status === 'delivered') suma(iso(p.creado!), p.total ?? 0);
  }
  for (const c of citasDemo(companyId)) {
    if (c.status === 'confirmed' || c.status === 'completed') {
      const s = SERVICIOS.find((x) => x.name === c.service);
      suma(iso(c.inicio!), s?.price ?? 40);
    }
  }
  return m;
}

export function metricasDemo(companyId: string, desde: string, hasta: string): DailyMetricRow[] {
  const leads = leadsDemo(companyId);
  const citas = citasDemo(companyId);
  const pedidos = pedidosDemo(companyId);
  const ingresos = ingresosPorFecha(companyId);
  const out: DailyMetricRow[] = [];

  for (let d = 29; d >= 0; d--) {
    const f = iso(dia(-d));
    if (f < desde || f > hasta) continue;
    out.push({
      company_id: companyId,
      date: f,
      leads: leads.filter((l) => l.creado && iso(l.creado) === f).length,
      paid_orders: pedidos.filter(
        (p) => p.creado && iso(p.creado) === f && (p.status === 'paid' || p.status === 'delivered'),
      ).length,
      revenue: ingresos.get(f) ?? 0,
      appointments: citas.filter(
        (c) => c.inicio && iso(c.inicio) === f && (c.status === 'confirmed' || c.status === 'completed'),
      ).length,
      escalations_pending: 0,
    });
  }
  return out;
}

export function leadsPorDiaDemo(companyId: string, desde: string): PuntoDia[] {
  const leads = leadsDemo(companyId);
  const m = new Map<string, number>();
  for (const l of leads) {
    if (!l.creado) continue;
    const k = iso(l.creado);
    if (k < desde) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort().map(([date, count]) => ({ date, count }));
}

export function ingresosPorDiaDemo(companyId: string, desde: string): PuntoIngreso[] {
  return [...ingresosPorFecha(companyId).entries()]
    .filter(([date]) => date >= desde)
    .sort()
    .map(([date, revenue]) => ({ date, revenue }));
}

export function pedidosPorDiaDemo(companyId: string, desde: string): PuntoPedidos[] {
  const m = new Map<string, { count: number; revenue: number }>();
  for (const p of pedidosDemo(companyId)) {
    if (!p.creado || (p.status !== 'paid' && p.status !== 'delivered')) continue;
    const k = iso(p.creado);
    if (k < desde) continue;
    const a = m.get(k) ?? { count: 0, revenue: 0 };
    m.set(k, { count: a.count + 1, revenue: a.revenue + (p.total ?? 0) });
  }
  return [...m.entries()].sort().map(([date, v]) => ({ date, ...v }));
}

export function intencionPorDiaDemo(companyId: string, desde: string): PuntoIntencion[] {
  const m = new Map<string, number>();
  for (const l of leadsDemo(companyId)) {
    if (!l.creado) continue;
    const k = iso(l.creado);
    if (k < desde) continue;
    m.set(`${k}|${l.intent}`, (m.get(`${k}|${l.intent}`) ?? 0) + 1);
  }
  return [...m.entries()].map(([k, count]) => {
    const [date, intent] = k.split('|');
    return { date, intent: intent as LeadIntent, count };
  });
}

export function productosDemo(companyId: string): ProductoIngreso[] {
  const m = new Map<string, { revenue: number; units: number }>();
  for (const c of citasDemo(companyId)) {
    if (c.status !== 'confirmed' && c.status !== 'completed') continue;
    const s = SERVICIOS.find((x) => x.name === c.service);
    if (!s) continue;
    const a = m.get(s.name) ?? { revenue: 0, units: 0 };
    m.set(s.name, { revenue: a.revenue + s.price, units: a.units + 1 });
  }
  for (const p of pedidosDemo(companyId)) {
    if (p.status !== 'paid' && p.status !== 'delivered') continue;
    for (const a of p.articulos) {
      const x = m.get(a.name) ?? { revenue: 0, units: 0 };
      m.set(a.name, { revenue: x.revenue + a.price * a.quantity, units: x.units + a.quantity });
    }
  }
  return [...m.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** Mapa de calor: horas punta a media mañana y a la salida del trabajo. */
export function actividadDemo(): number[][] {
  return Array.from({ length: 7 }, (_, d) =>
    Array.from({ length: 24 }, (_, h) => {
      if (d === 6) return h >= 10 && h <= 14 ? entre(2, 8) : 0;
      if (h < 8 || h > 21) return 0;
      const punta = h === 11 || h === 12 || h === 18 || h === 19;
      return punta ? entre(9, 22) : entre(1, 8);
    }),
  );
}

/* ── Retargeting ────────────────────────────────────────────────────────── */

const MOTIVOS_DEMO = [
  { motivo: 'voucher-sin-verificar', detalle: 'Mandó el Yape de S/ 120 y nadie lo revisó', monto: 120, prioridad: 0 },
  { motivo: 'pedido-sin-pagar', detalle: 'Pack novio apartado, sin pagar', monto: 180, prioridad: 1 },
  { motivo: 'carrito', detalle: 'Corte + barba en el carrito', monto: 55, prioridad: 3 },
  { motivo: 'cupo-elegido', detalle: 'Eligió el jueves 19:00 y no confirmó', monto: 35, prioridad: 4 },
  { motivo: 'cita-a-medias', detalle: 'Preguntó por coloración, no cerró', monto: 120, prioridad: 5 },
  { motivo: 'cliente-dormido', detalle: 'Venía cada 3 semanas, lleva 8 sin aparecer', monto: 0, prioridad: 6 },
];

export function retargetingDemo(companyId: string, negocio: string): RetargetingRow[] {
  const leads = leadsDemo(companyId);
  return MOTIVOS_DEMO.flatMap((m, i) =>
    Array.from({ length: i < 2 ? 1 : 2 }, (_, k) => {
      const l = leads[(i * 11 + k * 3) % leads.length];
      const compras = entre(0, 4);
      return {
        lead_id: `${l.id}-rt-${k}`,
        company_id: companyId,
        negocio,
        nombre: l.name ?? '',
        telefono: l.phone,
        estado: m.motivo === 'cliente-dormido' ? 'dormant' : compras > 0 ? 'customer' : 'ready',
        intent: 'purchase_ready',
        motivo: m.motivo,
        motivos: JSON.stringify([m.motivo]),
        detalle: m.detalle,
        monto: m.monto,
        n_compras: compras,
        total_gastado: compras * entre(35, 120),
        ultimo_item: compras ? de(SERVICIOS).name : '',
        ultima_actividad: ts(dia(-entre(1, 25))),
        cadencia_dias: compras > 1 ? entre(14, 45) : 0,
        mensaje: `Hola ${(l.name ?? '').split(' ')[0]}, te escribo del salón…`,
        wa_link: `https://wa.me/${l.phone}?text=Hola`,
        contactado_at: rnd() < 0.25 ? ts(dia(-entre(1, 6))) : 0,
        prioridad: m.prioridad,
        actualizado_at: ts(new Date(Date.now() - 6 * 60000)),
      } as RetargetingRow;
    }),
  ).sort((a, b) => a.prioridad - b.prioridad || b.monto - a.monto);
}

/* ── Mensajes y medios ──────────────────────────────────────────────────── */

export function mensajesDemo(leadId: string): Mensaje[] {
  const guion: [string, 'user' | 'assistant'][] = [
    ['Hola, buenas tardes 👋', 'user'],
    ['¡Hola! Soy Mia 😊 ¿En qué te ayudo?', 'assistant'],
    ['¿Tienen cupo para el sábado en la mañana?', 'user'],
    ['Sí, tengo 10:00 y 11:30 con Marco. ¿Cuál te viene mejor?', 'assistant'],
    ['El de 11:30 porfa', 'user'],
    ['Listo, te lo aparto. ¿A tu nombre?', 'assistant'],
    ['Sí, gracias!', 'user'],
  ];
  const base = Date.now() - guion.length * 4 * 60000;
  return guion.map((g, i) => {
    const f = new Date(base + i * 4 * 60000);
    return {
      id: `demo-msg-${leadId}-${i}`,
      lead_id: leadId,
      role: g[1],
      content: g[0],
      created_at: ts(f),
      created_ts: f.toISOString(),
      creado: f,
    } as unknown as Mensaje;
  });
}

/** Sin fotos: una URL inventada daría imágenes rotas, que es peor que ninguna. */
export const mediosDemo = (): Record<string, CatalogMediaRow[]> => ({});

/**
 * Horario garantizado para que la rejilla de la agenda tenga filas.
 *
 * Se impone SIEMPRE en modo demo, y no solo cuando el negocio no tiene horario:
 * una demo con la rejilla vacía porque el negocio real cierra los martes no
 * enseña nada. Es seguro porque en modo demo no se puede guardar nada —
 * `useComando()` rechaza todos los comandos.
 */
export const horarioDemo = (): Horario => ({
  monday: { open: '09:00', close: '20:00', capacity: 2 },
  tuesday: { open: '09:00', close: '20:00', capacity: 2 },
  wednesday: { open: '09:00', close: '20:00', capacity: 2 },
  thursday: { open: '09:00', close: '20:00', capacity: 2 },
  friday: { open: '09:00', close: '21:00', capacity: 3 },
  saturday: { open: '10:00', close: '18:00', capacity: 3 },
});
