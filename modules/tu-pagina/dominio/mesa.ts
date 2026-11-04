/**
 * Plantilla «Atención en mesa»: lo que se pide desde el QR de una mesa (sql/0015).
 *
 * Nada de esto entra al POS del restaurante: son avisos para el mozo, que sigue
 * comandando y emitiendo comprobantes en su sistema. Por eso aquí no hay stock ni
 * caja, y el DNI o RUC solo viajan para que él lleve la cuenta.
 */
export type Idioma = 'es' | 'en' | 'pt';
export type TipoLlamado = 'mozo' | 'cuenta' | 'requerimiento' | 'pedido' | 'sugerencia' | 'felicitacion';
export type Comprobante = 'boleta' | 'factura';

export const TOKEN_MESA = /^[A-Za-z0-9_-]{10,40}$/;

/** Lo que lleva el QR impreso, tras el host: `<negocio>/mesa/<token>`. */
export const rutaMesa = (slug: string, token: string) => `${slug}/mesa/${token}`;

/** El token, desde lo que lee la cámara. null si ese QR no es de una mesa. */
export const tokenDeUrl = (texto: string): string | null => {
  const m = texto.match(/\/mesa\/([A-Za-z0-9_-]{10,40})(?:[/?#]|$)/);
  return m ? m[1] : null;
};

export const nombreMesa = (m: { salon: string; numero: string }) =>
  m.salon ? `${m.salon} · Mesa ${m.numero}` : `Mesa ${m.numero}`;

export const documentoValido = (comprobante: Comprobante, documento: string) =>
  comprobante === 'factura' ? /^\d{11}$/.test(documento) : /^(\d{8})?$/.test(documento);

/* ── Lo que el dueño ajusta de cada plato ──────────────────────────────────── */

/** secciones.carta: id del catálogo → sus ajustes. Sin migración: vive en la página. */
export interface AjustePlato {
  destacado?: boolean;
  /** Precio de antes, tachado junto al de hoy. */
  antes?: number;
  /** Franja en que se sirve, 'HH:MM'. `hasta` antes que `desde`: pasa de medianoche. */
  desde?: string;
  hasta?: string;
  /** Nombre en inglés. Sin él, el plato sale con su nombre en español. */
  en?: string;
}
export type AjustesCarta = Record<string, AjustePlato>;

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));

/** Solo lo que sirve de cada plato y de los que siguen en el catálogo: secciones es público. */
export function limpiarAjustes(ajustes: AjustesCarta, ids: string[]): AjustesCarta {
  const fuera: AjustesCarta = {};
  for (const id of ids) {
    const a = ajustes[id];
    if (!a) continue;
    const limpio: AjustePlato = {};
    if (a.destacado) limpio.destacado = true;
    if (typeof a.antes === 'number' && a.antes > 0) limpio.antes = a.antes;
    if (a.desde && a.hasta && HORA.test(a.desde) && HORA.test(a.hasta) && a.desde !== a.hasta) {
      limpio.desde = a.desde;
      limpio.hasta = a.hasta;
    }
    if (a.en?.trim()) limpio.en = a.en.trim().slice(0, 120);
    if (Object.keys(limpio).length) fuera[id] = limpio;
  }
  return fuera;
}

/** La hora de Lima en minutos, sea cual sea la zona del celular (un turista trae la suya). */
export function minutosEnLima(ahora = new Date()): number {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ahora);
  return minutos(p);
}

export function seSirveAhora(a: AjustePlato | undefined, ahora: number): boolean {
  if (!a?.desde || !a.hasta) return true;
  const desde = minutos(a.desde);
  const hasta = minutos(a.hasta);
  return desde < hasta ? ahora >= desde && ahora < hasta : ahora >= desde || ahora < hasta;
}

/* ── Los textos de la mesa ─────────────────────────────────────────────────── */

const ES = {
  pregunta: '¿Qué necesitas?',
  verCarta: 'Ver la carta', verCartaSub: 'Menú y precios, y arma tu pedido',
  mozo: 'Llamar al mesero', mozoSub: 'Que se acerque a la mesa',
  cuenta: 'Pedir la cuenta', cuentaSub: 'Boleta o factura',
  otro: 'Otro pedido', otroSub: 'Cuéntanos qué necesitas',
  sugerencia: 'Sugerencias', sugerenciaSub: 'Queremos saber cómo mejorar',
  felicitacion: 'Felicitaciones', felicitacionSub: 'Déjanos un comentario positivo',
  volver: 'Volver', enviando: 'Enviando…',
  dividir: 'Dividir la cuenta', dividirSub: 'Cuentas separadas: el mozo se acerca a coordinar',
  dividirNota: 'El mozo se acercará para tomar cada cuenta por separado.',
  comoComprobante: '¿Cómo quieres tu comprobante?', boleta: 'Boleta', factura: 'Factura',
  dni: 'DNI (opcional)', dniAyuda: 'Si lo dejas vacío, igual te llevamos la cuenta.',
  ruc: 'RUC (11 dígitos)', rucAyuda: 'Necesario para emitir la factura.',
  errDni: 'El DNI debe tener 8 dígitos, o déjalo vacío.', errRuc: 'El RUC debe tener 11 dígitos.',
  otroEjemplo: 'Ej.: más servilletas, otra silla, bajar el volumen…',
  otroAyuda: 'Opcional: puedes enviarlo en blanco y alguien se acercará.', enviarAviso: 'Enviar aviso',
  tuSugerencia: 'Tu sugerencia', sugerenciaAyuda: '¿Qué podemos mejorar? Lo lee la gerencia.',
  sugerenciaEjemplo: 'Escríbelo con confianza.', quieroRespuesta: 'Quiero que me respondan (opcional)',
  tuNombre: 'Tu nombre', tuTelefono: 'Tu teléfono', enviarSugerencia: 'Enviar sugerencia',
  gracias: '¡Gracias!', quienAtendio: '¿Quién te atendió?', eligeMozo: 'Elige a tu mozo/a',
  queGusto: '¿Qué te gustó? Lo compartimos con el equipo.', felicitacionEjemplo: 'Ej.: la atención estuvo excelente…',
  dejarNombre: 'Dejar mi nombre (opcional)', enviarFelicitacion: 'Enviar felicitación',
  listo: 'Aviso enviado', listoOtraVez: 'Aviso enviado otra vez', vaEnCamino: 'Alguien de nuestro equipo va en camino.',
  pedirAlgoMas: 'Pedir algo más', graciasSugerencia: 'Gracias, la gerencia lo va a leer.',
  graciasFelicitacion: 'Se lo haremos saber al equipo.',
  errorTitulo: 'No pudimos enviar el aviso', errorTexto: 'Por favor, avisa a cualquier miembro del personal.',
  sinConexion: 'Sin conexión', sinConexionTexto: 'Revisa tus datos móviles e inténtalo otra vez.',
  reintentar: 'Reintentar', avisarWhatsapp: 'Avisar por WhatsApp',
  mensajeWhatsapp: 'Hola, necesito atención en la',
  miPedido: 'Pedido de la mesa', agregar: 'Agregar', agregado: 'Agregado', opcion: 'Elige una opción',
  destacados: 'Favoritos de la casa', todo: 'Todo', buscar: 'Buscar en la carta', sinResultados: 'No encontramos ese plato.',
  consultar: 'A consultar', agotado: 'Agotado', seSirve: 'Se sirve de {desde} a {hasta}', platosEnEspanol: 'Algunos platos llevan su nombre en español.',
  verPedido: 'Ver el pedido', vacio: 'Todavía no hay nada. Agrega platos desde la carta.',
  personas: '{n} celulares están armando este pedido.', deOtro: 'De otro celular',
  nota: 'Algo que debamos saber (alergias, sin ají…)', total: 'Total aproximado',
  noEsComanda: 'Esto avisa al mozo: él se acerca a confirmar tu pedido.', enviarMozo: 'Avisar al mozo',
  pedidoEnviado: 'Tu mozo ya sabe lo que quieren', pedidoEnviadoTexto: 'Se acercará a confirmar el pedido.',
  cerrar: 'Cerrar', quitar: 'Quitar', menos: 'Uno menos', mas: 'Uno más', idioma: 'Idioma',
  mesaNoValida: 'No reconocemos este QR', mesaNoValidaTexto: 'Vuelve a escanear el código de tu mesa.',
};
export type TextosMesa = typeof ES;

const EN: TextosMesa = {
  pregunta: 'What do you need?',
  verCarta: 'See the menu', verCartaSub: 'Dishes, prices and your order',
  mozo: 'Call the waiter', mozoSub: 'Someone will come to your table',
  cuenta: 'Ask for the bill', cuentaSub: 'Receipt or invoice',
  otro: 'Something else', otroSub: 'Tell us what you need',
  sugerencia: 'Suggestions', sugerenciaSub: 'Help us improve',
  felicitacion: 'Compliments', felicitacionSub: 'Leave us a kind word',
  volver: 'Back', enviando: 'Sending…',
  dividir: 'Split the bill', dividirSub: 'Separate bills: your waiter will sort it out',
  dividirNota: 'Your waiter will come to take each bill separately.',
  comoComprobante: 'Which document do you need?', boleta: 'Receipt', factura: 'Invoice',
  dni: 'ID number (optional)', dniAyuda: 'Leave it blank and we will still bring the bill.',
  ruc: 'RUC (11 digits)', rucAyuda: 'Required to issue the invoice.',
  errDni: 'The ID must have 8 digits, or leave it blank.', errRuc: 'The RUC must have 11 digits.',
  otroEjemplo: 'E.g. more napkins, another chair, lower the music…',
  otroAyuda: 'Optional: send it blank and someone will come over.', enviarAviso: 'Send',
  tuSugerencia: 'Your suggestion', sugerenciaAyuda: 'What can we improve? Management reads this.',
  sugerenciaEjemplo: 'Feel free to tell us.', quieroRespuesta: 'I would like a reply (optional)',
  tuNombre: 'Your name', tuTelefono: 'Your phone', enviarSugerencia: 'Send suggestion',
  gracias: 'Thank you!', quienAtendio: 'Who served you?', eligeMozo: 'Choose your waiter',
  queGusto: 'What did you like? We will share it with the team.', felicitacionEjemplo: 'E.g. the service was excellent…',
  dejarNombre: 'Leave my name (optional)', enviarFelicitacion: 'Send compliment',
  listo: 'Request sent', listoOtraVez: 'Request sent again', vaEnCamino: 'Someone from our team is on the way.',
  pedirAlgoMas: 'Ask for something else', graciasSugerencia: 'Thank you, management will read it.',
  graciasFelicitacion: 'We will let the team know.',
  errorTitulo: 'We could not send your request', errorTexto: 'Please let any member of staff know.',
  sinConexion: 'No connection', sinConexionTexto: 'Check your mobile data and try again.',
  reintentar: 'Try again', avisarWhatsapp: 'Notify via WhatsApp',
  mensajeWhatsapp: 'Hello, I need assistance at',
  miPedido: 'Table order', agregar: 'Add', agregado: 'Added', opcion: 'Choose an option',
  destacados: 'House favourites', todo: 'All', buscar: 'Search the menu', sinResultados: 'We could not find that dish.',
  consultar: 'Ask us', agotado: 'Sold out', seSirve: 'Served from {desde} to {hasta}', platosEnEspanol: 'Some dishes keep their Spanish name.',
  verPedido: 'View order', vacio: 'Nothing yet. Add dishes from the menu.',
  personas: '{n} phones are building this order.', deOtro: 'From another phone',
  nota: 'Anything we should know (allergies, no chili…)', total: 'Approximate total',
  noEsComanda: 'This notifies your waiter, who will come to confirm your order.', enviarMozo: 'Notify the waiter',
  pedidoEnviado: 'Your waiter knows what you want', pedidoEnviadoTexto: 'Someone will come to confirm your order.',
  cerrar: 'Close', quitar: 'Remove', menos: 'One less', mas: 'One more', idioma: 'Language',
  mesaNoValida: 'We do not recognise this QR', mesaNoValidaTexto: 'Please scan your table code again.',
};

const PT: TextosMesa = {
  pregunta: 'Do que você precisa?',
  verCarta: 'Ver o cardápio', verCartaSub: 'Pratos, preços e seu pedido',
  mozo: 'Chamar o garçom', mozoSub: 'Alguém virá até a mesa',
  cuenta: 'Pedir a conta', cuentaSub: 'Recibo ou fatura',
  otro: 'Outro pedido', otroSub: 'Conte o que você precisa',
  sugerencia: 'Sugestões', sugerenciaSub: 'Queremos melhorar',
  felicitacion: 'Elogios', felicitacionSub: 'Deixe um comentário positivo',
  volver: 'Voltar', enviando: 'Enviando…',
  dividir: 'Dividir a conta', dividirSub: 'Contas separadas: o garçom vem combinar',
  dividirNota: 'O garçom virá para fechar cada conta separadamente.',
  comoComprobante: 'Qual comprovante você quer?', boleta: 'Recibo', factura: 'Fatura',
  dni: 'Documento (opcional)', dniAyuda: 'Se deixar em branco, levaremos a conta mesmo assim.',
  ruc: 'RUC (11 dígitos)', rucAyuda: 'Necessário para emitir a fatura.',
  errDni: 'O documento deve ter 8 dígitos, ou deixe em branco.', errRuc: 'O RUC deve ter 11 dígitos.',
  otroEjemplo: 'Ex.: mais guardanapos, outra cadeira, abaixar a música…',
  otroAyuda: 'Opcional: envie em branco e alguém virá.', enviarAviso: 'Enviar',
  tuSugerencia: 'Sua sugestão', sugerenciaAyuda: 'O que podemos melhorar? A gerência lê.',
  sugerenciaEjemplo: 'Pode falar com confiança.', quieroRespuesta: 'Quero uma resposta (opcional)',
  tuNombre: 'Seu nome', tuTelefono: 'Seu telefone', enviarSugerencia: 'Enviar sugestão',
  gracias: 'Obrigado!', quienAtendio: 'Quem atendeu você?', eligeMozo: 'Escolha seu garçom',
  queGusto: 'Do que você gostou? Vamos compartilhar com a equipe.', felicitacionEjemplo: 'Ex.: o atendimento foi excelente…',
  dejarNombre: 'Deixar meu nome (opcional)', enviarFelicitacion: 'Enviar elogio',
  listo: 'Aviso enviado', listoOtraVez: 'Aviso enviado de novo', vaEnCamino: 'Alguém da equipe está a caminho.',
  pedirAlgoMas: 'Pedir mais alguma coisa', graciasSugerencia: 'Obrigado, a gerência vai ler.',
  graciasFelicitacion: 'Vamos avisar a equipe.',
  errorTitulo: 'Não conseguimos enviar o aviso', errorTexto: 'Por favor, avise qualquer membro da equipe.',
  sinConexion: 'Sem conexão', sinConexionTexto: 'Verifique seus dados móveis e tente de novo.',
  reintentar: 'Tentar de novo', avisarWhatsapp: 'Avisar pelo WhatsApp',
  mensajeWhatsapp: 'Olá, preciso de atendimento na',
  miPedido: 'Pedido da mesa', agregar: 'Adicionar', agregado: 'Adicionado', opcion: 'Escolha uma opção',
  destacados: 'Favoritos da casa', todo: 'Tudo', buscar: 'Buscar no cardápio', sinResultados: 'Não encontramos esse prato.',
  consultar: 'Consulte', agotado: 'Esgotado', seSirve: 'Servido das {desde} às {hasta}', platosEnEspanol: 'Os pratos mantêm o nome em espanhol.',
  verPedido: 'Ver o pedido', vacio: 'Ainda não há nada. Adicione pratos do cardápio.',
  personas: '{n} celulares estão montando este pedido.', deOtro: 'De outro celular',
  nota: 'Algo que devemos saber (alergias, sem pimenta…)', total: 'Total aproximado',
  noEsComanda: 'Isto avisa o garçom, que virá confirmar seu pedido.', enviarMozo: 'Avisar o garçom',
  pedidoEnviado: 'O garçom já sabe o que vocês querem', pedidoEnviadoTexto: 'Alguém virá confirmar o pedido.',
  cerrar: 'Fechar', quitar: 'Remover', menos: 'Um a menos', mas: 'Um a mais', idioma: 'Idioma',
  mesaNoValida: 'Não reconhecemos este QR', mesaNoValidaTexto: 'Escaneie novamente o código da sua mesa.',
};

export const TEXTOS: Record<Idioma, TextosMesa> = { es: ES, en: EN, pt: PT };
export const IDIOMAS: { id: Idioma; nombre: string }[] = [
  { id: 'es', nombre: 'Español' },
  { id: 'en', nombre: 'English' },
  { id: 'pt', nombre: 'Português' },
];

/** Con su idioma guardado, ese; si no, el del celular cuando lo tenemos. */
export const idiomaDe = (guardado: string | null, navegador: string | undefined): Idioma => {
  if (guardado === 'es' || guardado === 'en' || guardado === 'pt') return guardado;
  const base = (navegador ?? '').slice(0, 2).toLowerCase();
  return base === 'en' || base === 'pt' ? base : 'es';
};
