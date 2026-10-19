'use client';

/**
 * Lo que llega desde Tu página: los pedidos del carrito y las citas o cupos
 * separados. El dueño confirma, marca y escribe al cliente por WhatsApp con el
 * mensaje ya hecho.
 *
 * ⚠️ Hasta la etapa 4 esto vive aparte de la Agenda y de Pedidos del panel
 * (tablas pedidos_web / reservas_web, ver 0002_tienda_y_reservas.sql): Mia no
 * las ve. Lo separado aquí ocupa su cupo en la página, no en el bot.
 */
import { useEffect, useMemo, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { supabase } from '@/lib/supabase/client';
import { telefonoBonito, urlWhatsApp } from '@/modules/tu-pagina/dominio/envio';
import { cuandoCita, soles, type LineaPedido } from '@/modules/tu-pagina/dominio/tienda';

const POR_PAGINA = 50;

type EstadoPedido = 'nuevo' | 'confirmado' | 'entregado' | 'cancelado';
type EstadoReserva = 'apartada' | 'confirmada' | 'atendida' | 'no_vino' | 'cancelada';

interface PedidoWeb {
  id: string;
  codigo: string;
  nombre: string;
  telefono: string;
  lineas: LineaPedido[];
  total: number;
  entrega: 'recojo' | 'delivery';
  direccion: string;
  referencia: string;
  estado: EstadoPedido;
  creado_at: string;
}

interface ReservaWeb {
  id: string;
  codigo: string;
  tipo: 'cita' | 'grupo';
  servicio: string;
  precio: number | null;
  slot_start: string;
  grupo: string;
  employee_id: string;
  nombre: string;
  telefono: string;
  beneficiario: string;
  estado: EstadoReserva;
  creado_at: string;
}

const NOMBRE_PEDIDO: Record<EstadoPedido, string> = {
  nuevo: 'Nuevo',
  confirmado: 'Confirmado',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};
const NOMBRE_RESERVA: Record<EstadoReserva, string> = {
  apartada: 'Por confirmar',
  confirmada: 'Confirmada',
  atendida: 'Atendida',
  no_vino: 'No vino',
  cancelada: 'Cancelada',
};

const hace = (iso: string) =>
  new Date(iso).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });

function useLista<T>(tabla: string, companyId: string, filtro: string, limite: number) {
  return useCargar(async () => {
    let q = supabase().from(tabla).select('*').eq('company_id', companyId).order('creado_at', { ascending: false }).limit(limite + 1);
    if (filtro !== 'todos') q = q.eq('estado', filtro);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data as T[];
  }, [tabla, companyId, filtro, limite]);
}

function Filtros<E extends string>({ opciones, valor, alCambiar }: { opciones: [E | 'todos', string][]; valor: E | 'todos'; alCambiar: (v: E | 'todos') => void }) {
  return (
    <div className="chip-tabs">
      {opciones.map(([id, nombre]) => (
        <button key={id} className={valor === id ? 'active' : ''} onClick={() => alCambiar(id)}>{nombre}</button>
      ))}
    </div>
  );
}

function Acciones({ botones, ocupado }: { botones: { texto: string; accion: () => void; principal?: boolean }[]; ocupado: boolean }) {
  return (
    <div className="tp-panel-botones">
      {botones.map((b) => (
        <button key={b.texto} className={`btn btn-sm${b.principal ? ' btn-primary' : ''}`} disabled={ocupado} onClick={b.accion}>{b.texto}</button>
      ))}
    </div>
  );
}

export function Pedidos({ companyId, nombre }: { companyId: string; nombre: string }) {
  const avisar = useAvisar();
  const [filtro, setFiltro] = useState<EstadoPedido | 'todos'>('nuevo');
  const [limite, setLimite] = useState(POR_PAGINA);
  const [ocupado, setOcupado] = useState(false);
  const { datos, cargando, error, releer } = useLista<PedidoWeb>('pedidos_web', companyId, filtro, limite);
  const lista = useMemo(() => (datos ?? []).slice(0, limite), [datos, limite]);

  async function marcar(p: PedidoWeb, estado: EstadoPedido) {
    setOcupado(true);
    try {
      const { error } = await supabase().rpc('pedidos_web_estado', { p_company: companyId, p_ids: [p.id], p_estado: estado });
      if (error) throw new Error(error.message);
      avisar(`${p.codigo}: ${NOMBRE_PEDIDO[estado].toLowerCase()}`);
      releer();
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="card table-card">
      <div className="tp-panel-barra">
        <Filtros
          opciones={[['nuevo', 'Nuevos'], ['confirmado', 'Confirmados'], ['entregado', 'Entregados'], ['cancelado', 'Cancelados'], ['todos', 'Todos']]}
          valor={filtro}
          alCambiar={(v) => { setFiltro(v); setLimite(POR_PAGINA); }}
        />
      </div>
      {error && <p className="vacio">No se pudieron cargar los pedidos: {error}</p>}
      {cargando && !datos && <p className="vacio">Cargando pedidos…</p>}
      {datos && lista.length === 0 && <p className="vacio">No hay pedidos aquí. Comparte tu página para recibirlos.</p>}
      {lista.length > 0 && (
        <ul className="tp-panel-lista">
          {lista.map((p) => {
            const msj = `Hola ${p.nombre.split(' ')[0]}, te escribe ${nombre}. Recibimos tu pedido ${p.codigo} por ${soles(Number(p.total))}.`;
            return (
              <li key={p.id} className="tp-panel-fila">
                <div className="tp-panel-fila__cuerpo" style={{ flex: 1 }}>
                  <div className="tp-panel-fila__linea">
                    <b className="tp-panel-codigo">{p.codigo}</b>
                    <span className={`tp-panel-pill tp-panel-pill--${p.estado}`}>{NOMBRE_PEDIDO[p.estado]}</span>
                    <small className="muted">{hace(p.creado_at)}</small>
                  </div>
                  <div><b>{p.nombre}</b><span className="muted"> · {telefonoBonito(p.telefono)}</span></div>
                  <small>
                    {p.lineas.map((l) => `${l.cantidad} × ${l.nombre}${l.opcion ? ` (${l.opcion})` : ''}`).join(' · ')} — <b>{soles(Number(p.total))}</b>
                  </small>
                  <small className="muted">
                    {p.entrega === 'delivery' ? `Delivery: ${p.direccion}${p.referencia ? ` (${p.referencia})` : ''}` : 'Recojo en tienda'}
                  </small>
                  <div className="tp-panel-fila__linea" style={{ flexWrap: 'wrap', marginTop: 4 }}>
                    <a className="btn btn-sm btn-ghost" href={urlWhatsApp(p.telefono, msj)} target="_blank" rel="noopener"><MessageCircle size={14} /> WhatsApp</a>
                    <Acciones
                      ocupado={ocupado}
                      botones={[
                        ...(p.estado === 'nuevo' ? [{ texto: 'Confirmar', accion: () => void marcar(p, 'confirmado'), principal: true }] : []),
                        ...(p.estado === 'nuevo' || p.estado === 'confirmado' ? [{ texto: 'Entregado', accion: () => void marcar(p, 'entregado') }] : []),
                        ...(p.estado !== 'cancelado' && p.estado !== 'entregado' ? [{ texto: 'Cancelar', accion: () => void marcar(p, 'cancelado') }] : []),
                      ]}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {(datos?.length ?? 0) > limite && <button className="btn btn-ghost tp-panel-mas" onClick={() => setLimite((l) => l + POR_PAGINA)}>Ver más</button>}
    </section>
  );
}

export function Reservas({ companyId, nombre }: { companyId: string; nombre: string }) {
  const avisar = useAvisar();
  const [filtro, setFiltro] = useState<EstadoReserva | 'todos'>('apartada');
  const [limite, setLimite] = useState(POR_PAGINA);
  const [ocupado, setOcupado] = useState(false);
  const [equipo, setEquipo] = useState<Map<string, string>>(new Map());
  const { datos, cargando, error, releer } = useLista<ReservaWeb>('reservas_web', companyId, filtro, limite);
  const lista = useMemo(() => (datos ?? []).slice(0, limite), [datos, limite]);

  useEffect(() => {
    void supabase()
      .from('employees')
      .select('id, name')
      .eq('company_id', companyId)
      .then(({ data }) => setEquipo(new Map((data ?? []).map((e: { id: string; name: string }) => [e.id, e.name]))));
  }, [companyId]);

  async function marcar(r: ReservaWeb, estado: EstadoReserva) {
    setOcupado(true);
    try {
      const { error } = await supabase().rpc('reservas_web_estado', { p_company: companyId, p_ids: [r.id], p_estado: estado });
      if (error) throw new Error(error.message);
      avisar(`${r.codigo}: ${NOMBRE_RESERVA[estado].toLowerCase()}`);
      releer();
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="card table-card">
      <div className="tp-panel-barra">
        <Filtros
          opciones={[['apartada', 'Por confirmar'], ['confirmada', 'Confirmadas'], ['atendida', 'Atendidas'], ['cancelada', 'Canceladas'], ['todos', 'Todas']]}
          valor={filtro}
          alCambiar={(v) => { setFiltro(v); setLimite(POR_PAGINA); }}
        />
      </div>
      {error && <p className="vacio">No se pudieron cargar: {error}</p>}
      {cargando && !datos && <p className="vacio">Cargando…</p>}
      {datos && lista.length === 0 && <p className="vacio">Nada aquí todavía. Comparte tu página para que separen su lugar.</p>}
      {lista.length > 0 && (
        <ul className="tp-panel-lista">
          {lista.map((r) => {
            const cuando = r.tipo === 'cita' ? cuandoCita(r.slot_start) : r.grupo;
            const con = r.employee_id ? equipo.get(r.employee_id) : '';
            const msj = `Hola ${r.nombre.split(' ')[0]}, te escribe ${nombre}. Confirmamos ${r.tipo === 'cita' ? 'tu cita' : 'tu cupo'} ${r.codigo}: ${r.servicio}, ${cuando}.`;
            return (
              <li key={r.id} className="tp-panel-fila">
                <div className="tp-panel-fila__cuerpo" style={{ flex: 1 }}>
                  <div className="tp-panel-fila__linea">
                    <b className="tp-panel-codigo">{r.codigo}</b>
                    <span className={`tp-panel-pill tp-panel-pill--${r.estado}`}>{NOMBRE_RESERVA[r.estado]}</span>
                    <small className="muted">{hace(r.creado_at)}</small>
                  </div>
                  <div>
                    <b>{r.servicio}</b> · {cuando}{con ? ` · con ${con}` : ''}
                  </div>
                  <small>
                    {r.nombre}<span className="muted"> · {telefonoBonito(r.telefono)}</span>
                    {r.beneficiario ? <span className="muted"> · para {r.beneficiario}</span> : null}
                    {r.precio !== null ? <span className="muted"> · {soles(Number(r.precio))}</span> : null}
                  </small>
                  <div className="tp-panel-fila__linea" style={{ flexWrap: 'wrap', marginTop: 4 }}>
                    <a className="btn btn-sm btn-ghost" href={urlWhatsApp(r.telefono, msj)} target="_blank" rel="noopener"><MessageCircle size={14} /> WhatsApp</a>
                    <Acciones
                      ocupado={ocupado}
                      botones={[
                        ...(r.estado === 'apartada' ? [{ texto: 'Confirmar', accion: () => void marcar(r, 'confirmada'), principal: true }] : []),
                        ...(r.tipo === 'cita' && r.estado === 'confirmada'
                          ? [{ texto: 'Vino', accion: () => void marcar(r, 'atendida') }, { texto: 'No vino', accion: () => void marcar(r, 'no_vino') }]
                          : []),
                        ...(r.estado === 'apartada' || r.estado === 'confirmada' ? [{ texto: 'Cancelar', accion: () => void marcar(r, 'cancelada') }] : []),
                      ]}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {(datos?.length ?? 0) > limite && <button className="btn btn-ghost tp-panel-mas" onClick={() => setLimite((l) => l + POR_PAGINA)}>Ver más</button>}
    </section>
  );
}
