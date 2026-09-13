/**
 * ══════════════════════════════════════════════════════════════════════════
 * LAS OTRAS DOS GUÍAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Viven aparte de lib/guias.ts para que aquel fichero siga siendo "la guía de
 * precios y sus datos de mercado", que es lo que hay que revisar cada año.
 * Estas dos no caducan igual: explican cómo funcionan las cosas, no cuánto
 * cuestan.
 *
 * ── SOBRE LA COMPARATIVA, Y POR QUÉ NO NOMBRA A NADIE ────────────────────
 *
 * La búsqueda que más tráfico mueve en esta categoría es del tipo "los
 * mejores chatbots para WhatsApp", y la forma de rankear ahí es una lista con
 * nombres y precios de la competencia. No se hizo, a propósito, por dos
 * motivos que no son de estilo:
 *
 * 1 · No se pueden verificar. Publicar "la empresa X cobra Y e incluye Z" sin
 *     haberlo comprobado es afirmar algo falso sobre un tercero identificable,
 *     y en Perú eso tiene nombre legal. Además envejece en semanas.
 *
 * 2 · Una comparativa escrita por uno de los comparados nunca es neutral, y el
 *     lector lo sabe. Gana menos confianza de la que parece.
 *
 * Se compara lo comparable de verdad: las CUATRO FORMAS de resolver el
 * problema, que son hechos técnicos y no opiniones sobre empresas. El lector
 * que busca "cuál es mejor" encuentra el criterio para decidir, que es lo que
 * de verdad estaba buscando. Si algún día hay que hacer la lista con nombres,
 * se hace probando cada herramienta y citando la fecha, no de memoria.
 */

import type { Bloque } from './guias';

/* ── /responder-whatsapp-automatico-peru ─────────────────────────────── */

export const AUTOMATICO = {
  metaTitulo: 'Cómo responder WhatsApp automáticamente en Perú: 4 formas · Vendemia',
  metaDescripcion:
    'Las cuatro maneras de automatizar el WhatsApp de tu negocio en Perú, qué cuesta cada una y cuál te conviene según cuántos mensajes recibes al día.',
  h1: 'Cómo responder WhatsApp automáticamente: las cuatro formas',
  bajada:
    'Van de gratis a S/1.500 al mes y no hacen lo mismo. Esto es lo que resuelve cada una, lo que no resuelve, y cómo saber en cuál estás tú.',
  bloques: [
    {
      h: 'La respuesta corta',
      p: [
        'Si recibes menos de diez mensajes al día y casi todos preguntan lo mismo, las respuestas rápidas de WhatsApp Business te bastan y son gratis. Si recibes más, o si lo que te frena no es contestar sino cerrar, ninguna de las opciones gratuitas te va a servir y conviene saberlo antes de perder dos meses probándolas.',
      ],
    },
    {
      h: '1 · Mensaje de ausencia y respuestas rápidas (gratis)',
      p: [
        'Vienen dentro de la app de WhatsApp Business, se configuran en diez minutos y no cuestan nada. El mensaje de ausencia contesta fuera de horario; las respuestas rápidas son atajos que escribes tú con "/" para no repetir el mismo texto veinte veces al día.',
        'Lo que resuelven: que el cliente sepa que existes y que le vas a contestar. Lo que no: nada más. No responden un precio concreto, no miran tu agenda y no cierran. El cliente recibe "gracias por escribirnos, te responderemos pronto" y sigue esperando — que es exactamente el momento en que le escribe a otro.',
      ],
    },
    {
      h: '2 · Chatbot de menús (desde gratis hasta unos S/300 al mes)',
      p: [
        'Es el clásico: "responde 1 para precios, 2 para horarios, 3 para hablar con un asesor". Se arma con un editor de flujos y funciona siempre que el cliente pregunte exactamente una de las cosas previstas.',
        'Lo que resuelven: las preguntas repetidas y previsibles. Un horario, una dirección, una lista de precios. Lo que no: cualquier cosa que se salga del guion. El cliente que escribe "hola, quería saber si el corte con barba incluye lavado y si tienen para el sábado en la tarde" no cabe en ningún menú, y acaba en la opción 3 esperando a una persona.',
        'El costo oculto aquí es el tiempo: cada pregunta nueva que aparece hay que ir a añadirla al flujo, y el flujo crece hasta que ya nadie se atreve a tocarlo.',
      ],
    },
    {
      h: '3 · Agencia que te monta un flujo a medida (S/550 – S/1.500 al mes)',
      p: [
        'Alguien diseña el recorrido para tu negocio, lo conecta con tus sistemas y te lo mantiene. Es lo correcto cuando tienes procesos propios de verdad que integrar: un ERP, una historia clínica, un inventario con miles de referencias.',
        'Lo que resuelven: la integración, que es un problema real y no siempre tiene otra salida. Lo que no: la dependencia. Cada cambio de precio, cada servicio nuevo y cada horario distinto es un ticket y una espera. Y suele haber costo de instalación, entre S/500 y varios miles, antes de que el sistema te traiga una sola venta.',
      ],
    },
    {
      h: '4 · Una IA que conversa (desde S/89 al mes)',
      p: [
        'No sigue un guion: entiende lo que le escriben. Contesta con tus precios y tus horarios reales, sostiene la objeción cuando el cliente dice "déjame pensarlo", propone una hora concreta de tu agenda, confirma y vuelve a los que no respondieron.',
        'Lo que resuelven: el trabajo de contestar bien, entero, a cualquier hora. Lo que no: no sustituye a una persona cuando hace falta criterio, y lo correcto es que lo sepa — ante una urgencia o algo que no cuadra, pasar la conversación es la respuesta buena, no un fallo.',
      ],
    },
    {
      h: 'Cómo saber cuál es la tuya',
      p: [
        'Cuenta los mensajes de un día normal y mira cuántos son preguntas distintas. Si de veinte mensajes hay quince preguntas diferentes, cualquier cosa basada en menús te va a fallar en las quince y no hay configuración que lo arregle: el problema no es que esté mal montado, es que un menú no entiende.',
        'Y hazte la otra pregunta, que es la que casi nadie se hace: ¿lo que te falta es contestar, o cerrar? Si tus clientes reciben respuesta y aun así no compran, automatizar la respuesta no va a mover nada. Lo que falta ahí es lo que pasa después del "está caro".',
      ],
    },
  ] as Bloque[],
  faq: [
    {
      q: '¿Se puede automatizar WhatsApp gratis?',
      a: 'Sí, hasta cierto punto. La app de WhatsApp Business incluye mensaje de bienvenida, mensaje de ausencia y respuestas rápidas sin costo, y para un negocio con pocos mensajes al día es suficiente. Lo que no puedes hacer gratis es responder con tus precios y tu disponibilidad reales, ni agendar.',
    },
    {
      q: '¿Necesito la API de WhatsApp Business?',
      a: 'Depende de la solución. La API oficial es necesaria para algunas integraciones y tiene costo por conversación que cobra Meta aparte. Otras soluciones trabajan vinculando tu número como WhatsApp Web, sin esa tarifa. Ninguna de las dos es mejor en abstracto: depende de tu volumen y de qué necesites integrar.',
    },
    {
      q: '¿Los clientes se molestan si les contesta un sistema?',
      a: 'Se molestan cuando no les resuelve, no por ser un sistema. Un menú de cinco opciones que no incluye su pregunta irrita; una respuesta correcta en treinta segundos a las diez de la noche, no. La prueba está en si el cliente tiene que repetir lo que ya escribió.',
    },
    {
      q: '¿Cuánto tarda en estar funcionando?',
      a: 'Las respuestas rápidas, diez minutos. Un chatbot de menús, de unas horas a unos días según cuántas ramas tenga. Un flujo con agencia, de dos a seis semanas. Una plataforma de IA lista para usar, minutos: solo hay que darle tus precios, tus horarios y vincular el número.',
    },
  ],
} as const;

/* ── /whatsapp-business-api-peru ─────────────────────────────────────── */

export const API_PERU = {
  metaTitulo: 'WhatsApp Business API en Perú: qué es, cuánto cuesta y cuándo la necesitas · Vendemia',
  metaDescripcion:
    'Qué es la API de WhatsApp Business, en qué se diferencia de la app normal, cómo cobra Meta por conversación y en qué casos un negocio peruano no la necesita.',
  h1: 'WhatsApp Business API en Perú: qué es y cuándo la necesitas de verdad',
  bajada:
    'Es lo primero que te nombran cuando preguntas por automatizar tu WhatsApp, y muchas veces no hace falta. Esto es qué es, qué cuesta y cómo saber si estás en el caso que sí la necesita.',
  bloques: [
    {
      h: 'Qué es, en una frase',
      p: [
        'La API de WhatsApp Business es la puerta oficial de Meta para que un sistema —no una persona— mande y reciba mensajes en nombre de un número de empresa. No es una app: no se instala ni se abre, se conecta desde un programa.',
        'Eso es justamente lo que la hace distinta de la app de WhatsApp Business que te descargas del teléfono. La app es para que atiendas tú; la API es para que atienda algo que tú programaste.',
      ],
    },
    {
      h: 'Las tres diferencias que importan',
      li: [
        'Cómo se paga: la app es gratis; en la API, Meta cobra por conversación y la factura llega aparte de lo que te cobre el proveedor.',
        'Quién puede escribir primero: con la API puedes iniciar conversaciones con plantillas aprobadas por Meta, y ahí hay un proceso de aprobación que la app no tiene.',
        'Cuánta gente atiende a la vez: la app va ligada a un teléfono; la API permite que varias personas y varios sistemas atiendan el mismo número sin pisarse.',
      ],
    },
    {
      h: 'Lo que cuesta en Perú',
      p: [
        'Hay dos facturas, y confundirlas es el error más común. La primera es la del proveedor que te da el sistema. La segunda es la de Meta, por conversación, y esa no la controla el proveedor: sube cuando sube tu volumen, que es justo cuando las cosas te están yendo bien.',
        'Meta cambia sus tarifas y las publica por país y por tipo de conversación, así que aquí no van cifras: la que valga hoy no valdrá dentro de unos meses. Lo que sí conviene llevarse es la pregunta — al pedir una cotización, preguntar explícitamente si el precio incluye lo que cobra Meta o llega por separado.',
        'A eso hay que sumarle algo que no es dinero pero cuesta: la verificación del negocio en Meta. Hay que acreditar la empresa, y en Perú eso significa RUC y documentación a nombre de la razón social. No es difícil, pero no se resuelve en una tarde.',
      ],
    },
    {
      h: 'Cuándo la necesitas de verdad',
      li: [
        'Cuando varias personas tienen que atender el mismo número a la vez y hoy se están pasando el teléfono.',
        'Cuando necesitas iniciar tú la conversación a escala: confirmaciones, recordatorios o avisos a listas grandes.',
        'Cuando hay que conectarlo con un sistema propio —un ERP, una historia clínica, un inventario— y esa integración no existe de otra forma.',
        'Cuando el volumen es alto y sostenido, y necesitas las garantías de un canal oficial.',
      ],
    },
    {
      h: 'Cuándo no la necesitas',
      p: [
        'Si eres un negocio que atiende desde un número y lo que te falta es que alguien conteste rápido y bien, la API resuelve un problema que no tienes y te añade dos que sí: una factura variable y un proceso de verificación.',
        'Para ese caso hay soluciones que trabajan sobre el número que ya repartes, vinculándolo como WhatsApp Web, sin tarifa por conversación y sin cambiar nada de cara a tus clientes. Vendemia es una de ellas: por eso el precio de aquí es un precio fijo al mes y no un precio más lo que salga.',
        'La forma honesta de decidirlo es esta: si tu problema se llama "no damos abasto entre varios", mira la API. Si se llama "no contestamos a tiempo", no la mires todavía.',
      ],
    },
  ] as Bloque[],
  faq: [
    {
      q: '¿Cuál es la diferencia entre WhatsApp Business y la API de WhatsApp Business?',
      a: 'La app de WhatsApp Business es gratuita, se instala en un teléfono y la usa una persona para atender. La API es una conexión para que un sistema atienda en nombre del número, permite que varias personas y programas trabajen sobre él a la vez, y Meta cobra por conversación.',
    },
    {
      q: '¿Meta cobra por usar la API?',
      a: 'Sí, por conversación, y esa factura es independiente de lo que te cobre el proveedor del sistema. Las tarifas las publica Meta por país y cambian, así que conviene consultarlas en el momento de decidir y preguntar al proveedor si su precio las incluye.',
    },
    {
      q: '¿Necesito RUC para usar la API en Perú?',
      a: 'Para la verificación del negocio en Meta necesitas acreditar la empresa, y en Perú eso pasa por el RUC y documentación a nombre de la razón social. Si todavía no tienes empresa formal, es un requisito a resolver antes.',
    },
    {
      q: '¿Puedo automatizar mi WhatsApp sin la API?',
      a: 'Sí. Hay soluciones que vinculan tu número actual como WhatsApp Web y automatizan sobre él, sin tarifa por conversación ni proceso de verificación. Para un negocio que atiende desde un solo número suele ser el camino más corto y más barato.',
    },
    {
      q: '¿Puedo usar mi número de siempre?',
      a: 'Con la API, un número solo puede estar en un sitio: si lo pasas a la API, deja de funcionar en la app normal de ese teléfono. Es la razón por la que muchos negocios acaban con dos números sin haberlo querido. Las soluciones que vinculan como WhatsApp Web no tienen ese problema.',
    },
  ],
} as const;
