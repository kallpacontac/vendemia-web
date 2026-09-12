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
   * Retargeting: «ya le escribí a este cliente».
   *
   * ⚠️ Es el único comando que NO se manda con la compañía activa de la sesión.
   * La pantalla de Retargeting es global, así que se encola con el `company_id`
   * de LA FILA — si no, el bot rechaza el lead por no ser de esa empresa. Por
   * eso esa pantalla llama a `encolar()` directamente y no a `useComando()`.
   */
  | 'marcar_seguimiento'
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
  | 'modificar_cita';

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
export interface ResultadoUpdateCompany {
  /** Campos cuyo valor quedó distinto del que había. */
  updated: string[];
  /** Campos que no cambiaron nada: mismo valor, o fuera de la lista blanca. */
  ignored: string[];
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

export interface ResultadoAddMember {
  email: string;
  user_id: string;
  ya_existia: boolean;
  /** null si la persona YA tenía cuenta: su contraseña no se toca. */
  password_temporal: string | null;
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
): Promise<string> {
  const { data, error } = await supabase()
    .from('commands')
    .insert({ company_id: companyId, type, payload })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('No se pudo guardar el cambio');
  return (data as { id: string }).id;
}

export function encolar<T = unknown>(
  companyId: string,
  type: TipoComando,
  payload: Record<string, unknown>,
  timeoutMs: number = 15000,
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
] as const;
