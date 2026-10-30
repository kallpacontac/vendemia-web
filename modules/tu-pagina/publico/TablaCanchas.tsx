'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * MI PÁGINA · la tabla de canchas: columnas = canchas, filas = horas
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Lo que sale en /reservar cuando la página tiene canchas (dominio/canchas.ts).
 * En cada casilla el precio de ESA hora (día o noche). Se toca una casilla
 * libre; tocar la siguiente de la misma cancha suma un turno (hasta MAX_TURNOS).
 * Una casilla ocupada ofrece «Avísame si se libera»: nombre y celular, y el
 * dueño lo ve en Mi página → «Avísame».
 *
 * En el celular la tabla se desliza de lado con la columna de horas fija, y si
 * hay canchas de varios tipos (familia del catálogo: «Fútbol 7», «Vóley») se
 * puede filtrar por tipo.
 *
 * Lo libre/ocupado es una foto de hace como mucho 15 s: el servidor lo rehace
 * con candado al reservar (rutas/reserva.ts → agenda_srv_reservar).
 */
import { useMemo, useState } from 'react';
import { Bell, Check, MessageCircle, X } from 'lucide-react';
import { sumarDias, sumarMin } from '@/modules/tu-pagina/dominio/agenda';
import {
  MAX_TURNOS,
  canchaLibre,
  canchasDe,
  estadoCasilla,
  filasDelDia,
  mensajeCancha,
  plazoDe,
  precioReserva,
  precioTurno,
  type ConfigCanchas,
} from '@/modules/tu-pagina/dominio/canchas';
import { fechaCorta, urlWhatsApp } from '@/modules/tu-pagina/dominio/envio';
import { soles, validarCliente, type ErroresCliente, type Escaparate, type Item } from '@/modules/tu-pagina/dominio/tienda';
import { CamposCliente, useCliente, useEnviar } from '@/modules/tu-pagina/publico/Escaparate';

const DIAS_A_LA_VISTA = 14;

const MENSAJE_FALLO: Record<string, string> = {
  lleno: 'Alguien acaba de reservar esa cancha. Elige otra hora.',
  pasada: 'Esa hora ya pasó. Elige otra.',
  demasiados: 'Ya tienes varias reservas sin confirmar. Escríbenos por WhatsApp.',
  no_existe: 'Esa cancha ya no está disponible.',
  not_found: 'Esta página ya no recibe reservas en línea. Escríbenos por WhatsApp.',
};

interface Seleccion {
  item: string;
  inicio: string;
  turnos: number;
}

const etiquetaDia = (fecha: string, hoy: string) =>
  fecha === hoy ? 'Hoy' : fecha === sumarDias(hoy, 1) ? 'Mañana' : fechaCorta(fecha).split(' ')[0];

export default function TablaCanchas({ esc, cfg, slug, whatsapp, negocio }: {
  esc: Escaparate; cfg: ConfigCanchas; slug: string; whatsapp: string; negocio: string;
}) {
  const canchas = useMemo(() => canchasDe(esc), [esc]);
  const tipos = useMemo(() => [...new Set(canchas.map((c) => c.familia).filter(Boolean))], [canchas]);
  const [tipo, setTipo] = useState('');
  const plazo = plazoDe(cfg);
  const visibles = tipo ? canchas.filter((c) => c.familia === tipo) : canchas;

  const dias = useMemo(
    () => Array.from({ length: DIAS_A_LA_VISTA }, (_, i) => sumarDias(esc.hoy, i)).filter((f) => filasDelDia(esc.agenda, f).length > 0),
    [esc.hoy, esc.agenda],
  );
  const [dia, setDia] = useState(dias[0] ?? '');
  const filas = dia ? filasDelDia(esc.agenda, dia) : [];

  // Lo que el servidor dijo «lleno» después de pintar: se pinta ocupado sin recargar.
  const [tomadas, setTomadas] = useState<{ item: string; inicio: string; fin: string }[]>([]);
  const agenda = useMemo(
    () => ({ ...esc.agenda, ocupados: [...esc.agenda.ocupados, ...tomadas.map((t) => ({ inicio: t.inicio, fin: t.fin, empleado: '', item: t.item }))] }),
    [esc.agenda, tomadas],
  );

  const [sel, setSel] = useState<Seleccion | null>(null);
  const [avisame, setAvisame] = useState<{ item: Item; inicio: string } | null>(null);
  const [hecho, setHecho] = useState<{ codigo: string; mensaje: string } | null>(null);

  const itemSel = sel ? canchas.find((c) => c.id === sel.item) ?? null : null;
  const finSel = sel && itemSel ? sumarMin(sel.inicio, itemSel.duracion * sel.turnos) : '';

  function tocarLibre(item: Item, inicio: string) {
    setAvisame(null);
    if (sel && sel.item === item.id) {
      const ultimo = sumarMin(sel.inicio, item.duracion * (sel.turnos - 1));
      // La siguiente de la misma cancha: un turno más, si está libre todo el rato.
      if (inicio === sumarMin(ultimo, item.duracion) && sel.turnos < MAX_TURNOS
          && canchaLibre(agenda, item.id, sel.inicio, item.duracion * (sel.turnos + 1), plazo)) {
        setSel({ ...sel, turnos: sel.turnos + 1 });
        return;
      }
      // La última elegida: un turno menos. La primera con uno solo: se suelta.
      if (inicio === ultimo) {
        setSel(sel.turnos > 1 ? { ...sel, turnos: sel.turnos - 1 } : null);
        return;
      }
    }
    setSel({ item: item.id, inicio, turnos: 1 });
  }

  if (hecho) {
    return (
      <section className="tp-hecho" aria-live="polite">
        <div className="tp-hecho__marca"><Check size={36} aria-hidden="true" /></div>
        <h2 className="tp-h1">¡Tu cancha está reservada!</h2>
        <p className="tp-lead">Guarda tu código y avísanos por WhatsApp.</p>
        <div className="tp-codigo">{hecho.codigo}</div>
        <p className="tp-resumen">{hecho.mensaje}</p>
        <a className="tp-boton tp-boton--wsp" href={urlWhatsApp(whatsapp, hecho.mensaje)} rel="noopener">
          <MessageCircle size={20} aria-hidden="true" /> Avisar por WhatsApp
        </a>
        <button type="button" className="tp-boton tp-boton--suave" onClick={() => { setHecho(null); setSel(null); }}>Reservar otra</button>
      </section>
    );
  }

  if (!canchas.length || !dias.length) {
    return <p className="tp-vacio">Por ahora no hay canchas para reservar aquí. Escríbenos por WhatsApp.</p>;
  }

  return (
    <div className="tp-canchas">
      <div className="tp-dias tp-canchas__dias" role="group" aria-label="Día">
        {dias.map((f) => (
          <button key={f} type="button" className="tp-opcion" aria-pressed={dia === f} onClick={() => { setDia(f); setSel(null); setAvisame(null); }}>
            {etiquetaDia(f, esc.hoy)}
            <small>{fechaCorta(f).split(' ').slice(1).join(' ')}</small>
          </button>
        ))}
      </div>

      {tipos.length > 1 && (
        <div className="tp-canchas__tipos" role="group" aria-label="Tipo de cancha">
          <button type="button" className="tp-chip" aria-pressed={!tipo} onClick={() => setTipo('')}>Todas</button>
          {tipos.map((t) => <button key={t} type="button" className="tp-chip" aria-pressed={tipo === t} onClick={() => setTipo(t)}>{t}</button>)}
        </div>
      )}

      <ul className="tp-canchas__leyenda" aria-label="Leyenda">
        <li><i className="libre" aria-hidden="true" /> Disponible</li>
        <li><i className="ocupada" aria-hidden="true" /> Ocupada · toca para que te avisemos</li>
        <li><i className="elegida" aria-hidden="true" /> Tu elección</li>
      </ul>

      <div className="tp-canchas__marco">
        <table className="tp-canchas__tabla">
          <thead>
            <tr>
              <th scope="col" className="tp-canchas__hora">Hora</th>
              {visibles.map((c) => (
                <th key={c.id} scope="col">
                  <b>{c.nombre}</b>
                  {c.familia && <small>{c.familia}</small>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((inicio) => (
              <tr key={inicio}>
                <th scope="row" className="tp-canchas__hora">{inicio.slice(11, 16)}</th>
                {visibles.map((c) => {
                  const estado = estadoCasilla(agenda, c, inicio, esc.ahora, plazo);
                  const precio = precioTurno(cfg, c, inicio);
                  const elegida = Boolean(sel && sel.item === c.id && inicio >= sel.inicio && inicio < finSel);
                  const etiqueta = `${c.nombre}, ${inicio.slice(11, 16)}`;
                  if (estado === 'libre') {
                    return (
                      <td key={c.id}>
                        <button type="button" className={`tp-canchas__casilla libre${elegida ? ' elegida' : ''}`} aria-pressed={elegida}
                          aria-label={`${etiqueta}, libre, ${soles(precio)}`} onClick={() => tocarLibre(c, inicio)}>
                          {elegida ? <Check size={16} aria-hidden="true" /> : null}{soles(precio)}
                        </button>
                      </td>
                    );
                  }
                  if (estado === 'ocupada') {
                    return (
                      <td key={c.id}>
                        <button type="button" className="tp-canchas__casilla ocupada" aria-label={`${etiqueta}, ocupada. Avísame si se libera`}
                          onClick={() => { setSel(null); setAvisame({ item: c, inicio }); }}>
                          <Bell size={14} aria-hidden="true" /> Ocupada
                        </button>
                      </td>
                    );
                  }
                  return <td key={c.id}><span className="tp-canchas__casilla apagada" aria-label={`${etiqueta}, no disponible`}>—</span></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sel && itemSel && (
        <Confirmar
          key={`${sel.item}|${sel.inicio}`}
          item={itemSel}
          sel={sel}
          precio={precioReserva(cfg, itemSel, sel.inicio, sel.turnos)}
          slug={slug}
          direccion={esc.direccion}
          alCerrar={() => setSel(null)}
          alLlenarse={() => { setTomadas((t) => [...t, { item: sel.item, inicio: sel.inicio, fin: finSel }]); setSel(null); }}
          alTerminar={setHecho}
        />
      )}
      {avisame && <Avisame key={`${avisame.item.id}|${avisame.inicio}`} item={avisame.item} inicio={avisame.inicio} slug={slug} negocio={negocio} alCerrar={() => setAvisame(null)} />}
    </div>
  );
}

function Confirmar({ item, sel, precio, slug, direccion, alCerrar, alLlenarse, alTerminar }: {
  item: Item; sel: Seleccion; precio: number | null; slug: string; direccion: string;
  alCerrar: () => void; alLlenarse: () => void; alTerminar: (h: { codigo: string; mensaje: string }) => void;
}) {
  const { cliente, setCliente, recordar } = useCliente();
  const [errores, setErrores] = useState<ErroresCliente>({});
  const [fallo, setFallo] = useState('');
  const { enviar, enviando } = useEnviar('/api/tu-pagina/publico/reserva');
  const minutos = item.duracion * sel.turnos;

  async function reservar() {
    const e = validarCliente(cliente);
    setErrores(e);
    setFallo('');
    if (Object.keys(e).length) return;
    const j = await enviar({ slug, item: item.id, inicio: sel.inicio, turnos: sel.turnos, nombre: cliente.nombre, telefono: cliente.telefono, web: '' });
    if (j.status === 'ok' && typeof j.codigo === 'string') {
      recordar(cliente);
      alTerminar({ codigo: j.codigo, mensaje: mensajeCancha(j.codigo, { cancha: item.nombre, inicio: sel.inicio, minutos, precio, nombre: cliente.nombre }) });
      return;
    }
    if (j.errores) setErrores(j.errores as ErroresCliente);
    setFallo(MENSAJE_FALLO[String(j.status)] ?? (j.status === 'sin_red' ? 'Sin conexión. Revisa tu internet.' : 'No pudimos reservar. Inténtalo otra vez.'));
    if (j.status === 'lleno' || j.status === 'pasada') alLlenarse();
  }

  return (
    <section className="tp-canchas__hoja" aria-label="Tu reserva">
      <div className="tp-canchas__hoja-cabeza">
        <h2>Tu reserva</h2>
        <button type="button" className="tp-canchas__cerrar" aria-label="Quitar selección" onClick={alCerrar}><X size={18} aria-hidden="true" /></button>
      </div>
      <div className="tp-reserva-resumen"><dl>
        <div><dt>Cancha</dt><dd>{item.nombre}{item.familia ? ` · ${item.familia}` : ''}</dd></div>
        <div><dt>Día</dt><dd>{fechaCorta(sel.inicio.slice(0, 10))}</dd></div>
        <div><dt>Hora</dt><dd>{sel.inicio.slice(11, 16)} – {sumarMin(sel.inicio, minutos).slice(11, 16)}</dd></div>
        {direccion && <div><dt>Dirección</dt><dd>{direccion}</dd></div>}
        <div className="tp-reserva-resumen__precio"><dt>Total</dt><dd>{soles(precio)}</dd></div>
      </dl></div>
      {sel.turnos < MAX_TURNOS && <p className="tp-nota">¿Más tiempo? Toca la hora siguiente de la misma cancha.</p>}
      <CamposCliente d={cliente} errores={errores} alCambiar={(k, v) => { setCliente((c) => ({ ...c, [k]: v })); setErrores((x) => ({ ...x, [k]: undefined })); }} />
      {fallo && <p className="tp-aviso" role="alert">{fallo}</p>}
      <button type="button" className="tp-boton" disabled={enviando} onClick={() => void reservar()}>{enviando ? 'Reservando…' : 'Reservar cancha'}</button>
      <p className="tp-nota">Después de reservar, podrás avisar al negocio por WhatsApp.</p>
    </section>
  );
}

function Avisame({ item, inicio, slug, negocio, alCerrar }: { item: Item; inicio: string; slug: string; negocio: string; alCerrar: () => void }) {
  const { cliente, setCliente, recordar } = useCliente();
  const [errores, setErrores] = useState<ErroresCliente>({});
  const [acepta, setAcepta] = useState(false);
  const [fallo, setFallo] = useState('');
  const [listo, setListo] = useState(false);
  const { enviar, enviando } = useEnviar('/api/tu-pagina/publico/avisame');

  async function apuntar() {
    const e = validarCliente(cliente);
    setErrores(e);
    setFallo('');
    if (Object.keys(e).length) return;
    if (!acepta) { setFallo('Marca la casilla para que podamos escribirte.'); return; }
    const j = await enviar({ slug, item: item.id, inicio, nombre: cliente.nombre, telefono: cliente.telefono, acepta: true, web: '' });
    if (j.status === 'ok') { recordar(cliente); setListo(true); return; }
    if (j.errores) setErrores(j.errores as ErroresCliente);
    setFallo(j.status === 'pasada' ? 'Esa hora ya pasó.' : j.status === 'demasiados' ? 'Ya te apuntaste a muchas horas hoy.' : j.status === 'sin_red' ? 'Sin conexión. Revisa tu internet.' : 'No pudimos apuntarte. Inténtalo otra vez.');
  }

  return (
    <section className="tp-canchas__hoja" aria-label="Avísame si se libera">
      <div className="tp-canchas__hoja-cabeza">
        <h2>Avísame si se libera</h2>
        <button type="button" className="tp-canchas__cerrar" aria-label="Cerrar" onClick={alCerrar}><X size={18} aria-hidden="true" /></button>
      </div>
      <p className="tp-lead">{item.nombre} · {fechaCorta(inicio.slice(0, 10))}, {inicio.slice(11, 16)}</p>
      {listo ? (
        <p className="tp-canchas__ok" role="status"><Check size={18} aria-hidden="true" /> Listo. Si esta hora se libera, {negocio || 'el negocio'} te escribirá por WhatsApp.</p>
      ) : (
        <>
          <CamposCliente d={cliente} errores={errores} alCambiar={(k, v) => { setCliente((c) => ({ ...c, [k]: v })); setErrores((x) => ({ ...x, [k]: undefined })); }} />
          <label className="tp-canchas__acepto">
            <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
            <span>Acepto que {negocio || 'el negocio'} me escriba por WhatsApp para avisarme de esta hora.</span>
          </label>
          {fallo && <p className="tp-aviso" role="alert">{fallo}</p>}
          <button type="button" className="tp-boton" disabled={enviando} onClick={() => void apuntar()}>{enviando ? 'Guardando…' : 'Avísame'}</button>
        </>
      )}
    </section>
  );
}
