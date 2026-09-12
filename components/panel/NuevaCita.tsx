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
 */
import { useMemo, useState } from 'react';
import { CalendarPlus, Check, Search, UserPlus, X } from 'lucide-react';
import AvisarCliente from './AvisarCliente';
import { useAvisar, useComando } from './Avisos';
import { hoyLima } from '@/lib/panel/inscripciones';
import { soles, telefono as comoTelefono } from '@/lib/panel/format';
import { json } from '@/lib/supabase/parse';
import type { ResultadoCrearCita } from '@/lib/supabase/commands';
import type { FranjaRecurrente } from '@/lib/supabase/types';
import type { ItemCatalogo, Lead, Trabajador } from '@/lib/supabase/queries';

/** Cuántos clientes se enseñan al buscar. Más es una lista que nadie lee. */
const TOPE_BUSQUEDA = 6;

const soloDigitos = (s: string) => s.replace(/\D/g, '');

export default function NuevaCita({
  leads,
  catalogo,
  trabajadores,
  alCerrar,
  alCambiar,
}: {
  leads: Lead[];
  catalogo: ItemCatalogo[];
  trabajadores: Trabajador[];
  alCerrar: () => void;
  alCambiar: () => void;
}) {
  const comando = useComando();
  const avisar = useAvisar();

  const [nuevo, setNuevo] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [lead, setLead] = useState<Lead | null>(null);
  const [tel, setTel] = useState('');
  const [nombre, setNombre] = useState('');
  const [fecha, setFecha] = useState(hoyLima());
  const [hora, setHora] = useState('');
  const [itemId, setItemId] = useState('');
  const [empId, setEmpId] = useState('');
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
    () => catalogo.filter((c) => c.activo && json<FranjaRecurrente[]>(c.schedule_slots, []).length === 0),
    [catalogo],
  );
  const activos = useMemo(() => trabajadores.filter((t) => t.activo), [trabajadores]);

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
    if (!nuevo && !lead) {
      avisar('Elige al cliente, o márcalo como nuevo.', 'error');
      return;
    }
    if (nuevo && (soloDigitos(tel).length < 9 || !nombre.trim())) {
      avisar(
        'Para un cliente nuevo hacen falta teléfono y nombre: sin nombre, la agenda queda con un número suelto.',
        'error',
      );
      return;
    }

    setEnviando(true);
    const r = await comando<ResultadoCrearCita>(
      'crear_cita',
      {
        ...(nuevo ? { telefono: soloDigitos(tel), nombre: nombre.trim() } : { lead_id: lead?.id }),
        slot_start: `${fecha} ${hora}`,
        catalog_item_id: itemId,
        ...(empId ? { employee_id: empId } : {}),
      },
      undefined,
      alCambiar,
    );
    setEnviando(false);
    // Si no cabe, useComando ya ha enseñado el motivo del bot y no hay cita.
    if (!r) return;

    const ficha = `${r.service} · ${r.slot_minutes} min · ${soles(r.precio)}`;
    setAviso({
      /* Reenviar es seguro y el bot lo dice: si ese cliente ya tenía esa cita,
         devuelve la suya con `duplicada`. Anunciar «creada» ahí haría creer que
         ahora hay dos. */
      titulo: r.duplicada ? 'Ese cliente ya tenía esta cita' : 'Cita creada',
      mensaje: r.mensaje,
      waLink: r.wa_link,
      nota: r.duplicada
        ? `No se ha creado una segunda: esta es la que ya tenía. ${ficha}`
        : r.cliente_nuevo
          ? `${ficha}. ${nombre.trim()} queda guardado como cliente nuevo.`
          : ficha,
    });

    setBusqueda('');
    setLead(null);
    setTel('');
    setNombre('');
    setHora('');
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-head">
        <h3>
          <CalendarPlus size={16} style={{ verticalAlign: -3 }} /> Nueva cita
        </h3>
        <button type="button" className="q-icon" aria-label="Cerrar" onClick={alCerrar}>
          <X size={15} />
        </button>
      </div>

      {aviso && <AvisarCliente {...aviso} alCerrar={() => setAviso(null)} />}

      <div className="form-nueva">
        <div className="full">
          <label className="field-label">Cliente</label>

          {nuevo ? (
            <div className="form-nueva">
              <input
                className="input"
                placeholder="Teléfono · 51987654321"
                value={tel}
                onChange={(e) => setTel(e.target.value)}
              />
              <input
                className="input"
                placeholder="Nombre y apellido"
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
                  placeholder="Buscar por nombre o teléfono…"
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

        <div>
          <label className="field-label">Servicio</label>
          <select className="select" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Elige el servicio</option>
            {servicios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.price != null ? ` · ${soles(s.price)}` : ''}
              </option>
            ))}
          </select>
          <small className="muted" style={{ fontSize: 11.5 }}>
            De él salen el precio y la duración: no se teclean.
          </small>
        </div>

        {activos.length > 0 && (
          <div>
            <label className="field-label">Profesional</label>
            <select className="select" value={empId} onChange={(e) => setEmpId(e.target.value)}>
              <option value="">Da igual</option>
              {activos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

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
          crea nada. Al terminar te doy el mensaje para avisar al cliente: <b>esta cita no pasa por
          Mia</b>, así que nadie le avisa si no lo mandas tú.
        </small>
      </div>
    </div>
  );
}
