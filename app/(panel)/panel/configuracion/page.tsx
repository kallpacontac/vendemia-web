'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * CONFIGURACIÓN · la pantalla que de verdad cambia cómo trabaja Mia
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Todo lo de aquí sale por la cola de comandos: `update_company` para la
 * empresa, `upsert_catalog_item` / `delete_catalog_item` para el catálogo y
 * `add_member` para dar acceso a otra persona.
 *
 * Tres cosas que este formulario respeta y conviene no deshacer:
 *
 * 1 · LA CONFIGURACIÓN ES DATOS, NO TEXTO. El horario vive en `schedule`, los
 *     precios en `catalog`, los pagos en `payment_methods`. Ahí es donde el
 *     motor los lee. Las reglas (`custom_rules`) son para CÓMO comportarse, y
 *     escribir ahí "abrimos domingos" contra un `schedule` con domingo cerrado
 *     hace que Mia ofrezca una hora que la tool luego rechaza, delante del
 *     cliente. Lo que no se duplica no se puede contradecir.
 *
 * 2 · SOLO SE MANDA LO QUE CAMBIÓ, y no es una optimización. El bot calcula
 *     `ignored` comparando el valor antes y después, así que un campo mandado
 *     con el valor que ya tenía vuelve ahí igual que uno rechazado. Mandándolo
 *     todo, pulsar Guardar sin tocar nada devolvía los 20 campos en `ignored` y
 *     la pantalla acusaba al bot de un fallo inexistente. Con el patch reducido
 *     a lo modificado, `ignored` vacío es lo normal y lo que aparezca ahí sí es
 *     un problema. Ver construirPatch() y guardar().
 *
 * 3 · NO HAY QR, Y NO LO VA A HABER. Un QR de WhatsApp es una sesión completa:
 *     quien lo escanea antes que el dueño se queda con el número del negocio.
 *     El emparejamiento se hace en persona. Si `status = needs_qr`, lo único
 *     que puede hacer el panel es avisar.
 */
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  ListChecks,
  MessageSquare,
  Plus,
  Scissors,
  Store,
  Trash2,
  UserPlus,
  UserSquare,
  Wallet,
  Wifi,
} from 'lucide-react';
import Topbar from '@/components/panel/Topbar';
import { useSesion } from '@/components/panel/Sesion';
import { botOperativo, useSalud } from '@/components/panel/Salud';
import { useAvisar, useComando } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { supabase } from '@/lib/supabase/client';
import { getCatalogo, getCompania, type ItemCatalogo } from '@/lib/supabase/queries';
import { b01 } from '@/lib/supabase/parse';
import type { ResultadoAddMember, ResultadoUpdateCompany } from '@/lib/supabase/commands';
import type {
  BusinessMode,
  ClaveDia,
  Horario,
  MetodoPago,
  PreguntaObligatoria,
  TipoPago,
} from '@/lib/supabase/types';

const DIAS: { clave: ClaveDia; nombre: string }[] = [
  { clave: 'monday', nombre: 'Lunes' },
  { clave: 'tuesday', nombre: 'Martes' },
  { clave: 'wednesday', nombre: 'Miércoles' },
  { clave: 'thursday', nombre: 'Jueves' },
  { clave: 'friday', nombre: 'Viernes' },
  { clave: 'saturday', nombre: 'Sábado' },
  { clave: 'sunday', nombre: 'Domingo' },
];

const PAGOS: { valor: TipoPago; etiqueta: string; pideNumero: boolean }[] = [
  { valor: 'yape', etiqueta: 'Yape', pideNumero: true },
  { valor: 'plin', etiqueta: 'Plin', pideNumero: true },
  { valor: 'bank_transfer', etiqueta: 'Transferencia', pideNumero: true },
  { valor: 'cash', etiqueta: 'Efectivo', pideNumero: false },
  { valor: 'cod', etiqueta: 'Contra entrega', pideNumero: false },
];

/** Lo que el formulario edita de `companies`. Todos están en la lista blanca del bot. */
interface Formulario {
  name: string;
  bot_name: string;
  business_mode: BusinessMode;
  whatsapp_phone: string;
  owner_phone: string;
  admin_phone: string;
  location: string;
  business_description: string;
  slot_minutes: number;
  require_payment_to_confirm: boolean;
  delivery_type: 'delivery' | 'pickup' | 'both';
  bot_tone: string;
  hook_question: string;
  welcome_note: string;
  closing_note: string;
  custom_rules: string;
  return_policy: string;
}

/**
 * Una pregunta lista para viajar: sin espacios de más, sin claves vacías.
 *
 * Importa que sea DETERMINISTA —mismas claves, mismo orden— porque el patch se
 * calcula comparando cadenas: `qualifying_questions` es `text`, no `jsonb`. Si
 * reserializáramos con las claves en otro orden, el campo saldría como cambiado
 * cada vez que se abre la pantalla aunque nadie hubiera tocado nada.
 */
function limpiar(p: PreguntaObligatoria): PreguntaObligatoria {
  const clave = p.field_key?.trim();
  return {
    question: p.question.trim(),
    reject_if: p.reject_if?.trim() || null,
    reject_message: p.reject_message?.trim() || null,
    is_terminal: Boolean(p.is_terminal),
    // Sin `field_key` no hay dónde guardar la respuesta, y entonces `required`
    // no significa nada. Las dos se caen juntas.
    ...(clave ? { field_key: clave, required: Boolean(p.required) } : {}),
  };
}

/**
 * El patch COMPLETO, como si todo hubiera cambiado. No se manda tal cual: es la
 * foto contra la que guardar() compara para quedarse solo con lo modificado.
 *
 * Se usa también para la foto inicial, y eso es justo lo que hace que la
 * comparación funcione: los dos lados salen del mismo serializador, así que un
 * campo intacto produce una cadena idéntica byte a byte.
 */
function construirPatch(
  form: Formulario,
  horario: Horario,
  pagos: MetodoPago[],
  preguntas: PreguntaObligatoria[],
  pideEmpleado: boolean,
): Record<string, string | number> {
  return {
    ...form,
    require_payment_to_confirm: b01(form.require_payment_to_confirm),
    ask_employee: b01(pideEmpleado),
    // ⚠️ Los tres son `text` en el espejo, no jsonb.
    schedule: JSON.stringify(horario),
    payment_methods: JSON.stringify(pagos),
    qualifying_questions: JSON.stringify(preguntas.map(limpiar)),
  };
}

export default function Configuracion() {
  const { companyId, esDueno } = useSesion();
  const { salud, desconocido } = useSalud();
  const comando = useComando();
  const avisar = useAvisar();

  const [paso, setPaso] = useState(1);
  const [form, setForm] = useState<Formulario | null>(null);
  const [horario, setHorario] = useState<Horario>({});
  const [pagos, setPagos] = useState<MetodoPago[]>([]);
  const [preguntas, setPreguntas] = useState<PreguntaObligatoria[]>([]);
  const [pideEmpleado, setPideEmpleado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  /**
   * La foto de cómo estaba todo al cargar. Es lo único que distingue "esto no
   * cambió" de "el bot lo rechazó" cuando llega la respuesta del comando.
   */
  const [original, setOriginal] = useState<Record<string, string | number> | null>(null);

  const { datos, recargar } = useCargar(async () => {
    if (!companyId) return null;
    const [empresa, catalogo, miembros] = await Promise.all([
      getCompania(companyId),
      getCatalogo(companyId),
      supabase().from('memberships').select('auth_user_id, role').eq('company_id', companyId),
    ]);
    return { empresa, catalogo, miembros: (miembros.data ?? []) as { role: string }[] };
  }, [companyId]);

  // El formulario se rellena una vez, cuando llegan los datos. Después NO se
  // pisa con cada recarga: si el espejo llega mientras alguien escribe, le
  // borraría lo que está tecleando.
  useEffect(() => {
    const e = datos?.empresa;
    if (!e || form) return;
    const inicial: Formulario = {
      name: e.name ?? '',
      bot_name: e.bot_name ?? '',
      business_mode: e.business_mode ?? 'appointment',
      whatsapp_phone: e.whatsapp_phone ?? '',
      owner_phone: e.owner_phone ?? '',
      admin_phone: e.admin_phone ?? '',
      location: e.location ?? '',
      business_description: e.business_description ?? '',
      slot_minutes: e.slot_minutes ?? 30,
      require_payment_to_confirm: e.require_payment_to_confirm === 1,
      delivery_type: e.delivery_type ?? 'pickup',
      bot_tone: e.bot_tone ?? '',
      hook_question: e.hook_question ?? '',
      welcome_note: e.welcome_note ?? '',
      closing_note: e.closing_note ?? '',
      custom_rules: e.custom_rules ?? '',
      return_policy: e.return_policy ?? '',
    };
    setForm(inicial);
    setHorario(e.horario);
    setPagos(e.pagos);
    setPreguntas(e.preguntas);
    setPideEmpleado(e.pideEmpleado);
    setOriginal(construirPatch(inicial, e.horario, e.pagos, e.preguntas, e.pideEmpleado));
  }, [datos, form]);

  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  async function guardar() {
    if (!form) return;

    // Yape y Plin sin número se imprimen vacíos en el prompt ("• Yape:  a
    // nombre de"). Mejor no dejar salir el formulario así.
    const sinNumero = pagos.find(
      (p) => PAGOS.find((x) => x.valor === p.type)?.pideNumero && !p.number?.trim(),
    );
    if (sinNumero) {
      avisar(`Falta el número del método de pago "${sinNumero.type}".`, 'error');
      return;
    }

    // Una pregunta sin texto no se puede hacer. Y `required` sin `field_key` no
    // tiene dónde guardar la respuesta: limpiar() lo tira, así que mejor
    // decirlo aquí que dejar que desaparezca en silencio.
    if (preguntas.some((p) => !p.question.trim())) {
      avisar('Hay una pregunta obligatoria sin texto. Escríbela o bórrala.', 'error');
      setPaso(4);
      return;
    }
    const huerfana = preguntas.find((p) => p.required && !p.field_key?.trim());
    if (huerfana) {
      avisar(
        `"${huerfana.question.trim()}" está marcada como dato obligatorio pero no tiene clave donde guardarse.`,
        'error',
      );
      setPaso(4);
      return;
    }

    /**
     * SOLO lo que cambió. Ver la nota 2 de la cabecera: mandarlo todo hace que
     * el bot devuelva el formulario entero en `ignored` y que esta pantalla
     * denuncie un fallo que no ha ocurrido.
     */
    const completo = construirPatch(form, horario, pagos, preguntas, pideEmpleado);
    const patch = Object.fromEntries(
      Object.entries(completo).filter(([k, v]) => !original || v !== original[k]),
    );

    if (Object.keys(patch).length === 0) {
      avisar('No hay nada que guardar: no cambiaste ningún campo.');
      return;
    }

    setGuardando(true);
    const r = await comando<ResultadoUpdateCompany>('update_company', { patch }, 'Configuración guardada');
    setGuardando(false);

    /**
     * Ahora sí es una alarma de verdad: todo lo que iba en el patch llevaba un
     * valor distinto del que había, así que si vuelve en `ignored` es porque el
     * bot no lo acepta — normalmente un campo fuera de EDITABLE_COMPANY_FIELDS.
     */
    if (r?.ignored?.length) {
      avisar(`El bot no aceptó estos campos: ${r.ignored.join(', ')}`, 'error');
    }
    // La foto se rehace con lo que se acaba de mandar para que un segundo
    // Guardar seguido no vuelva a mandar lo mismo. recargar() trae el espejo,
    // pero tarda 1-2s y el usuario puede pulsar antes.
    if (r) {
      setOriginal(completo);
      recargar();
    }
  }

  if (!form) {
    return (
      <main className="main">
        <div className="cargando">
          <div className="spin" />
          Cargando la configuración…
        </div>
      </main>
    );
  }

  return (
    <main className="main">
      <div className="cfg-wrap">
        <Topbar titulo="Configuración del bot" sub={`Personaliza a ${form.bot_name || 'Mia'}`} />

        <div className="stepper-card">
          <div className="stepper">
            {[
              'Mi negocio',
              'Servicios, horario y pagos',
              'Personalidad y reglas',
              'Preguntas obligatorias',
            ].map((txt, i) => (
              <div key={txt} style={{ display: 'contents' }}>
                {i > 0 && <div className={`step__line ${paso > i ? 'done' : ''}`} />}
                <div
                  className={`step ${paso === i + 1 ? 'active' : ''} ${paso > i + 1 ? 'done' : ''}`}
                  onClick={() => setPaso(i + 1)}
                >
                  <div className="step__dot">{i + 1}</div>
                  <div className="step__lbl">{txt}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ══ PASO 1 · MI NEGOCIO ══ */}
        <div className={`card panel ${paso === 1 ? 'active' : ''}`}>
          <div className="sec">
            <h4>
              <Store /> Datos del negocio
            </h4>
            <div className="grid-form">
              <Campo etiqueta="Nombre del negocio" valor={form.name} alCambiar={(v) => set('name', v)} />
              <Campo etiqueta="Nombre del bot" valor={form.bot_name} alCambiar={(v) => set('bot_name', v)} />
              <div>
                <label className="field-label">Modo de negocio</label>
                <select
                  className="select"
                  value={form.business_mode}
                  onChange={(e) => set('business_mode', e.target.value as BusinessMode)}
                >
                  <option value="appointment">Citas puntuales (barbería, salón, clínica)</option>
                  <option value="recurring_appointment">Grupos recurrentes (cursos, clases)</option>
                  <option value="ecommerce">E-commerce (productos)</option>
                </select>
                <small className="muted" style={{ fontSize: 11.5 }}>
                  Cambia las herramientas que Mia puede usar. Un negocio de citas no sabe crear
                  pedidos, y al revés.
                </small>
              </div>
              <div>
                <label className="field-label">Entrega</label>
                <select
                  className="select"
                  value={form.delivery_type}
                  onChange={(e) => set('delivery_type', e.target.value as Formulario['delivery_type'])}
                >
                  <option value="pickup">Recojo en local</option>
                  <option value="delivery">Delivery</option>
                  <option value="both">Ambos</option>
                </select>
              </div>
              <Campo
                etiqueta="WhatsApp del bot"
                valor={form.whatsapp_phone}
                alCambiar={(v) => set('whatsapp_phone', v)}
                pista="Sin +, así: 51987654321"
              />
              <Campo
                etiqueta="Teléfono del dueño"
                valor={form.owner_phone}
                alCambiar={(v) => set('owner_phone', v)}
              />
              <Campo
                etiqueta="Teléfono admin (comandos)"
                valor={form.admin_phone}
                alCambiar={(v) => set('admin_phone', v)}
              />
              <Campo etiqueta="Ubicación / distrito" valor={form.location} alCambiar={(v) => set('location', v)} />
              <div className="full">
                <label className="field-label">Descripción del negocio</label>
                <textarea
                  className="textarea"
                  value={form.business_description}
                  onChange={(e) => set('business_description', e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="nav-btns">
            <span />
            <button className="btn btn-primary" onClick={() => setPaso(2)}>
              Continuar <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* ══ PASO 2 · SERVICIOS, HORARIO Y PAGOS ══ */}
        <div className={`card panel ${paso === 2 ? 'active' : ''}`}>
          <div className="sec">
            <h4>
              <Scissors /> Servicios y productos
            </h4>
            <Catalogo items={datos?.catalogo ?? []} alCambiar={recargar} />
          </div>

          <div className="sec">
            <h4>
              <Clock /> Reserva
            </h4>
            <div className="grid-form">
              <div>
                <label className="field-label">Duración por turno (minutos)</label>
                <input
                  className="input"
                  type="number"
                  min={5}
                  value={form.slot_minutes}
                  onChange={(e) => set('slot_minutes', Number(e.target.value))}
                />
              </div>
            </div>
            <div className="toggle-row" style={{ marginTop: 12 }}>
              <div className="t">
                <b>Requerir pago para confirmar</b>
                <small>La cita queda en «esperando pago» hasta que llegue el comprobante</small>
              </div>
              <div
                className={`toggle ${form.require_payment_to_confirm ? 'on' : ''}`}
                onClick={() => set('require_payment_to_confirm', !form.require_payment_to_confirm)}
                role="switch"
                aria-checked={form.require_payment_to_confirm}
              />
            </div>
          </div>

          <div className="sec">
            <h4>
              <CalendarClock /> Horario de atención
            </h4>
            {DIAS.map(({ clave, nombre }) => {
              const d = horario[clave];
              const abierto = Boolean(d && !d.closed);
              return (
                <div className={`sched-row ${abierto ? '' : 'off'}`} key={clave}>
                  <b>{nombre}</b>
                  <input
                    type="time"
                    value={d?.open ?? '09:00'}
                    onChange={(e) =>
                      setHorario((h) => ({ ...h, [clave]: { ...h[clave], open: e.target.value } }))
                    }
                  />
                  <input
                    type="time"
                    value={d?.close ?? '19:00'}
                    onChange={(e) =>
                      setHorario((h) => ({ ...h, [clave]: { ...h[clave], close: e.target.value } }))
                    }
                  />
                  <div
                    className={`toggle ${abierto ? 'on' : ''}`}
                    role="switch"
                    aria-checked={abierto}
                    onClick={() =>
                      setHorario((h) => ({
                        ...h,
                        [clave]: abierto
                          ? { ...h[clave], closed: true }
                          : {
                              open: h[clave]?.open ?? '09:00',
                              close: h[clave]?.close ?? '19:00',
                              capacity: h[clave]?.capacity ?? 1,
                              closed: false,
                            },
                      }))
                    }
                  />
                </div>
              );
            })}
            <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              La capacidad de cada día (cuántas citas a la vez) se respeta tal y como esté; si
              necesitas cambiarla, dínoslo y la ajustamos en el bot.
            </p>
          </div>

          <div className="sec">
            <h4>
              <Wallet /> Métodos de pago
            </h4>
            {pagos.map((p, i) => {
              const cfg = PAGOS.find((x) => x.valor === p.type);
              return (
                <div className="pay-item" key={i}>
                  <select
                    value={p.type}
                    onChange={(e) =>
                      setPagos((ps) => ps.map((x, j) => (j === i ? { ...x, type: e.target.value as TipoPago } : x)))
                    }
                  >
                    {PAGOS.map((o) => (
                      <option key={o.valor} value={o.valor}>
                        {o.etiqueta}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder={cfg?.pideNumero ? 'Número (obligatorio)' : 'Número (opcional)'}
                    value={p.number ?? ''}
                    onChange={(e) =>
                      setPagos((ps) => ps.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)))
                    }
                  />
                  <input
                    placeholder="A nombre de"
                    value={p.name ?? ''}
                    onChange={(e) => setPagos((ps) => ps.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  />
                  <Trash2
                    size={16}
                    className="del"
                    style={{ cursor: 'pointer', color: 'var(--ink-mute)' }}
                    onClick={() => setPagos((ps) => ps.filter((_, j) => j !== i))}
                  />
                </div>
              );
            })}
            <button className="btn btn-ghost btn-sm" onClick={() => setPagos((ps) => [...ps, { type: 'yape' }])}>
              <Plus size={15} /> Agregar método
            </button>
          </div>

          <div className="nav-btns">
            <button className="btn btn-ghost" onClick={() => setPaso(1)}>
              <ArrowLeft size={16} /> Atrás
            </button>
            <button className="btn btn-primary" onClick={() => setPaso(3)}>
              Continuar <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* ══ PASO 3 · PERSONALIDAD Y REGLAS ══ */}
        <div className={`card panel ${paso === 3 ? 'active' : ''}`}>
          <div className="sec">
            <h4>
              <MessageSquare /> Personalidad
            </h4>
            <label className="field-label">Tono del bot</label>
            <textarea
              className="textarea"
              style={{ minHeight: 70 }}
              placeholder="cercano, directo y con jerga peruana"
              value={form.bot_tone}
              onChange={(e) => set('bot_tone', e.target.value)}
            />
            <div className="grid-form" style={{ marginTop: 14 }}>
              <div>
                <label className="field-label">Pregunta de enganche</label>
                <input
                  className="input"
                  value={form.hook_question}
                  onChange={(e) => set('hook_question', e.target.value)}
                />
              </div>
              <div>
                <label className="field-label">Saludo de bienvenida</label>
                <input
                  className="input"
                  value={form.welcome_note}
                  onChange={(e) => set('welcome_note', e.target.value)}
                />
              </div>
              <div className="full">
                <label className="field-label">Nota de cierre</label>
                <input
                  className="input"
                  value={form.closing_note}
                  onChange={(e) => set('closing_note', e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="sec">
            <h4>
              <FileText /> Reglas y política
            </h4>
            <div className="desfase" style={{ background: '#EEF1FF', borderColor: '#D8DFFF', color: '#2C46D8' }}>
              Las reglas son para <b>cómo comportarse</b>, no para repetir horarios ni precios: eso
              ya vive arriba, y si se contradicen Mia ofrece una hora que luego el sistema rechaza.
            </div>
            <div className="grid-form">
              <div className="full">
                <label className="field-label">Reglas personalizadas</label>
                <textarea
                  className="textarea"
                  placeholder="Confirma siempre servicio y hora antes de cerrar. Si no sabes algo, dilo."
                  value={form.custom_rules}
                  onChange={(e) => set('custom_rules', e.target.value)}
                />
              </div>
              <div className="full">
                <label className="field-label">Política de cambios y devoluciones</label>
                <textarea
                  className="textarea"
                  style={{ minHeight: 64 }}
                  value={form.return_policy}
                  onChange={(e) => set('return_policy', e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="sec">
            <h4>
              <Wifi /> Conexión de WhatsApp
            </h4>
            <div className="wa-box">
              <div>
                {/*
                  Tres estados, no dos: sin instancia registrada no se puede
                  decir "revisar" — no hay nada que revisar todavía.
                */}
                <b style={{ fontSize: 15 }}>
                  {desconocido ? '➖ Sin registrar' : botOperativo(salud) ? '✅ Conectado' : '⚠️ Revisar'}
                </b>
                <p className="muted" style={{ fontSize: 13, marginTop: 4, maxWidth: 420 }}>
                  {desconocido
                    ? 'Este negocio todavía no tiene una instancia del bot dada de alta.'
                    : (salud?.diagnostico ?? 'Comprobando el estado de la instancia…')}
                </p>
                {/*
                  Deliberadamente no hay botón de re-emparejar ni QR: quien
                  escanea ese código se lleva la sesión de WhatsApp del negocio.
                  Se hace en persona, con el portátil delante.
                */}
                <p className="muted" style={{ fontSize: 12, marginTop: 8, maxWidth: 420 }}>
                  El emparejamiento del número se hace en persona, nunca desde el panel.
                </p>
              </div>
            </div>
          </div>

          {esDueno && <Usuarios cuantos={datos?.miembros.length ?? 0} />}

          <div className="nav-btns">
            <button className="btn btn-ghost" onClick={() => setPaso(2)}>
              <ArrowLeft size={16} /> Atrás
            </button>
            <button className="btn btn-primary" onClick={() => setPaso(4)}>
              Continuar <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* ══ PASO 4 · PREGUNTAS OBLIGATORIAS ══ */}
        <div className={`card panel ${paso === 4 ? 'active' : ''}`}>
          <div className="sec">
            <h4>
              <ListChecks /> Preguntas obligatorias
            </h4>
            <p className="muted" style={{ fontSize: 13, marginTop: -4, marginBottom: 12 }}>
              Mia las hace <b>siempre</b>, en este orden, antes de cerrar. No son un guion de
              conversación: son un filtro. Cada una puede descalificar al cliente, guardar un dato
              en su ficha, o las dos cosas.
            </p>
            <Preguntas lista={preguntas} alCambiar={setPreguntas} />
          </div>

          {/*
            El interruptor vive aquí, pegado al editor, y no en el paso 1 a
            propósito: es la trampa que hay que ver justo antes de escribir una
            pregunta. Ver el aviso de abajo.
          */}
          {form.business_mode === 'appointment' && (
            <div className="sec">
              <h4>
                <UserSquare /> Quién atiende
              </h4>
              <div className="toggle-row">
                <div className="t">
                  <b>Preguntar por el profesional</b>
                  <small>
                    Mia pide el nombre antes de cerrar la cita, lo valida contra tu equipo y ofrece
                    solo los huecos libres de esa persona
                  </small>
                </div>
                <div
                  className={`toggle ${pideEmpleado ? 'on' : ''}`}
                  onClick={() => setPideEmpleado((v) => !v)}
                  role="switch"
                  aria-checked={pideEmpleado}
                />
              </div>
              <div
                className="desfase"
                style={{ background: '#EEF1FF', borderColor: '#D8DFFF', color: '#2C46D8', marginTop: 12 }}
              >
                Si activas esto, <b>no añadas además una pregunta obligatoria del tipo «¿con qué
                barbero?»</b>. Van por caminos distintos: la respuesta de aquí entra en el motor de
                horarios, y la de una pregunta obligatoria acaba en la ficha del cliente, que el
                motor de reservas no lee. Mia lo preguntaría dos veces y la segunda no serviría de
                nada.
              </div>
            </div>
          )}

          <div className="nav-btns">
            <button className="btn btn-ghost" onClick={() => setPaso(3)}>
              <ArrowLeft size={16} /> Atrás
            </button>
            <button
              className="btn btn-primary"
              style={{ height: 52, padding: '0 26px' }}
              onClick={() => void guardar()}
              disabled={guardando}
            >
              <Check size={16} /> {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * El editor de `qualifying_questions`.
 *
 * EL ORDEN IMPORTA: el bot las hace de arriba abajo, así que una que descalifica
 * duro conviene tenerla arriba — no tiene sentido pedirle cinco datos a alguien
 * a quien vas a rechazar por el primero.
 *
 * `is_terminal` es la decisión con más peso de esta pantalla, y por eso está
 * escrita como dos opciones con su consecuencia y no como un interruptor
 * llamado "terminal": duro corta la conversación; aviso deja al cliente
 * insistir y seguir comprando.
 */
function Preguntas({
  lista,
  alCambiar,
}: {
  lista: PreguntaObligatoria[];
  alCambiar: (v: PreguntaObligatoria[]) => void;
}) {
  const editar = (i: number, patch: Partial<PreguntaObligatoria>) =>
    alCambiar(lista.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const mover = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= lista.length) return;
    const copia = [...lista];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    alCambiar(copia);
  };

  return (
    <>
      {lista.length === 0 && (
        <p className="vacio">
          <b>Sin preguntas obligatorias</b>
          Mia atiende a todo el que escriba. Añade una si necesitas filtrar —por zona, por edad, por
          lo que sea— o guardar un dato antes de cerrar.
        </p>
      )}

      {lista.map((p, i) => (
        <div className="q-item" key={i}>
          <div className="q-head">
            <span className="q-num">{i + 1}</span>
            <input
              className="input"
              placeholder="¿Desde qué distrito nos escribes?"
              value={p.question}
              onChange={(e) => editar(i, { question: e.target.value })}
            />
            <button
              type="button"
              className="q-icon"
              aria-label="Subir"
              disabled={i === 0}
              onClick={() => mover(i, -1)}
            >
              <ChevronUp size={16} />
            </button>
            <button
              type="button"
              className="q-icon"
              aria-label="Bajar"
              disabled={i === lista.length - 1}
              onClick={() => mover(i, 1)}
            >
              <ChevronDown size={16} />
            </button>
            <button
              type="button"
              className="q-icon q-icon--del"
              aria-label="Eliminar pregunta"
              onClick={() => alCambiar(lista.filter((_, j) => j !== i))}
            >
              <Trash2 size={16} />
            </button>
          </div>

          <div className="grid-form">
            <div className="full">
              <label className="field-label">Descalifica si…</label>
              <input
                className="input"
                placeholder="El distrito NO está en: Jesús María, Lince, San Isidro, Magdalena"
                value={p.reject_if ?? ''}
                onChange={(e) => editar(i, { reject_if: e.target.value })}
              />
              <small className="muted" style={{ fontSize: 11.5 }}>
                Escríbelo en lenguaje normal: lo interpreta el modelo, no es una fórmula. Déjalo
                vacío si la pregunta solo sirve para guardar un dato.
              </small>
            </div>
            <div className="full">
              <label className="field-label">Y entonces le dice</label>
              <input
                className="input"
                placeholder="Nuestra sede está en Jesús María. Desde tu distrito el viaje puede ser largo 📍"
                value={p.reject_message ?? ''}
                onChange={(e) => editar(i, { reject_message: e.target.value })}
              />
            </div>
          </div>

          {p.reject_if?.trim() && (
            <div className="q-modo">
              <button
                type="button"
                className={`q-modo__op ${p.is_terminal ? '' : 'sel'}`}
                onClick={() => editar(i, { is_terminal: false })}
              >
                <b>Solo avisar</b>
                <small>Se lo dice, pero si insiste sigue atendiéndole</small>
              </button>
              <button
                type="button"
                className={`q-modo__op ${p.is_terminal ? 'sel' : ''}`}
                onClick={() => editar(i, { is_terminal: true })}
              >
                <b>Rechazo duro</b>
                <small>Corta ahí. No hay venta ni reserva</small>
              </button>
            </div>
          )}

          <div className="grid-form" style={{ marginTop: 12 }}>
            <div>
              <label className="field-label">Guardar la respuesta en la ficha como</label>
              <input
                className="input"
                placeholder="age"
                value={p.field_key ?? ''}
                onChange={(e) => editar(i, { field_key: e.target.value })}
              />
              <small className="muted" style={{ fontSize: 11.5 }}>
                Una clave corta y sin espacios. Aparece en los datos del cliente. Vacío = no se
                guarda.
              </small>
            </div>
          </div>

          {p.field_key?.trim() && (
            <div className="toggle-row" style={{ marginTop: 10 }}>
              <div className="t">
                <b>Es un dato imprescindible</b>
                <small>
                  Mia <b>no cierra</b> la venta ni la reserva hasta tenerlo. Úsalo con cuidado: es la
                  forma más rápida de que deje de vender
                </small>
              </div>
              <div
                className={`toggle ${p.required ? 'on' : ''}`}
                onClick={() => editar(i, { required: !p.required })}
                role="switch"
                aria-checked={Boolean(p.required)}
              />
            </div>
          )}
        </div>
      ))}

      <button
        className="btn btn-ghost btn-sm"
        onClick={() =>
          alCambiar([
            ...lista,
            { question: '', reject_if: null, reject_message: null, is_terminal: false },
          ])
        }
      >
        <Plus size={15} /> Añadir pregunta
      </button>
    </>
  );
}

function Campo({
  etiqueta,
  valor,
  alCambiar,
  pista,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (v: string) => void;
  pista?: string;
}) {
  return (
    <div>
      <label className="field-label">{etiqueta}</label>
      <input className="input" value={valor} onChange={(e) => alCambiar(e.target.value)} />
      {pista && (
        <small className="muted" style={{ fontSize: 11.5 }}>
          {pista}
        </small>
      )}
    </div>
  );
}

/**
 * El catálogo se guarda ítem a ítem, no con el resto del formulario: cada uno
 * es su propio comando (`upsert_catalog_item`), y el bot devuelve el id.
 *
 * ⚠️ `name` es la clave real: el modelo pide los servicios por nombre exacto.
 * Cambiar el nombre de un ítem cambia lo que Mia tiene que decir para pedirlo.
 */
function Catalogo({ items, alCambiar }: { items: ItemCatalogo[]; alCambiar: () => void }) {
  const comando = useComando();
  const [nuevo, setNuevo] = useState<{ name: string; price: string; duration: string } | null>(null);

  async function guardarItem(item: ItemCatalogo, patch: Partial<ItemCatalogo>) {
    const r = await comando(
      'upsert_catalog_item',
      {
        item: {
          id: item.id,
          name: patch.name ?? item.name,
          price: patch.price ?? item.price,
          duration_minutes: patch.duration_minutes ?? item.duration_minutes,
          is_active: patch.is_active ?? item.is_active,
        },
      },
      'Servicio actualizado',
    );
    if (r) alCambiar();
  }

  async function crear() {
    if (!nuevo?.name.trim()) return;
    const r = await comando(
      'upsert_catalog_item',
      {
        item: {
          name: nuevo.name.trim(),
          price: Number(nuevo.price) || 0,
          duration_minutes: Number(nuevo.duration) || 0,
          is_active: 1,
        },
      },
      'Servicio añadido',
    );
    if (r) {
      setNuevo(null);
      alCambiar();
    }
  }

  async function borrar(item: ItemCatalogo) {
    const r = await comando('delete_catalog_item', { id: item.id }, 'Servicio eliminado');
    if (r) alCambiar();
  }

  return (
    <>
      {items.length === 0 && !nuevo && (
        <p className="vacio">
          <b>El catálogo está vacío</b>
          Mia no puede vender lo que no está aquí: añade tus servicios o productos.
        </p>
      )}

      {items.map((it) => (
        <div className="svc-item" key={it.id}>
          <div>
            <span className="lbl">Nombre</span>
            <input defaultValue={it.name} onBlur={(e) => void guardarItem(it, { name: e.target.value })} />
          </div>
          <div>
            <span className="lbl">Precio</span>
            <input
              type="number"
              defaultValue={it.price ?? 0}
              onBlur={(e) => void guardarItem(it, { price: Number(e.target.value) })}
            />
          </div>
          <div>
            <span className="lbl">Minutos</span>
            <input
              type="number"
              defaultValue={it.duration_minutes ?? 0}
              onBlur={(e) => void guardarItem(it, { duration_minutes: Number(e.target.value) })}
            />
          </div>
          <div>
            <span className="lbl">Activo</span>
            <div
              className={`toggle ${it.activo ? 'on' : ''}`}
              role="switch"
              aria-checked={it.activo}
              onClick={() => void guardarItem(it, { is_active: it.activo ? 0 : 1 })}
            />
          </div>
          <Trash2 size={16} className="del" onClick={() => void borrar(it)} />
        </div>
      ))}

      {nuevo ? (
        <div className="svc-item">
          <div>
            <span className="lbl">Nombre</span>
            <input
              autoFocus
              value={nuevo.name}
              onChange={(e) => setNuevo({ ...nuevo, name: e.target.value })}
            />
          </div>
          <div>
            <span className="lbl">Precio</span>
            <input type="number" value={nuevo.price} onChange={(e) => setNuevo({ ...nuevo, price: e.target.value })} />
          </div>
          <div>
            <span className="lbl">Minutos</span>
            <input
              type="number"
              value={nuevo.duration}
              onChange={(e) => setNuevo({ ...nuevo, duration: e.target.value })}
            />
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => void crear()}>
            <Check size={14} /> Guardar
          </button>
          <Trash2 size={16} className="del" onClick={() => setNuevo(null)} />
        </div>
      ) : (
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setNuevo({ name: '', price: '', duration: '' })}
        >
          <Plus size={15} /> Agregar servicio
        </button>
      )}
    </>
  );
}

/**
 * Dar acceso a otra persona. Solo el dueño.
 *
 * La contraseña temporal se ENSEÑA EN PANTALLA, no se manda por correo: el SMTP
 * por defecto de Supabase va limitadísimo y cae en spam, y un alta que depende
 * de un email falla justo cuando hay alguien delante esperando. El dueño la lee
 * y se la dicta.
 *
 * Si la persona ya tenía cuenta, `password_temporal` viene a null y su
 * contraseña NO se toca: aquí no se enseña un hueco vacío, se dice lo que pasó.
 */
function Usuarios({ cuantos }: { cuantos: number }) {
  const comando = useComando();
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [temporal, setTemporal] = useState<ResultadoAddMember | null>(null);

  async function invitar() {
    if (!email.trim()) return;
    setEnviando(true);
    const r = await comando<ResultadoAddMember>('add_member', { email: email.trim(), role: 'member' });
    setEnviando(false);
    if (r) {
      setTemporal(r);
      setEmail('');
    }
  }

  return (
    <div className="sec">
      <h4>
        <UserPlus /> Quién más puede entrar
      </h4>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
        {cuantos} {cuantos === 1 ? 'persona tiene' : 'personas tienen'} acceso a este negocio.
      </p>
      <div className="pay-item" style={{ gridTemplateColumns: '1fr auto' }}>
        <input
          placeholder="correo@dequien-va-a-entrar.com"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="btn btn-ghost btn-sm" onClick={() => void invitar()} disabled={enviando}>
          <UserPlus size={15} /> {enviando ? 'Creando…' : 'Dar acceso'}
        </button>
      </div>

      {temporal &&
        (temporal.password_temporal ? (
          <div className="clave-temporal">
            Cuenta creada para <b>{temporal.email}</b>. Dile esta contraseña de viva voz —no se envía
            por correo y no vuelve a aparecer:
            <br />
            <code>{temporal.password_temporal}</code>
          </div>
        ) : (
          <div className="clave-temporal">
            <b>{temporal.email}</b> ya tenía cuenta: ahora también ve este negocio. Su contraseña no
            ha cambiado.
          </div>
        ))}
    </div>
  );
}
