/**
 * ══════════════════════════════════════════════════════════════════════════
 * RUBROS · una página por tipo de negocio
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── POR QUÉ EXISTEN, SI LA LANDING YA NOMBRA LOS CUATRO ──────────────────
 *
 * Porque una página rankea para un puñado de búsquedas y no para veinte. La
 * landing nombra "barberías, clínicas, tiendas y gimnasios" en la meta
 * descripción, y con eso no compite por ninguna de las cuatro: compite por la
 * media de las cuatro, que es no competir por nada.
 *
 * Quien escribe "agendar citas barbería whatsapp" no quiere una página que
 * también sirve para gimnasios. Quiere una que hable de cupos, de la silla
 * vacía del martes y del cliente que canceló a las dos horas. Esa página
 * rankea mejor Y convierte mejor, porque el visitante se reconoce en la
 * primera línea.
 *
 * ── DE DÓNDE SALE EL TEXTO ───────────────────────────────────────────────
 *
 * Las conversaciones NO se inventan aquí: son las mismas de DEMO en
 * content.ts, las que ya se enseñan en la landing. Dos motivos. Uno, que ya
 * están escritas con el criterio correcto —los hechos separados del tono— y
 * duplicarlas con otras palabras sería tener dos versiones de lo que Mia
 * promete. Y dos, Google pide que lo que marcas como contenido esté visible y
 * sea el mismo; tener dos guiones distintos para el mismo producto es la
 * forma de que ninguno de los dos parezca real.
 *
 * ⚠️ Lo que SÍ es propio de cada rubro es el problema, los números y las
 * preguntas. Eso no se puede compartir: la inasistencia de una clínica y el
 * cupo vacío de una barbería se parecen en la hoja de cálculo y en nada más.
 *
 * ── LOS NÚMEROS ──────────────────────────────────────────────────────────
 *
 * ⚠️ Las cuentas de "lo que pierdes" son ESCENARIOS con los supuestos a la
 * vista, nunca estadísticas del rubro. Se escriben siempre como "si recibes X
 * y pasa Y, son Z", con la X y la Y dichas en la misma frase, para que el
 * lector pueda cambiar sus números y rehacerla. Inventarse "el 40% de las
 * barberías peruanas..." sería inventarse un estudio, y eso no se hace.
 */

export interface Rubro {
  slug: string;
  /** Lo que va en <title>. Lleva el término de búsqueda delante. */
  metaTitulo: string;
  metaDescripcion: string;
  /** El H1. Puede —y debe— ser más humano que el <title>. */
  h1: string;
  bajada: string;
  /** El id del negocio en DEMO cuya conversación se reutiliza. `null` = no hay. */
  demo: 'barberia' | 'clinica' | 'ecommerce' | null;
  /** El dolor, contado como lo cuenta quien lo vive. */
  problema: string[];
  /** Lo concreto que hace Mia en ESTE negocio. Verbos, no adjetivos. */
  tareas: { h: string; p: string }[];
  /** El escenario con los supuestos delante. */
  cuenta: { titulo: string; p: string[] };
  faq: { q: string; a: string }[];
}

export const RUBROS: Rubro[] = [
  {
    slug: 'barberias',
    metaTitulo: 'Agendar citas por WhatsApp para barberías · Vendemia',
    metaDescripcion:
      'Mia contesta el WhatsApp de tu barbería en 30 segundos, propone los cupos libres, confirma la cita y rellena el hueco cuando alguien cancela. Desde S/89 al mes.',
    h1: 'Tu barbería deja de perder cortes por no contestar a tiempo',
    bajada:
      'El cliente pregunta un precio a las nueve de la noche, tú lo ves al día siguiente, y para entonces ya se cortó en otro lado. Mia contesta en el momento, propone los cupos que te quedan y confirma.',
    demo: 'barberia',
    problema: [
      'En una barbería casi nadie llama: escriben. Y escriben cuando se acuerdan, que suele ser mientras tú tienes las manos en la cabeza de otro cliente. Entre corte y corte pasan cuarenta minutos, y cuarenta minutos después el que preguntó "¿hasta qué hora atienden?" ya encontró a otro.',
      'El segundo problema no es la consulta perdida: es la silla vacía. Alguien cancela a las dos de la tarde para las cinco, y ese hueco se queda sin llenar porque avisar uno por uno a los que preguntaron esta semana es un trabajo que nadie hace.',
    ],
    tareas: [
      {
        h: 'Propone los cupos que de verdad te quedan',
        p: 'No dice "déjame consultar". Mira tu agenda, ve qué horas están libres con el barbero que el cliente pidió, y propone dos o tres. El cliente elige y queda agendado en la misma conversación.',
      },
      {
        h: 'Rellena el hueco de una cancelación',
        p: 'Cuando se libera un cupo, avisa a los que habían preguntado por esa franja y no habían cerrado. Es la diferencia entre una silla vacía a las cinco y un corte más.',
      },
      {
        h: 'Sostiene el "lo pienso y te aviso"',
        p: 'Es la frase que más se oye y la que más cuesta. Mia no la deja morir: recuerda que los cupos del sábado se llenan, que el precio va hasta el domingo, y que se puede mover hasta tres horas antes.',
      },
      {
        h: 'Manda el recordatorio el día antes',
        p: 'Bajan las faltas sin que tú te acuerdes de nada. Y si el cliente no puede, lo mueve él mismo por WhatsApp, con lo que el cupo vuelve a estar libre a tiempo de darlo.',
      },
    ],
    cuenta: {
      titulo: 'La cuenta, con tus números',
      p: [
        'Pon los tuyos. Si te escriben quince personas al día y una de cada cuatro se cansa de esperar respuesta, son casi cuatro consultas diarias que no llegan a ser nada. A un corte de S/35, eso son unos S/4.200 al mes que nunca aparecen en la caja porque nunca entraron.',
        'No hace falta que la cuenta salga exacta: basta con que una sola de esas cuatro se convierta en corte para que el mes esté pagado tres veces.',
      ],
    },
    faq: [
      {
        q: '¿Funciona si tengo varios barberos?',
        a: 'Sí, y es donde más se nota. Cada barbero tiene su propio horario y sus días libres, y Mia solo ofrece las horas en las que ese barbero está de turno. Si el cliente pide a uno en concreto, respeta la preferencia; si le da igual, reparte entre quien tenga hueco.',
      },
      {
        q: '¿Y si dos clientes piden la misma hora a la vez?',
        a: 'No se pisan. El cupo se ocupa cuando se confirma, y a partir de ese momento deja de ofrecerse. Si tienes tres sillas, caben tres citas a la misma hora y ni una más.',
      },
      {
        q: '¿Puedo cambiar precios y horarios yo mismo?',
        a: 'Sí, desde un panel, sin pedírselo a nadie. Subes el precio del corte con barba un martes y Mia lo dice bien desde el mensaje siguiente.',
      },
      {
        q: '¿Necesito un número nuevo?',
        a: 'No. Mia trabaja sobre el número que ya repartes en las tarjetas y en tu Instagram. No hay que avisar a nadie de ningún cambio.',
      },
    ],
  },
  {
    slug: 'clinicas-dentales',
    metaTitulo: 'Agendar citas por WhatsApp para clínicas dentales · Vendemia',
    metaDescripcion:
      'Mia responde el WhatsApp de tu clínica, filtra el motivo de consulta, agenda con el especialista correcto y confirma para reducir inasistencias. Desde S/89 al mes.',
    h1: 'Tu clínica contesta a la primera, aunque el consultorio esté lleno',
    bajada:
      'Quien pregunta por una limpieza compara tres clínicas el mismo día y agenda en la que le contesta antes. Mia responde en el momento, filtra el motivo y deja la cita puesta con el especialista que toca.',
    demo: 'clinica',
    problema: [
      'La recepción de una clínica atiende al que está delante, y hace bien. El problema es que el WhatsApp no espera: quien pregunta por una limpieza está preguntando a la vez en otras dos clínicas, y agenda en la que le conteste primero. No en la mejor: en la primera.',
      'Y luego está la inasistencia, que es más cara que la consulta perdida. Un hueco de las cuatro y media que se avisa a las cuatro y veinte ya no se puede dar a nadie: es una hora de sillón y de personal pagada y vacía.',
    ],
    tareas: [
      {
        h: 'Filtra el motivo antes de agendar',
        p: 'Pregunta qué necesita —limpieza, dolor, ortodoncia, una urgencia— y agenda con el profesional y la duración que ese motivo requiere. Deja de pasar que una endodoncia entre en el hueco de veinte minutos de una revisión.',
      },
      {
        h: 'Responde lo que cuesta, con lo que incluye',
        p: 'La pregunta es siempre el precio, y la respuesta que cierra no es una cifra suelta: es la cifra con lo que va dentro. "Limpieza con evaluación, S/120, incluye la radiografía si el doctor la necesita" cierra; "desde S/120" hace que el paciente siga buscando.',
      },
      {
        h: 'Confirma y baja las inasistencias',
        p: 'Recordatorio el día antes y confirmación. Si el paciente no puede, lo dice con horas de margen en vez de no aparecer, y ese hueco vuelve a la agenda a tiempo de dárselo a otro.',
      },
      {
        h: 'Pasa a una persona cuando hace falta',
        p: 'Ante un dolor agudo, una urgencia o algo que no cuadra, no improvisa: avisa al momento con la conversación a la vista para que alguien del equipo entre enseguida.',
      },
    ],
    cuenta: {
      titulo: 'La cuenta, con tus números',
      p: [
        'Cámbialos por los tuyos. Si recibes veinte consultas al día y una de cada cinco se va porque tardaste en contestar, son cuatro pacientes diarios. A un tratamiento inicial de S/120, son unos S/9.600 al mes en tratamientos que empezaban por esa conversación.',
        'Y es una cuenta prudente, porque un paciente dental no vale una consulta: vale el tratamiento entero y las revisiones de los años siguientes.',
      ],
    },
    faq: [
      {
        q: '¿Mia da diagnósticos?',
        a: 'No, y está puesto para que no lo haga. Informa de precios, de lo que incluye cada tratamiento, de horarios y de disponibilidad, y agenda. Cualquier cosa clínica la deriva a una persona con la conversación a la vista. Un sistema que opina sobre un dolor de muelas es un riesgo, no una comodidad.',
      },
      {
        q: '¿Se puede agendar con un especialista concreto?',
        a: 'Sí. Cada profesional tiene su horario y sus días, y Mia ofrece solo las horas en las que esa persona está. Si el motivo requiere a alguien en particular, agenda directamente con quien corresponde.',
      },
      {
        q: '¿Cómo reduce las inasistencias?',
        a: 'Con recordatorio el día antes y confirmación por WhatsApp, que es donde el paciente sí contesta. Lo que más baja la inasistencia no es el recordatorio en sí: es darle una forma fácil de reprogramar, porque entonces avisa en vez de desaparecer.',
      },
      {
        q: '¿Qué pasa con los datos de los pacientes?',
        a: 'Las conversaciones son tuyas y viven en tu cuenta. Mia no necesita historia clínica para agendar: trabaja con el motivo, el horario y el profesional, que es lo que hace falta para dar una cita.',
      },
    ],
  },
  {
    slug: 'tiendas-online',
    metaTitulo: 'Vender por WhatsApp en tu tienda online · Vendemia',
    metaDescripcion:
      'Mia responde stock, tallas y envíos al instante, sostiene el "está caro" y cobra por Yape o Plin dentro de la conversación. Para tiendas online en Perú, desde S/89 al mes.',
    h1: 'Tu tienda responde stock y cobra sin que tú abras el chat',
    bajada:
      'En Perú la venta online se cierra por WhatsApp, no en el carrito. Mia responde talla y stock al instante, sostiene el "está caro" sin regalar descuento y cobra por Yape o Plin en la misma conversación.',
    demo: 'ecommerce',
    problema: [
      'La tienda puede estar abierta a las once de la noche, pero la venta no se cierra en el carrito: se cierra cuando alguien contesta "sí, queda en M". Si esa respuesta llega por la mañana, el cliente ya compró en otra cuenta de Instagram.',
      'Y hay un segundo agujero, más silencioso: el que dice "está un poco caro, lo voy a pensar". Ese mensaje casi nunca se responde bien, porque responderlo bien significa sostener el precio sin regalar un descuento — y eso, escrito a las diez de la noche entre pedidos, no sale.',
    ],
    tareas: [
      {
        h: 'Responde stock, tallas y colores al instante',
        p: 'Con tu inventario delante, no con un "déjame confirmar". "Quedan 3 en M, envío gratis a Lima, llega en 24 a 48 horas" es una respuesta que cierra; "déjame ver y te aviso" es una venta que se enfría.',
      },
      {
        h: 'Sostiene el precio sin regalar descuento',
        p: 'Ante el "está caro" no baja la cifra: recuerda la garantía, el cambio sin costo si no queda, y ofrece apartarlo veinticuatro horas. Mantiene el margen y no pierde al cliente.',
      },
      {
        h: 'Cobra por Yape o Plin en la conversación',
        p: 'Genera el pedido y cobra donde el cliente ya está, sin mandarlo a una pasarela que abandona la mitad. El pedido queda registrado en tu panel con lo que compró y cuánto pagó.',
      },
      {
        h: 'Vuelve al que dejó el pedido a medias',
        p: 'El que preguntó, le gustó y no confirmó no está perdido: está ocupado. Mia vuelve a las veinticuatro horas con el producto que le interesaba, y ahí se recupera buena parte de lo que parecía caído.',
      },
    ],
    cuenta: {
      titulo: 'La cuenta, con tus números',
      p: [
        'Pon los tuyos. Si te escriben treinta personas al día y una de cada cuatro se va sin respuesta a tiempo, son siete consultas diarias. A un ticket de S/89 y cerrando tres de cada diez, son unos S/5.600 al mes que se fueron a otra cuenta.',
        'A eso se le suma lo que se recupera del "lo pienso", que en una tienda es la mitad de las conversaciones que hoy simplemente se apagan.',
      ],
    },
    faq: [
      {
        q: '¿Se conecta con mi inventario?',
        a: 'Trabaja con el catálogo que cargas en el panel: productos, variantes, precios y stock, que puedes cambiar tú cuando quieras. Para una tienda con cientos de referencias y un sistema propio, hablemos antes: no todas las integraciones existen.',
      },
      {
        q: '¿Cómo cobra por Yape o Plin?',
        a: 'Genera el pedido en la conversación y le pasa al cliente los datos de pago. Cuando el cliente paga, el pedido queda registrado con lo que compró y por cuánto, para que tú lo veas en el panel sin ir buscando capturas por el chat.',
      },
      {
        q: '¿Y si el cliente quiere regatear?',
        a: 'No baja el precio por su cuenta. Sostiene la objeción con lo que sí puedes ofrecer —garantía, cambio, apartado— y si hay un descuento de verdad, es el que tú hayas configurado, no uno que se inventa para cerrar.',
      },
      {
        q: '¿Funciona con Instagram?',
        a: 'Mia atiende WhatsApp, que es donde acaba la conversación aunque empiece en Instagram. El enlace de tu perfil manda al mismo número de siempre y ahí contesta ella.',
      },
    ],
  },
  {
    slug: 'gimnasios',
    metaTitulo: 'WhatsApp automático para gimnasios y estudios · Vendemia',
    metaDescripcion:
      'Mia responde precios de membresía, agenda la clase de prueba y reactiva al socio que dejó de venir antes de que se dé de baja. Desde S/89 al mes.',
    h1: 'Tu gimnasio agenda la clase de prueba mientras tú das clase',
    bajada:
      'El que pregunta por una membresía está decidiendo esta semana, y el que dejó de venir se da de baja en silencio. Mia contesta al primero en el momento y va a buscar al segundo antes de que sea tarde.',
    demo: null,
    problema: [
      'Un gimnasio tiene dos conversaciones que no puede perder, y las pierde las dos por el mismo motivo: quien podría contestarlas está dando clase. La primera es la del que pregunta el precio de la mensualidad — está comparando dos o tres sitios del barrio y se apunta en el que le conteste hoy.',
      'La segunda no llega como mensaje: llega como ausencia. El socio que lleva tres semanas sin venir no avisa de que se va a dar de baja. Simplemente deja de pagar el mes siguiente, y para cuando lo notas en la cuenta ya no hay conversación que tener.',
    ],
    tareas: [
      {
        h: 'Responde los planes y lo que incluye cada uno',
        p: 'Mensual, trimestral, con clases o solo sala, con matrícula o sin ella. Contesta con la cifra y lo que va dentro, que es lo que hace que el que compara se quede.',
      },
      {
        h: 'Agenda la clase de prueba',
        p: 'Que es lo que de verdad convierte. Propone los horarios con cupo, la deja agendada y manda el recordatorio: el que viene a probar se apunta mucho más que el que solo preguntó el precio.',
      },
      {
        h: 'Reactiva al que dejó de venir',
        p: 'Vuelve a escribirle al socio que lleva semanas sin aparecer, antes de que la baja sea un hecho consumado. Recuperar a uno que ya te conocía cuesta mucho menos que traer a uno nuevo.',
      },
      {
        h: 'Controla el cupo de cada clase',
        p: 'Si a la clase de las siete caben veinte, caben veinte. Cuando se llena deja de ofrecerla y propone la siguiente, en vez de apuntar a veinticinco y que sobren cinco en la puerta.',
      },
    ],
    cuenta: {
      titulo: 'La cuenta, con tus números',
      p: [
        'Cámbialos por los tuyos. Si te preguntan diez personas al día por la mensualidad y una de cada cuatro se apunta en otro sitio por no recibir respuesta a tiempo, son unas setenta y cinco consultas al mes que se van. A S/120 de mensualidad, basta con recuperar cinco para que el año cambie de color.',
        'Y la reactivación juega aparte: un socio recuperado no es una venta, son los meses que siga viniendo después.',
      ],
    },
    faq: [
      {
        q: '¿Controla el aforo de las clases?',
        a: 'Sí. Cada clase tiene su cupo, y cuando se llena Mia deja de ofrecerla y propone la siguiente con espacio. No apunta a más gente de la que cabe.',
      },
      {
        q: '¿Cómo sabe a quién reactivar?',
        a: 'Por el tiempo que lleva sin aparecer en la conversación y sin agendar. No hace falta que tú marques a nadie: los que llevan semanas callados salen solos, y tú decides si se les escribe.',
      },
      {
        q: '¿Puede cobrar la mensualidad?',
        a: 'Puede cobrar por Yape o Plin dentro de la conversación y dejar el pago registrado. Para una domiciliación bancaria mes a mes, eso lo lleva tu pasarela, no Mia.',
      },
      {
        q: '¿Sirve para un estudio pequeño de yoga o crossfit?',
        a: 'Sí, y suele notarse más que en un gimnasio grande, porque en un estudio pequeño quien contesta el WhatsApp es la misma persona que está dando la clase.',
      },
    ],
  },
];

export const RUBRO_POR_SLUG = new Map(RUBROS.map((r) => [r.slug, r]));
