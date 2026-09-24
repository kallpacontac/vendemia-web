import { BRAND, WHATSAPP } from '@/lib/content';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * TEXTOS LEGALES — BORRADORES, NO ASESORÍA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ ESTO LO TIENE QUE REVISAR UN ABOGADO ANTES DE PUBLICARSE.
 *
 * Lo que hay aquí es un punto de partida escrito sobre lo que la landing YA
 * promete —S/89 a S/189 al mes, sin permanencia, 30 días de garantía, atención
 * por WhatsApp— para que la web deje de anunciar cuatro páginas legales que no
 * existían. No sustituye a un abogado, y menos en la parte de datos personales:
 * Vendemia trata conversaciones de WhatsApp de terceros (los clientes de tus
 * clientes), y eso en Perú entra de lleno en la Ley 29733 de Protección de
 * Datos Personales, con obligación de inscribir el banco de datos ante la
 * Autoridad Nacional. Eso no se resuelve con una página web.
 *
 * ⚠️ HAY DATOS DE LA EMPRESA SIN RELLENAR, Y ESTÁN A PROPÓSITO ASÍ.
 *
 * Razón social, RUC y domicilio fiscal no me los sé y no me los invento: en un
 * documento legal un dato inventado es peor que un hueco. Van marcados abajo
 * entre corchetes para que sea imposible publicarlos sin darse cuenta.
 * Rellénalos en `EMPRESA` y aparecen solos en las cuatro páginas.
 */

/**
 * Datos de la empresa titular, tomados de la ficha RUC.
 *
 * El correo es una dirección REAL y con dueño: en las tres páginas se ofrece
 * como vía para ejercer derechos ARCO y para pedir el reembolso, así que quien
 * escriba ahí tiene que encontrar a alguien. Si algún día deja de leerse, hay
 * que cambiarlo aquí antes de que caduque, no después.
 *
 * ⚠️ Y HAY ALGO QUE CONVIENE CONSULTAR CON EL CONTADOR, NO CONMIGO:
 * la actividad registrada de KALLPA TRIATLON S.A.C. es "Actividades
 * Deportivas" (CIIU 92413). Vender suscripciones de software no encaja ahí.
 * En Perú se pueden declarar actividades secundarias ante SUNAT, y facturar
 * un servicio que no corresponde a ninguna actividad registrada es el tipo de
 * cosa que aparece en una fiscalización, no en el lanzamiento. Merece una
 * consulta antes de emitir la primera factura de Vendemia.
 */
export const EMPRESA = {
  razonSocial: 'KALLPA TRIATLON S.A.C.',
  ruc: '20608585541',
  domicilio: 'Av. Talara Nro. 450, A.F. Angamos, Jesús María',
  /** Para el JSON-LD (addressLocality / addressRegion). Mismo domicilio de arriba. */
  distrito: 'Jesús María',
  region: 'Lima',
  /**
   * Correo del dominio y no el Gmail de antes: Meta, en la verificación de
   * negocio, busca que el correo de contacto sea del mismo dominio que la web.
   * Un Gmail no demuestra que la marca y la empresa sean la misma cosa.
   */
  email: 'contacto@vendemias.com',
  ciudad: 'Lima, Perú',
  /** Para leer: "+51 947 144 701". */
  telefono: '+51 947 144 701',
  /** Para enlazar y para el JSON-LD: "+51947144701". Sale de WHATSAPP, el número de todos los botones. */
  whatsapp: `+${WHATSAPP.phone}`,
} as const;

/**
 * Fecha de última actualización. Escrita a mano y NO `new Date()`: una página
 * legal que dice "actualizado hoy" cada día que alguien la abre no está
 * informando de nada — el sentido de esa fecha es marcar cuándo cambió el
 * texto, y eso solo lo sabe quien lo cambia.
 */
export const ACTUALIZADO = '24 de septiembre de 2026';

/**
 * La misma fecha en ISO, para el `lastmod` del sitemap.
 *
 * ⚠️ Las dos se mueven JUNTAS o ninguna. Están separadas solo porque una la lee
 * una persona al pie de la página y la otra un rastreador, no porque puedan
 * decir cosas distintas.
 */
export const ACTUALIZADO_ISO = '2026-09-24';

export type Bloque = {
  h?: string;
  p?: string[];
  li?: string[];
  /** Enlaces al final del bloque, como enlaces de verdad y no como una URL en el texto. */
  enlaces?: { href: string; label: string }[];
};
export type PaginaLegal = {
  slug: string;
  titulo: string;
  bajada: string;
  bloques: Bloque[];
};

export const TERMINOS: PaginaLegal = {
  slug: 'terminos',
  titulo: 'Términos del servicio',
  bajada: `Las reglas de uso de ${BRAND.name}. En castellano y sin letra pequeña, porque la letra pequeña es de donde salen los problemas.`,
  bloques: [
    {
      h: 'Quiénes somos',
      p: [
        `${EMPRESA.razonSocial}, con RUC ${EMPRESA.ruc} y domicilio en ${EMPRESA.domicilio}, es la titular de ${BRAND.name} y de la asistente de ventas por WhatsApp llamada Mia.`,
        'Al contratar el servicio aceptas estos términos. Si no estás de acuerdo con alguno, no contrates: es preferible eso a descubrirlo después.',
      ],
    },
    {
      h: 'Qué es el servicio',
      p: [
        'Vendemia conecta una asistente automatizada al número de WhatsApp de tu negocio para atender consultas, responder preguntas sobre tus productos o servicios, proponer y confirmar citas, y hacer seguimiento a conversaciones abiertas.',
        'La asistente responde con la información que tú configuras: tu catálogo, tus precios, tus horarios. No inventa condiciones comerciales que tú no hayas cargado.',
      ],
    },
    {
      h: 'Qué no es',
      p: [
        'No es un servicio de asesoría, ni garantiza un volumen de ventas, un número de citas ni un resultado comercial concreto. Cualquier cifra que aparezca en nuestra web es una estimación con supuestos declarados, no una promesa.',
        'No sustituye tu criterio: las decisiones sobre precios, promociones y compromisos con tus clientes siguen siendo tuyas, y tuya es también la responsabilidad de lo que se acuerde en tus conversaciones.',
      ],
    },
    {
      h: 'Tu cuenta y tu número',
      li: [
        'Necesitas ser mayor de edad y tener capacidad para contratar.',
        'Eres responsable de la veracidad de los datos que cargas y de mantener tus credenciales a buen recaudo.',
        'El servicio opera sobre el número de WhatsApp que tú indiques. Debes tener derecho a usarlo y a automatizar la atención en él.',
        'Te comprometes a usar el servicio conforme a las políticas de WhatsApp y de Meta, que pueden cambiar sin que dependa de nosotros.',
      ],
    },
    {
      h: 'Precios, cobro y permanencia',
      li: [
        'Los planes son mensuales y se cobran por adelantado. Los precios vigentes son los publicados en la web.',
        'No hay costo de instalación ni permanencia mínima: puedes cancelar cuando quieras y el servicio sigue activo hasta el final del período ya pagado.',
        'Si cambiamos precios, te avisamos con al menos 30 días de antelación y el cambio se aplica a partir de tu siguiente renovación.',
        'Los límites de conversaciones de cada plan son los publicados. Si los superas de forma sostenida, te proponemos el plan que corresponda antes de cobrarte nada distinto.',
      ],
    },
    {
      h: 'Disponibilidad',
      p: [
        'Hacemos lo razonable para que el servicio esté disponible de forma continua, pero depende de terceros —WhatsApp y Meta entre ellos— cuyas caídas o cambios de política no controlamos.',
        'Cuando tengamos que hacer mantenimiento programado, avisaremos con antelación.',
      ],
    },
    {
      h: 'Suspensión',
      p: [
        'Podemos suspender una cuenta que use el servicio para enviar mensajes no solicitados, para actividades ilícitas, o de una forma que ponga en riesgo el número o la cuenta de WhatsApp de otros usuarios. Cuando ocurra, te explicaremos el motivo.',
      ],
    },
    {
      h: 'Responsabilidad',
      p: [
        'El servicio se presta tal como se describe. En la medida en que la ley lo permita, nuestra responsabilidad frente a ti se limita al importe que nos hayas pagado en los tres meses anteriores al hecho que la origine.',
        'Nada de lo anterior limita los derechos que te reconoce el Código de Protección y Defensa del Consumidor ni la responsabilidad por dolo o culpa inexcusable.',
      ],
    },
    {
      h: 'Ley aplicable',
      p: [
        'Estos términos se rigen por las leyes de la República del Perú. Para cualquier controversia, las partes se someten a los jueces y tribunales del distrito judicial de Lima, sin perjuicio de que puedas acudir a Indecopi por la vía del consumidor.',
      ],
    },
  ],
};

export const PRIVACIDAD: PaginaLegal = {
  slug: 'privacidad',
  titulo: 'Política de privacidad',
  bajada:
    'Qué datos tratamos, para qué, cuánto los guardamos y qué puedes exigirnos en cualquier momento.',
  bloques: [
    {
      h: 'Responsable del tratamiento',
      p: [
        `${EMPRESA.razonSocial}, RUC ${EMPRESA.ruc}, con domicilio en ${EMPRESA.domicilio}. Para cualquier asunto de datos personales puedes escribirnos a ${EMPRESA.email} o al ${EMPRESA.whatsapp}.`,
      ],
    },
    {
      h: 'Hay dos tipos de personas en esta política, y conviene distinguirlas',
      p: [
        'Por un lado estás tú, el negocio que contrata Vendemia. Por otro están las personas que le escriben a tu WhatsApp, que son tus clientes y no los nuestros.',
        'Sobre tus datos como cliente somos responsables. Sobre los datos de las personas que te escriben actuamos como encargados: los tratamos por cuenta tuya, siguiendo tus instrucciones, y el responsable frente a ellas eres tú.',
      ],
    },
    {
      h: 'La asistente es de cada negocio, no un asistente de uso general',
      p: [
        'Mia, la asistente de Vendemia, se configura para un negocio concreto: atiende las consultas de los clientes de ese negocio sobre sus productos, sus precios, sus horarios y sus citas, con la información que el propio negocio carga en su panel.',
        'No es un asistente de inteligencia artificial de uso general ni un servicio al que el público pueda escribir para cualquier cosa. Cada conversación pertenece al negocio en cuyo número de WhatsApp tiene lugar, y solo ese negocio la ve.',
      ],
    },
    {
      h: 'Qué tratamos de ti',
      li: [
        'Datos de identificación y contacto: nombre, correo, teléfono, datos del negocio.',
        'Datos de facturación y del plan contratado.',
        'Datos de uso del panel: accesos, configuración y métricas agregadas del servicio.',
      ],
    },
    {
      h: 'Qué tratamos por cuenta tuya',
      li: [
        'El contenido de las conversaciones que la asistente mantiene en tu número de WhatsApp.',
        'El número de teléfono y el nombre de perfil de quien escribe.',
        'Los datos que esa persona facilite voluntariamente en la conversación (una cita, un pedido, una dirección de entrega).',
      ],
      p: [
        'Puedes excluir números concretos para que la asistente no intervenga en esas conversaciones.',
      ],
    },
    {
      h: 'Para qué',
      li: [
        'Prestar el servicio: atender, responder, agendar y hacer seguimiento en tu nombre.',
        'Facturarte y darte soporte.',
        'Mejorar el servicio a partir de información agregada, no de conversaciones identificables.',
      ],
    },
    {
      h: 'Datos obtenidos de la plataforma de WhatsApp',
      p: [
        'Para prestar el servicio recibimos, a través de la API de WhatsApp Business de Meta, los datos de las conversaciones que ocurren en el número de WhatsApp del negocio que nos contrató:',
      ],
      li: [
        'El número de teléfono y el nombre de perfil de WhatsApp de quien escribe.',
        'El contenido de los mensajes: texto, notas de voz, imágenes y documentos que esa persona envía, y las respuestas que se le dan.',
        'Los datos técnicos de cada mensaje que la plataforma entrega junto a él, como la fecha, la hora y el estado de entrega.',
      ],
    },
    {
      p: [
        'Esos datos se usan únicamente para prestar el servicio al negocio que nos contrató: responder a sus clientes, agendar sus citas, registrar sus pedidos y enseñarle sus conversaciones en su panel.',
        'No los vendemos, no los cedemos a terceros, no los usamos para publicidad ni para crear perfiles, y no los cruzamos entre negocios distintos: lo que un cliente le dice a un negocio no lo ve ningún otro.',
      ],
    },
    {
      h: 'Con quién se comparten',
      p: [
        'Solo con los proveedores necesarios para que el servicio funcione, que actúan como encargados y tratan únicamente lo que necesitan para su función:',
      ],
      li: [
        'Meta, como proveedor de la API de WhatsApp Business por la que se envían y reciben los mensajes.',
        'El proveedor de inteligencia artificial que genera las respuestas de la asistente, que recibe el contenido de la conversación en curso para poder contestarla.',
        'Nuestros proveedores de alojamiento, base de datos y almacenamiento de archivos (donde se guardan las conversaciones y los archivos enviados).',
        'El proveedor de pagos, solo para cobrar el plan del negocio que nos contrata.',
      ],
    },
    {
      p: ['No vendemos datos personales ni los cedemos a terceros con fines publicitarios.'],
    },
    {
      h: 'Transferencias internacionales',
      p: [
        'Parte de la infraestructura está alojada fuera del Perú. Cuando eso implique un flujo transfronterizo de datos personales, se realiza con las garantías que exige la Ley 29733 y su reglamento.',
      ],
    },
    {
      h: 'Cuánto tiempo',
      p: [
        'Tus datos de cliente, mientras la relación esté vigente y después durante los plazos legales de conservación contable y tributaria.',
        'Las conversaciones, mientras las necesites para operar y como máximo el plazo que acordemos contigo. Al cancelar el servicio puedes pedir su devolución o su eliminación.',
      ],
    },
    {
      h: 'Tus derechos',
      p: [
        `Puedes acceder a tus datos, rectificarlos, cancelarlos y oponerte a su tratamiento —los derechos ARCO de la Ley 29733— escribiendo a ${EMPRESA.email}. Responderemos en los plazos legales.`,
        'Si consideras que no hemos atendido bien tu solicitud, puedes acudir a la Autoridad Nacional de Protección de Datos Personales del Ministerio de Justicia.',
        'Si le escribiste por WhatsApp a un negocio que usa Vendemia y quieres que se borren tus datos, el procedimiento está explicado paso a paso en nuestra página de eliminación de datos.',
      ],
      enlaces: [{ href: '/eliminacion-de-datos', label: 'Cómo pedir la eliminación de tus datos' }],
    },
    {
      /**
       * ⚠️ ESTE APARTADO DECÍA QUE NO HABÍA SEGUIMIENTO DE TERCEROS, Y DEJÓ DE
       * SER CIERTO EN EL MOMENTO EN QUE SE AÑADIÓ EL PIXEL DE META.
       *
       * Una política de privacidad que se queda vieja no es un descuido de
       * redacción: es exactamente la infracción que se sanciona. Si mañana se
       * añade otra herramienta —Google Ads, TikTok, un mapa de calor— hay que
       * volver aquí ANTES de desplegarla, no después.
       */
      h: 'Cookies y medición',
      p: [
        'Esta web usa el píxel de Meta para medir la efectividad de nuestros anuncios en Facebook e Instagram: nos permite saber cuántas personas que vieron un anuncio llegaron a la web y cuántas nos escribieron. Meta puede usar esa información para mostrarte nuestros anuncios de nuevo.',
        'Lo que le enviamos son datos de navegación —la página visitada y qué botón se pulsó—, nunca tu nombre, tu correo, tu teléfono ni el contenido de ninguna conversación.',
        'Puedes bloquearlo desde la configuración de tu navegador o con cualquier extensión de bloqueo, y la web sigue funcionando igual. Fuera de eso, no instalamos cookies de publicidad de terceros. El panel usa únicamente el almacenamiento local imprescindible para mantener tu sesión iniciada.',
      ],
    },
  ],
};

export const GARANTIA: PaginaLegal = {
  slug: 'garantia',
  titulo: 'Garantía de reembolso',
  bajada:
    'Treinta días para probarlo. Si no te sirve, te devolvemos el dinero. Esta página dice exactamente cómo.',
  bloques: [
    {
      h: 'Qué cubre',
      p: [
        'Si dentro de los primeros 30 días naturales desde tu primer pago decides que Vendemia no te ayuda a responder más rápido ni a cerrar más ventas, te devolvemos íntegro ese primer pago.',
        'No hay que justificar el motivo ni pasar por una llamada de retención.',
      ],
    },
    {
      h: 'Cómo se pide',
      li: [
        `Escribiendo al ${EMPRESA.whatsapp} o a ${EMPRESA.email} desde el contacto asociado a la cuenta.`,
        'Basta con decir que quieres acogerte a la garantía. No pedimos explicaciones.',
      ],
    },
    {
      h: 'Plazos',
      li: [
        'Confirmamos la solicitud en un máximo de 2 días hábiles.',
        'El reembolso se emite dentro de los 7 días hábiles siguientes a esa confirmación, por el mismo medio con el que pagaste.',
        'El tiempo que tarde en verse reflejado depende de tu banco o de tu billetera, no de nosotros.',
      ],
    },
    {
      h: 'Qué pasa con el servicio y con tus datos',
      p: [
        'Al aceptarse el reembolso, el servicio se desactiva. Antes de eliminar nada te damos la opción de llevarte el historial de conversaciones y los contactos generados durante el período.',
      ],
    },
    {
      h: 'Límites',
      li: [
        'La garantía aplica una vez por negocio y solo sobre el primer pago.',
        'No cubre los meses posteriores al primero, que puedes cancelar en cualquier momento sin permanencia.',
        'Esta garantía es adicional a los derechos que te reconoce el Código de Protección y Defensa del Consumidor, no los sustituye.',
      ],
    },
  ],
};

/**
 * ⚠️ EL LIBRO DE RECLAMACIONES NO ES UNA PÁGINA MÁS.
 *
 * Es una obligación del Código de Protección y Defensa del Consumidor (Ley
 * 29571) y de su reglamento del Libro de Reclamaciones: quien vende por
 * internet tiene que ofrecerlo en formato virtual, con acceso visible desde la
 * página principal. Los campos de este formulario son los que exige la norma,
 * no una selección estética: quitar uno es incumplir.
 *
 * Y hay dos obligaciones que NO se resuelven con esta página y que son tuyas:
 * conservar el registro de cada reclamación, y responder dentro del plazo
 * legal. Ver la nota del componente sobre por qué esto, hoy, sale por WhatsApp.
 */
export const RECLAMACIONES = {
  slug: 'reclamaciones',
  titulo: 'Libro de Reclamaciones',
  bajada:
    'Conforme al Código de Protección y Defensa del Consumidor, este establecimiento cuenta con un Libro de Reclamaciones virtual a tu disposición.',
  aviso:
    'La formulación de un reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para denunciar ante Indecopi.',
  plazo:
    'Responderemos tu reclamo o queja en un plazo máximo de 15 días hábiles, prorrogable por un plazo igual cuando la naturaleza del caso lo justifique.',
  diferencia: {
    reclamo: 'Reclamo · disconformidad con el producto o servicio contratado.',
    queja: 'Queja · malestar con la atención recibida, no con el servicio en sí.',
  },
} as const;

/**
 * /nosotros — quién está detrás de la marca.
 *
 * La lee sobre todo quien verifica: la revisión de negocio de Meta y la de la
 * app como Tech Provider comprueban que la marca y la empresa legal son la
 * misma, y que el uso de WhatsApp es el de un software para negocios. Por eso
 * dice las dos cosas sin rodeos y en el primer párrafo.
 */
export const NOSOTROS: PaginaLegal = {
  slug: 'nosotros',
  titulo: 'Sobre nosotros',
  bajada: `${BRAND.name} es un software de atención y ventas por WhatsApp para pequeños negocios del Perú.`,
  bloques: [
    {
      h: 'Qué hacemos',
      p: [
        `${BRAND.name} le da a cada negocio una asistente, Mia, que atiende por WhatsApp a sus clientes: responde preguntas sobre sus productos y precios, agenda citas, toma pedidos y hace seguimiento de las conversaciones que quedaron abiertas.`,
        'Mia responde con la información que el propio negocio configura en su panel —su catálogo, sus precios, sus horarios— y el negocio ve todas sus conversaciones y puede tomar el control de cualquiera en cualquier momento.',
      ],
    },
    {
      h: 'Para quién',
      p: [
        'Para pymes peruanas que venden y atienden por WhatsApp: barberías y salones, clínicas, academias y gimnasios, tiendas online. Negocios en los que un mensaje sin responder es una venta perdida y no hay una persona dedicada solo a contestar.',
      ],
    },
    {
      h: 'Cómo nos conectamos a WhatsApp',
      p: [
        `${BRAND.name} usa la API oficial de WhatsApp Business de Meta. Cada negocio conecta su propio número mediante el registro de Meta, desde su panel, y los mensajes se envían y reciben por esa API.`,
        'Mia atiende solo a los clientes del negocio que la contrató y solo en su número. No es un asistente de uso general ni envía mensajes masivos: responde a quien le escribe al negocio.',
      ],
    },
    {
      h: 'Quién está detrás',
      p: [
        `${BRAND.name} es una marca de ${EMPRESA.razonSocial}, sociedad peruana con RUC ${EMPRESA.ruc} y domicilio en ${EMPRESA.domicilio}, ${EMPRESA.ciudad}. Es la empresa que presta el servicio, emite las facturas y responde ante los clientes.`,
      ],
      enlaces: [
        { href: '/contacto', label: 'Contacto' },
        { href: '/terminos', label: 'Términos del servicio' },
        { href: '/privacidad', label: 'Política de privacidad' },
      ],
    },
  ],
};

/**
 * /eliminacion-de-datos — la URL de «instrucciones de eliminación de datos»
 * que se registra en la configuración de la app de Meta.
 *
 * Meta la exige y la visita: tiene que decir a quién escribir, qué se borra y
 * en cuánto tiempo. Y la tiene que entender quien le escribió a una barbería,
 * no un abogado: por eso separa al negocio de su cliente, que son dos pedidos
 * distintos.
 *
 * ⚠️ Los plazos son promesas. Si no se pueden cumplir, se cambian aquí antes
 * de que venza el primero, no después.
 */
export const ELIMINACION: PaginaLegal = {
  slug: 'eliminacion-de-datos',
  titulo: 'Eliminación de datos',
  bajada:
    'Cómo pedir que borremos tus datos, qué se borra y en cuánto tiempo. Vale tanto si eres un negocio que usa Vendemia como si le escribiste por WhatsApp a uno.',
  bloques: [
    {
      h: 'Cómo pedirlo',
      p: ['Escríbenos por cualquiera de estas dos vías con el asunto «Eliminación de datos»:'],
      li: [`Correo: ${EMPRESA.email}`, `WhatsApp: ${EMPRESA.telefono}`],
    },
    {
      p: ['Para encontrar tus datos necesitamos:'],
      li: [
        'Si le escribiste a un negocio: el número de teléfono desde el que escribiste y el nombre del negocio.',
        'Si eres un negocio que usa Vendemia: el nombre del negocio y el correo o teléfono asociado a la cuenta.',
      ],
    },
    {
      p: [
        'Antes de borrar comprobamos que la petición viene de quien dice venir: normalmente, pidiéndote que nos escribas desde el mismo número o correo. Así nadie puede borrar los datos de otra persona.',
      ],
    },
    {
      h: 'Qué se borra',
      li: [
        'Si le escribiste a un negocio: tu número, tu nombre de perfil, el historial de conversación con ese negocio y los archivos que enviaste, junto con los datos que diste en ella (nombre, dirección, datos de una cita o de un pedido).',
        'Si eres un negocio: tu cuenta, la configuración de tu asistente, tu catálogo y las conversaciones de tus clientes. Antes de borrarlas te ofrecemos una copia, si la quieres.',
      ],
    },
    {
      h: 'Qué se conserva, y por qué',
      p: [
        'Solo lo que la ley nos obliga a guardar: los comprobantes de pago y los datos de facturación de los negocios, durante los plazos de conservación tributaria. No se usan para nada más.',
        'Si el negocio al que escribiste necesita conservar el registro de una venta o una cita por sus propias obligaciones legales, te lo diremos al responderte.',
      ],
    },
    {
      h: 'Plazos',
      li: [
        'Confirmamos que recibimos tu pedido en un máximo de 2 días hábiles.',
        'La eliminación queda hecha en un máximo de 10 días hábiles desde que comprobamos tu identidad, y te avisamos cuando está hecha.',
      ],
    },
    {
      h: 'Si le escribiste a un negocio',
      p: [
        'Ese negocio es el responsable de tus datos y nosotros tratamos esas conversaciones por encargo suyo. Puedes pedirle la eliminación a él o directamente a nosotros: si nos escribes, la hacemos y se lo comunicamos.',
      ],
      enlaces: [{ href: '/privacidad', label: 'Política de privacidad completa' }],
    },
  ],
};

export const PAGINAS_LEGALES = [TERMINOS, PRIVACIDAD, GARANTIA] as const;
