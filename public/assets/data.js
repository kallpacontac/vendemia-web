/* ═══════════════════════════════════════════════════════════════
   VENDEMIA · Capa de datos compartida (mock barbería + API)
   Modo: localStorage 'vendemia_mode' = 'mock' | 'api'
   Alineado al OpenAPI de KallpaBot (business_mode: appointment)
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
  const MODE  = localStorage.getItem('vendemia_mode') || 'mock';
  const BASE  = (localStorage.getItem('vendemia_api_base') || '').replace(/\/$/, '');
  const TOKEN = localStorage.getItem('vendemia_api_token') || '';

  /* ── Utilidades ──────────────────────────────────────────── */
  const soles = n => 'S/ ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 0 });
  const pad = n => String(n).padStart(2, '0');
  const daysAgo = d => { const t = new Date(); t.setDate(t.getDate() - d); return t; };
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  /* Colores por intención (OpenAPI intent) */
  const INTENT = {
    purchase_ready: { label: 'Listo p/ comprar', cls: 'b-hot',  color: '#FF4757', short: 'Caliente' },
    quote:          { label: 'Cotizando',        cls: 'b-warm', color: '#FFA502', short: 'Tibio'   },
    inquiry:        { label: 'Consulta',         cls: 'b-info', color: '#3B82F6', short: 'Consulta'},
    support:        { label: 'Soporte',          cls: 'b-mute', color: '#8B93A7', short: 'Soporte' },
    other:          { label: 'Otro',             cls: 'b-mute', color: '#A0AEC0', short: 'Otro'    }
  };
  const STATUS = {
    new:       { label: 'Nuevo',      color: '#3B82F6' },
    contacted: { label: 'Contactado', color: '#FFA502' },
    paid:      { label: 'Pagado',     color: '#2ED573' },
    closed:    { label: 'Cerrado',    color: '#A0AEC0' }
  };

  /* ── MOCK: Barbería El Corte (appointment) ───────────────── */
  const initials = name => name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const palette = ['#F58220', '#FF4757', '#00C48C', '#3B82F6', '#A78BFA', '#FFA502', '#2DD4BF', '#EC4899'];

  const company = {
    id: 'demo-barberia', name: 'Barbería El Corte', bot_name: 'Mia', business_mode: 'appointment',
    bot_tone: 'cercano, directo y con jerga peruana', location: 'Av. Larco 345, Miraflores, Lima',
    owner_phone: '+51 987 000 111', admin_phone: '+51 987 000 111', whatsapp_phone: '+51 987 000 111',
    slot_minutes: 45, delivery_type: 'pickup', plan: 'starter', is_active: 1, company_code: 'ELCORTE',
    business_description: 'Barbería de cortes clásicos y modernos, arreglo de barba y diseño.',
    custom_rules: 'Confirmar siempre día y hora. Recordar llegar 5 min antes. No atender sin cita en hora punta.',
    return_policy: 'Reprogramación gratuita hasta 3h antes de la cita.',
    google_calendar_id: '', sales_mode: 'spin', request_location: 1, require_payment_to_confirm: 0,
    delivery_fee: 0, delivery_days_ahead: -1, express_fee: 10, express_cutoff_hour: 14, normal_fee: 0, normal_cutoff_hour: null,
    proactive_venue: 1, plan_label: 'Starter',
    buy_signals: ['quiero', 'reservar', 'agendar', 'cita', 'cuánto', 'precio', 'hoy', 'mañana', 'sábado', 'disponible', 'yape'],
    closing_ctas: ['¿Te agendo la cita? 💈', '¿Confirmo tu reserva?', null],
    qualifying_questions: [
      { id: 'q1', question: '¿Para qué servicio buscas cita?', required: true },
      { id: 'q2', question: '¿Qué día y hora te acomoda?', required: true }
    ],
    created_at: Math.floor(Date.now() / 1000)
  };

  /* Schedule (horario de atención semanal) */
  const schedule = {
    monday:    { open: '09:00', close: '21:00', closed: false, slot_minutes: 45, capacity: 2 },
    tuesday:   { open: '09:00', close: '21:00', closed: false, slot_minutes: 45, capacity: 2 },
    wednesday: { open: '09:00', close: '21:00', closed: false, slot_minutes: 45, capacity: 2 },
    thursday:  { open: '09:00', close: '21:00', closed: false, slot_minutes: 45, capacity: 2 },
    friday:    { open: '09:00', close: '22:00', closed: false, slot_minutes: 45, capacity: 3 },
    saturday:  { open: '08:00', close: '20:00', closed: false, slot_minutes: 45, capacity: 3 },
    sunday:    { open: '10:00', close: '14:00', closed: true,  slot_minutes: 45, capacity: 1 }
  };

  /* Métodos de pago (PaymentMethod[]) */
  const payments = [
    { type: 'yape', number: '987 000 111', name: 'Álvaro Ruiz', qr_url: '' },
    { type: 'plin', number: '987 000 111', name: 'Álvaro Ruiz', qr_url: '' },
    { type: 'cash', number: '', name: 'Efectivo en local', qr_url: '' }
  ];

  /* Form templates (preguntas del formulario) */
  const formTemplates = [
    { id: 'f1', field_name: 'name',         question: '¿A nombre de quién agendo la cita? 💈' },
    { id: 'f2', field_name: 'phone',        question: '¿Me confirmas tu número de WhatsApp?' },
    { id: 'f3', field_name: 'deliveryDate', question: '¿Qué día y hora te viene bien? 📅' }
  ];

  const catalog = [
    { id: 's1', name: 'Corte clásico',     price: 25, capacity: 1, slot_minutes: 45, discovery_questions: ['¿Qué estilo buscas?'] },
    { id: 's2', name: 'Corte + barba',     price: 40, capacity: 1, slot_minutes: 60 },
    { id: 's3', name: 'Afeitado a navaja', price: 30, capacity: 1, slot_minutes: 30 },
    { id: 's4', name: 'Corte niño',        price: 20, capacity: 1, slot_minutes: 30 },
    { id: 's5', name: 'Diseño + tinte',    price: 70, capacity: 1, slot_minutes: 90 }
  ];

  /* Grupos horarios recurrentes (schedule slots) */
  const slots = [
    { id: 'm1',  itemId: 's1', label: 'Mañanas L–V', days: [1, 2, 3, 4, 5], time: '09:00', capacity: 6, booked: 4 },
    { id: 'm2',  itemId: 's1', label: 'Tardes L–V',  days: [1, 2, 3, 4, 5], time: '15:00', capacity: 6, booked: 6 },
    { id: 's1s', itemId: 's2', label: 'Sábado AM',   days: [6],             time: '09:00', capacity: 8, booked: 5 },
    { id: 's2s', itemId: 's2', label: 'Sábado PM',   days: [6],             time: '15:00', capacity: 8, booked: 1 }
  ];

  const rawLeads = [
    ['María Ramos',  '+51 987 654 321', 'purchase_ready', 'new',       1, 'hace 2 min', '¿tienen cupo para hoy 4pm?'],
    ['Carlos López', '+51 976 543 210', 'quote',          'contacted', 1, 'hace 8 min', 'quiero corte + barba el sábado'],
    ['José Díaz',    '+51 965 111 222', 'inquiry',        'new',       0, 'hace 22 min','cuánto está el afeitado a navaja'],
    ['Ana Torres',   '+51 954 333 444', 'quote',          'contacted', 1, 'hace 1 h',   'me confirmas mi cita porfa'],
    ['Luis Vega',    '+51 943 555 666', 'purchase_ready', 'paid',      1, 'hace 2 h',   'listo, ya te hago el yape'],
    ['Rosa Núñez',   '+51 932 777 888', 'support',        'contacted', 0, 'hace 3 h',   'necesito reprogramar mi cita'],
    ['Pedro Salas',  '+51 921 999 000', 'inquiry',        'new',       1, 'hace 5 h',   '¿atienden domingos?'],
    ['Diana Gómez',  '+51 910 121 314', 'purchase_ready', 'paid',      1, 'ayer',       'perfecto, nos vemos mañana'],
    ['Marco Ruiz',   '+51 900 151 617', 'quote',          'new',       1, 'ayer',       'cuánto el diseño + tinte'],
    ['Elena Paz',    '+51 989 181 920', 'other',          'closed',    1, 'hace 2 d',   'gracias!']
  ];
  const leads = rawLeads.map((r, i) => ({
    id: 'l' + (i + 1), company_id: company.id, name: r[0], phone: r[1], customer_phone: r[1], customer_address: '',
    intent: r[2], status: r[3], bot_active: r[4], lastTime: r[5], last_message: r[6],
    handoff_at: r[4] === 0 ? Math.floor(daysAgo(0).getTime() / 1000) - 1800 : null,
    initials: initials(r[0]), color: palette[i % palette.length],
    created_at: Math.floor(daysAgo(i < 4 ? 0 : i).getTime() / 1000),
    customer_notes: ''
  }));

  /* Conversaciones (Message[]) para algunos leads */
  const convos = {
    l1: [
      { role: 'assistant', content: '¡Hola! Soy Mia, la asistente de Barbería El Corte 💈 ¿En qué te ayudo?', time: '10:21' },
      { role: 'user',      content: '¿tienen cupo para hoy 4pm?', time: '10:22' },
      { role: 'assistant', content: '¡Justo tenemos un espacio a las 4:00pm! ¿Sería *Corte clásico* (S/25) o *Corte + barba* (S/40)?', time: '10:22' },
      { role: 'user',      content: 'corte + barba', time: '10:23' },
      { role: 'assistant', content: 'Perfecto ✂️ Te agendo *Corte + barba* hoy 4:00pm con nosotros en Av. Larco 345. ¿Me confirmas tu nombre?', time: '10:23' }
    ],
    l2: [
      { role: 'assistant', content: '¡Hola! ¿Para qué día buscas tu cita? 😊', time: '09:02' },
      { role: 'user',      content: 'quiero corte + barba el sábado', time: '09:03' },
      { role: 'assistant', content: 'El sábado tenemos turnos AM (9am) y PM (3pm). ¿Cuál prefieres?', time: '09:03' }
    ],
    l4: [
      { role: 'user',      content: 'me confirmas mi cita porfa', time: '08:40' },
      { role: 'assistant', content: 'Claro Ana 🙌 Tu cita es mañana 3:00pm — *Corte clásico*. ¡Te esperamos!', time: '08:41' }
    ]
  };

  /* Citas (Appointment[]) */
  const H = new Date();
  const appointments = [
    { id: 'a1', lead_id: 'l1', lead_name: 'María Ramos',  service: 'Corte + barba',     slot_start: `${iso(H)} 16:00`, slot_minutes: 60, status: 'confirmed', price: 40 },
    { id: 'a2', lead_id: 'l4', lead_name: 'Ana Torres',   service: 'Corte clásico',     slot_start: `${iso(daysAgo(-1))} 15:00`, slot_minutes: 45, status: 'confirmed', price: 25 },
    { id: 'a3', lead_id: 'l5', lead_name: 'Luis Vega',    service: 'Afeitado a navaja', slot_start: `${iso(H)} 11:30`, slot_minutes: 30, status: 'completed', price: 30 },
    { id: 'a4', lead_id: 'l8', lead_name: 'Diana Gómez',  service: 'Diseño + tinte',    slot_start: `${iso(daysAgo(-1))} 10:00`, slot_minutes: 90, status: 'confirmed', price: 70 },
    { id: 'a5', lead_id: 'l6', lead_name: 'Rosa Núñez',   service: 'Corte clásico',     slot_start: `${iso(H)} 09:00`, slot_minutes: 45, status: 'cancelled', price: 25 },
    { id: 'a6', lead_id: 'l9', lead_name: 'Marco Ruiz',   service: 'Corte + barba',     slot_start: `${iso(H)} 17:30`, slot_minutes: 60, status: 'confirmed', price: 40 }
  ];

  /* Órdenes de producto (pocas — pomadas/ceras) */
  const orders = [
    { id: 'o1', lead_id: 'l5', lead_name: 'Luis Vega',   items: '[{"name":"Cera mate","quantity":1,"price":35}]', total: 35, status: 'paid', payment_method: 'yape', created_at: Math.floor(daysAgo(0).getTime()/1000) },
    { id: 'o2', lead_id: 'l8', lead_name: 'Diana Gómez', items: '[{"name":"Shampoo barba","quantity":1,"price":28}]', total: 28, status: 'paid', payment_method: 'plin', created_at: Math.floor(daysAgo(0).getTime()/1000) }
  ];

  /* Calendario tipo Calendly (CalendarAppointment) generado desde el schedule */
  const NOW_HOUR = 13; // "ahora" simulado para marcar pasado/futuro hoy
  function buildCalendar(weekOffset = 0) {
    const today = new Date(2026, 6, 31); today.setHours(0, 0, 0, 0);
    const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7);
    const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const services = ['Corte clásico', 'Corte + barba', 'Afeitado a navaja', 'Diseño + tinte', 'Corte niño'];
    const clients = ['María Ramos', 'Carlos López', 'José Díaz', 'Ana Torres', 'Luis Vega', 'Marco Ruiz', 'Diana Gómez', 'Pedro Salas'];
    const barbers = ['Álvaro', 'Kevin', 'Diego'];
    const days = [], bookings = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday); d.setDate(monday.getDate() + i);
      const dk = dayKeys[d.getDay()], sch = schedule[dk] || { closed: true, open: '09:00', close: '21:00', capacity: 2 };
      const openH = parseInt(sch.open), closeH = parseInt(sch.close);
      const isPastDay = d < today, isToday = d.getTime() === today.getTime();
      const slots = hours.map(h => {
        const closed = sch.closed || h < openH || h >= closeH;
        const cap = closed ? 0 : (sch.capacity || 2);
        const past = isPastDay || (isToday && h < NOW_HOUR);
        // ocupación determinista: tardes llenas, mediodía media, mañanas baja
        let booked = 0;
        if (!closed) booked = h >= 16 ? cap : (h >= 12 && h < 15 ? Math.min(cap, 1) : ((h + i + weekOffset) % 3 === 0 ? 1 : 0));
        const spotsLeft = Math.max(0, cap - booked);
        const slotStart = `${iso(d)} ${pad(h)}:00`;
        for (let b = 0; b < booked; b++) {
          bookings.push({ date: iso(d), slotStart, slotEnd: `${iso(d)} ${pad(h + 1)}:00`,
            service: services[(h + i + b) % services.length], client: clients[(h + i + b) % clients.length], employee: barbers[b % barbers.length] });
        }
        return { slotStart, time: `${pad(h)}:00`, capacity: cap, booked, spotsLeft, available: !closed && !past && spotsLeft > 0, closed, past };
      });
      days.push({ date: iso(d), weekday: d.toLocaleDateString('es-PE', { weekday: 'long' }), isToday, slots });
    }
    return { type: 'appointment', slotMinutes: 60, days, bookings };
  }
  const calendar = buildCalendar();

  const metrics = { leads_today: 47, purchase_ready: 9, quote: 14, orders_paid: 12, revenue_today: 1240, conversion: 25.5, resp_avg: 2.4 };

  /* Analytics: 30 días */
  const leadsByDay = Array.from({ length: 30 }, (_, i) => {
    const d = daysAgo(29 - i);
    const base = 18 + Math.round(14 * Math.sin(i / 3)) + (d.getDay() === 6 ? 16 : 0) + Math.round(Math.random() * 8);
    return { date: iso(d), count: Math.max(6, base) };
  });
  const ordersByDay = leadsByDay.map(p => ({ date: p.date, count: Math.round(p.count * 0.26), revenue: Math.round(p.count * 0.26) * 38 }));
  const intentDist = [
    { intent: 'purchase_ready', count: 78 }, { intent: 'quote', count: 112 },
    { intent: 'inquiry', count: 64 }, { intent: 'support', count: 31 }, { intent: 'other', count: 19 }
  ];
  /* Heatmap 7×12 (día × franja 9–21h) */
  const heat = Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 12 }, (_, h) => {
      const hour = 9 + h;
      let v = 2 + Math.round(6 * Math.exp(-Math.pow(hour - 17, 2) / 22));
      if (day === 6) v += 4; if (day === 0) v = Math.round(v * 0.4);
      return Math.max(0, v + Math.round((Math.random() - 0.5) * 3));
    })
  );

  /* ProductRevenueRow[] — ingresos por servicio */
  const productRevenue = [
    { catalog_item_id: 's2', name: 'Corte + barba',     units: 34, revenue: 1360, source: 'appointment', attributed_by: 'id' },
    { catalog_item_id: 's1', name: 'Corte clásico',     units: 62, revenue: 1550, source: 'appointment', attributed_by: 'id' },
    { catalog_item_id: 's5', name: 'Diseño + tinte',    units: 12, revenue: 840,  source: 'appointment', attributed_by: 'id' },
    { catalog_item_id: 's3', name: 'Afeitado a navaja', units: 21, revenue: 630,  source: 'appointment', attributed_by: 'id' },
    { catalog_item_id: 's4', name: 'Corte niño',        units: 15, revenue: 300,  source: 'appointment', attributed_by: 'id' }
  ];

  const whatsapp = { connected: true, needs_qr: false };
  const escalations = [
    { id: 'e1', lead_id: 'l6', lead_name: 'Rosa Núñez', lead_phone: '+51 932 777 888', kind: 'paid_reschedule', detail: 'Quiere mover su cita del sábado a la próxima semana', status: 'pending', created_at: Math.floor(daysAgo(0).getTime() / 1000) - 5400 },
    { id: 'e2', lead_id: 'l3', lead_name: 'José Díaz',  lead_phone: '+51 965 111 222', kind: 'paid_order_cancel', detail: 'Pide cancelar y reembolso del afeitado', status: 'pending', created_at: Math.floor(daysAgo(0).getTime() / 1000) - 9000 }
  ];

  const MOCK = { company, catalog, slots, leads, convos, appointments, orders, metrics,
    leadsByDay, ordersByDay, intentDist, heat, productRevenue, whatsapp, escalations,
    schedule, payments, formTemplates, calendar };

  /* ── API helpers ─────────────────────────────────────────── */
  function headers() {
    const h = { 'Content-Type': 'application/json' };
    if (TOKEN) { h['Authorization'] = 'Bearer ' + TOKEN; h['x-api-key'] = TOKEN; }
    return h;
  }
  async function apiGet(path) {
    const res = await fetch(BASE + path, { headers: headers() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }
  async function apiSend(path, method, body) {
    if (MODE !== 'api') return { ok: true, mock: true, body }; // mock: no-op
    const res = await fetch(BASE + path, { method, headers: headers(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }
  function companyId() { return localStorage.getItem('vendemia_company') || (MOCK.company.id); }

  /* ── API pública (promesas; mock resuelve local) ─────────── */
  const api = {
    mode: MODE,
    async company()      { return MODE === 'api' ? apiGet(`/api/companies/${companyId()}`) : MOCK.company; },
    async catalog()      { return MODE === 'api' ? apiGet(`/api/companies/${companyId()}/catalog`) : MOCK.catalog; },
    async slots()        { return MODE === 'api' ? apiGet(`/api/companies/${companyId()}/calendar`).then(r => r.groups || []) : MOCK.slots; },
    async leads()        { return MODE === 'api' ? apiGet(`/api/companies/${companyId()}/leads`) : MOCK.leads; },
    async messages(id)   { return MODE === 'api' ? apiGet(`/api/companies/${companyId()}/leads/${id}/messages`) : (MOCK.convos[id] || []); },
    async appointments() { return MODE === 'api' ? apiGet(`/api/companies/${companyId()}/appointments`) : MOCK.appointments; },
    async orders()       { return MODE === 'api' ? apiGet(`/api/companies/${companyId()}/orders`) : MOCK.orders; },
    async metrics()      { return MODE === 'api' ? apiGet(`/api/companies/${companyId()}/metrics/daily`) : MOCK.metrics; },
    async analytics()    { return MODE === 'api' ? apiGet(`/api/companies/${companyId()}/analytics`) : { leadsByDay: MOCK.leadsByDay, ordersByDay: MOCK.ordersByDay, intentDist: MOCK.intentDist, heat: MOCK.heat }; },
    async whatsapp()     { return MODE === 'api' ? apiGet(`/api/companies/${companyId()}/whatsapp/status`) : MOCK.whatsapp; },
    async escalations()  { return MODE === 'api' ? apiGet(`/api/companies/${companyId()}/escalations`) : MOCK.escalations; },
    async schedule()     { return MODE === 'api' ? apiGet(`/api/companies/${companyId()}/schedule`) : MOCK.schedule; },
    async payments()     { return MODE === 'api' ? apiGet(`/api/companies/${companyId()}/payment-methods`) : MOCK.payments; },
    async formTemplates(){ return MODE === 'api' ? apiGet(`/api/companies/${companyId()}/form-templates`) : MOCK.formTemplates; },
    async calendar(weekOffset) { return MODE === 'api' ? apiGet(`/api/companies/${companyId()}/calendar?days=14`) : buildCalendar(weekOffset || 0); },
    async calendarPublic(weekOffset){ return MODE === 'api' ? apiGet(`/public/${companyId()}/calendar?days=14`) : buildCalendar(weekOffset || 0); },
    async productRevenue(){ return MODE === 'api' ? apiGet(`/api/companies/${companyId()}/analytics/product-revenue`) : MOCK.productRevenue; },
    /* Escrituras (en mock solo devuelven el payload; en API hacen PATCH/PUT) */
    async saveCompany(patch)  { return apiSend(`/api/companies/${companyId()}`, 'PATCH', patch); },
    async saveLead(id, patch) { return apiSend(`/api/companies/${companyId()}/leads/${id}`, 'PATCH', patch); },
    async resolveEscalation(id){ return apiSend(`/api/companies/${companyId()}/escalations/${id}`, 'PATCH', { status: 'resolved' }); },
    async saveSchedule(s)     { return apiSend(`/api/companies/${companyId()}/schedule`, 'PUT', s); },
    async savePayments(p)     { return apiSend(`/api/companies/${companyId()}/payment-methods`, 'PUT', p); },
    async saveCatalog(item)   { return apiSend(`/api/companies/${companyId()}/catalog`, 'POST', item); },
    async generateConfig(domain, fields) { return apiSend(`/api/companies/${companyId()}/generate-config`, 'POST', { business_domain: domain, fields }); },
    _mock: MOCK
  };

  /* ── Sidebar compartido ──────────────────────────────────── */
  const NAV = [
    { key: 'dashboard', href: 'dashboard.html',     icon: 'layout-dashboard', tip: 'Dashboard' },
    { key: 'mensajes',  href: 'mensajes.html',      icon: 'message-circle',   tip: 'Mensajes', badge: 3 },
    { key: 'leads',     href: 'leads.html',         icon: 'users',            tip: 'Leads' },
    { key: 'agenda',    href: 'agenda.html',        icon: 'calendar-days',    tip: 'Agenda' },
    { key: 'metricas',  href: 'metricas.html',      icon: 'bar-chart-2',      tip: 'Métricas' },
    { key: 'config',    href: 'configuracion.html', icon: 'settings',         tip: 'Ajustes' }
  ];
  function renderSidebar(active) {
    const el = document.getElementById('sidebar');
    if (!el) return;
    el.className = 'sidebar';
    el.innerHTML =
      `<div class="sidebar__brand"><img src="./assets/logos/logo-principal.webp" alt="Vendemia"></div>
       <nav class="sidebar__nav">${NAV.map(n =>
        `<a class="nav-item ${n.key === active ? 'active' : ''}" href="./${n.href}">
           <span class="ico"><i data-lucide="${n.icon}"></i></span>
           <span>${n.tip}</span>
           ${n.badge ? `<span class="badge">${n.badge}</span>` : ''}
         </a>`).join('')}
       </nav>
       <div class="sidebar__foot">
         <div class="sidebar__promo">
           <div class="ic"><i data-lucide="sparkles"></i></div>
           <p>Desbloquea reportes y automatizaciones con <b>Vendemia Pro</b></p>
           <button onclick="location.href='./metricas.html'">Descubrir Pro</button>
         </div>
         <div class="sidebar__logout" onclick="location.href='./login.html'"><i data-lucide="log-out"></i> Cerrar sesión</div>
       </div>`;
    if (global.lucide) lucide.createIcons();
  }

  /* ── Helpers de gráficos SVG ─────────────────────────────── */
  /* Ruta suavizada (Catmull-Rom → Bézier) por puntos [{x,y}] */
  function smoothPath(pts) {
    if (pts.length < 2) return '';
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x},${p2.y}`;
    }
    return d;
  }
  /* Serie → puntos en viewBox W×H */
  function seriesPts(values, W, H, pad = 6) {
    const max = Math.max(...values) || 1, min = Math.min(...values, 0);
    const n = values.length;
    return values.map((v, i) => ({
      x: +(i * (W / (n - 1))).toFixed(1),
      y: +(H - pad - (v - min) / (max - min || 1) * (H - pad * 2)).toFixed(1)
    }));
  }
  /* Count-up animado */
  function countUp(el, target, opts = {}) {
    const dur = opts.duration || 1300, dec = opts.decimals || 0, suf = opts.suffix || '', pre = opts.prefix || '';
    const t0 = performance.now();
    (function tick(now) {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = pre + (target * e).toFixed(dec) + suf;
      if (p < 1) requestAnimationFrame(tick); else el.textContent = pre + target.toFixed(dec) + suf;
    })(t0);
  }

  global.VD = { api, MODE, INTENT, STATUS, renderSidebar, smoothPath, seriesPts, countUp, soles, initials };
})(window);
