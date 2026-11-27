'use client';

/**
 * «Listos para cobrar» · la cola del mostrador (The 24/7, 17-nov-2026).
 *
 * El barbero termina, marca «Atendido» en Mi agenda y le da el ticket al cliente; el cliente
 * camina a la caja. Aquí sale esa atención, arriba de todo, con lo que el cajero necesita para
 * reconocerla de un vistazo: el BARBERO, el servicio, el cliente y lo que falta pagar. Lo último
 * atendido, primero. La Caja se relee sola cada 20 s, así que no hace falta recargar.
 *
 * «+ Agregar»: el ticket dice algo más de lo que se anotó (una barba, una cera). Se suma con un
 * toque, a precio de carta, como una línea más (agenda_consumo, tu-pagina 0011): sube el total,
 * descuenta stock y, si es un servicio, cuenta para la comisión del barbero (datos 0011).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Plus, Scissors, Wallet, X } from 'lucide-react';
import { BotonCobrar } from '@/components/panel/BotonCobrar';
import Campana from '@/components/panel/Campana';
import FiltroProductos, { ordenarPorVentas, useMasVendidos } from '@/components/panel/ProductosFiltro';
import { RegistrarPago } from '@/components/panel/Saldos';
import { sedeCorta } from '@/components/panel/SelectorSede';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { hora, soles } from '@/lib/panel/format';
import { quienDeCita, quienEnUnaLinea } from '@/lib/panel/ficha';
import type { FotoPago } from '@/lib/panel/fotoPago';
import type { MetodoPago } from '@/lib/panel/metodosPago';
import type { Saldo } from '@/lib/panel/saldo';
import { supabase } from '@/lib/supabase/client';
import type { Cita, ItemCatalogo } from '@/lib/supabase/queries';

export interface FilaListo {
  cita: Cita;
  importe: number;
  pagos?: Saldo;
}

/** Lo que se puede sumar a una atención: activo y sin horario de grupo. */
export function cobrable(c: ItemCatalogo): boolean {
  if (!c.activo) return false;
  try {
    const f = JSON.parse(c.schedule_slots || '[]');
    return !(Array.isArray(f) && f.length > 0);
  } catch {
    return true;
  }
}

export default function ListosParaCobrar({
  companyId,
  filas,
  catalogo,
  barbero,
  cliente,
  conSede,
  enVuelo,
  alCobrar,
  alCambiar,
}: {
  companyId: string;
  filas: FilaListo[];
  catalogo: ItemCatalogo[];
  /** id de la ficha → nombre del barbero. */
  barbero: (id: string) => string | undefined;
  /** id del lead → nombre o teléfono. */
  cliente: (id: string) => string | undefined;
  /** Enseñar la sede de cada una (mirando «Todas»). */
  conSede: boolean;
  enVuelo: string | null;
  alCobrar: (c: Cita, metodo: MetodoPago, foto?: FotoPago) => void;
  alCambiar: () => void;
}) {
  /** La fila con algo abierto debajo: «A cuenta» o «Agregar». Una a la vez. */
  const [abierto, setAbierto] = useState<{ id: string; que: 'cuenta' | 'agregar' } | null>(null);

  // Lo que entra mientras la pantalla está abierta (el barbero acaba de marcar «Atendido») se
  // resalta unos segundos: así el cajero lo ve llegar sin recargar ni buscarlo.
  const vistos = useRef<Set<string> | null>(null);
  const [nuevos, setNuevos] = useState<Set<string>>(new Set());
  const ids = filas.map((f) => f.cita.id).join(',');
  useEffect(() => {
    const ahora = ids ? ids.split(',') : [];
    if (vistos.current) {
      const llegan = ahora.filter((id) => !vistos.current!.has(id));
      if (llegan.length) {
        setNuevos(new Set(llegan));
        const t = window.setTimeout(() => setNuevos(new Set()), 6000);
        vistos.current = new Set(ahora);
        return () => window.clearTimeout(t);
      }
    }
    vistos.current = new Set(ahora);
  }, [ids]);

  // La foto del voucher o del ticket que el barbero adjuntó al generarlo (tu-pagina 0037). Sin la
  // migración, o si falla, no sale y ya: es una ayuda para comparar, no parte del cobro.
  // 26-nov-2026 (0039): hasta dos por ticket (url_2). Sin la 0039, la consulta con url_2 falla y se
  // pide solo la primera, como antes.
  const [fotos, setFotos] = useState<Map<string, string[]>>(new Map());
  useEffect(() => {
    if (!ids) return;
    let vivo = true;
    const lista = ids.split(',');
    void (async () => {
      type Fila = { appointment_id: string; url: string; url_2?: string | null };
      const dos = await supabase().from('ticket_fotos').select('appointment_id, url, url_2').in('appointment_id', lista);
      const r = dos.error ? await supabase().from('ticket_fotos').select('appointment_id, url').in('appointment_id', lista) : dos;
      if (!vivo || r.error) return;
      setFotos(new Map((r.data as Fila[])
        .map((f) => [f.appointment_id, [f.url, f.url_2].filter((u): u is string => Boolean(u))])));
    })();
    return () => { vivo = false; };
  }, [ids]);

  if (filas.length === 0) return null;
  const total = filas.reduce((t, x) => t + (x.pagos ? x.pagos.saldo : x.importe), 0);
  const alternar = (id: string, que: 'cuenta' | 'agregar') =>
    setAbierto((a) => (a?.id === id && a.que === que ? null : { id, que }));

  return (
    <section className="card listos" aria-label="Por cobrar en caja">
      <div className="card-mini-head">
        <h3>
          <Campana size={17} /> Por cobrar en caja · {filas.length}
        </h3>
        <small className="muted">{soles(total)}</small>
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 8px' }}>
        Ya atendidos: el cliente viene a pagar con su ticket. Búscalo por el barbero y el servicio.
      </p>
      {filas.map(({ cita, importe, pagos }) => {
        const esta = abierto?.id === cita.id ? abierto.que : null;
        return (
          <div key={cita.id} className={`listo${nuevos.has(cita.id) ? ' listo--nuevo' : ''}`}>
            <div className="listo-fila">
              <div className="listo-quien">
                <span className="listo-barbero">
                  <Scissors size={13} /> {cita.employee_id ? (barbero(cita.employee_id) ?? 'Barbero') : 'Sin barbero'}
                </span>
                <b>{cita.service || 'Servicio'}</b>
                <small className="muted">
                  {quienEnUnaLinea(quienDeCita(cita, cliente(cita.lead_id)))}
                  {cita.inicio ? ` · ${hora(cita.inicio)}` : ''}
                  {cita.sede && conSede ? ` · ${sedeCorta(cita.sede)}` : ''}
                  {pagos ? ` · pagó ${soles(pagos.pagado)} · falta ${soles(pagos.saldo)}` : ''}
                </small>
                {(fotos.get(cita.id) ?? []).map((u, i, todas) => (
                  <a key={u} className="listo-foto" href={u} target="_blank" rel="noopener noreferrer">
                    <Camera size={13} /> {todas.length > 1 ? `Ver foto ${i + 1} del ticket` : 'Ver foto del ticket'}
                  </a>
                ))}
              </div>
              <b className="listo-monto">{soles(pagos ? pagos.saldo : importe)}</b>
              <div className="listo-acciones">
                <BotonCobrar grande ocupado={enVuelo === cita.id} etiqueta="Cobrar" total={pagos ? pagos.saldo : importe} alCobrar={(m, foto) => alCobrar(cita, m, foto)} />
                <button type="button" className={`btn btn-ghost${esta === 'agregar' ? ' on' : ''}`} aria-expanded={esta === 'agregar'}
                  onClick={() => alternar(cita.id, 'agregar')} title="El ticket dice algo más: una barba, una cera…">
                  <Plus size={15} /> Agregar
                </button>
                <button type="button" className={`btn btn-ghost${esta === 'cuenta' ? ' on' : ''}`} aria-expanded={esta === 'cuenta'}
                  onClick={() => alternar(cita.id, 'cuenta')} title="Pagó solo una parte">
                  <Wallet size={15} /> A cuenta
                </button>
              </div>
            </div>
            {esta === 'cuenta' && (
              <div className="form-cita">
                <RegistrarPago
                  leadId={cita.lead_id}
                  appointmentId={cita.id}
                  sugerido={pagos ? pagos.saldo : importe}
                  alCerrar={() => setAbierto(null)}
                  alGuardar={alCambiar}
                />
              </div>
            )}
            {esta === 'agregar' && (
              <Agregar companyId={companyId} citaId={cita.id} catalogo={catalogo} alCerrar={() => setAbierto(null)} alCambiar={alCambiar} />
            )}
          </div>
        );
      })}
    </section>
  );
}

interface Linea {
  id: string;
  nombre: string;
  precio: number;
  consumo: boolean;
}

/** Sumar (o quitar lo sumado) a una atención ya hecha, con un toque por cosa. */
function Agregar({ companyId, citaId, catalogo, alCerrar, alCambiar }: {
  companyId: string;
  citaId: string;
  catalogo: ItemCatalogo[];
  alCerrar: () => void;
  alCambiar: () => void;
}) {
  const avisar = useAvisar();
  const ventas = useMasVendidos(companyId);
  // Servicios arriba y productos debajo, lo más pedido primero en cada uno (datos 0013).
  const servicios = useMemo(() => ordenarPorVentas(catalogo.filter((c) => cobrable(c) && c.tipo !== 'producto'), ventas), [catalogo, ventas]);
  const productos = useMemo(() => catalogo.filter((c) => cobrable(c) && c.tipo === 'producto'), [catalogo]);
  const [enVuelo, setEnVuelo] = useState(false);
  const [lineas, setLineas] = useState<{ lineas: Linea[]; total: number } | null>(null);

  const llamar = async (datos: Record<string, unknown>) => {
    const { data, error } = await supabase().rpc('agenda_consumo', { p_company: companyId, p_datos: { id: citaId, ...datos } });
    if (error) throw new Error(error.message);
    return data as { lineas: Linea[]; total: number };
  };
  const { error } = useCargar(async () => {
    const r = await llamar({ accion: 'ver' });
    setLineas(r);
    return r;
  }, [companyId, citaId]);

  async function cambiar(datos: Record<string, unknown>, ok: string) {
    setEnVuelo(true);
    try {
      setLineas(await llamar(datos));
      avisar(ok, 'ok');
      alCambiar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo guardar.', 'error');
    } finally {
      setEnVuelo(false);
    }
  }

  return (
    <div className="listo-agregar">
      <div className="listo-agregar__cab">
        <b>¿Qué más dice el ticket?</b>
        <button type="button" className="q-icon" aria-label="Cerrar" onClick={alCerrar}><X size={16} /></button>
      </div>
      {error && <p className="ticket-nota">No se pudo abrir: {error}</p>}
      {lineas && (
        <ul className="ticket-lineas">
          {lineas.lineas.map((l) => (
            <li key={l.id}>
              <span>{l.nombre}</span>
              <b>{soles(l.precio)}</b>
              {l.consumo ? (
                <button type="button" className="q-icon" aria-label={`Quitar ${l.nombre}`} disabled={enVuelo}
                  onClick={() => void cambiar({ accion: 'quitar', linea: l.id }, `Quitaste ${l.nombre}.`)}>
                  <X size={15} />
                </button>
              ) : <span aria-hidden="true" />}
            </li>
          ))}
          <li className="listo-agregar__total"><span>Total</span><b>{soles(lineas.total)}</b><span aria-hidden="true" /></li>
        </ul>
      )}
      <div className="ticket-chips">{servicios.map((c: ItemCatalogo) => (
          <button key={c.id} type="button" className="ticket-chip ticket-chip--item" disabled={enVuelo || (c.stock != null && c.stock <= 0)}
            onClick={() => void cambiar({ accion: 'agregar', catalog_item_id: c.id, cantidad: 1 }, `Sumado: ${c.name}.`)}>
            <span>+ {c.name}</span>
            <small>{c.price != null ? soles(Number(c.price)) : '—'}{c.tipo === 'producto' && c.stock != null ? ` · quedan ${c.stock}` : ''}</small>
          </button>
        ))}</div>
      {productos.length > 0 && (
        <FiltroProductos productos={productos} ventas={ventas} render={(lista) => <div className="ticket-chips">{lista.map((c: ItemCatalogo) => (
          <button key={c.id} type="button" className="ticket-chip ticket-chip--item" disabled={enVuelo || (c.stock != null && c.stock <= 0)}
            onClick={() => void cambiar({ accion: 'agregar', catalog_item_id: c.id, cantidad: 1 }, `Sumado: ${c.name}.`)}>
            <span>+ {c.name}</span>
            <small>{c.price != null ? soles(Number(c.price)) : '—'}{c.tipo === 'producto' && c.stock != null ? ` · quedan ${c.stock}` : ''}</small>
          </button>
        ))}</div>} />
      )}
    </div>
  );
}
