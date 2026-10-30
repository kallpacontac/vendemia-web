/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA ÚNICA FORMA DE CAMBIAR ALGO: LA COLA DE COMANDOS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * > El panel LEE tablas y vistas. Para CAMBIAR algo, inserta una fila en
 * > `commands`.
 *
 * No es una convención de estilo. Los GRANT de Postgres solo permiten `select`,
 * más `insert` en `commands`: un `update` desde el navegador falla siempre. Y
 * si un día no fallara, el siguiente barrido del espejo reescribiría la fila
 * con lo que hay en el SQLite del bot y el cambio desaparecería sin error ni
 * aviso — el *lost update* clásico.
 *
 * El bot escucha por websocket saliente, aplica el cambio en su SQLite y el
 * espejo lo devuelve a Supabase. Por eso lo que se ve en pantalla tarda 1-2 s:
 * es lo que el bot tiene DE VERDAD, no un optimismo que puede revertirse.
 *
 * ⚠️ Nunca mandes `status`, `attempts` ni `created_by` en el insert. Los dos
 * primeros los fuerza la política ('pending' / 0) y mandarlos hace fallar el
 * insert entero; `created_by` lo rellena Postgres con auth.uid(), y es lo que
 * le permite al bot comprobar permisos.
 */
import { supabase } from './client';

/** Los tipos de comando que el bot sabe ejecutar. Uno desconocido acaba en `error`. */
export type TipoComando =
  | 'update_company'
  | 'upsert_catalog_item'
  | 'delete_catalog_item'
  | 'upsert_catalog_media'
  | 'delete_catalog_media'
  | 'set_primary_media'
  /**
   * Alta o edición de un trabajador. Es un PATCH: lo que no se manda se
   * conserva, y `schedule: null` significa «que herede el del negocio». El bot
   * VALIDA el horario y falla con `horario inválido: <motivo>` — un motivo
   * escrito para el dueño, que se enseña tal cual.
   */
  | 'upsert_employee'
  | 'delete_employee'
  /** Una ausencia: «Marco no está esta semana». Ver ResultadoBloqueo. */
  | 'upsert_employee_block'
  | 'delete_employee_block'
  | 'send_message'
  | 'toggle_bot'
  | 'handoff'
  | 'resolve_escalation'
  | 'add_member'
  /**
   * El equipo de un negocio (13-oct-2026). Los dos, SOLO el dueño, y nunca
   * sobre el dueño: un negocio tiene uno, y ni se le cambia el rol ni se le da
   * de baja. Ver ResultadoCambioDeRol y ResultadoBaja.
   */
  | 'cambiar_rol_miembro'
  | 'quitar_miembro'
  /**
   * Unir a una persona con su ficha de `employees`: `{ user_id, employee_id }`,
   * y `null` quita el enlace. El dueño, a cualquiera; el administrador, solo a
   * un empleado. Ver ResultadoEnlace.
   */
  | 'enlazar_ficha'
  /**
   * Retargeting: «ya le escribí a este cliente».
   *
   * ⚠️ Es el único comando que NO se manda con la compañía activa de la sesión.
   * La pantalla de Retargeting es global, así que se encola con el `company_id`
   * de LA FILA — si no, el bot rechaza el lead por no ser de esa empresa. Por
   * eso esa pantalla llama a `encolar()` directamente y no a `useComando()`.
   */
  | 'marcar_seguimiento'
  /**
   * Un pago CON IMPORTE de una inscripción (3-oct-2026): la seña en efectivo.
   * `{ lead_id, monto > 0, metodo_pago?: yape|plin|bank_transfer|cash|cod
   * (defecto cash), appointment_id? }`. El bot lo apunta en pending_payments,
   * confirma los cupos y recalcula el saldo de la venta entera. Queda firmado
   * como `panel`, no `voucher`. Reintentarlo no cobra dos veces (dedupe por id
   * del comando; vuelve `duplicado: true`). Los pedidos siguen con
   * marcar_pagado. Con `appointment_id` de una cita PUNTUAL (0005, solo agenda
   * en la nube) el pago va a esa cita: «cobrada» al cubrir el total.
   */
  | 'registrar_pago'
  /**
   * «Ya cobré esto», dicho por una persona. Ver ResultadoMarcarPagado.
   *
   * ⚠️ El estado al que lleva NO es el mismo en pedidos que en citas: un pedido
   * se cobra pasando a `paid`; una cita, pasando de `pending_payment` a
   * `confirmed`, que es lo que libera el cupo. No se puede unificar, y por eso
   * el payload lleva `tipo`.
   */
  | 'marcar_pagado'
  /** «Vino» o «no vino», dicho por una persona. Ver ResultadoMarcarCumplido. */
  | 'marcar_cumplido'
  /**
   * Cancelar, mover de hora o pasar a otro profesional una cita.
   *
   * ⚠️ Exige `is_member(company_id)`. Ser admin de plataforma NO basta: esa vía
   * está acotada a `marcar_seguimiento` a propósito (migración 0023), así que
   * desde la pantalla global de Retargeting esto no se puede encolar.
   */
  | 'modificar_cita'
  /**
   * Agendar desde el mostrador: la cita que se pide por teléfono o entrando por
   * la puerta, y que por tanto NO pasa por Mia. Ver ResultadoCrearCita.
   */
  | 'crear_cita'
  /**
   * Editar los datos de un cliente: nombre, correo, dirección, los valores de
   * `custom_data` y `notas_salon`. Solo viaja lo que cambió. El bot devuelve
   * `actualizados` con lo que guardó de verdad (ver EditarLead y
   * docs/prompt-bot-editar-lead.md); hoy solo guarda `notas_salon`.
   */
  | 'actualizar_lead'
  /**
   * Caja: apuntar o corregir un gasto del día (`{ gasto: { id?, fecha,
   * concepto, categoria, importe } }`) y borrarlo (`{ id }`). Un adelanto de
   * sueldo es un gasto con categoria 'adelanto'.
   */
  | 'upsert_gasto'
  | 'delete_gasto'
  /**
   * El dueño le pregunta a Mia por su negocio, escribiendo o hablando:
   * `{ pregunta }` o `{ audio: { base64, mime } }`, más `con_voz?`. Ver
   * RespuestaAsistente y lib/panel/asistente.ts.
   *
   * ⚠️ No lleva rol ni usuario: el bot los saca de `created_by` y de
   * `memberships`. Y es el único comando cuyo `result` es dinero del negocio:
   * con la migración 0037 del bot, la fila solo la lee quien la creó.
   */
  | 'preguntar_asistente';

/**
 * ⚠️ `ignored` NO significa "rechazado". Significa "esto no cambió".
 *
 * El bot lo calcula comparando el valor antes y después de aplicar el patch, así
 * que un campo mandado con el MISMO valor que ya tenía sale en `ignored` igual
 * que uno fuera de la lista blanca. Si el dueño abre la pantalla, no toca nada y
 * pulsa Guardar, vuelve TODO en `ignored` — y un panel que enseñe "el bot no
 * aceptó estos campos" estaría acusando al backend de un fallo que no existe.
 *
 * La forma limpia de que la ambigüedad desaparezca sola es mandar únicamente los
 * campos que el usuario modificó. Así `ignored` vacío es el caso normal y
 * cualquier cosa que aparezca ahí sí es un problema de verdad. Eso es justo lo
 * que hace guardar() en (panel)/panel/configuracion/page.tsx.
 *
 * Corolario de que los campos JSON viajen como TEXTO: si se reserializa
 * `schedule`, `payment_methods` o `qualifying_questions` con las claves en otro
 * orden, el campo sale en `updated` aunque el contenido sea equivalente. Es
 * inofensivo, pero explica algún "guardado" que parece de más.
 */
export interface ResultadoUpdateCompany extends ConSinPermiso {
  /** Campos cuyo valor quedó distinto del que había. */
  updated: string[];
  /** Campos que no cambiaron nada: mismo valor, o fuera de la lista blanca. */
  ignored: string[];
}

/**
 * Lo que venía en el comando y NO se aplicó por el rol de quien lo encola: los
 * campos de cobro en `update_company`, `comision_pct` en `upsert_employee`, las
 * `comision_*` en `upsert_catalog_item`.
 *
 * ⚠️ NO es `ignored`. `ignored` significa «no cambió»; esto significa «no
 * puedes». El comando no falla: el resto del patch SÍ se guarda.
 *
 * La clave solo viene cuando hay algo que decir, y hasta el corte de roles el
 * bot ni la manda (aplica el campo y apunta en su log lo que rechazará). Se lee
 * siempre con `r.sin_permiso ?? []`.
 */
export interface ConSinPermiso {
  sin_permiso?: string[];
}

/**
 * Lo que devuelve `upsert_catalog_media`.
 *
 * El payload es `{ catalog_id, url, media_type, id?, sort_order? }`.
 *
 * · Sin `sort_order`, la foto va al final — y el bot calcula MAX+1, no cuenta
 *   filas, así que borrar una del medio no provoca colisiones.
 * · Reenviar con el MISMO `id` sustituye el fichero **conservando la posición**.
 *   Eso es lo que hay que usar para "cambiar esta foto": borrar y volver a
 *   añadir la mandaría al final, y con el tope de 2 adjuntos podría dejar de
 *   enviarse sin que nadie entienda por qué.
 * · El bot valida `catalog_id` contra el catálogo real de la compañía. Un id
 *   ajeno devuelve error, no una fila huérfana.
 */
export interface ResultadoCatalogMedia {
  id: string;
  catalog_id: string;
  sort_order: number;
}

/**
 * `set_primary_media` · payload `{ id }` — el id de la fila de `catalog_media`.
 *
 * Va aparte de `upsert_catalog_media` a propósito: marcar no es editar. El
 * panel solo tiene el id, y obligarle a reenviar `url` y `media_type` para
 * cambiar un flag invita a que mande cualquier cosa en esos campos y acabe
 * pisando la foto que quería marcar.
 *
 * La marca es EXCLUSIVA y el bot desmarca las otras en la misma operación: el
 * panel no encola un segundo comando para desmarcar. Un id de otra empresa no
 * marca nada.
 *
 * ⚠️ Lo aplica el bot, así que con el bot fuera se queda en `pending` y la
 * estrella no se mueve hasta que arranque. NO des la marca por hecha en local:
 * la pantalla de catálogo no hace update optimista precisamente por esto, así
 * que lo que se ve es lo que el bot tiene de verdad.
 */
export interface ResultadoSetPrimary {
  id: string;
  catalog_id: string;
}

/**
 * Lo que devuelve `marcar_pagado`.
 *
 * ⚠️ `cambio` es la parte que hay que mirar. El comando es idempotente: marcar
 * pagado algo que ya estaba cobrado NO falla, devuelve `cambio: false`. Si el
 * panel anuncia «cobrado» sin mirarlo, el dueño cree que acaba de cobrar algo
 * que ya estaba cobrado — y eso, en una pantalla de dinero, es lo peor que
 * puede pasar.
 */
export interface ResultadoMarcarPagado {
  id: string;
  tipo: 'order' | 'appointment';
  /** false = ya estaba cobrado y no se tocó nada. */
  cambio: boolean;
  /** El estado del que venía, para poder decir «de pendiente a cobrado». */
  antes: string;
  pagado_por: 'panel';
}

/**
 * Lo que devuelve `modificar_cita`.
 *
 * ⚠️ `antes` y `ahora` NO tienen la misma forma en las tres acciones, y esto no
 * es un capricho del tipo: comprobado en el handler del bot, al CANCELAR son
 * cadenas con el estado (`'confirmed'` → `'cancelled'`), y al mover o reasignar
 * son objetos con el hueco. Leer `antes.slot_start` de una cancelación daría
 * `undefined` sin error, así que la unión obliga a mirar `accion` primero.
 *
 * ⚠️ EL COMANDO NO LE ESCRIBE AL CLIENTE. Devuelve el `mensaje` redactado y el
 * `wa_link` para que lo mande una PERSONA, igual que en el retargeting. Si el
 * panel no lo enseña, el cliente se queda sin enterarse de que su cita cambió.
 */
export type ResultadoModificarCita =
  | {
      id: string;
      accion: 'cancelar';
      /** El estado del que venía. */
      antes: string;
      ahora: 'cancelled';
      /** Qué queda libre: `'el horario'` o `'una plaza del grupo'`. */
      libera: string;
      mensaje: string;
      wa_link: string;
    }
  | {
      id: string;
      accion: 'mover' | 'reasignar';
      antes: { slot_start: string; employee_id: string };
      ahora: { slot_start: string; employee_id: string };
      mensaje: string;
      wa_link: string;
    };

/**
 * Lo que devuelve `crear_cita`.
 *
 * El payload es `{ lead_id | (telefono + nombre), slot_start, catalog_item_id,
 * employee_id? }`. **La duración, el precio y el nombre del servicio salen del
 * catálogo**: el panel no los manda, porque quien agenda en el mostrador no
 * teclea importes y un importe tecleado a mano no cuadra con nada.
 *
 * ⚠️ `duplicada` es la parte que hay que mirar. Reenviar el comando es seguro:
 * si ese cliente YA tenía esa cita, el bot devuelve la suya con `duplicada:
 * true` en vez de crear una segunda. Anunciar «cita creada» ahí haría creer que
 * ahora hay dos, y alguien iría a cancelar una que no existe.
 *
 * ⚠️ `mensaje` y `wa_link` importan más aquí que en `modificar_cita`: esta cita
 * no pasa por Mia, así que **si nadie abre ese enlace, el cliente no se entera
 * de que tiene hora**.
 */
export interface ResultadoCrearCita {
  id: string;
  lead_id: string;
  /** El teléfono no estaba y se creó el lead (con `source: 'panel'`). */
  cliente_nuevo: boolean;
  /** Ya tenía esta misma cita: no se ha creado otra. */
  duplicada: boolean;
  slot_start: string;
  slot_minutes: number;
  employee_id: string;
  service: string;
  precio: number;
  /** Nace `confirmed` aunque el negocio exija pago: en `pending_payment` no
   *  ocuparía plaza y Mia podría vender ese mismo hueco por WhatsApp. El cobro
   *  se marca después con `marcar_pagado`. */
  estado: 'confirmed';
  mensaje: string;
  wa_link: string;
  /** Canchas (modules/tu-pagina/sql/0011): el turno fijo creado y las semanas que entraron o no. */
  fija_id?: string | null;
  creadas?: string[];
  saltadas?: { slot_start: string; motivo: string }[];
}

/** Lo que devuelve `marcar_cumplido`. */
export interface ResultadoMarcarCumplido {
  id: string;
  tipo: 'order' | 'appointment';
  vino: boolean;
  antes: string;
  cumplido_por: 'panel';
}

/**
 * Lo que devuelve `upsert_employee_block`.
 *
 * ⚠️ `citas_afectadas` ES OBLIGATORIO ENSEÑARLO. El bloqueo hace que Mia deje
 * de ofrecer a ese trabajador en ese intervalo, pero NO mueve ni avisa las
 * citas que ya tenía. Si el panel dice «guardado» y ya está, el cliente llega
 * a una cita con alguien que no va a estar.
 */
export interface ResultadoBloqueo {
  id: string;
  citas_afectadas: { id: string; slot_start: string; service: string | null; lead_id: string }[];
}

/**
 * El audio de una respuesta del asistente.
 *
 * ⚠️ Llega en DOS TIEMPOS. `encolar` resuelve con el texto y, si se pidió voz,
 * con `generando`: el audio tarda unos segundos más y aparece SOBRE LA MISMA
 * FILA de `commands`, así que hay que releerla (ver esperarAudio en
 * lib/panel/asistente.ts).
 *
 * `url` es un enlace firmado que caduca a los 10 minutos (`expira_en`, en
 * segundos): se descarga al recibirlo y se reproduce desde memoria.
 */
export type AudioAsistente =
  | null
  | { estado: 'generando' }
  | { estado: 'sin_audio' }
  | { estado: 'listo'; url: string; mime: 'audio/mpeg'; hablado: string; expira_en: number };

/**
 * Lo que devuelve `preguntar_asistente`.
 *
 * ⚠️ Texto y audio NO son la misma respuesta en dos formatos: `respuesta` trae
 * los datos y el audio los comenta. Por eso `audio.hablado` no se pinta debajo
 * del texto como si fuera más respuesta.
 */
export interface RespuestaAsistente {
  /** El id del comando: sirve para ir a buscar el audio. */
  id: string;
  respuesta: string;
  /** Si se mandó un audio: lo que Mia entendió. */
  transcripcion: string | null;
  audio: AudioAsistente;
  /**
   * Mia redactó un mensaje para un cliente y lo dejó POR APROBAR en su chat
   * (tabla `borradores`, ver lib/panel/borradores.ts). La respuesta solo trae
   * a quién, para el botón «Ver el chat de …»: la tarjeta vive en Mensajes.
   */
  borrador?: { id: string; lead_id: string; nombre: string } | null;
}

export interface ResultadoAddMember {
  email: string;
  user_id: string;
  ya_existia: boolean;
  /** null si la persona YA tenía cuenta: su contraseña no se toca. */
  password_temporal: string | null;
  /**
   * El rol con el que QUEDA, que no siempre es el que se pidió: si ya era del
   * negocio (`ya_era_miembro`), el bot no le cambia el rol y devuelve el que
   * tenía. Anunciar «ahora es administrador» sin mirarlo sería mentira.
   */
  role: string;
  ya_era_miembro: boolean;
  /** La ficha que TIENE. Si ya era del negocio, tampoco se le cambió. */
  employee_id: string | null;
}

/**
 * Lo que devuelve `cambiar_rol_miembro` · payload `{ user_id, role }`, con
 * `role` = `member` (empleado) o `admin` (administrador).
 *
 * ⚠️ Tras el comando se pinta `ahora`, NO se relee `equipo_listar`: el cambio
 * sube a Postgres por el espejo y tarda unos segundos, así que una relectura
 * inmediata puede traer el rol viejo y la pantalla diría que no cambió.
 */
export interface ResultadoCambioDeRol {
  user_id: string;
  email: string | null;
  antes: string;
  ahora: 'member' | 'admin';
  /** false = ya tenía ese rol. No es un error. */
  cambio: boolean;
  employee_id: string | null;
}

/**
 * Lo que devuelve `enlazar_ficha`.
 *
 * Una ficha, una persona: el bot rechaza una ficha que ya es de otro, que no
 * existe o que está dada de baja, con un mensaje que se enseña tal cual.
 *
 * ⚠️ Como el cambio de rol: se pinta `employee_id` y NO se relee la lista.
 */
export interface ResultadoEnlace {
  user_id: string;
  email: string | null;
  /** La ficha que tenía. */
  antes: string | null;
  /** La que tiene ahora. `null` = sin ficha. */
  employee_id: string | null;
  /** false = ya era esa. */
  cambio: boolean;
}

/**
 * Lo que devuelve `quitar_miembro` · payload `{ user_id }`.
 *
 * Al revés que el cambio de rol, esto SÍ se puede releer: el bot borra primero
 * la fila de Postgres y contesta después. Cuando llega el `done`, esa persona
 * ya no lee nada del negocio aunque siga con el panel abierto.
 *
 * Se quita el acceso a ESTE negocio; la cuenta no se borra, puede ser de otro.
 */
export interface ResultadoBaja {
  user_id: string;
  email: string | null;
  /** false = ya no era de este negocio (un doble clic). No es un error. */
  quitado: boolean;
}

/**
 * Se lanza cuando el comando se encoló bien pero el bot no contestó a tiempo.
 *
 * Importa distinguirlo de un fallo de verdad: **el comando NO se perdió**.
 * Queda en `pending` y se drena en cuanto el bot arranca. Decirle al usuario
 * "no se guardó" sería mentira, y volvería a darle a guardar.
 */
export class BotNoResponde extends Error {
  constructor() {
    super('El bot no respondió. El cambio se aplicará cuando vuelva a estar en línea.');
    this.name = 'BotNoResponde';
  }
}

/** Cada cuánto se relee la fila del comando por si Realtime no la trajo. */
const SONDEO_MS = 1200;

/**
 * Encola un comando y espera su resultado.
 *
 * ══ POR QUÉ HAY DOS CAMINOS Y NO SOLO REALTIME ═══════════════════════════
 *
 * Realtime es el camino rápido, pero NO se puede depender solo de él, y esto
 * costó un rato entenderlo:
 *
 * El canal se suscribe DESPUÉS del insert — no hay otra forma, hace falta el id
 * de la fila para filtrar. Entre una cosa y otra hay una ventana: el bot puede
 * aplicar el comando y dejar la fila en `done` antes de que el WebSocket
 * termine de unirse al canal. Ese UPDATE ya no lo recibe nadie, la promesa se
 * agota a los 15 s y `useComando` devuelve `undefined`.
 *
 * El síntoma no se parece a la causa: el comando SÍ se aplicó, pero la pantalla
 * dice "el bot no está en línea" y no refresca. Quien lo sufre concluye que el
 * botón de borrar no funciona, cuando borró perfectamente.
 *
 * Así que se sondea la fila en paralelo. El sondeo es la garantía y Realtime es
 * la velocidad: si el evento llega, se resuelve en milisegundos; si se pierde
 * —por la carrera, o porque Realtime no esté habilitado en la tabla— el sondeo
 * lo recoge como muy tarde en SONDEO_MS.
 *
 * @param timeoutMs cuánto esperar antes de rendirse. El bot vive en un portátil
 *        que puede estar apagado; la UI no puede quedarse colgada.
 */
/**
 * Encola y NO espera al bot. Vuelve en cuanto la fila está en `commands`.
 *
 * Existe porque el bot vive en un portátil: esperar su confirmación dejaba el
 * botón de Guardar girando 15 s —o para siempre, con el bot apagado— y la
 * pantalla con lo viejo. Pero el comando ya está a salvo en cuanto entra en la
 * cola: el bot lo recoge al arrancar aunque haya estado horas caído.
 *
 * Así que lo que se confirma aquí es exactamente eso, «guardado en la cola», y
 * es verdad. Lo que NO se sabe todavía es si el bot lo aceptará: si lo rechaza,
 * la fila acaba en `error` y la pantalla lo cuenta después (ver
 * getComandosCatalogo y lib/panel/pendientes.ts).
 *
 * Para lo que necesita el `result` del bot —la contraseña de add_member, el
 * `cambio` de marcar_pagado— sigue siendo `encolar()`.
 */
export async function encolarSinEsperar(
  companyId: string,
  type: TipoComando,
  payload: Record<string, unknown>,
): Promise<{ id: string; enNube: boolean }> {
  if (await vaALaNube(companyId, type)) {
    try {
      await aplicarEnNube(companyId, type, payload);
      return { id: '', enNube: true };
    } catch (e) {
      if (!(e instanceof YaNoEsDeLaNube)) throw e;
    }
  }
  const { data, error } = await supabase()
    .from('commands')
    .insert({ company_id: companyId, type, payload })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('No se pudo guardar el cambio');
  return { id: (data as { id: string }).id, enNube: false };
}

export async function encolar<T = unknown>(
  companyId: string,
  type: TipoComando,
  payload: Record<string, unknown>,
  timeoutMs: number = 15000,
): Promise<T> {
  if (await vaALaNube(companyId, type)) {
    try {
      return await aplicarEnNube<T>(companyId, type, payload);
    } catch (e) {
      if (!(e instanceof YaNoEsDeLaNube)) throw e;
    }
  }
  return encolarEnLaCola<T>(companyId, type, payload, timeoutMs);
}

/* ══════════════════════════════════════════════════════════════════════════
   LA CONFIGURACIÓN DE UN NEGOCIO «DE LA NUBE» NO PASA POR EL BOT
   ══════════════════════════════════════════════════════════════════════════

   Arquitectura de datos v2 (docs/ARQUITECTURA-DATOS-V2.md). En un negocio con
   `datos_v2_empresas.config_en_nube`, la configuración —catálogo, fotos,
   equipo, ausencias, ajustes— la escribe Postgres, no el bot: el panel llama a
   las funciones `cfg_*` (modules/datos/sql/0001 y 0002), que aplican las MISMAS
   reglas que los handlers del bot y devuelven el mismo `result`. Así ninguna
   pantalla cambia: siguen llamando a encolar()/useComando()/useGuardar().

   Es lo que deja a un negocio SIN bot (alta de Fideliza o de Tu página) editar
   su catálogo, y lo que hace el guardado instantáneo en vez de «en 15 minutos».

   En un negocio que sigue siendo del bot, nada cambia: todo va por la cola.
   ══════════════════════════════════════════════════════════════════════════ */

const RPC_DE_CONFIG: Partial<Record<TipoComando, (p: Record<string, unknown>) => [string, Record<string, unknown>]>> = {
  update_company: (p) => ['cfg_empresa_actualizar', { p_patch: p.patch ?? {} }],
  upsert_catalog_item: (p) => ['cfg_producto_guardar', { p_item: p.item ?? {} }],
  delete_catalog_item: (p) => ['cfg_producto_borrar', { p_id: p.id }],
  upsert_catalog_media: (p) => ['cfg_media_guardar', { p_media: p }],
  set_primary_media: (p) => ['cfg_media_principal', { p_id: p.id }],
  delete_catalog_media: (p) => ['cfg_media_borrar', { p_id: p.id }],
  upsert_employee: (p) => ['cfg_trabajador_guardar', { p_emp: p.employee ?? {} }],
  delete_employee: (p) => ['cfg_trabajador_borrar', { p_id: p.id }],
  upsert_employee_block: (p) => ['cfg_bloqueo_guardar', { p_block: p.block ?? {} }],
  delete_employee_block: (p) => ['cfg_bloqueo_borrar', { p_id: p.id }],
};

/**
 * LA AGENDA, igual (etapa 4, modules/datos/sql/0004): en un negocio con
 * `agenda_en_nube`, citas, cobros, asistencia, fichas y gastos los escribe
 * Postgres con las `agenda_*`, que copian las reglas de los handlers del bot y
 * devuelven su mismo `result`. Ninguna pantalla cambia.
 */
const RPC_DE_AGENDA: Partial<Record<TipoComando, (p: Record<string, unknown>) => [string, Record<string, unknown>]>> = {
  crear_cita: (p) => ['agenda_crear_cita', { p_datos: p }],
  modificar_cita: (p) => ['agenda_modificar_cita', { p_datos: p }],
  marcar_pagado: (p) => ['agenda_marcar_pagado', { p_datos: p }],
  marcar_cumplido: (p) => ['agenda_marcar_cumplido', { p_datos: p }],
  // Sin id de comando que deduplique: uno nuevo por llamada (el botón ya se bloquea mientras guarda).
  registrar_pago: (p) => ['agenda_registrar_pago', { p_datos: p, p_op: crypto.randomUUID() }],
  actualizar_lead: (p) => ['agenda_lead_actualizar', { p_datos: p }],
  upsert_gasto: (p) => ['agenda_gasto_guardar', { p_gasto: p.gasto ?? {} }],
  delete_gasto: (p) => ['agenda_gasto_borrar', { p_id: p.id }],
};

/**
 * Quién manda en cada negocio cambia muy de vez en cuando (el corte de la
 * etapa 2, negocio a negocio), así que se pregunta una vez por minuto, no en
 * cada guardado. Si en ese minuto el negocio volviera al bot, la `cfg_*`
 * contesta 55000 y el cambio sigue por la cola (ver YaNoEsDeLaNube).
 */
const VIGENCIA_MS = 60_000;
const quienManda = new Map<string, { nube: boolean; hasta: number }>();

class YaNoEsDeLaNube extends Error {}

const deQuien = (type: TipoComando): 'config' | 'agenda' | null =>
  RPC_DE_CONFIG[type] ? 'config' : RPC_DE_AGENDA[type] ? 'agenda' : null;

async function vaALaNube(companyId: string, type: TipoComando): Promise<boolean> {
  const dominio = deQuien(type);
  if (!dominio) return false;
  const clave = `${dominio}:${companyId}`;
  const visto = quienManda.get(clave);
  if (visto && visto.hasta > Date.now()) return visto.nube;
  const { data, error } = await supabase().rpc(dominio === 'config' ? 'config_en_nube' : 'agenda_en_nube', { p_company: companyId });
  // Sin respuesta (la función no existe, red), lo seguro es lo de siempre: la cola.
  const nube = !error && data === true;
  quienManda.set(clave, { nube, hasta: Date.now() + VIGENCIA_MS });
  return nube;
}

async function aplicarEnNube<T>(companyId: string, type: TipoComando, payload: Record<string, unknown>): Promise<T> {
  const [fn, args] = (RPC_DE_CONFIG[type] ?? RPC_DE_AGENDA[type])!(payload);
  const { data, error } = await supabase().rpc(fn, { p_company: companyId, ...args });
  if (error) {
    if (error.code === '55000') {
      quienManda.delete(`${deQuien(type)}:${companyId}`);
      throw new YaNoEsDeLaNube();
    }
    // El mensaje es de Postgres y ya está en palabras del panel («horario inválido: …»).
    throw new Error(error.message);
  }
  return data as T;
}

function encolarEnLaCola<T>(
  companyId: string,
  type: TipoComando,
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<T> {
  const sb = supabase();

  return new Promise<T>((resolve, reject) => {
    void (async () => {
      const { data: cmd, error } = await sb
        .from('commands')
        .insert({ company_id: companyId, type, payload })
        .select('id')
        .single();

      if (error || !cmd) return reject(error ?? new Error('No se pudo encolar el comando'));

      let cerrado = false;
      const cerrar = () => {
        if (cerrado) return;
        cerrado = true;
        clearTimeout(reloj);
        clearInterval(sonda);
        void sb.removeChannel(canal);
      };

      /** Resuelve o rechaza según el estado de la fila. Ignora `pending`. */
      const resolver = (fila: Record<string, unknown> | null): boolean => {
        if (!fila) return false;
        if (fila.status === 'done') {
          cerrar();
          resolve(fila.result as T);
          return true;
        }
        if (fila.status === 'error') {
          cerrar();
          reject(new Error(String(fila.error ?? 'El comando falló')));
          return true;
        }
        return false;
      };

      const canal = sb
        .channel(`cmd-${cmd.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'commands', filter: `id=eq.${cmd.id}` },
          ({ new: fila }: { new: Record<string, unknown> }) => resolver(fila),
        )
        .subscribe();

      const mirar = async () => {
        if (cerrado) return;
        const { data } = await sb
          .from('commands')
          .select('status, result, error')
          .eq('id', cmd.id)
          .maybeSingle();
        resolver(data as Record<string, unknown> | null);
      };

      // La primera lectura va inmediata: cierra la ventana entre el insert y la
      // suscripción, que es justo donde se perdía el evento.
      void mirar();
      const sonda = setInterval(() => void mirar(), SONDEO_MS);

      const reloj = setTimeout(() => {
        cerrar();
        reject(new BotNoResponde());
      }, timeoutMs);
    })();
  });
}

/**
 * Los campos de `companies` que el bot acepta en un `update_company`.
 *
 * Es una COPIA de la lista blanca del bot (EDITABLE_COMPANY_FIELDS en
 * src/services/db.service.ts). Sirve para no mandar de más, pero no manda: la
 * autoridad es el bot, y por eso hay que mirar SIEMPRE `result.ignored`.
 */
export const CAMPOS_EDITABLES = [
  'name',
  'bot_name',
  'bot_tone',
  'hook_question',
  'custom_rules',
  'return_policy',
  'schedule',
  'payment_methods',
  'business_mode',
  'delivery_type',
  'whatsapp_phone',
  'owner_phone',
  'admin_phone',
  'location',
  'slot_minutes',
  'require_payment_to_confirm',
  'welcome_note',
  'closing_note',
  'reminder_config',
  'business_description',
  // Confirmados en EDITABLE_COMPANY_FIELDS del bot: los dos se guardan.
  'qualifying_questions',
  'ask_employee',
  // Comprobados en db.service.ts de este mismo repo raíz, EDITABLE_COMPANY_FIELDS.
  // Sin estar en esa lista, el bot los descarta y vuelven en `ignored` sin
  // decir por qué — que se lee igual que "no cambió nada".
  'verify_vouchers',
  'request_location',
  'proactive_venue',
  // Adjuntos del saludo y el cierre (bot 21-oct-2026; nube: modules/datos/sql/0006).
  'welcome_media',
  'closing_media',
] as const;
