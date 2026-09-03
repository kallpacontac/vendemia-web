/**
 * Todo el copy de la página, tipado. Nada hardcodeado en el JSX.
 *
 * Fuente: el index.html de Vendemia. Producto real — vendedor digital que
 * atiende y cierra por WhatsApp, mercado peruano, precios en soles. Se llama
 * Mia. Sobre por qué NUNCA se le llama "bot", ver la nota sobre HERO.
 *
 * Dos secciones no tenían equivalente directo en el HTML y las resolví así
 * (están marcadas más abajo):
 *   · Sección 5 (la del globo) → "Mia no duerme": el visual de disponibilidad
 *     permanente sustituye al de red global. Es el mismo argumento, 24/7.
 *   · Sección 11 (productos relacionados) → las tres ventajas de la comparativa
 *     "Vendemia vs otros", que en el HTML viven en una tabla.
 *
 * Los números (78 %, 21x, 5 min, S/500, 30 s, 10 min) vienen de tu HTML tal
 * cual. No he inventado ninguno.
 *
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CÓMO ESTÁ ESTRUCTURADA ESTA PÁGINA, Y POR QUÉ
 * ══════════════════════════════════════════════════════════════════════════
 *
 * El orden NO es "hero, características, precios, pie". Es la lista de
 * OBJECIONES que se hace quien llega, resueltas en el orden en que aparecen.
 * Cada sección tiene UN trabajo; si no responde a una objeción, sobra.
 *
 *   #   sección       la pregunta que responde        la pieza de copy
 *   ──  ────────────  ──────────────────────────────  ─────────────────────
 *    1  Hero          ¿qué es y qué gano?             dolor con cifra + categoría
 *                     ¿y si me sale mal?              HERO.footnote (garantía)
 *                     ¿esto es real?                  HERO.socialProof
 *    2  Benefit       ¿me pasa a mí?                  calculadora con SUS números
 *    3  BentoA        ¿cómo funciona?                 el mecanismo
 *    4  ChatDemo      ¿funciona de verdad?            que lo vea con su rubro
 *    5  BentoB        ¿qué más hace?                  resultados, no funciones
 *    6  Always-on     ¿y cuando no estoy?             24/7
 *    7  UseCases      ¿sirve para MI negocio?         por rubro, con sus tareas
 *    8  Pricing       ¿cuánto cuesta? ¿me van a       precio + garantía +
 *                     cobrar de más?                  planes por tipo de lector
 *    9  Faq           mis dudas sueltas               objeciones nombradas
 *   10  Related       ¿por qué tú y no el otro?       las 3 diferencias que pesan
 *   11  FinalCta      la petición                     dolor → botón → garantía
 *
 * TRES REGLAS que hay que respetar al escribir aquí:
 *
 *  1 · LOS TÍTULOS DICEN RESULTADOS, EL CUERPO DICE MECANISMOS. Nunca al
 *      revés. "Seguimiento inteligente a 24 horas" es lo que el software
 *      tiene; 'Rescata al que dijo "ya te aviso"' es lo que al lector le pasa.
 *      Lo segundo no hay que traducirlo.
 *
 *  2 · LA GARANTÍA VA PEGADA A CADA PETICIÓN, no en una sección aparte.
 *      Aparece tres veces —bajo el botón del hero, bajo los precios y bajo el
 *      botón final— porque son los tres sitios donde se abandona. No es
 *      repetirse: es responder "¿y si me sale mal?" en el momento en que se
 *      pregunta.
 *
 *  3 · LOS BOTONES VAN EN PRIMERA PERSONA. "Empiezo con Seller", "Quiero
 *      probar Mia gratis" — no "Empezar ahora". Redactado como lo diría el
 *      usuario, el clic continúa su propia frase; en imperativo es una orden
 *      de la página.
 *
 * La primera objeción de todas —"¿esto es real?"— la responde la fila de
 * negocios bajo el hero. Es la más barata de responder y la que más sostiene
 * al resto: mientras no haya una prueba, los datos de la página (78 %, 21x,
 * 30 s) son afirmaciones nuestras. Ver la nota sobre HERO.socialProof para el
 * siguiente paso, que es convertir uno de esos nombres en un testimonio con
 * cifra.
 */

export const BRAND = {
  name: 'VENDEMIA',
  // Ver la nota de posicionamiento sobre HERO: la categoría es "vendedor
  // digital", nunca "bot".
  /** El wordmark del logo parte en dos colores: "vende" tinta + "mia" azul. */
  letters: ['V', 'E', 'N', 'D', 'E', 'M', 'I', 'A'] as const,
  /** Índice desde el que las letras van en azul de marca */
  accentFrom: 5,
  tagline: 'Tu vendedor digital en WhatsApp',
} as const;

/* ── Barra de anuncio + navbar ────────────────────────────── */

/**
 * ⚠️ ESTA LANDING NO VIVE SOLA: ES EL index DEL BACKOFFICE.
 *
 * El build estático se copia dentro de kallpabot-backoffice, junto a
 * login.html, dashboard.html y las demás. O sea que "Iniciar sesión" tiene un
 * destino REAL, y hasta ahora apuntaba a #final-cta — un ancla de relleno que
 * dejaba al visitante dando vueltas por la misma página.
 *
 * ⚠️ VA ANTES DE ANNOUNCEMENT A PROPÓSITO, y no es cuestión de orden
 * estético: ANNOUNCEMENT lo usa en su `href`. Un `const` de módulo está en
 * zona muerta temporal hasta su línea, así que declararlo DESPUÉS no da un
 * aviso — lanza "Cannot access 'SITIO' before initialization" al cargar el
 * módulo y la página entera se queda en blanco. Si mueves este bloque,
 * muévelo hacia arriba, nunca hacia abajo.
 *
 * ⚠️ AHORA SON RUTAS DE NEXT, Y POR ESO SON ABSOLUTAS.
 *
 * Antes eran "./login.html" y "./dashboard.html": el panel era una carpeta de
 * HTML sueltos y el prefijo relativo permitía servirlo también desde un
 * subdirectorio o abierto a pelo desde el disco. El panel ya son rutas de la
 * misma aplicación (app/(acceso)/login, app/(panel)/panel), así que van con
 * barra inicial — un "./login" desde /panel/leads resolvería a
 * /panel/leads/login, que no existe.
 */
export const SITIO = {
  login: '/login',
  panel: '/panel',
} as const;


/**
 * UN SOLO NOMBRE PARA LA ACCION PRINCIPAL, EN TODA LA PAGINA.
 *
 * Habia cuatro etiquetas distintas para el mismo clic -- "Prueba gratis" en el
 * navbar, "Empieza gratis - sin tarjeta" en el hero, "Empiezo con Starter" en
 * precios y "Quiero probar Mia gratis" en el cierre -- y encima llevaban a TRES
 * destinos distintos (#pricing, #final-cta y wa.me). Quien baja la pagina no
 * reconoce que le han pedido lo mismo cuatro veces: lee cuatro ofertas y se
 * queda sin saber cual es la buena.
 *
 * Y LA PALABRA "GRATIS" SE HA IDO DE TODAS ELLAS.
 *
 * No hay periodo de prueba: se paga desde el primer mes y lo que hay es
 * garantia de reembolso a 30 dias. Prometer "gratis, sin tarjeta" y aterrizar
 * en una tabla que empieza en S/89 rompe la confianza en el punto exacto de
 * maxima intencion, que es el peor sitio donde se puede romper. Lo que si es
 * cierto -- riesgo cero -- vende igual de bien y ademas se puede sostener.
 *
 * `long` va en el hero y en el cierre, donde hay sitio para decir a donde
 * lleva el clic. `short` va en el navbar, donde la pildora no da para mas.
 * Los dos abren la MISMA conversacion de WhatsApp.
 *
 * OJO: "Probar Mia" solo es cierto si al otro lado contesta Mia. Si de momento
 * contestas tu a mano, cambia `long` por 'Escribeme por WhatsApp' -- prometer
 * que va a probar el producto y que le conteste un humano es justo la primera
 * impresion que este producto no se puede permitir.
 */
export const CTA = {
  long: 'Probar Mia por WhatsApp',
  short: 'Probar Mia',
  secondary: 'Ver a Mia vendiendo',
} as const;


/**
 * ⚠️ TODO ENLACE LLEVA A ALGÚN SITIO, O NO ES UN ENLACE.
 *
 * Aquí no hay `href: '#'`. Un ancla vacía no es un enlace pendiente: navega al
 * principio de la página, mete una entrada en el historial (y rompe el botón
 * "atrás") y un lector de pantalla la anuncia como enlace aunque no lleve a
 * nada. Se auditó y había 31 de 52 así.
 *
 * Cuando el destino todavía no existe (blog, contacto, legales…), el `href` se
 * deja SIN DEFINIR y el componente pinta texto plano en vez de un enlace. Se ve
 * igual, pero deja de mentir. En cuanto exista la página, se añade el href aquí
 * y se convierte en enlace solo.
 */
export const ANNOUNCEMENT = {
  text: 'Mia activa 24/7 · Responde en menos de 30 segundos',
  // Es el aria-label de la flecha, y la flecha lleva a #pricing. Decía "Probar
  // gratis": quien navega con lector de pantalla oía una cosa y aterrizaba en
  // otra. La etiqueta tiene que describir el DESTINO, no el deseo.
  cta: 'Ver precios',
  links: [
    { label: 'Iniciar sesión', href: SITIO.login },
    { label: 'Precios', href: '#pricing' },
    { label: 'FAQ', href: '#faq' },
  ],
} as const;

/**
 * ⚠️ "Comparativa" apunta a #related, NO a la sección del 24/7.
 *
 * Apuntaba a #global, que es "Tu negocio cierra a las 8. Mia no cierra nunca."
 * — disponibilidad, no comparación. La comparativa real ("El mismo canal.
 * Distinto resultado.", con S/0 de instalación, 10 minutos y la garantía) vive
 * en RELATED. Era un enlace que sí resolvía y por eso no saltaba en ninguna
 * comprobación automática: llevaba a la sección equivocada, que es peor que no
 * llevar a ninguna.
 */
export const NAV_LINKS = [
  { label: 'Cómo funciona', href: '#bento-a', hasChevron: false },
  { label: 'Comparativa', href: '#related', hasChevron: false },
  { label: 'Precios', href: '#pricing', hasChevron: false },
  { label: 'FAQ', href: '#faq', hasChevron: false },
] as const;

export const NAV_CTA = {
  ghost: 'Iniciar sesión',
  solid: CTA.short,
} as const;

/* ── WhatsApp ─────────────────────────────────────────────── */

/**
 * El CTA "Prueba gratis" abre WhatsApp con la conversación empezada.
 *
 * Tiene sentido que sea WhatsApp y no un formulario: el producto ES un
 * vendedor de WhatsApp, así que el primer contacto por el mismo canal es
 * además una demostración.
 *
 * ── Formato del número ───────────────────────────────────────────────────
 * `wa.me` quiere el número internacional SIN el `+`, sin espacios y sin
 * guiones. +51 947 144 701 → "51947144701". Si le cuelas el `+` o un espacio,
 * WhatsApp abre pero con el número en blanco y el usuario no sabe a quién
 * escribe.
 *
 * El mensaje se escribe aquí en claro y lo codifica whatsappUrl(); no lo
 * guardes ya codificado o acabará con dobles escapes (%2520) la primera vez
 * que alguien lo edite.
 */
export const WHATSAPP = {
  /** +51 947 144 701 */
  phone: '51947144701',
  // Decia "Quiero probar Vendemia GRATIS en mi negocio". Lo peor no es que el
  // mensaje lo escriba la pagina: es que lo escribe EL CLIENTE, en primera
  // persona, y llega a tu WhatsApp con una expectativa de trial que no existe.
  // La conversacion arrancaba con un malentendido que tenias que deshacer tu
  // en el primer mensaje, que es el peor sitio para tener que decir "no".
  message: 'Hola 👋 Quiero probar Mia en el WhatsApp de mi negocio.',
} as const;

/** Construye el enlace de WhatsApp con el mensaje ya escrito. */
export function whatsappUrl(message: string = WHATSAPP.message): string {
  return `https://wa.me/${WHATSAPP.phone}?text=${encodeURIComponent(message)}`;
}

/**
 * Los atributos COMPLETOS de un CTA que abre WhatsApp. Vivía dentro de
 * Navbar.tsx, pero el CTA final también lo necesita y duplicarlo es la forma
 * de que dentro de un mes uno de los dos apunte a otro número.
 *
 *   · target="_blank"  → WhatsApp abre aparte y no se pierde la landing, que
 *                        es donde el usuario estaba decidiendo.
 *   · rel="noopener"   → sin esto la página destino recibe window.opener y
 *                        puede redirigir la nuestra. `noreferrer` además evita
 *                        filtrar de dónde viene.
 *   · aria-label       → el texto visible dice "Prueba gratis"; sin esto, quien
 *                        navega con lector de pantalla no sabe que va a salir a
 *                        WhatsApp hasta que ya está fuera.
 */
export function whatsappLink(label: string, message?: string) {
  return {
    href: whatsappUrl(message),
    target: '_blank',
    rel: 'noopener noreferrer',
    'aria-label': `${label} — escríbenos por WhatsApp`,
  } as const;
}

/* ── 1 · Hero ─────────────────────────────────────────────── */

/**
 * ⚠️ POSICIONAMIENTO · LA PALABRA "BOT" NO APARECE EN NINGUNA PARTE
 *
 * Mia no se vende como un bot ni como un chatbot. Se vende como un VENDEDOR
 * DIGITAL. No es maquillaje de copy: es la diferencia de categoría, y la
 * investigación del sector la respalda —
 *
 *   · un chatbot es REACTIVO: espera a que le escriban y CONTESTA. Su métrica
 *     es cuántas consultas desvía;
 *   · un vendedor es PROACTIVO: maneja la objeción, insiste una vez, agenda y
 *     CIERRA. Su métrica es cuánto vende.
 *
 * Quien busca "bot de WhatsApp" en Perú tiene ya una expectativa formada —
 * menús de "responde 1, responde 2", respuestas rígidas, y la sensación de
 * estar hablando con una máquina que no entiende. Entrar en esa categoría es
 * competir en precio dentro de una expectativa baja. La categoría "vendedor
 * digital" se compara con contratar a alguien, y ahí S/89 al mes es barato.
 *
 * Ni siquiera se usa para negarlo ("no somos un chatbot"): nombrar a la
 * categoría rival la refuerza. Se contrasta por el COMPORTAMIENTO —
 * "contestar" frente a "vender"— sin decir la palabra.
 *
 * Vocabulario de reemplazo, por si hay que escribir copy nuevo:
 *   bot / chatbot        → vendedor digital · Mia
 *   "responde mensajes"  → "atiende y cierra"
 *   "automatiza"         → "vende por ti"
 *   "sonar a robot"      → "sonar a mensaje automático"
 */
export const HERO = {
  badge: 'Mia atiende 24/7',
  /**
   * AQUI HABIA UNA CIFRA SORTEADA CON Math.random() EN CADA CARGA.
   *
   * El titular decia "Cada minuto que tardas, pierdes {n} ventas" y <CountUp>
   * rellenaba el hueco con un numero al azar entre 4 y 99. Tres problemas, y
   * con el primero basta:
   *
   *  1 · Es un dato inventado presentado como dato. Dos visitas seguidas ven
   *      cifras distintas, y quien lo nota deja de creerse tambien el 78 %, el
   *      21x y el S/1,497 -- que esos si estan sostenidos. Una cifra falsa no
   *      cuesta una cifra: cuesta todas las demas.
   *  2 · Nadie pierde 4 ni 99 ventas por minuto. La frase no aguanta el primer
   *      segundo de aritmetica mental de un dueno de negocio, que es
   *      exactamente el lector que tenemos.
   *  3 · El servidor pinta siempre el valor inicial, asi que a Google le
   *      llegaba literalmente "pierdes 4 ventas" como H1.
   *
   * El gancho numerico no se pierde: vive 300 px mas abajo, en la calculadora
   * de BENEFIT, donde la cifra sale de LOS SUYOS y por eso convence.
   *
   * El titular nuevo hace tres trabajos de una vez: nombra el dolor en las
   * primeras palabras ("perder ventas"), nombra la causa ("responder tarde") y
   * nombra el canal ("WhatsApp"). Y son, ademas, las tres expresiones con las
   * que se busca esto en Peru, asi que el H1 pasa a trabajar tambien para SEO.
   */
  h1: 'Deja de perder ventas por responder tarde en WhatsApp',
  /**
   * El párrafo del hero hace UN trabajo: decir qué categoría es esto.
   *
   * El titular ya dio el dolor y la causa; aquí toca la respuesta a "¿qué
   * es?" en la primera línea, y el "¿qué hace?" en la segunda. Los cuatro
   * verbos van en el orden real de una venta —atender, objeción, agendar,
   * cobrar— porque enumerar capacidades sueltas se lee como lista de
   * funciones, y en secuencia se lee como un trabajo hecho de principio a fin.
   */
  // El H1 ya dice "WhatsApp", asi que el parrafo se lo ahorra y gana sitio
  // para "por Yape", que en Peru vale mas que cualquier adjetivo: es la prueba
  // de que esto esta hecho aqui y no traducido.
  paragraph:
    'Mia es tu vendedor digital: atiende en 30 segundos, resuelve la objeción, agenda la cita y cobra por Yape. Trabaja mientras tú atiendes el local, duermes o descansas el domingo.',
  primaryCta: CTA.long,
  // Llevaba a #final-cta, o sea al PIE de la pagina: quien queria ver como
  // funciona se saltaba de un golpe la calculadora, el mecanismo, la demo y
  // los precios, y aterrizaba en la peticion final sin un solo argumento
  // leido. Ahora lleva a #demo, que es donde se ve funcionando de verdad.
  secondaryCta: CTA.secondary,
  footnote: 'Garantía de reembolso · Sin costo de instalación · Funciona en 10 minutos',
  /**
   * ⚠️ ESTA LISTA AFIRMA EN PÚBLICO QUE SON CLIENTES. TRÁTALA COMO TAL.
   *
   * Responde a la primera objeción de quien llega —"¿esto es real?"— y por eso
   * se pinta bajo el hero. Confirmado que son negocios reales.
   *
   * La regla, para el día que alguien edite esto sin contexto: un nombre solo
   * entra aquí si el negocio ES cliente y ha dado permiso. Si deja de serlo, se
   * quita — no se deja "porque queda bien". Publicar nombres de terceros que no
   * son clientes es afirmar una relación comercial que no existe, y en Perú eso
   * cae bajo publicidad engañosa (Indecopi).
   *
   * SIGUIENTE PASO, y es el que más convierte: cambiar uno de estos nombres por
   * un testimonio con CIFRA ("pasamos de responder en 2 horas a 30 segundos").
   * Una frase con número atribuida a una persona vale más que los seis nombres
   * juntos, porque es la única prueba que sostiene los datos del resto de la
   * página en vez de pedir que se los crean.
   */
  socialProofLabel: 'Negocios peruanos que ya venden con Mia',
  // Los seis nombres anteriores (Barbería El Corte, DentPlus, FreshMart,
  // EstiloShop, MediTurno, Nails Studio) NO eran clientes. Cuatro nombres
  // reales sostienen la pagina; seis inventados la hunden, porque el lector es
  // del sector y nota que no existe ninguno. Ademas es lo que dice el aviso de
  // arriba: publicar una relacion comercial que no existe es publicidad
  // enganosa (Indecopi).
  socialProof: [
    'Peluquería Jhoyner',
    'Tienda Elvis',
    'Academia de Natación Kallpa',
    'Agencia Werner',
  ],
} as const;

/**
 * Ticker superior — datos que justifican toda la propuesta.
 *
 * ⚠️ LAS DOS CIFRAS DECIAN MAS DE LO QUE DICE EL ESTUDIO. Se comprobo contra
 * la fuente (Lead Response Management Study, MIT / InsideSales) y ninguna de
 * las dos versiones anteriores se sostenia:
 *
 *  · "reduce 21x tu probabilidad de VENTA" — el estudio mide la probabilidad
 *    de CALIFICAR al prospecto, que es llegar a hablar con el, no de venderle.
 *    Y no compara "menos de 5 minutos" contra "mas": compara 5 MINUTOS CONTRA
 *    30. Dicho como estaba, el numero era mas grande de lo que nadie ha medido.
 *
 *  · "el 78 % DECIDE con el primer contacto" — el dato es que el 78 % le COMPRA
 *    A QUIEN LE RESPONDE PRIMERO. Es otra cosa, y ademas es mejor para
 *    nosotros: "decide" habla de la cabeza del cliente, "le compra al primero"
 *    habla de una carrera que se puede ganar. Que es lo que vendemos.
 *
 * La version corregida es igual de dura y ya no hay que cruzar los dedos si
 * alguien busca la fuente. En una pagina cuyo argumento entero son numeros,
 * que un solo numero no aguante la comprobacion los tumba todos.
 */
export const TICKER = [
  'El 78 % le compra a quien le responde PRIMERO',
  'De 5 a 30 minutos: 21× menos opciones de llegar a hablar con él',
  'Cada minuto que tardas, un competidor cierra esa venta',
] as const;

/* ── 2 · La calculadora de pérdida ────────────────────────── */

/**
 * ⚠️ LA CALCULADORA ESTABA ESCRITA AQUI Y NO EXISTIA EN LA PANTALLA.
 *
 * `BENEFIT.calculator` llevaba etiquetas, metricas y hasta el texto del
 * supuesto, y Benefit.tsx no leia ni una sola de ellas: en su sitio pintaba una
 * ilustracion fija con el pie "Mueve los controles con tus numeros reales y
 * mira la cuenta". O sea que la pagina invitaba a mover unos controles que no
 * estaban. Es el tercer caso del mismo tipo en este fichero (el parrafo de
 * precios, el pie del hero) y de largo el mas caro: de todos los elementos de
 * una landing, un estimador con LOS NUMEROS DEL LECTOR es el que mas convierte,
 * porque deja de ser una afirmacion nuestra y pasa a ser una cuenta suya.
 *
 * ── DE DONDE SALE LA CIFRA, Y POR QUE ASI ────────────────────────────────
 *
 * El S/1,497 que habia escrito en `body` no se podia reconstruir con ningun
 * modelo: no cuadraba con las 20 consultas ni con el ticket de S/120 que la
 * propia frase declaraba. Un numero que el lector no puede rehacer con una
 * regla de tres es un numero en el que no va a confiar, y este ademas es EL
 * numero de la pagina.
 *
 * Ahora sale de dos supuestos, los dos escritos en pantalla debajo del
 * resultado, y de una cadena que se puede seguir de cabeza:
 *
 *   consultas/dia × fuga × cierre × 30 dias = ventas perdidas al mes
 *   ventas perdidas × ticket                = soles perdidos al mes
 *
 * Con los valores por defecto: 20 × 0.25 × 0.30 × 30 = 45 ventas, S/5,400.
 * Son el 7,5 % de las consultas del mes, que para un negocio que no contesta
 * fuera de horario es conservador y no heroico. Y el S/89 del plan Starter
 * sigue siendo menos de lo que se pierde en dos dias, que es lo que promete
 * PRICING.subtitle.
 *
 * ⚠️ ESTOS DOS NUMEROS SON TUYOS, NO MIOS. Son los unicos supuestos del
 * modelo y estan aqui, solos, para que los ajustes con lo que veas en tus
 * clientes. Todo lo demas de la seccion —el texto de `body` incluido— se
 * recalcula de ellos, asi que la pagina ya no se puede contradecir a si misma.
 */
export const MODELO_PERDIDA = {
  /** Parte de las consultas que llega cuando NO puedes contestar en 5 minutos. */
  fuga: 0.25,
  /** De las que si contestas a tiempo, cuantas acaban en venta. */
  cierre: 0.3,
  diasMes: 30,
  leads: { min: 5, max: 100, step: 1, def: 20 },
  ticket: { min: 20, max: 1000, step: 10, def: 120 },
} as const;

/** Ventas que se pierden al mes con `leads` consultas al dia. */
export function ventasPerdidasMes(leads: number): number {
  return leads * MODELO_PERDIDA.fuga * MODELO_PERDIDA.cierre * MODELO_PERDIDA.diasMes;
}

/** Los mismos soles que pinta la calculadora, para poder citarlos en el copy. */
export function perdidaMensual(leads: number, ticket: number): number {
  return Math.round(ventasPerdidasMes(leads) * ticket);
}

/**
 * Miles con coma, a mano.
 *
 * `toLocaleString('es-PE')` habria sido lo obvio y es justo lo que no se puede
 * usar: el Node del servidor y el navegador del cliente no siempre llevan los
 * mismos datos de ICU, asi que uno puede escribir "5,400" y el otro "5400" —
 * y eso es un hydration mismatch en el numero mas visible de la pagina.
 */
export function formatoSoles(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export const BENEFIT = {
  h2: '¿Cuánto te cuesta responder tarde?',
  /**
   * DOS anclas, ni una más.
   *
   * En la referencia son exactamente dos: una píldora negra con icono +
   * etiqueta, y un enlace en texto plano al lado. Con cinco, la píldora negra
   * deja de leerse como "estás aquí" y pasa a leerse como una barra de
   * pestañas — que es otra cosa y compite con el navbar de arriba.
   *
   * El icono no es adorno: es lo que se ve dentro del punto mientras la
   * píldora todavía no se ha estirado.
   */
  anchors: [
    { label: '¿Qué es?', href: '#benefit', icon: 'sparkles' },
    { label: '¿Cómo funciona?', href: '#bento-a' },
  ],
  // `mediaHeadline` se ha ido: era el pie de la ilustracion que prometia unos
  // controles inexistentes. Ahora los controles existen y se explican solos,
  // asi que la frase no tiene nada que anunciar. Se borra en vez de dejarla
  // "por si acaso": copy que no se pinta es exactamente como llego esta seccion
  // a tener una calculadora escrita y ninguna en pantalla.
  lead: 'Pasar de 5 a 30 minutos multiplica por 21 las probabilidades de que ese cliente ya ni llegue a hablar contigo.',
  // La cifra ya NO esta escrita a mano: sale del mismo modelo que la
  // calculadora de al lado. Antes eran dos numeros independientes que podian
  // separarse en cuanto alguien tocara uno, y el lector que hiciera la cuenta
  // con los controles y la comparara con el parrafo se encontraba con dos
  // respuestas distintas a la misma pregunta.
  body:
    `No es una cifra de marketing: es el punto donde el cliente ya le escribió a otro. Con ${MODELO_PERDIDA.leads.def} consultas al día y un ticket de S/${MODELO_PERDIDA.ticket.def}, la cuenta sale a unos S/${formatoSoles(perdidaMensual(MODELO_PERDIDA.leads.def, MODELO_PERDIDA.ticket.def))} al mes que no ves porque nunca llegaron a ser venta. Mia responde en 30 segundos, así que el primero en contestar pasas a ser tú.`,
  /**
   * ⚠️ CITAR LA FUENTE NO ES UNA NOTA AL PIE: ES PARTE DEL ARGUMENTO.
   *
   * La seccion apoya toda su credibilidad en dos numeros ajenos y hasta ahora
   * los daba sin decir de donde salian, que es exactamente como se leen las
   * cifras inventadas. Una linea de seis palabras con el nombre del estudio
   * cambia el genero del bloque: deja de ser publicidad con numeros y pasa a
   * ser un dato con procedencia. Cuesta una linea y la puede comprobar
   * cualquiera, que es justo el punto.
   */
  source: 'Lead Response Management Study (MIT / InsideSales).',
  /** Chips del marquee: lo que Mia resuelve sin que intervengas */
  chipRows: [
    ['Responde al instante', 'Maneja objeciones', 'Agenda citas', 'Cobra por Yape'],
    ['Seguimiento a 24h', 'Remarketing', 'Resumen diario', 'Deriva a humano'],
    ['Consulta de precios', 'Disponibilidad', 'Ubicación y horarios', 'Confirma pedidos'],
  ],
  /**
   * Etiquetas de la calculadora. Ahora SI se pintan, en components/sections/
   * Calculadora.tsx, que ocupa el sitio de la ilustracion fija.
   *
   * `metrics` se ha ido. Eran cuatro cifras a la vez —perdidos/dia, ticket,
   * perdida diaria, perdida anual— y de las cuatro solo una decide algo. Un
   * tablero de metricas se lee con la parte del cerebro que compara y duda; un
   * numero grande y solo se lee con la que se asusta, que es la que aqui hace
   * falta. La perdida anual sobre todo hacia dano: multiplicar por doce una
   * estimacion la vuelve inverosimil justo cuando mas hay que creersela.
   */
  calculator: {
    tag: 'Tu cuenta, en tiempo real',
    leadsLabel: 'Clientes que te escriben al día',
    ticketLabel: 'Ticket promedio de venta',
    resultLabel: 'Estás perdiendo aproximadamente',
    perMonth: 'al mes',
    // El plural se resuelve en el componente: "1 venta" / "45 ventas".
    salesLabel: 'que no llegan a serlo',
    // El supuesto va DEBAJO DEL NUMERO y visible, no en letra pequena ni en un
    // tooltip. Una cifra de perdida sin sus supuestos a la vista se lee como
    // una exageracion de vendedor; con ellos delante se lee como una cuenta, y
    // el lector puede discutirla — que es exactamente lo que queremos que haga,
    // porque para discutirla tiene que hacerla suya.
    // Acortada a dos lineas: en tres, la tarjeta no cabia en el hueco que le
    // deja la seccion apilada y el resultado se recortaba. Dice lo mismo.
    assumption:
      'Supone 1 de cada 4 consultas sin respuesta en 5 minutos, y 3 cierres de cada 10 atendidas a tiempo.',
    // Decia "recupera hasta el 78 % de esos clientes". El 78 % es el dato de
    // que la gente le compra a quien responde primero: NO es una tasa de
    // recuperacion, y menos una nuestra. Usar el mismo numero para dos cosas
    // distintas en la misma pagina es la clase de descuido que, cuando alguien
    // lo nota, se lleva por delante tambien los numeros que si son ciertos.
    tip: 'Mia responde en 30 segundos: el primero en contestar pasas a ser tú.',
  },
} as const;

/* ── 3 · Mia no contesta, vende ───────────────────────────── */

export const BENTO_A = {
  badge: 'Cómo funciona',
  h2: 'Mia no contesta. Vende.',
  cards: {
    network: {
      title: 'Maneja la objeción sin pasártela a ti',
      body: [
        { text: 'Cuando el cliente dice ' },
        { text: '"déjame pensarlo"', strong: true },
        { text: ' o pregunta el precio antes de tiempo, una respuesta automática corta la conversación. Mia la sostiene, responde y ' },
        { text: 'lleva al cierre', strong: true },
        { text: ' — igual que tu mejor vendedor un martes por la mañana.' },
      ],
    },
    endpoint: {
      title: 'Agenda y confirma sola',
      body: [
        { text: 'Propone horarios libres, confirma y manda recordatorio. ' },
        { text: 'Sin ida y vuelta', strong: true },
        { text: ' y sin que abras la agenda.' },
      ],
    },
  },
} as const;

/* ── 4 · Capacidades ──────────────────────────────────────── */

export type RichText = { text: string; strong?: boolean }[];

/**
 * ⚠️ LOS TÍTULOS SON RESULTADOS, NO CARACTERÍSTICAS.
 *
 * Esta sección responde a "¿qué más hace?", y es donde toda landing se
 * desliza sola hacia la lista de funciones. La regla para escribir aquí:
 * el título dice lo que el DUEÑO consigue, y el cuerpo dice cómo se hace.
 * Nunca al revés.
 *
 * Los cuatro que había antes decían el mecanismo:
 *   "Seguimiento inteligente a 24 horas"  → 'Rescata al que dijo "ya te aviso"'
 *   "Configurada por tipo de negocio"     → "Sabe de tu negocio desde el primer día"
 *   "Panel de ventas en tiempo real"      → "Sabes cómo va el negocio sin abrir nada"
 *
 * Fíjate en el patrón: la versión antigua describe lo que el software TIENE,
 * la nueva describe lo que al lector le PASA. "Seguimiento a 24 horas" hay que
 * traducirlo mentalmente; el "ya te aviso" que nunca vuelve ya le duele.
 *
 * Los dos que se quedaron —"Responde en 30 segundos" y "Listo en 10 minutos"—
 * son características que YA son el resultado, porque el tiempo es justo la
 * unidad en la que el lector mide el problema. No hay que arreglar lo que
 * funciona.
 */
export const BENTO_B = {
  cards: [
    {
      area: 'a',
      assetId: 'bentoB.privacy',
      title: 'Responde en 30 segundos',
      body: [
        { text: 'A cualquier hora, también domingo y a las 3 de la mañana. ' },
        { text: 'El 78 %', strong: true },
        { text: ' le compra a quien le responde primero — y el primero ahora eres tú.' },
      ] as RichText,
    },
    {
      area: 'b',
      assetId: 'bentoB.storage',
      title: 'Rescata al que dijo "ya te aviso"',
      body: [
        { text: 'Ese cliente no dijo que no: se distrajo. A las 24 horas Mia vuelve ' },
        { text: 'una sola vez, en el momento justo', strong: true },
        { text: ', y sin sonar a mensaje automático. Es la venta que ya tenías y se te escapó por no insistir.' },
      ] as RichText,
    },
    {
      area: 'c',
      assetId: 'bentoB.models',
      title: 'Sabe de tu negocio desde el primer día',
      body: [
        { text: 'No hay que enseñarle: llega sabiendo agendar para barberías y clínicas, vender catálogo para e-commerce, o ' },
        { text: 'las dos cosas', strong: true },
        { text: ' si las necesitas.' },
      ] as RichText,
    },
    {
      area: 'd',
      assetId: 'bentoB.autoscale',
      title: 'Sabes cómo va el negocio sin abrir nada',
      body: [
        { text: 'Cada noche te llega un ' },
        { text: 'resumen por WhatsApp', strong: true },
        { text: ': cuántos escribieron, cuántos agendaron, cuántos cerraron y en qué punto se cae la conversación. El panel en vivo está ahí si lo quieres, pero no hace falta que entres.' },
      ] as RichText,
    },
    {
      area: 'e',
      assetId: 'bentoB.gpu',
      title: 'Listo en 10 minutos',
      body: [
        { text: 'Sin código, sin asesor, sin llamada de onboarding. ' },
        { text: 'Tú solo, desde tu celular', strong: true },
        { text: '.' },
      ] as RichText,
    },
  ],
} as const;

/* ── 5 · Mia no duerme ────────────────────────────────────── */
/* Sustituye a la sección de "red global": mismo peso visual, argumento 24/7. */

export const GLOBAL_NETWORK = {
  badge: 'Disponible 24/7',
  h2: 'Tu negocio cierra a las 8. Mia no cierra nunca.',
  paragraph:
    'El domingo por la tarde, el feriado, la madrugada. Los mensajes siguen llegando aunque tú no estés — y ahora también las respuestas.',
} as const;

/* ── 6 · La demo conversacional ────────────────────────────── */

/**
 * ⚠️ ESTA SECCIÓN NO GUARDA CONVERSACIONES: LAS COMPONE.
 *
 * Y esa es la decisión importante del bloque, no un detalle de implementación.
 *
 * Lo que la sección promete es "Mia se configura con tu negocio y tu forma de
 * hablar". Si las 27 combinaciones (3 negocios × 3 tonos × 3 casos) estuvieran
 * escritas a mano, la promesa sería un dibujo: el visitante vería tres textos
 * fijos que alguien redactó. Componiéndolas —los HECHOS los pone el negocio, el
 * REGISTRO lo pone el tono— la sección hace delante de sus ojos exactamente lo
 * que el producto dice hacer. La demo ES el argumento.
 *
 * De paso, mantenerlo es sumar, no multiplicar: un negocio nuevo son 3 bloques
 * de hechos, no 9 conversaciones.
 *
 *   mensaje de Mia = apertura[tono][caso] + hechos[negocio][caso] + cierre[tono][caso]
 *
 * ── LO QUE **NO** DEPENDE DEL TONO ────────────────────────────────────────
 * Lo que escribe el CLIENTE, ni su respuesta final. El tono es un ajuste de
 * Mia; el cliente escribe como le da la gana. Hacer que el cliente también
 * cambiara de registro habría quedado más "redondo" y habría sido mentira.
 *
 * ── EL TONO YA NO SE ELIGE EN PANTALLA ────────────────────────────────────
 * Había un segundo selector ("Cómo quieres que hable") y se retiró: dos filas
 * de mandos encima del chat pedían demasiado antes de haber enseñado nada.
 * Ahora la demo va fija en NEUTRAL — ni acartonado ni pegajoso, el registro que
 * casi cualquier negocio peruano reconoce como suyo.
 *
 * "Cercano" y "Formal" SE QUEDAN AQUÍ a propósito, no son código muerto:
 *   · siguen documentando que el tono es un ajuste real del producto, que es
 *     justo lo que se vende;
 *   · y devolver el selector es un cambio de una línea en ChatDemo.tsx.
 * Si algún día sobran de verdad, se borran los dos y el guion sigue armándose
 * igual con el que quede.
 */

export const DEMO = {
  /**
   * El título ya no promete "y tu forma de hablar": el selector de tono se
   * retiró y prometer lo que no se puede tocar es peor que no ofrecerlo.
   */
  h2: 'Míralo funcionando en tu negocio',
  sub: 'Elige tu rubro y mira cómo responde Mia. Son ventas, no respuestas automáticas.',
  etiquetaNegocio: 'Tu negocio',
  pie: 'Demostración con datos de ejemplo. La Mia real usa tu catálogo, tus horarios y tus precios.',

  /** El cliente escribe esto. NO depende del tono — ver la nota de arriba. */
  casos: [
    {
      id: 'precio',
      pestana: '¿Cuánto cuesta?',
      /** Lo que se demuestra. Sirve igual para los tres negocios. */
      etiqueta: 'Responde y propone el siguiente paso',
      tiempo: 'en 30 segundos',
    },
    {
      id: 'objecion',
      pestana: '"Déjame pensarlo"',
      etiqueta: 'Sostiene la objeción sin bajar el precio',
      tiempo: 'sin pasártela a ti',
    },
    {
      id: 'disponibilidad',
      pestana: '¿Tienen disponibilidad?',
      etiqueta: 'Cierra sin que tú intervengas',
      tiempo: 'a cualquier hora',
    },
  ],

  negocios: [
    {
      id: 'barberia',
      label: 'Barbería',
      nombre: 'Barbería El Corte',
      precio: {
        cliente: 'Hola, ¿cuánto está el corte con barba?',
        hechos:
          'El *corte + barba* incluye lavado y perfilado. Esta semana está en S/40 (normalmente S/50).\nHoy queda cupo a las 4:00 pm y mañana a las 11:00 am.',
        respuesta: 'Hoy 4pm me va perfecto. ¿Cómo confirmo?',
      },
      objecion: {
        cliente: 'Ah ya, lo pienso y te aviso.',
        hechos:
          'Solo te comento que los cupos del sábado se llenan rápido y el precio de S/40 va hasta el domingo.\nEl cupo se puede mover hasta 3 horas antes.',
        respuesta: 'Ya pues, mejor apártamelo. ¿Qué datos necesitas?',
      },
      disponibilidad: {
        cliente: '¿Tienen espacio mañana?',
        hechos:
          'Mañana queda:\n• 9:00 am\n• 11:30 am\n• 5:00 pm\nTe mando el recordatorio el día antes.',
        respuesta: '11:30 am. Gracias, qué rápido.',
      },
    },
    {
      id: 'clinica',
      label: 'Clínica dental',
      nombre: 'DentPlus',
      precio: {
        cliente: 'Buenas, ¿cuánto cuesta una limpieza dental?',
        hechos:
          'La *limpieza con evaluación* está en S/120 e incluye la radiografía si el doctor la necesita.\nTengo martes 10:00 am y jueves 4:30 pm.',
        respuesta: 'El jueves 4:30 me queda bien.',
      },
      objecion: {
        cliente: 'Lo consulto en casa y te escribo.',
        hechos:
          'Te comento que la evaluación va sin costo si agendas esta semana.\nEl horario se puede reprogramar sin penalidad.',
        respuesta: 'Mejor resérvame el martes, mañana confirmo.',
      },
      disponibilidad: {
        cliente: '¿Tienen cita para esta semana?',
        hechos:
          'Sí, esta semana queda:\n• Miércoles 9:00 am\n• Jueves 4:30 pm\n• Sábado 11:00 am\nTe recuerdo un día antes por acá.',
        respuesta: 'Sábado 11, por favor.',
      },
    },
    {
      id: 'ecommerce',
      label: 'Tienda online',
      nombre: 'EstiloShop',
      precio: {
        cliente: 'Hola, ¿cuánto cuesta el modelo negro?',
        hechos:
          'El negro está en S/89 con *envío gratis a Lima*. Quedan tallas M y L.\nSi lo pides hoy, sale mañana temprano.',
        respuesta: 'Ya, lo quiero en M. ¿Cómo pago?',
      },
      objecion: {
        cliente: 'Está un poco caro, lo voy a pensar.',
        hechos:
          'Te entiendo. Es cuero sintético con 6 meses de garantía, y si no te queda lo cambias sin costo.\nNo hay descuento, pero sí puedo apartártelo 24 horas.',
        respuesta: 'Bueno, apártamelo. Mañana te confirmo.',
      },
      disponibilidad: {
        cliente: '¿Tienen stock del negro en talla M?',
        hechos:
          'Sí, quedan 3 en M.\nEnvío gratis a Lima y llega en 24 a 48 horas.\nPuedes pagar con Yape o Plin por acá mismo.',
        respuesta: 'Sí, genérame el pedido. Pago con Yape.',
      },
    },
  ],

  /**
   * El tono SOLO envuelve. Los hechos —precios, horarios, stock— son los
   * mismos en los tres: cambiar de registro no puede cambiar lo que se le
   * promete al cliente, y que eso quede separado en el código es justamente
   * lo que impide que alguien lo rompa al añadir un tono nuevo.
   */
  tonos: [
    {
      id: 'neutral',
      label: 'Neutral',
      apertura: {
        precio: 'Hola, claro que sí.',
        objecion: 'Sin problema, tómate tu tiempo.',
        disponibilidad: 'Hola, sí tenemos.',
      },
      cierre: {
        precio: '¿Cuál te acomoda mejor?',
        objecion: '¿Te lo aparto mientras tanto?',
        disponibilidad: '¿Con cuál te confirmo?',
      },
    },
    {
      id: 'cercano',
      label: 'Cercano',
      apertura: {
        precio: '¡Hola! 👋 Claro que sí.',
        objecion: '¡Tranquilo, sin apuro! 😊',
        disponibilidad: '¡Hola! Justo queda espacio.',
      },
      cierre: {
        precio: '¿Cuál te reservo? 🙌',
        objecion: '¿Te lo aparto? Sin compromiso.',
        disponibilidad: '¿Con cuál te lo dejo apartado?',
      },
    },
    {
      id: 'formal',
      label: 'Formal',
      apertura: {
        precio: 'Buenas tardes. Con gusto le comento:',
        objecion: 'Por supuesto, quedo atento a su decisión.',
        disponibilidad: 'Buenas tardes. Sí, contamos con disponibilidad.',
      },
      cierre: {
        precio: '¿Cuál horario prefiere que le reserve?',
        objecion: '¿Desea que le reserve un espacio provisional?',
        disponibilidad: '¿Cuál horario desea confirmar?',
      },
    },
  ],
} as const;

export type DemoCasoId = (typeof DEMO.casos)[number]['id'];

/**
 * Arma la conversación. Es la función que sostiene toda la sección — ver la
 * nota de arriba sobre por qué se compone en vez de guardarse.
 */
export function guionDemo(negocioIdx: number, tonoIdx: number, casoIdx: number) {
  const negocio = DEMO.negocios[negocioIdx];
  const tono = DEMO.tonos[tonoIdx];
  const caso = DEMO.casos[casoIdx];
  const id = caso.id as DemoCasoId;

  // El acceso por índice no vale aquí: cada negocio guarda sus tres casos en
  // propiedades con el nombre del caso, no en un array.
  const guion = negocio[id];

  return {
    negocio: negocio.nombre,
    caso,
    cliente: guion.cliente,
    // Dos saltos de línea entre las tres partes: en WhatsApp un mensaje de
    // venta sin aire es un muro que nadie lee.
    mia: `${tono.apertura[id]}\n\n${guion.hechos}\n\n${tono.cierre[id]}`,
    respuesta: guion.respuesta,
  };
}

/* ── 7 · Casos de uso ─────────────────────────────────────── */

export const USE_CASES = {
  badge: 'Por tipo de negocio',
  h2: 'Funciona igual de bien en una barbería que en una clínica',
  items: [
    {
      assetId: 'useCases.it',
      title: 'Barberías y peluquerías',
      bullets: [
        'Agenda el corte sin ida y vuelta',
        'Recuerda la cita el día anterior',
        'Rellena los huecos que deja una cancelación',
        'Avisa cuando toca volver',
      ],
    },
    {
      assetId: 'useCases.retail',
      title: 'Clínicas y consultorios',
      bullets: [
        'Filtra el motivo de consulta antes de agendar',
        'Reparte según especialidad y disponibilidad',
        'Confirma y reduce las inasistencias',
        'Responde precios y coberturas',
      ],
    },
    {
      assetId: 'useCases.auto',
      title: 'E-commerce',
      bullets: [
        'Consulta de stock y tallas al instante',
        'Recupera el carrito abandonado por WhatsApp',
        'Cobra con Yape o Plin en la conversación',
        'Da el estado del pedido sin que preguntes tú',
      ],
    },
    {
      assetId: 'useCases.gaming',
      title: 'Gimnasios y estudios',
      bullets: [
        'Explica planes y compara membresías',
        'Agenda la clase de prueba',
        'Reactiva al que dejó de venir',
        'Cobra la renovación antes de que caduque',
      ],
    },
    {
      assetId: 'useCases.hospitality',
      title: 'Restaurantes',
      bullets: [
        'Toma el pedido para llevar',
        'Reserva mesa y confirma',
        'Manda la carta del día',
        'Responde horarios y ubicación',
      ],
    },
    {
      assetId: 'useCases.manufacturing',
      title: 'Inmobiliarias y servicios',
      bullets: [
        'Califica al interesado antes de que pierdas la visita',
        'Agenda la visita al inmueble',
        'Manda ficha, fotos y ubicación',
        'Hace seguimiento hasta la decisión',
      ],
    },
  ],
} as const;

/* ── 8 · Precios ──────────────────────────────────────────── */

/**
 * DOS DECISIONES DE COPY QUE NO SON ADORNO:
 *
 * 1 · LOS PLANES SE NOMBRAN POR EL LECTOR, NO POR LO QUE INCLUYEN.
 *     Decían "para empezar a vender", "el más popular", "para escalar". Eso
 *     obliga a leer las tres columnas enteras y comparar specs para saber cuál
 *     te toca. Ahora dicen "para el que atiende solo", "para el que ya no da
 *     abasto", "para el que tiene más de un local": el lector se reconoce en
 *     una línea y deja de comparar. "El más popular" además no informaba de
 *     nada — es presión social, y ya la da el borde iluminado de la tarjeta.
 *
 * 2 · CADA PLAN LLEVA SU PROPIO BOTÓN, Y EN PRIMERA PERSONA.
 *     Los tres decían "Empezar ahora". Un botón que nombra el plan que estás
 *     mirando confirma la elección en el momento de pulsarla, y redactado como
 *     lo diría el usuario ("Empiezo con…", no "Empezar") el clic es la
 *     continuación de su propia frase en vez de una orden de la página.
 *     `PRICING.cta` se mantiene como respaldo por si algún plan nuevo entra
 *     sin el suyo.
 */
export const PRICING = {
  h2: 'Sin costos ocultos. Sin sorpresas.',
  subtitle:
    'Desde S/89 al mes — menos de lo que pierdes en dos días sin responder a tiempo. Sin instalación, sin permanencia y con 30 días de garantía.',
  currencies: [
    { code: 'PEN', symbol: 'S/', rate: 1 },
    { code: 'USD', symbol: '$', rate: 0.27 },
  ],
  period: '/ mes',
  // Respaldo por si algun dia entra un plan sin `cta` propio. Decia "Empezar
  // ahora": generico, imperativo y sin decir que se lleva quien pulsa.
  cta: 'Quiero este plan',
  plans: [
    {
      header: 'Starter · para el que atiende solo',
      price: 89,
      featured: false,
      cta: 'Empiezo con Starter',
      // EL BOTON DE PRECIOS YA NO MANDA AL PIE DE LA PAGINA.
      // Llevaba a #final-cta: el lector elegia plan, bajaba, y se encontraba
      // OTRO boton que tenia que volver a pulsar. Dos clics para una sola
      // decision, y entre uno y otro un scroll entero para arrepentirse.
      // Ahora abre WhatsApp con el plan ya nombrado, asi que la conversacion
      // empieza en "quiero Starter" y no en "hola, informacion".
      waMessage: 'Hola 👋 Quiero el plan Starter de Vendemia (S/89 al mes) para mi negocio.',
      specs: [
        { icon: 'chat', label: 'Hasta 300 conversaciones/mes' },
        { icon: 'shield', label: 'Objeciones automáticas' },
        { icon: 'calendar', label: 'Agenda de citas' },
        { icon: 'chart', label: 'Resumen diario y panel básico', tooltip: 'El resumen llega a tu WhatsApp cada noche.' },
      ],
    },
    {
      header: 'Seller · para el que ya no da abasto',
      price: 149,
      featured: true,
      cta: 'Empiezo con Seller',
      waMessage: 'Hola 👋 Quiero el plan Seller de Vendemia (S/149 al mes) para mi negocio.',
      specs: [
        { icon: 'chat', label: 'Hasta 800 conversaciones/mes' },
        { icon: 'shield', label: 'Seguimiento inteligente 24h' },
        { icon: 'calendar', label: 'Remarketing automático' },
        { icon: 'chart', label: 'Panel en vivo y soporte prioritario', tooltip: 'Incluye todo lo de Starter.' },
      ],
    },
    {
      header: 'Best Seller · para el que tiene más de un local',
      price: 189,
      featured: false,
      cta: 'Empiezo con Best Seller',
      waMessage: 'Hola 👋 Quiero el plan Best Seller de Vendemia (S/189 al mes) para mi negocio.',
      specs: [
        { icon: 'chat', label: 'Conversaciones ilimitadas' },
        { icon: 'shield', label: 'Multi-negocio en un panel' },
        { icon: 'calendar', label: 'Integración con Yape y Plin' },
        { icon: 'chart', label: 'Informes y onboarding a medida', tooltip: 'Incluye todo lo de Seller.' },
      ],
    },
  ],
  footnote: 'Garantía de reembolso 30 días · Sin costo de instalación · Cancela cuando quieras',
} as const;

/* ── 9 · FAQ ──────────────────────────────────────────────── */

export const FAQ = {
  h2: 'Preguntas frecuentes',
  items: [
    {
      /**
       * La pregunta ya NO nombra a la categoría rival.
       *
       * Decía "¿Vendemia es un chatbot?" y se respondía "No...". Preguntarlo
       * así mete la palabra en la cabeza del lector y le da a Vendemia el
       * marco del competidor: a partir de ahí compara precios de chatbots.
       * Preguntado por el COMPORTAMIENTO, la respuesta puede marcar la
       * diferencia sin regalar la categoría.
       */
      q: '¿En qué se diferencia de las respuestas automáticas que ya usa todo el mundo?',
      a: [
        'Una respuesta automática contesta y ahí se queda. Mia vende: entiende lo que te preguntan, maneja la objeción, propone un horario, confirma la cita y vuelve a los que no respondieron. Es la diferencia entre un contestador y un vendedor.',
        'La diferencia está en los resultados, no en la tecnología.',
      ],
    },
    {
      /**
       * ⚠️ ESTA ES LA PRIMERA OBJECION REAL DEL PRODUCTO Y NO ESTABA EN NINGUNA
       * PARTE DE LA PAGINA.
       *
       * Antes de preguntarse cuanto cuesta, quien vende por WhatsApp se
       * pregunta si va a tener que cambiar el numero que lleva anos repartiendo
       * en tarjetas, en el letrero y en su perfil de Instagram. Mientras esa
       * duda no se responde, todo lo demas de la pagina se lee con un "ya, pero
       * ¿y mi numero?" de fondo. Va la segunda, justo despues de saber que es
       * esto y antes de nada mas.
       */
      q: '¿Necesito otro número de WhatsApp o puedo usar el mío?',
      a: [
        'El tuyo. Mia trabaja sobre el número que ya repartes: no hay que comprar otra línea ni avisar a nadie de ningún cambio.',
        'Y si hay contactos que prefieres que no atienda, los excluyes y esas conversaciones siguen siendo solo tuyas.',
      ],
    },
    {
      q: '¿Cuánto tiempo toma configurarlo?',
      a: [
        '10 minutos. Sin asesores, sin código, sin llamadas de onboarding. Tú solo, desde tu celular.',
      ],
    },
    {
      q: '¿Cuánto cuesta realmente?',
      a: [
        'Desde S/89 al mes, sin costo de instalación. Otros cobran S/500 solo para empezar, más el consumo mensual. Con Vendemia pagas lo que ves.',
      ],
    },
    {
      q: '¿Qué pasa si no funciona?',
      a: [
        // Decia "no mereces pagar", que significa lo contrario de lo que
        // queria decir: deja al cliente sin merito en vez de dejarnos a
        // nosotros sin derecho a cobrar. Es la frase de la garantia, o sea la
        // que mas trabaja de todo el FAQ.
        'Te devolvemos el dinero sin preguntas. Si Mia no te ayuda a responder más rápido y cerrar más ventas, no tienes por qué pagarla.',
      ],
    },
    {
      q: '¿Funciona para barberías, clínicas y e-commerce?',
      a: [
        'Sí. Vendemia se configura por tipo de negocio: agenda citas para barberías y clínicas, vende productos para e-commerce, y combina ambos si los necesitas.',
      ],
    },
    {
      /**
       * La otra objecion que faltaba. Quien deja su WhatsApp en manos de algo
       * automatico no teme que falle: teme ENTERARSE TARDE. Por eso la
       * respuesta no promete que Mia no se equivoque —eso no seria creible— sino
       * que cuando pasa te enteras en el momento y hay alguien que entra.
       */
      q: '¿Y si Mia se equivoca?',
      a: [
        'Cuando algo no cuadra no improvisa: avisa al dueño y a un asesor en el momento, con la conversación a la vista, para que alguien entre enseguida.',
        'Prefiere pasarte el chat antes que inventarse una respuesta.',
      ],
    },
    {
      q: '¿Y si el cliente quiere hablar con una persona?',
      a: [
        'Mia te pasa la conversación en cuanto detecta que hace falta, con el contexto de lo hablado. No pelea por quedarse el chat.',
      ],
    },
  ],
} as const;

/* ── 10 · CTA final ───────────────────────────────────────── */

/**
 * EL CIERRE. Tres piezas, y las tres tienen que estar:
 *
 *   1 · el recordatorio del dolor  → `badge`, que repite el titular del hero.
 *       El lector ha bajado toda la página; para cuando llega aquí ya no tiene
 *       en la cabeza por qué empezó a leer.
 *   2 · la petición                → `cta`, en PRIMERA PERSONA. "Quiero probar
 *       Mia gratis" y no "Empieza gratis ahora": redactado como lo diría el
 *       usuario, el clic continúa su propia frase; redactado en imperativo, es
 *       una orden de la página. Mismo criterio que los botones de precios.
 *   3 · la anulación del riesgo    → `footnote`, otra vez y al lado del botón.
 *       Repetir la garantía justo donde se pulsa no es redundante: es el
 *       último punto donde se abandona.
 *
 * `badge` y `footnote` existían y NO se pintaban — el cierre era titular,
 * párrafo y botón, sin dolor ni garantía. Ya se pintan los dos.
 *
 * Se retiró `secondaryCta: 'Hablar con el equipo'`, que tampoco se pintaba y
 * que ahora además sobra: el botón principal abre WhatsApp, o sea que ya ES
 * hablar con el equipo. Dos botones que llevan al mismo sitio solo reparten el
 * clic.
 */
export const FINAL_CTA = {
  badge: 'Cada minuto sin responder es dinero que pierdes',
  h2: 'Tu vendedor digital empieza hoy',
  paragraph: [
    'Sin instalación. Sin esperar a un asesor.',
    'Sin pagar S/500 para empezar.',
  ],
  cta: CTA.long,
  footnote: 'Garantía de reembolso 30 días · Funciona en 10 minutos',
} as const;

/* ── 11 · Vendemia vs otros ───────────────────────────────── */
/* En el HTML esto es una tabla comparativa. Aquí son las tres diferencias que
   más pesan, que es lo que cabe en tres tarjetas sin marear. */

export const RELATED = {
  h2: 'El mismo canal. Distinto resultado.',
  cards: [
    {
      icon: 'wallet',
      title: 'S/0 de instalación',
      // El "más de S/1,200 en 6 meses" no salia de ninguna parte: la pagina
      // declara un cobro unico de S/500 y no dice cual es la mensualidad del
      // otro, asi que el lector no puede rehacer la cuenta ni de lejos. Un
      // ahorro que no se puede comprobar se lee como un ahorro inventado, y
      // encima tapaba el dato bueno, que es sencillo y verificable: aqui la
      // instalacion no se cobra.
      body: 'Otros cobran S/500 de instalación antes de que vendas nada. Aquí ese cobro no existe: el primer mes te cuesta S/89 y ni un sol más.',
    },
    {
      icon: 'clock',
      title: '10 minutos, tú solo',
      body: 'Frente a los 45 minutos con asesor que pide el resto. Sin agendar llamada y sin esperar a que te devuelvan el mensaje.',
    },
    {
      icon: 'shield',
      title: '30 días de garantía',
      // "Nadie más lo ofrece" es una afirmación sobre TODO el mercado que no
      // podemos sostener si alguien la discute — y en Perú una comparativa sin
      // respaldo es justo lo que mira Indecopi. Ademas no hacia falta: la
      // garantia ya es el argumento, y el superlativo solo le quitaba peso.
      body: 'Si no te ayuda a responder más rápido y cerrar más, te devolvemos el dinero sin preguntas. Treinta días dan de sobra para saberlo.',
    },
  ],
  // Se retiró `link: 'Ver comparativa completa'`. No se pintaba en ninguna
  // parte y, sobre todo, no existe ninguna comparativa completa a la que
  // llevar: era una promesa esperando a que alguien la enchufara a un `href`
  // inventado. Mismo criterio que los enlaces sin destino del footer.
} as const;

/* ── 12 · Footer ──────────────────────────────────────────── */

export const FOOTER = {
  description:
    'Mia es tu vendedor digital en WhatsApp: responde en 30 segundos, maneja objeciones y cierra por ti — también cuando tú no puedes.',
  /**
   * `href` opcional a propósito: con él sale un enlace, sin él sale texto
   * plano. Ver la nota de ANNOUNCEMENT. La columna "Producto" apunta a las
   * secciones de esta misma página; el resto espera a que existan las páginas.
   */
  columns: [
    {
      title: 'Producto',
      links: [
        { label: 'Cómo funciona', href: '#bento-a' },
        { label: 'Comparativa', href: '#related' },
        { label: 'Precios', href: '#pricing' },
        { label: 'Casos de uso', href: '#use-cases' },
        // "Novedades" se queda sin enlace: no hay changelog ni blog todavía.
        { label: 'Novedades' },
      ],
    },
    {
      title: 'Empresa',
      links: [
        { label: 'Sobre nosotros' },
        { label: 'Blog' },
        { label: 'Trabaja con nosotros' },
        { label: 'Contacto' },
      ],
    },
    {
      title: 'Ayuda',
      links: [
        { label: 'Centro de ayuda' },
        { label: 'Cómo empezar', href: '#bento-a' },
        { label: 'Estado del servicio' },
        { label: 'Soporte' },
      ],
    },
    {
      /**
       * ⚠️ LOS CUATRO ERAN TEXTO MUERTO, Y UNO DE ELLOS ES OBLIGATORIO.
       *
       * "Libro de reclamaciones" anunciado y sin enlace no es un enlace
       * pendiente: el Codigo de Proteccion y Defensa del Consumidor (Ley
       * 29571) obliga a quien vende por internet a tenerlo, en formato
       * virtual y accesible. Escribirlo en el pie sin que lleve a ninguna
       * parte es declarar que existe algo que no existia — peor que no
       * mencionarlo.
       *
       * Ahora los cuatro son rutas de verdad, en app/(legal)/. El texto vive
       * en lib/legal.ts, donde estan tambien los datos de la empresa que
       * faltan por rellenar.
       */
      title: 'Legal',
      links: [
        { label: 'Términos', href: '/terminos' },
        { label: 'Privacidad', href: '/privacidad' },
        { label: 'Garantía de reembolso', href: '/garantia' },
        { label: 'Libro de reclamaciones', href: '/reclamaciones' },
      ],
    },
  ],
  /**
   * ⚠️ AQUI HABIA UN NEWSLETTER QUE SE TRAGABA EL CORREO EN SILENCIO.
   *
   * El formulario hacia `preventDefault()` y ahi se acababa: no habia destino,
   * ni aviso, ni error. El visitante escribia su correo, pulsaba, y no pasaba
   * absolutamente nada — ni siquiera un mensaje diciendo que habia fallado. De
   * todas las formas de perder a alguien que ya te habia dado su correo, esa es
   * la unica que ademas le hace pensar que fue culpa suya.
   *
   * Y no hacia falta arreglarlo: hacia falta quitarlo. Toda la pagina lleva a
   * WhatsApp, el producto ES WhatsApp, y el correo no lo lee nadie aqui. Un
   * canal menos que mantener y una promesa menos que incumplir.
   */
  contacto: {
    title: '¿Tienes una duda antes de decidir? Pregúntanos por WhatsApp.',
    cta: 'Escribir por WhatsApp',
  },
  /**
   * Sin URL todavía. Se pintan como texto, no como enlaces: seis iconos
   * sociales que no llevan a ningún perfil son seis promesas incumplidas, y
   * además el `href="#"` que tenían devolvía al usuario al principio de la
   * página cada vez que pulsaba uno. Añade la `url` de cada perfil y se
   * convierten en enlaces solos (con target/rel correctos).
   */
  social: [
    { label: 'WhatsApp' },
    { label: 'Instagram' },
    { label: 'TikTok' },
    { label: 'Facebook' },
    { label: 'LinkedIn' },
    { label: 'YouTube' },
  ],
  /**
   * ⚠️ SE RETIRO EL AVISO DE reCAPTCHA PORQUE ERA FALSO.
   *
   * Decia "Este sitio esta protegido por reCAPTCHA. Se aplican la Politica de
   * privacidad y los Terminos del servicio". Se comprobo en el navegador: no
   * hay ningun script de reCAPTCHA en la pagina ni objeto `grecaptcha`. No es
   * un detalle: ese aviso es un requisito que Google impone a quien SI usa
   * reCAPTCHA, no un sello de confianza que se pega porque queda serio.
   * Declarar una proteccion que no existe es afirmar algo falso sobre la web
   * en el unico bloque de la pagina cuyo trabajo entero es ser exacto.
   *
   * Y encima "Politica de privacidad" y "Terminos del servicio" iban
   * subrayados sin ser enlaces, o sea que parecian llevar a unas paginas que
   * tampoco existen. Los dos nombres siguen en la columna Legal, que es su
   * sitio, esperando a que existan.
   *
   * Si algun dia se anade reCAPTCHA de verdad (por ejemplo al formulario del
   * newsletter), este aviso vuelve — pero entonces con los enlaces puestos.
   */
  legal: {
    copyright: `© ${new Date().getFullYear()} Vendemia · Hecho en Perú 🇵🇪`,
    address: 'Mia, tu vendedor digital en WhatsApp · Lima, Perú',
  },
} as const;
