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
  | 'upsert_employee'
  | 'delete_employee'
  | 'send_message'
  | 'toggle_bot'
  | 'handoff'
  | 'resolve_escalation'
  | 'add_member';

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

/**
 * Encola un comando y espera su resultado por Realtime.
 *
 * @param timeoutMs cuánto esperar antes de rendirse. El bot vive en un portátil
 *        que puede estar apagado; la UI no puede quedarse colgada.
 */
export function encolar<T = unknown>(
  companyId: string,
  type: TipoComando,
  payload: Record<string, unknown>,
  timeoutMs = 15000,
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
        void sb.removeChannel(canal);
      };

      const canal = sb
        .channel(`cmd-${cmd.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'commands', filter: `id=eq.${cmd.id}` },
          ({ new: fila }: { new: Record<string, unknown> }) => {
            if (fila.status === 'done') {
              cerrar();
              resolve(fila.result as T);
            }
            if (fila.status === 'error') {
              cerrar();
              reject(new Error(String(fila.error ?? 'El comando falló')));
            }
          },
        )
        .subscribe();

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
] as const;
