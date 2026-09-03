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

/** ⚠️ RELLENAR ANTES DE PUBLICAR. */
export const EMPRESA = {
  razonSocial: '[RAZÓN SOCIAL — completar]',
  ruc: '[RUC — completar]',
  domicilio: '[DOMICILIO FISCAL — completar]',
  email: '[CORREO DE CONTACTO — completar]',
  ciudad: 'Lima, Perú',
  whatsapp: `+${WHATSAPP.phone}`,
} as const;

/**
 * Fecha de última actualización. Escrita a mano y NO `new Date()`: una página
 * legal que dice "actualizado hoy" cada día que alguien la abre no está
 * informando de nada — el sentido de esa fecha es marcar cuándo cambió el
 * texto, y eso solo lo sabe quien lo cambia.
 */
export const ACTUALIZADO = '3 de septiembre de 2026';

export type Bloque = { h?: string; p?: string[]; li?: string[] };
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
      h: 'Con quién se comparten',
      p: [
        'Con los proveedores necesarios para que el servicio funcione: la infraestructura de mensajería de WhatsApp y Meta, nuestro proveedor de alojamiento y base de datos, y el proveedor de pagos. Cada uno trata solo lo que necesita para su función.',
        'No vendemos datos personales ni los cedemos a terceros con fines publicitarios.',
      ],
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
      ],
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

export const PAGINAS_LEGALES = [TERMINOS, PRIVACIDAD, GARANTIA] as const;
