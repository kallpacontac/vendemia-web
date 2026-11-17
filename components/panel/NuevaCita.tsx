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
import { useMemo, useState } from 'react';
import { CalendarPlus, Check, Search, UserPlus, X } from 'lucide-react';
import AvisarCliente from './AvisarCliente';
import ComboPanel from './ComboPanel';
import { useAvisar, useComando } from './Avisos';
import { hoyLima } from '@/lib/panel/inscripciones';
import { soles, telefono as comoTelefono } from '@/lib/panel/format';
import { json } from '@/lib/supabase/parse';
import type { ResultadoCrearCita } from '@/lib/supabase/commands';
import type { FranjaRecurrente } from '@/lib/supabase/types';
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
const sumarMin = (slot: string, min: number) => {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})$/.exec(slot);
  return m ? `${m[1]} ${hhmm(Number(m[2]) * 60 + Number(m[3]) + min)}` : slot;
};

/**
 * El primer hueco de HOY en una sede desde ahora: cuenta las citas en pie que se cruzan (las sin sede
 * cuentan en todas, como en la base) contra sus sillas. Es una ayuda: la base vuelve a comprobar
 * horario y aforo al agendar, y si no cabe lo dice.
 */
function proximoLibre(citas: Cita[], hoy: string, sede: string, sillas: number, minutos: number): string | null {
  const vivas = citas.filter((c) => c.slot_start?.startsWith(hoy) && c.status !== 'cancelled' && c.status !== 'no_show'
    && (!c.sede || c.sede === sede));
  for (let t = ahoraAgendable(); t + minutos <= 23 * 60; t += 5) {
    const ini = `${hoy} ${hhmm(t)}`;
    const fin = `${hoy} ${hhmm(t + minutos)}`;
    const ocupadas = vivas.filter((c) => c.slot_start < fin && (c.slot_end || sumarMin(c.slot_start, c.slot_minutes ?? 30)) > ini).length;
    if (ocupadas < sillas) return hhmm(t);
  }
  return null;
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
  alCreada?: (c: { id: string; sede: string; resumen: string; aviso: { titulo: string; mensaje: string; waLink: string; nota?: string } | null }) => void;
}) {
  const comando = useComando();
  const avisar = useAvisar();

  const [nuevo, setNuevo] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [lead, setLead] = useState<Lead | null>(null);
  const [tel, setTel] = useState('');
  const [nombre, setNombre] = useState('');
  const [fecha, setFecha] = useState(inicial?.fecha ?? hoyLima());
  // Por defecto, AHORA: casi siempre es el que acaba de entrar por la puerta.
  const [hora, setHora] = useState(inicial?.hora ?? (canchas ? '' : hhmm(ahoraAgendable())));
  const [itemId, setItemId] = useState(inicial?.itemId ?? '');
  const [empId, setEmpId] = useState('');
  const [sede, setSede] = useState('');
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
    () => catalogo.filter((c) => c.activo && json<FranjaRecurrente[]>(c.schedule_slots, []).length === 0 && !(canchas && c.tipo === 'producto')),
    [catalogo, canchas],
  );
  const turno = servicios.find((s) => s.id === itemId)?.duration_minutes || 60;
  const activos = useMemo(() => trabajadores.filter((t) => t.activo), [trabajadores]);

  /** Hoy: «Ahora» y el próximo cupo libre de cada sede con sillas conocidas. */
  const hoy = hoyLima();
  const minutosServicio = servicios.find((x) => x.id === itemId)?.duration_minutes || 30;
  const sugerencias = useMemo(() => {
    if (canchas) return [];
    return sedes
      .filter((x) => (x.capacidad ?? 0) > 0)
      .map((x) => ({ sede: x.nombre, hora: proximoLibre(citas, hoy, x.nombre, x.capacidad ?? 0, minutosServicio) }));
  }, [canchas, sedes, citas, hoy, minutosServicio]);

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

    const sinTelefono = Boolean((r as { sin_telefono?: boolean }).sin_telefono);
    if (alCreada && !canchas && !r.fija_id) {
      const quien = lead && !nuevo ? lead.name || comoTelefono(lead.phone) : nombreEnviar || (telEnviar ? comoTelefono(telEnviar) : 'Cliente');
      const resumen = `${quien} · ${r.service} · ${hora}${pideSede && sede ? ` · ${sede.split(' · ')[0]}` : ''}`;
      alCreada({
        id: (r as { id?: string }).id ?? '',
        sede: pideSede ? sede : '',
        resumen,
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
    setHora(canchas ? '' : hhmm(ahoraAgendable()));
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-head">
        <h3>
          <CalendarPlus size={16} style={{ verticalAlign: -3 }} /> {canchas ? 'Nueva reserva' : 'Nueva cita'}
        </h3>
        <button type="button" className="q-icon" aria-label="Cerrar" onClick={alCerrar}>
          <X size={15} />
        </button>
      </div>

      {aviso && <AvisarCliente {...aviso} alCerrar={() => setAviso(null)} />}

      <div className="form-nueva">
        <div className="full">
          <label className="field-label">Cliente <span className="muted" style={{ fontWeight: 500 }}>· opcional</span></label>

          {nuevo ? (
            <div className="form-nueva">
              <input
                className="input"
                placeholder="Teléfono (opcional) · 987654321"
                value={tel}
                onChange={(e) => setTel(e.target.value)}
              />
              <input
                className="input"
                placeholder="Nombre (opcional)"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
              <button className="btn btn-ghost btn-sm" onClick={() => setNuevo(false)}>
                Buscar en mis clientes
              </button>
            </div>
          ) : lead ? (
            <div className="check-inline">
              <b>{lead.name || 'Sin nombre'}</b>
              <span className="muted">{comoTelefono(lead.phone)}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setLead(null)}>
                Cambiar
              </button>
            </div>
          ) : (
            <>
              <div className="search" style={{ width: '100%' }}>
                <Search size={16} />
                <input
                  placeholder="Buscar cliente, o escribe su nombre o número (opcional)"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
              </div>
              {encontrados.map((l) => (
                <button
                  type="button"
                  key={l.id}
                  className="buscador-res"
                  onClick={() => {
                    setLead(l);
                    setBusqueda('');
                  }}
                >
                  <b>{l.name || 'Sin nombre'}</b>
                  <span className="muted">{comoTelefono(l.phone)}</span>
                </button>
              ))}
              {/* El que llamó por teléfono y nunca le escribió a Mia: es media
                  clientela de una barbería, y hasta hoy no cabía en la agenda. */}
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 8 }}
                onClick={() => setNuevo(true)}
              >
                <UserPlus size={14} /> No está: es cliente nuevo
              </button>
            </>
          )}
        </div>

        <div>
          <label className="field-label">Día</label>
          <input
            className="input"
            type="date"
            min={hoyLima()}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Hora</label>
          <input
            className="input"
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
          />
        </div>

        {!canchas && (
          <div className="full" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: -4 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setFecha(hoy); setHora(hhmm(ahoraAgendable())); }}>
              Ahora · {hhmm(ahoraAgendable())}
            </button>
            {sugerencias.map((x) => (
              <button key={x.sede} type="button" className="btn btn-ghost btn-sm" disabled={!x.hora}
                title={x.hora ? `Primer cupo libre hoy en ${x.sede}` : `${x.sede} no tiene cupo libre hoy`}
                onClick={() => { if (!x.hora) return; setFecha(hoy); setHora(x.hora); setSede(x.sede); }}>
                {x.sede.split(' · ')[0]} · {x.hora ? `libre ${x.hora}` : 'lleno hoy'}
              </button>
            ))}
          </div>
        )}

        <div>
          <label className="field-label">{canchas ? 'Cancha' : 'Servicio'}</label>
          <ComboPanel tipo={canchas ? 'cancha' : 'servicio'} etiqueta={canchas ? 'Cancha' : 'Servicio'} value={itemId} alCambiar={setItemId}
            opciones={[{ value:'', label: canchas ? 'Elige la cancha' : 'Elige el servicio' }, ...servicios.map((s) => ({ value:s.id, label:s.name, detalle:s.price != null ? soles(s.price) : undefined }))]} />
        </div>

        {canchas && (
          <>
            <div>
              <label className="field-label" htmlFor="nueva-turnos">Tiempo</label>
              <select id="nueva-turnos" className="select" value={turnos} onChange={(e) => setTurnos(Number(e.target.value))}>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n * turno % 60 === 0 ? `${n * turno / 60} h` : `${n * turno} min`}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="nueva-semanas">Repetir</label>
              <select id="nueva-semanas" className="select" value={semanas} onChange={(e) => setSemanas(Number(e.target.value))}>
                {SEMANAS.map((n) => <option key={n} value={n}>{n === 1 ? 'Solo esta vez' : `Cada semana · ${n} semanas`}</option>)}
              </select>
            </div>
          </>
        )}

        {pideSede && (
          <div>
            <label className="field-label">Sede</label>
            <ComboPanel etiqueta="Sede" value={sede} alCambiar={setSede}
              opciones={[{ value: '', label: 'Elige la sede' }, ...sedes.map((x) => ({ value: x.nombre, label: x.capacidad ? `${x.nombre} · ${x.capacidad} a la vez` : x.nombre }))]} />
          </div>
        )}

        {activos.length > 0 && (
          <div>
            <label className="field-label">Profesional</label>
            <ComboPanel tipo="persona" etiqueta="Profesional" value={empId} alCambiar={setEmpId}
              opciones={[{ value:'', label:'Da igual' }, ...activos.map((t) => ({ value:t.id, label:t.name }))]} />
          </div>
        )}

        <small className="muted full" style={{ fontSize: 11.5, marginTop: -4 }}>
          {canchas ? 'El precio sale de la cancha y de la hora (día o noche): no se teclea.' : 'Del servicio salen el precio y la duración: no se teclean.'}
        </small>

        <div className="full nav-btns">
          <button className="btn btn-ghost" onClick={alCerrar}>
            Dejarlo
          </button>
          <button className="btn btn-primary" disabled={enviando} onClick={() => void crear()}>
            <Check size={16} /> {enviando ? 'Agendando…' : 'Agendar'}
          </button>
        </div>

        <small className="muted full" style={{ fontSize: 11.5 }}>
          Si no cabe —ocupado, bloqueado o fuera de horario— Mia te dirá exactamente por qué y no se
          crea nada. Al terminar te doy el mensaje para avisar al cliente: <b>{canchas ? 'esta reserva' : 'esta cita'} no pasa por
          Mia</b>, así que nadie le avisa si no lo mandas tú.
        </small>
      </div>
    </div>
  );
}
