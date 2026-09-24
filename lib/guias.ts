/**
 * ══════════════════════════════════════════════════════════════════════════
 * GUÍAS · las páginas que existen para que Google nos encuentre
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── POR QUÉ ESTA PÁGINA DICE "CHATBOT" SI LA LANDING NO LO DICE ──────────
 *
 * En lib/content.ts hay una regla escrita y es buena: la categoría es
 * "vendedor digital", nunca "bot". Preguntarse "¿Vendemia es un chatbot?" en
 * la propia web es regalarle al lector el marco del competidor y mandarlo a
 * comparar precios de chatbots.
 *
 * Esa regla vale para la LANDING, donde el lector ya llegó. Aquí no ha
 * llegado: está escribiendo en Google, y lo que escribe es "cuánto cuesta un
 * chatbot de whatsapp perú". Nadie busca "vendedor digital para WhatsApp"
 * —no existe esa categoría en la cabeza de nadie todavía—, así que una página
 * que evite la palabra no aparece, y una página que no aparece no reencuadra
 * a nadie.
 *
 * El orden correcto es: se le contesta la pregunta EN SU VOCABULARIO, con
 * datos de verdad y sin vender; y una vez leído y con la confianza ganada, el
 * último bloque explica por qué lo que necesita no se parece a lo que fue a
 * buscar. El reencuadre ocurre AQUÍ, después del clic, y por eso no contamina
 * el marco de la landing.
 *
 * ── LOS RANGOS DE PRECIO SON DE FUERA, Y HAY QUE REVISARLOS ──────────────
 *
 * ⚠️ Los importes de MERCADO no son inventados ni son nuestros: salen de lo
 * que publican los proveedores peruanos, consultado en la fecha de
 * CONSULTADO_EN. Son RANGOS a propósito, no "la empresa X cobra Y": un precio
 * concreto de otro envejece en semanas y deja la página mintiendo.
 *
 * Si esta página va a seguir siendo útil, estos rangos se revisan una vez al
 * año y se sube CONSULTADO_EN. Una guía de precios con datos viejos hace más
 * daño que no tenerla: es exactamente lo que el lector vino a comprobar.
 */

export type Bloque = { h?: string; p?: string[]; li?: string[] };

/** Cuándo se miraron por última vez los precios de mercado de aquí abajo. */
export const CONSULTADO_EN = 'septiembre de 2026';

/** La misma fecha en ISO, para el `lastmod` del sitemap. */
export const GUIAS_ACTUALIZADAS_ISO = '2026-09-12';

/**
 * Los tres modos de contratar esto en Perú, con lo que cuesta cada uno.
 *
 * Van de menos a más porque así se lee la tabla: el lector busca dónde encaja
 * él, y casi siempre encaja en la primera fila aunque haya venido pensando en
 * la tercera.
 */
export const RANGOS = [
  {
    modo: 'Plataforma lista para usar',
    quien: 'El negocio que quiere empezar esta semana',
    mensual: 'S/89 – S/300',
    instalacion: 'S/0',
    detalle:
      'Te conectas a algo que ya funciona y lo configuras con tus precios y horarios. No hay que programar nada.',
  },
  {
    modo: 'Chatbot con agencia local',
    quien: 'La empresa con procesos propios que integrar',
    mensual: 'S/550 – S/1.500',
    instalacion: 'S/500 – S/2.000',
    detalle:
      'Alguien te monta el flujo a medida y te lo mantiene. El mensual sube con el número de conversaciones y con cada cambio que pidas.',
  },
  {
    modo: 'Desarrollo a medida',
    quien: 'Quien necesita integrarlo con su propio sistema',
    mensual: 'Mantenimiento aparte',
    instalacion: 'S/800 – S/10.000+',
    detalle:
      'Se paga una vez y es tuyo, pero el proyecto tarda meses y cada cambio posterior vuelve a ser un presupuesto.',
  },
] as const;

/** Lo que casi nunca viene desglosado en la cotización que te pasan. */
export const OCULTOS = [
  {
    h: 'La instalación',
    p: 'Es el importe que más se dispara y el que menos se discute, porque se paga una vez y suena a trámite. En el mercado peruano va de S/500 a varios miles, y se cobra antes de que el sistema te haya traído una sola venta. Pregunta siempre por él primero: cambia el total del primer año más que el mensual.',
  },
  {
    h: 'Las conversaciones que cobra Meta',
    p: 'Si la solución usa la API oficial de WhatsApp Business, Meta cobra aparte por conversación, y ese costo no suele aparecer en la cotización porque no lo cobra el proveedor. Escala con tu volumen: justo cuando el sistema empieza a funcionar es cuando empieza a costarte más.',
  },
  {
    h: 'Los cambios',
    p: 'Subiste los precios, entró un servicio nuevo, cambiaste el horario de los domingos. Si cada uno de esos cambios es un ticket a tu proveedor, el costo real no es el mensual: es el mensual más la espera. Pregunta si puedes cambiarlo tú desde un panel.',
  },
  {
    h: 'La permanencia',
    p: 'Un contrato a doce meses con descuento sale más barato sobre el papel y más caro en la realidad, porque lo que estás comprando por adelantado es la parte que todavía no sabes si funciona. Los primeros treinta días son los que te dicen si esto sirve para tu negocio.',
  },
] as const;

/** El bloque que se puede arrancar y llevarse a una reunión. */
export const PREGUNTAS_ANTES = [
  '¿Cuánto es la instalación, y qué pasa con ese dinero si cancelo al segundo mes?',
  '¿El precio incluye lo que Meta cobra por conversación, o eso me llega aparte?',
  '¿Puedo cambiar precios, horarios y servicios yo mismo, o cada cambio lo hacen ustedes?',
  '¿Funciona sobre mi número actual o tengo que repartir uno nuevo?',
  '¿Qué pasa cuando el cliente pide hablar con una persona?',
  '¿Hay permanencia? ¿Y devolución si no funciona?',
  '¿Qué pasa con las conversaciones de mis clientes si me voy?',
] as const;

/**
 * El reencuadre. Va al final a propósito: antes de esto el lector ya tiene lo
 * que vino a buscar, así que esto se lee como una opinión de alguien que le
 * acaba de ser útil, y no como el anuncio que estaba esquivando.
 */
export const REENCUADRE: Bloque[] = [
  {
    h: 'Una última cosa, y es la que cambia la cuenta',
    p: [
      'Todo lo de arriba compara precios de chatbots, que es lo que fuiste a buscar. Pero el precio correcto de esto no se mide contra otros proveedores: se mide contra lo que te cuesta no tenerlo.',
      'Un negocio que recibe veinte consultas al día por WhatsApp y contesta tarde una de cada cuatro está dejando ir unas cuarenta y cinco ventas al mes. Con un ticket de S/120, son S/5.400 que no aparecen en ninguna cuenta porque nunca llegaron a ser venta. Contra eso, la diferencia entre pagar S/89 y pagar S/550 es casi ruido: lo que importa es si contesta a tiempo y si cierra.',
      /**
       * ⚠️ EL CONTRASTE ES POR COMPORTAMIENTO, NO POR LA ETIQUETA.
       *
       * La regla de posicionamiento de lib/content.ts dice que ni siquiera se
       * niega la categoría rival ("no somos un chatbot"), porque nombrarla
       * para negarla la refuerza. Aquí el lector ya llegó con la palabra en la
       * mano —la escribió en Google—, así que esconderla sería raro; pero la
       * frase final NO dice "Mia no es un chatbot": pone al lado lo que hace
       * uno y lo que hace el otro, y deja que el lector saque la conclusión.
       * Es más fuerte y no le regala el marco a nadie.
       */
      'Y ahí es donde la comparación de precios se queda corta. Una cosa contesta; la otra sostiene la objeción cuando el cliente dice "déjame pensarlo", propone un horario concreto, confirma la cita y vuelve a los que no respondieron. Lo primero se mide en consultas desviadas y lo segundo en ventas cerradas, y por eso no deberían compararse por el precio mensual: se parecen por fuera y no hacen el mismo trabajo.',
    ],
  },
];

/** Las preguntas de esta página. Van a JSON-LD (FAQPage) además de a la vista. */
export const FAQ_PRECIOS = [
  {
    q: '¿Cuánto cuesta un chatbot de WhatsApp en Perú?',
    a: 'Entre S/89 y S/1.500 al mes, según cómo lo contrates. Las plataformas listas para usar arrancan en S/89 mensuales sin costo de instalación; una agencia local cobra entre S/550 y S/1.500 al mes más la instalación; y un desarrollo a medida se paga una vez, entre S/800 y más de S/10.000, con el mantenimiento aparte.',
  },
  {
    q: '¿Hay que pagar instalación?',
    a: 'Depende del proveedor, y es el importe que más varía: en el mercado peruano va de S/0 a varios miles de soles. Es lo primero que conviene preguntar, porque se cobra antes de que el sistema haya traído una sola venta y cambia el total del primer año más que el precio mensual.',
  },
  {
    q: '¿Meta cobra aparte por los mensajes?',
    a: 'Puede cobrar, sí. Las soluciones que usan la API oficial de WhatsApp Business —que es la vía que Meta permite para automatizar— están sujetas a sus tarifas, y ese costo es independiente de lo que te cobre el proveedor. Conviene preguntar antes de firmar qué mensajes cobra Meta en tu caso y si el precio del proveedor los incluye, porque escala con tu volumen.',
  },
  {
    q: '¿Necesito un número de WhatsApp nuevo?',
    a: 'No necesariamente. Hay soluciones que trabajan sobre el número que ya repartes, sin comprar otra línea ni avisar a tus clientes de ningún cambio. Es una diferencia práctica importante: un número nuevo significa volver a repartir tarjetas, cambiar el perfil de Instagram y perder las conversaciones que ya tenías.',
  },
  {
    q: '¿Cuánto tarda en estar funcionando?',
    a: 'Una plataforma lista para usar se configura en minutos, porque solo hay que darle tus precios, tus horarios y conectar el número con el registro de Meta. Un flujo a medida con agencia tarda de dos a seis semanas, y un desarrollo propio, meses.',
  },
  {
    q: '¿Conviene un chatbot hecho a medida?',
    a: 'Solo si necesitas integrarlo con un sistema que ya tienes —un ERP, una historia clínica, un inventario propio— y esa integración no existe de otra forma. Para atender WhatsApp, agendar citas y cobrar, el desarrollo a medida cuesta entre diez y cien veces más y tarda meses en hacer lo mismo.',
  },
] as const;

/** Lo que cuesta Vendemia, dicho aquí sin rodeos porque la página va de eso. */
export const NUESTRO_PRECIO: Bloque[] = [
  {
    h: 'Y lo que cuesta Vendemia',
    p: [
      'Esta guía la escribe Vendemia, así que lo justo es poner nuestros números en la misma tabla y que los compares.',
      'S/89 al mes el plan de entrada, S/149 y S/189 los otros dos. Cero de instalación, sin permanencia y con treinta días de devolución. Trabaja sobre el número que ya tienes, y los precios, los horarios y los servicios los cambias tú desde un panel sin pedírnoslo a nadie.',
      'No somos los únicos que puedes contratar, y para algunos casos —una integración con tu propio sistema— no somos la respuesta correcta. Pero si lo que necesitas es que alguien atienda tu WhatsApp a tiempo, ese es el precio completo, y no hay una segunda cifra esperando en la letra pequeña.',
    ],
  },
];
