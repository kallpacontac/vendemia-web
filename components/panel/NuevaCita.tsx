'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * AGENDAR DESDE EL MOSTRADOR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La cita que no nace en WhatsApp: la que se pide por teléfono o entrando por
 * la puerta. Hasta ahora el panel no podía crear ninguna —no existía el
 * comando— y esa mitad de la clientela no tenía forma de entrar en la agenda.
 *
 * Tres cosas que esta pantalla NO hace, a propósito:
 *
 * 1 · NO pregunta precio ni duración. Salen del catálogo, en el bot. Quien
 *     agenda en el mostrador no teclea importes, y un importe tecleado a mano
 *     es un importe que no cuadra con nada.
 * 2 · NO calcula si el hueco está libre. Se intenta y, si no cabe, el bot
 *     devuelve el motivo escrito para el dueño y se enseña tal cual.
 * 3 · NO le escribe al cliente. Esta cita no pasa por Mia, así que **si nadie
 *     abre el enlace de WhatsApp, el cliente no se entera de que tiene hora**.
 *     Por eso el aviso se queda en pantalla hasta que lo cierran.
 *
 * Con canchas (Mi página, modules/tu-pagina/dominio/canchas.ts) se reserva una
 * cancha: de 1 a 4 turnos seguidos y, si se quiere, TURNO FIJO cada semana. El
 * precio (día o noche) lo pone Postgres; las semanas que no caben se saltan y
 * se dicen. Ver agenda_crear_cita en modules/tu-pagina/sql/0011.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { guiarA } from '@/lib/panel/guiar';
import { ElegirFecha, ElegirHora, fechaEnPalabras } from './FechaHora';
import { CalendarPlus, Check, Search, UserPlus, X } from 'lucide-react';
import AvisarCliente from './AvisarCliente';
import ElegirCumple, { guardarCumple } from './ElegirCumple';
import { useAvisar, useComando } from './Avisos';
import { hoyLima } from '@/lib/panel/inscripciones';
import { hora12, soles, telefono as comoTelefono } from '@/lib/panel/format';
import { json } from '@/lib/supabase/parse';
import type { ResultadoCrearCita } from '@/lib/supabase/commands';
import type { ClaveDia, FranjaRecurrente, Horario } from '@/lib/supabase/types';
import { tramoDe } from '@/lib/panel/medianoche';
import type { Cita, ItemCatalogo, Lead, Trabajador } from '@/lib/supabase/queries';
import type { Sede } from '@/modules/tu-pagina/dominio/adelantoCitas';
import { supabase } from '@/lib/supabase/client';

/** Cuántos clientes se enseñan al buscar. Más es una lista que nadie lee. */
const TOPE_BUSQUEDA = 6;

const soloDigitos = (s: string) => s.replace(/\D/g, '');

/** La hora de Lima ahora, en minutos desde medianoche. */
function minutosLima(): number {
  const [h, m] = new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' }).split(':').map(Number);
  return h * 60 + m;
}
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
/** «Ahora» para agendar: el próximo múltiplo de 5 minutos (la base no acepta una hora que ya pasó). */
const ahoraAgendable = () => Math.floor(minutosLima() / 5) * 5 + 5;
/** Ayer en Lima, 'YYYY-MM-DD'. */
const ayerLima = () => new Date(Date.now() - 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const sumarMin = (slot: string, min: number) => {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})$/.exec(slot);
  return m ? `${m[1]} ${hhmm(Number(m[2]) * 60 + Number(m[3]) + min)}` : slot;
};

/**
 * El primer hueco de HOY en una sede desde ahora: cuenta las citas en pie que se cruzan (las sin sede
 * cuentan en todas, como en la base) contra sus sillas. Es una ayuda: la base vuelve a comprobar
 * horario y aforo al agendar, y si no cabe lo dice.
 */
/** Cuántas citas vivas de esa sede (o sin sede) se cruzan con [inicio, inicio + minutos). */
function ocupadasA(citas: Cita[], fecha: string, sede: string, hora: string, minutos: number): number {
  const ini = `${fecha} ${hora}`;
  const fin = sumarMin(ini, minutos);
  return citas.filter((c) => c.slot_start?.startsWith(fecha) && c.status !== 'cancelled' && c.status !== 'no_show'
    && (!c.sede || c.sede === sede)
    && c.slot_start < fin && (c.slot_end || sumarMin(c.slot_start, c.slot_minutes ?? 30)) > ini).length;
}

const CLAVES_DIA: ClaveDia[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Las horas que se pueden elegir ese día: de la apertura hasta que el servicio quepa antes del cierre,
 * cada 30 min (Alvaro, 17-nov: «filtra el reloj para que esté dentro de los horarios»). null = no hay
 * horario guardado (se usa el reloj libre); [] = ese día está cerrado.
 */
function horasDelDia(horario: Horario | undefined, fecha: string, minutos: number): string[] | null {
  if (!horario || !Object.keys(horario).length) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return null;
  const clave = CLAVES_DIA[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
  const t = tramoDe(horario[clave]);
  if (!t) return [];
  const fin = Math.min(t.cierra, 1440) - Math.max(minutos, 5);
  const out: string[] = [];
  // Cada 30 min (18-nov: «son muchos botones»): la hora exacta, con «Ahora».
  for (let x = Math.ceil(t.abre / 30) * 30; x <= fin; x += 30) out.push(hhmm(x));
  return out;
}

/** «Repetir cada semana»: 1 = solo esta vez. */
const SEMANAS = [1, 4, 8, 12];

export default function NuevaCita({
  leads,
  catalogo,
  trabajadores,
  canchas = false,
  inicial,
  alCerrar,
  alCambiar,
  companyId,
  sedes = [],
  citas = [],
  sedeInicial = '',
  horario,
  alCreada,
}: {
  leads: Lead[];
  catalogo: ItemCatalogo[];
  trabajadores: Trabajador[];
  canchas?: boolean;
  /** Para guardar la sede (tu-pagina 0025). */
  companyId?: string | null;
  /** Las sedes de Mi página. Con 2 o más, hay que decir en cuál es la cita. */
  sedes?: Sede[];
  /** El horario del negocio: la hora se elige solo dentro de él. */
  horario?: Horario;
  /** La sede elegida arriba en la Agenda: el combo empieza en ella (y la sigue si se cambia). */
  sedeInicial?: string;
  /** Las citas ya cargadas en la Agenda: para sugerir el próximo cupo libre de cada sede. */
  citas?: Cita[];
  /** Lo que ya se sabe al abrirla: la casilla libre que se tocó en el tablero. */
  inicial?: { fecha: string; hora: string; itemId: string };
  alCerrar: () => void;
  alCambiar: () => void;
  /**
   * Con esto, al agendar el formulario se cierra y la Agenda enseña la cita creada (resaltada) y el
   * mensaje para el cliente. Pedido de Alvaro (17-nov): «no veo lo que agendé».
   */
  alCreada?: (c: { id: string; sede: string; resumen: string; pasada: boolean; aviso: { titulo: string; mensaje: string; waLink: string; nota?: string } | null }) => void;
}) {
  const comando = useComando();
  const avisar = useAvisar();

  const [nuevo, setNuevo] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [lead, setLead] = useState<Lead | null>(null);
  const [tel, setTel] = useState('');
  const [nombre, setNombre] = useState('');
  /** El cumpleaños del cliente nuevo ('MM-DD' o ''): datos 0017. */
  const [cumple, setCumple] = useState('');
  const [fecha, setFecha] = useState(inicial?.fecha ?? hoyLima());
  // Por defecto, AHORA: casi siempre es el que acaba de entrar por la puerta.
  const [hora, setHora] = useState(inicial?.hora ?? (canchas ? '' : hhmm(ahoraAgendable())));
  const [itemId, setItemId] = useState(inicial?.itemId ?? '');
  const [empId, setEmpId] = useState('');
  const [sede, setSede] = useState(sedeInicial);
  // Cambiar la sede del filtro de arriba con el formulario abierto también cambia esta.
  useEffect(() => { if (sedeInicial) setSede(sedeInicial); }, [sedeInicial]);
  const pideSede = !canchas && sedes.length > 1;
  const [turnos, setTurnos] = useState(1);
  const [semanas, setSemanas] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{
    titulo: string;
    mensaje: string;
    waLink: string;
    nota: string;
  } | null>(null);

  /**
   * Los grupos recurrentes se quedan fuera: el bot los rechaza («es un grupo con
   * horarios fijos: se inscribe, no se agenda por hora») y ofrecerlos aquí sería
   * enseñar una opción que siempre falla.
   */
  const servicios = useMemo(
    () => catalogo.filter((c) => c.activo && json<FranjaRecurrente[]>(c.schedule_slots, []).length === 0 && c.tipo !== 'producto'),
    [catalogo, canchas],
  );
  const turno = servicios.find((s) => s.id === itemId)?.duration_minutes || 60;
  const activos = useMemo(() => trabajadores.filter((t) => t.activo), [trabajadores]);

  /** Hoy: «Ahora» y el próximo cupo libre de cada sede con sillas conocidas. */
  const hoy = hoyLima();
  const minutosServicio = servicios.find((x) => x.id === itemId)?.duration_minutes || 30;
  /** Las horas del día elegido dentro del horario; la que ya está puesta («Ahora», un cupo libre) se añade en su sitio. */
  const horasPosibles = useMemo(() => {
    const l = canchas ? null : horasDelDia(horario, fecha, minutosServicio);
    if (!l) return null;
    return hora && !l.includes(hora) ? [...l, hora].sort() : l;
  }, [canchas, horario, fecha, minutosServicio, hora]);
  /** Las horas llenas de la sede elegida ese día (con sillas conocidas): salen tachadas. */
  const capacidad = sedes.find((x) => x.nombre === sede)?.capacidad ?? 0;
  const llenas = useMemo(() => {
    if (canchas || !horasPosibles || !sede || capacidad <= 0) return new Set<string>();
    return new Set(horasPosibles.filter((h) => h !== hora && ocupadasA(citas, fecha, sede, h, minutosServicio) >= capacidad));
  }, [canchas, horasPosibles, sede, capacidad, citas, fecha, minutosServicio, hora]);
  /** Hoy, solo de ahora en adelante; las de antes, si se pide (anotar a quien ya se atendió, 0030). */
  const [verPasadas, setVerPasadas] = useState(false);
  const desde = fecha === hoy && !verPasadas ? hhmm(Math.floor(minutosLima() / 30) * 30) : '';
  const horasVisibles = (horasPosibles ?? []).filter((h) => !desde || h >= desde || h === hora);
  const cerrado = (iso: string) => horasDelDia(horario, iso, 5)?.length === 0;
  const servicioElegido = servicios.find((x) => x.id === itemId);

  const encontrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    return leads
      .filter((l) => (l.name ?? '').toLowerCase().includes(q) || l.phone.includes(soloDigitos(q)))
      .slice(0, TOPE_BUSQUEDA);
  }, [leads, busqueda]);

  async function crear() {
    if (!itemId) {
      avisar('Elige el servicio: sin él la cita entraría en los ingresos como S/ 0.', 'error');
      return;
    }
    if (!fecha || !hora) {
      avisar('Falta el día o la hora.', 'error');
      return;
    }
    // Nombre y teléfono son opcionales (tu-pagina 0029): el que entra por la puerta no siempre
    // deja su celular. Sin elegir a nadie, lo escrito en el buscador sirve de nombre o de número.
    const escrito = busqueda.trim();
    const escritoEsTel = soloDigitos(escrito).length >= 9 && !/[a-záéíóúñ]/i.test(escrito);
    const telEnviar = nuevo ? soloDigitos(tel) : escritoEsTel ? soloDigitos(escrito) : '';
    const nombreEnviar = nuevo ? nombre.trim() : escritoEsTel ? '' : escrito;
    if (!lead && telEnviar && telEnviar.length < 9) {
      avisar('Ese teléfono no está completo: escribe los 9 dígitos o déjalo vacío.', 'error');
      return;
    }

    if (pideSede && !sede) {
      avisar('Elige la sede: cada una tiene su propio aforo.', 'error');
      return;
    }

    setEnviando(true);
    const r = await comando<ResultadoCrearCita>(
      'crear_cita',
      {
        ...(lead && !nuevo ? { lead_id: lead.id } : { telefono: telEnviar, nombre: nombreEnviar }),
        slot_start: `${fecha} ${hora}`,
        catalog_item_id: itemId,
        ...(empId ? { employee_id: empId } : {}),
        ...(canchas ? { turnos, semanas } : {}),
      },
      undefined,
      alCambiar,
    );
    setEnviando(false);
    // Si no cabe, useComando ya ha enseñado el motivo del bot y no hay cita.
    if (!r) return;
    // La sede va aparte (cita_sede_panel): la cita ya existe. No bloquea —quien agenda manda—,
    // pero avisa si esa sede queda por encima de su aforo a esa hora.
    if (pideSede && sede && companyId && !r.duplicada && (r as { id?: string }).id) {
      const s = await supabase().rpc('cita_sede_panel', { p_company: companyId, p_id: (r as { id?: string }).id, p_sede: sede });
      if (s.error) avisar(`La cita quedó creada, pero no pude guardar la sede: ${s.error.message}`, 'error');
      else if ((s.data as { sobre_aforo?: boolean } | null)?.sobre_aforo) avisar(`Ojo: ${sede} ya tenía todas sus sillas ocupadas a esa hora. La cita quedó igual.`, 'error');
      alCambiar();
    }

    // Cliente nuevo con cumpleaños: a su ficha (datos 0017). No bloquea la cita.
    if (nuevo && cumple && companyId && tel) void guardarCumple(companyId, tel, cumple);

    const sinTelefono = Boolean((r as { sin_telefono?: boolean }).sin_telefono);
    if (alCreada && !canchas && !r.fija_id) {
      const quien = lead && !nuevo ? lead.name || comoTelefono(lead.phone) : nombreEnviar || (telEnviar ? comoTelefono(telEnviar) : 'Cliente');
      const resumen = `${quien} · ${r.service} · ${hora12(hora)}${pideSede && sede ? ` · ${sede.split(' · ')[0]}` : ''}`;
      alCreada({
        id: (r as { id?: string }).id ?? '',
        sede: pideSede ? sede : '',
        resumen,
        // Anotada con hora que ya pasó (0030): sale en «Pasadas», donde se marca «Vino».
        pasada: `${fecha} ${hora}` <= `${hoy} ${hhmm(minutosLima())}`,
        aviso: sinTelefono ? null : {
          titulo: r.duplicada ? 'Ese cliente ya tenía esta cita' : `Agendada: ${resumen}`,
          mensaje: r.mensaje,
          waLink: r.wa_link,
          nota: r.duplicada ? 'No se ha creado una segunda: esta es la que ya tenía.' : `${r.service} · ${r.slot_minutes} min · ${soles(r.precio)}`,
        },
      });
      return;
    }

    // Sin teléfono no hay a quién escribirle: basta con el aviso.
    if (sinTelefono && !r.fija_id) {
      avisar(`Cita creada: ${r.service} · ${soles(r.precio)}${nombreEnviar ? ` · ${nombreEnviar}` : ''}.`, 'ok');
      setBusqueda('');
      setLead(null);
      setTel('');
      setNombre('');
      setCumple('');
      setHora(hhmm(ahoraAgendable()));
      return;
    }

    const saltadas = r.saltadas ?? [];
    const ficha = `${r.service} · ${r.slot_minutes} min · ${soles(r.precio)}`
      + (r.fija_id ? ` · turno fijo de ${r.creadas?.length ?? 0} semanas` : '')
      + (saltadas.length ? `. Sin sitio (se saltaron): ${saltadas.map((s) => s.slot_start.slice(5, 10).split('-').reverse().join('/')).join(', ')}` : '');
    setAviso({
      /* Reenviar es seguro y el bot lo dice: si ese cliente ya tenía esa cita,
         devuelve la suya con `duplicada`. Anunciar «creada» ahí haría creer que
         ahora hay dos. */
      titulo: r.duplicada ? 'Ese cliente ya tenía esta cita' : r.fija_id ? 'Turno fijo creado' : canchas ? 'Reserva creada' : 'Cita creada',
      mensaje: r.mensaje,
      waLink: r.wa_link,
      nota: r.duplicada
        ? `No se ha creado una segunda: esta es la que ya tenía. ${ficha}`
        : r.cliente_nuevo
          ? `${ficha}. ${nombreEnviar || 'El número'} queda guardado como cliente nuevo.`
          : ficha,
    });

    setBusqueda('');
    setLead(null);
    setTel('');
    setNombre('');
    setCumple('');
    setHora(canchas ? '' : hhmm(ahoraAgendable()));
  }

  // Escape cierra; detrás no se desplaza la página mientras está abierta.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && !enviando && alCerrar();
    document.addEventListener('keydown', tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = antes;
    };
  }, [alCerrar, enviando]);

  const nombreSede = (n: string) => n.split(' · ')[0];

  // La guía (18-nov): cada elección lleva la vista al siguiente campo (lib/panel/guiar.ts).
  const refSede = useRef<HTMLDivElement>(null);
  const refQuien = useRef<HTMLDivElement>(null);
  const refHora = useRef<HTMLDivElement>(null);
  const refCliente = useRef<HTMLDivElement>(null);
  const ahoraCampo = !itemId ? 'servicio' : pideSede && !sede ? 'sede' : !hora ? 'hora' : '';
  const elegirServicio = (id: string) => {
    setItemId(id);
    guiarA((pideSede && !sede ? refSede : activos.length ? refQuien : refHora).current);
  };
  const elegirSedeNc = (n: string) => {
    setSede(n);
    guiarA((activos.length ? refQuien : refHora).current);
  };
  const elegirQuien = (id: string) => {
    setEmpId(id);
    guiarA(refHora.current);
  };
  const elegirHoraNc = (h: string) => {
    setHora(h);
    guiarA(refCliente.current);
  };
  const clase = (campo: string) => `nc-campo${ahoraCampo === campo ? ' nc-campo--ahora' : ''}`;

  return (
    <div className="modal-fondo nc-fondo" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !enviando) alCerrar(); }}>
      <div className="modal nc" role="dialog" aria-modal="true" aria-labelledby="nc-titulo">
        <div className="nc-cab">
          <h3 id="nc-titulo"><CalendarPlus size={18} /> {canchas ? 'Nueva reserva' : 'Nueva cita'}</h3>
          <button type="button" className="q-icon" aria-label="Cerrar" onClick={alCerrar} disabled={enviando}>
            <X size={18} />
          </button>
        </div>

        <div className="nc-cuerpo">
          {aviso && <AvisarCliente {...aviso} alCerrar={() => setAviso(null)} />}

          <div className={clase('servicio')}>
            <span className="nc-rotulo">{canchas ? '¿Qué cancha?' : '¿Qué servicio?'}</span>
            <div className="nc-chips" role="radiogroup" aria-label={canchas ? 'Cancha' : 'Servicio'}>
              {servicios.map((x) => (
                <button key={x.id} type="button" role="radio" aria-checked={itemId === x.id}
                  className={`ticket-chip ticket-chip--item${itemId === x.id ? ' on' : ''}`} onClick={() => elegirServicio(x.id)}>
                  <span>{x.name}</span>
                  <small>{x.price != null ? soles(x.price) : '—'}{x.duration_minutes ? ` · ${x.duration_minutes} min` : ''}</small>
                </button>
              ))}
              {servicios.length === 0 && <p className="fh-vacio">No hay servicios activos en el Catálogo.</p>}
            </div>
          </div>

          {canchas && (
            <div className="nc-dos">
              <div className="nc-campo">
                <label className="nc-rotulo" htmlFor="nueva-turnos">Tiempo</label>
                <select id="nueva-turnos" className="select" value={turnos} onChange={(e) => setTurnos(Number(e.target.value))}>
                  {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n * turno % 60 === 0 ? `${n * turno / 60} h` : `${n * turno} min`}</option>)}
                </select>
              </div>
              <div className="nc-campo">
                <label className="nc-rotulo" htmlFor="nueva-semanas">Repetir</label>
                <select id="nueva-semanas" className="select" value={semanas} onChange={(e) => setSemanas(Number(e.target.value))}>
                  {SEMANAS.map((n) => <option key={n} value={n}>{n === 1 ? 'Solo esta vez' : `Cada semana · ${n} semanas`}</option>)}
                </select>
              </div>
            </div>
          )}

          {pideSede && (
            <div ref={refSede} className={clase('sede')}>
              <span className="nc-rotulo">¿En qué sede?</span>
              <div className="nc-chips" role="radiogroup" aria-label="Sede">
                {sedes.map((x) => (
                  <button key={x.nombre} type="button" role="radio" aria-checked={sede === x.nombre}
                    className={`ticket-chip${sede === x.nombre ? ' on' : ''}`} onClick={() => elegirSedeNc(x.nombre)}>
                    {nombreSede(x.nombre)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activos.length > 0 && (
            <div ref={refQuien} className="nc-campo">
              <span className="nc-rotulo">¿Con quién?</span>
              <div className="nc-chips" role="radiogroup" aria-label="Profesional">
                <button type="button" role="radio" aria-checked={empId === ''} className={`ticket-chip${empId === '' ? ' on' : ''}`} onClick={() => elegirQuien('')}>
                  Cualquiera
                </button>
                {activos.map((t) => (
                  <button key={t.id} type="button" role="radio" aria-checked={empId === t.id}
                    className={`ticket-chip${empId === t.id ? ' on' : ''}`} onClick={() => elegirQuien(t.id)}>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="nc-campo">
            <span className="nc-rotulo">¿Qué día?</span>
            <ElegirFecha valor={fecha} alCambiar={(f) => { setFecha(f); setVerPasadas(false); if (f !== hoy && hora && !(horasDelDia(horario, f, minutosServicio) ?? []).includes(hora)) setHora(''); }}
              min={ayerLima()} cerrado={canchas ? undefined : cerrado} />
          </div>

          <div ref={refHora} className={clase('hora')}>
            <span className="nc-rotulo">
              ¿A qué hora?
              {fecha === hoy && !canchas && (
                <button type="button" className="nc-ahora" onClick={() => setHora(hhmm(ahoraAgendable()))}>Ahora · {hora12(hhmm(ahoraAgendable()))}</button>
              )}
            </span>
            {horasPosibles ? (
              <>
                <ElegirHora horas={horasVisibles} valor={hora} alCambiar={elegirHoraNc} llenas={llenas} />
                {/* Un interruptor, no una puerta de un solo sentido: se abre y se vuelve a cerrar. */}
                {fecha === hoy && (verPasadas || horasVisibles.length < horasPosibles.length) && (
                  <button type="button" className={`nc-interruptor${verPasadas ? ' on' : ''}`} aria-pressed={verPasadas}
                    onClick={() => setVerPasadas((v) => !v)}>
                    {verPasadas ? <><X size={15} /> Ocultar las horas que ya pasaron</> : '¿Ya lo atendiste? Ver las horas que ya pasaron'}
                  </button>
                )}
              </>
            ) : (
              <input className="input" type="time" value={hora} onChange={(e) => setHora(e.target.value)} aria-label="Hora" />
            )}
          </div>

          <div ref={refCliente} className="nc-campo">
            <span className="nc-rotulo">¿Para quién? <span className="nc-opcional">opcional</span></span>
            {nuevo ? (
              <div className="nc-dos">
                <input className="input" inputMode="tel" placeholder="Celular · 987654321" value={tel} onChange={(e) => setTel(e.target.value)} aria-label="Celular" />
                <input className="input" placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre" />
                <ElegirCumple valor={cumple} alCambiar={setCumple} />
                <button type="button" className="nc-link" onClick={() => setNuevo(false)}>Buscar en mis clientes</button>
              </div>
            ) : lead ? (
              <div className="nc-elegido">
                <b>{lead.name || 'Sin nombre'}</b>
                <span className="muted">{comoTelefono(lead.phone)}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLead(null)}>Cambiar</button>
              </div>
            ) : (
              <>
                <div className="search nc-buscar">
                  <Search size={16} />
                  <input placeholder="Nombre o celular" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar cliente" />
                </div>
                {encontrados.map((l) => (
                  <button type="button" key={l.id} className="buscador-res" onClick={() => { setLead(l); setBusqueda(''); }}>
                    <b>{l.name || 'Sin nombre'}</b>
                    <span className="muted">{comoTelefono(l.phone)}</span>
                  </button>
                ))}
                {/* El que llamó por teléfono y nunca le escribió a Mia: media clientela de una barbería. */}
                <button type="button" className="nc-link" onClick={() => setNuevo(true)}>
                  <UserPlus size={14} /> Es cliente nuevo
                </button>
              </>
            )}
          </div>
        </div>

        <div className="nc-pie">
          {/* Lo que se agenda y, aparte y grande, lo que va a pagar (18-nov: «más grande y claro»). */}
          <div className="nc-resumen" aria-live="polite">
            <div className="nc-resumen__que">
              {servicioElegido ? <b>{servicioElegido.name}</b> : <span className="muted">Elige el servicio</span>}
              {(hora || (pideSede && sede)) && (
                <span>
                  {hora ? `${fechaEnPalabras(fecha, hoy)} · ${hora12(hora)}` : ''}
                  {pideSede && sede ? `${hora ? ' · ' : ''}${nombreSede(sede)}` : ''}
                </span>
              )}
            </div>
            {servicioElegido?.price != null && (
              <div className="nc-resumen__total">
                <small>A pagar</small>
                <b>{soles(servicioElegido.price)}</b>
              </div>
            )}
          </div>
          <div className="nc-botones">
            <button type="button" className="btn btn-ghost" onClick={alCerrar} disabled={enviando}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={enviando || !itemId || !hora || (pideSede && !sede)} onClick={() => void crear()}>
              <Check size={16} /> {enviando ? 'Agendando…' : 'Agendar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
