'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * COBRAR TICKET · el cliente llega a caja con el ticket del barbero
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The 24/7 (17-nov-2026): «el cliente va con el barbero, lo atiende, este le da un ticket y el
 * cliente va a caja a pagar con ese ticket; lo anota el cajero / admin».
 *
 * Lo que dice el ticket se toca, no se teclea: QUIÉN atendió, QUÉ se hizo (uno o varios
 * servicios o productos, a su precio de carta) y, con dos sedes, DÓNDE. El cliente es opcional:
 * con su celular, el cobro queda en su ficha y se le puede sumar el sello de la tarjeta.
 *
 * Dos pasos, a propósito (tu-pagina 0031):
 *   1 · `caja_ticket` deja la atención anotada y ATENDIDA, a nombre del barbero (su comisión
 *       se congela ahí mismo). No mira el aforo: el cliente ya fue atendido.
 *   2 · `marcar_pagado`, el cobro de siempre: método, foto si el negocio la pide, caja del día.
 * Si el paso 2 falla, la atención ya está en «Listos para cobrar» y se cobra desde ahí: nada se
 * pierde ni se duplica.
 *
 * Guiado (18-nov): al abrir, la vista baja al ticket; cada toque la lleva al siguiente paso que
 * falta (lib/panel/guiar.ts), y ese paso se ve resaltado. Al cobrar, vuelve arriba para el próximo.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { guiarA } from '@/lib/panel/guiar';
import Link from 'next/link';
import { Gift, Minus, Plus, Receipt, Search, UserPlus, X } from 'lucide-react';
import { BotonCobrar } from '@/components/panel/BotonCobrar';
import { cobrable } from '@/components/panel/ListosParaCobrar';
import FiltroProductos, { ordenarPorVentas, useMasVendidos } from '@/components/panel/ProductosFiltro';
import { useAvisar, useComando } from '@/components/panel/Avisos';
import { fotoParaCobro, type FotoPago } from '@/lib/panel/fotoPago';
import { etiquetaMetodo, type MetodoPago } from '@/lib/panel/metodosPago';
import { soles } from '@/lib/panel/format';
import { supabase } from '@/lib/supabase/client';
import { sumarSelloDeCita, type SelloResultado } from '@/components/panel/selloDeCita';
import type { ItemCatalogo, Trabajador } from '@/lib/supabase/queries';
import type { Sede } from '@/modules/tu-pagina/dominio/adelantoCitas';
import type { LineaCobro } from '@/modules/facturacion/ui/BoletaDelCobro';
import ComprobanteDelCobro from '@/modules/facturacion/ui/ComprobanteDelCobro';
import ElegirCumple, { guardarCumple } from '@/components/panel/ElegirCumple';

const soloDigitos = (s: string) => s.replace(/\D/g, '');
const claveSede = (c: string) => `vm-ticket-sede:${c}`;

export default function CobrarTicket({
  companyId,
  trabajadores,
  catalogo,
  sedes,
  sedeInicial,
  alCerrar,
  alListo,
}: {
  companyId: string;
  trabajadores: Trabajador[];
  catalogo: ItemCatalogo[];
  sedes: Sede[];
  /** La sede que se está mirando en la Caja ('' = todas). */
  sedeInicial: string;
  alCerrar: () => void;
  alListo: () => void;
}) {
  const avisar = useAvisar();
  const comando = useComando();
  const activos = useMemo(() => trabajadores.filter((t) => t.activo), [trabajadores]);
  // Lo más pedido primero (datos 0013), en servicios y en productos.
  const ventas = useMasVendidos(companyId);
  const servicios = useMemo(() => ordenarPorVentas(catalogo.filter((c) => cobrable(c) && c.tipo !== 'producto'), ventas), [catalogo, ventas]);
  const productos = useMemo(() => catalogo.filter((c) => cobrable(c) && c.tipo === 'producto'), [catalogo]);
  const porId = useMemo(() => new Map(catalogo.map((c) => [c.id, c])), [catalogo]);

  const [barbero, setBarbero] = useState(activos.length === 1 ? activos[0].id : '');
  const [items, setItems] = useState<string[]>([]);
  const pideSede = sedes.length > 1;
  const [sede, setSede] = useState(sedeInicial);
  useEffect(() => {
    if (sedeInicial || !pideSede) return;
    try {
      const s = localStorage.getItem(claveSede(companyId));
      if (s && sedes.some((x) => x.nombre === s)) setSede(s);
    } catch {
      /* sin almacenamiento: la elige */
    }
  }, [companyId, sedeInicial, pideSede, sedes]);
  const [conCliente, setConCliente] = useState(false);
  /** El cumpleaños del cliente nuevo ('MM-DD' o ''): datos 0017. */
  const [cumple, setCumple] = useState('');
  /**
   * El cliente se BUSCA (18-nov: «el nombre es para el buscador»): por nombre o celular, y solo
   * se consulta mientras se escribe. Elegido, va su celular (sello y boleta por WhatsApp); si no
   * está, «Cliente nuevo» con celular y nombre.
   */
  const [modoCliente, setModoCliente] = useState<'buscar' | 'elegido' | 'nuevo'>('buscar');
  const [busca, setBusca] = useState('');
  const [encontrados, setEncontrados] = useState<{ id: string; name: string | null; phone: string | null }[]>([]);
  useEffect(() => {
    const t = busca.trim();
    if (modoCliente !== 'buscar' || t.length < 2) {
      setEncontrados([]);
      return;
    }
    let vigente = true;
    const espera = window.setTimeout(async () => {
      const digitos = t.replace(/\D/g, '');
      const esNumero = digitos.length >= 3 && digitos.length === t.replace(/[\s+-]/g, '').length;
      // Sin comodines ni comas: es texto que va dentro de un filtro.
      const texto = t.replace(/[%_,()*\\]/g, ' ').trim();
      let q = supabase().from('leads').select('id,name,phone').eq('company_id', companyId).limit(6);
      q = esNumero ? q.ilike('phone', `%${digitos.slice(-9)}%`) : q.ilike('name', `%${texto}%`);
      const { data } = await q;
      if (vigente) setEncontrados((data ?? []) as typeof encontrados);
    }, 300);
    return () => {
      vigente = false;
      window.clearTimeout(espera);
    };
  }, [busca, modoCliente, companyId]);
  const elegirCliente = (l: { name: string | null; phone: string | null }) => {
    setTel(soloDigitos(l.phone ?? '').slice(-9));
    setNombre(l.name ?? '');
    setModoCliente('elegido');
    setBusca('');
    irA(pasoQueFalta(barbero, items.length, sede));
  };
  const clienteNuevo = () => {
    const d = soloDigitos(busca);
    // Lo que ya escribió no se pierde: un número va al celular; un nombre, al nombre.
    if (d.length >= 6) setTel(d.slice(-9));
    else if (busca.trim()) setNombre(busca.trim());
    setModoCliente('nuevo');
  };
  const [tel, setTel] = useState('');
  const [nombre, setNombre] = useState('');
  const [enviando, setEnviando] = useState(false);
  /** Lo último cobrado y lo que pasó con su tarjeta de fidelidad. */
  const [hecho, setHecho] = useState<{ texto: string; tel: string; sello: SelloResultado; id?: string; lineas?: LineaCobro[]; cliente?: string; atendio?: string } | null>(null);

  const total = items.reduce((t, id) => t + Number(porId.get(id)?.price ?? 0), 0);
  const cuenta = (id: string) => items.filter((x) => x === id).length;
  const quitarUno = (id: string) => setItems((l) => {
    const i = l.lastIndexOf(id);
    return i < 0 ? l : [...l.slice(0, i), ...l.slice(i + 1)];
  });
  const sumarUno = (id: string) => setItems((l) => [...l, id]);
  /**
   * Tocar marca o desmarca (17-nov-2026: «que no se sume al darle varias veces»). La cantidad,
   * con − y + en la línea del ticket, abajo.
   */
  const alternar = (id: string) => {
    if (items.length === 0) irA(pasoQueFalta(barbero, 1, sede));
    setItems((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  };
  const stockDe = (id: string) => porId.get(id)?.stock ?? null;
  const quitarCliente = () => {
    setTel('');
    setNombre('');
    setConCliente(false);
    setBusca('');
    setModoCliente('buscar');
    setCumple('');
  };
  const telLimpio = soloDigitos(tel);

  // ── La guía: qué paso toca, y llevar la vista ahí después de cada toque ──
  const raiz = useRef<HTMLElement>(null);
  const refBarbero = useRef<HTMLDivElement>(null);
  const refItems = useRef<HTMLDivElement>(null);
  const refSede = useRef<HTMLDivElement>(null);
  const refPie = useRef<HTMLDivElement>(null);
  const pasoQueFalta = (b: string, n: number, sd: string) =>
    activos.length > 0 && !b ? 'barbero' : n === 0 ? 'items' : pideSede && !sd ? 'sede' : 'cobrar';
  const ahora = pasoQueFalta(barbero, items.length, sede);
  const irA = (paso: ReturnType<typeof pasoQueFalta>) =>
    paso === 'barbero' ? guiarA(refBarbero.current)
      : paso === 'items' ? guiarA(refItems.current)
        : paso === 'sede' ? guiarA(refSede.current)
          : guiarA(refPie.current, 'end');
  // Al abrir: la vista baja al ticket (antes se quedaba arriba y había que buscarlo).
  useEffect(() => {
    guiarA(raiz.current);
  }, []);
  const elegirBarbero = (id: string) => {
    setBarbero(id);
    irA(pasoQueFalta(id, items.length, sede));
  };
  const elegirSede = (nombre: string) => {
    setSede(nombre);
    irA(pasoQueFalta(barbero, items.length, nombre));
  };

  /** Lo que falta, dicho en una línea encima del botón. */
  const falta =
    activos.length > 0 && !barbero ? '¿Quién lo atendió?'
      : items.length === 0 ? '¿Qué se hizo?'
        : pideSede && !sede ? '¿En qué sede?'
          : telLimpio && telLimpio.length < 9 ? 'El celular está incompleto'
            : '';

  async function cobrar(metodo: MetodoPago, foto?: FotoPago) {
    if (falta || enviando) return;
    setEnviando(true);
    const { data, error } = await supabase().rpc('caja_ticket', {
      p_company: companyId,
      p_datos: {
        items,
        employee_id: barbero,
        sede: pideSede ? sede : '',
        telefono: telLimpio,
        nombre: nombre.trim(),
      },
    });
    if (error) {
      setEnviando(false);
      avisar(
        /caja_ticket/.test(error.message) && /function|find/i.test(error.message)
          ? 'Falta instalar «Cobrar ticket» en la base (tu-pagina 0031).'
          : error.message,
        'error',
      );
      return;
    }
    const r = data as { id: string; total: number; servicio: string; barbero: string };
    try {
      if (pideSede && sede) localStorage.setItem(claveSede(companyId), sede);
    } catch {
      /* nada */
    }
    const pagado = await comando(
      'marcar_pagado',
      { tipo: 'appointment', id: r.id, metodo_pago: metodo, ...(foto ? { foto: fotoParaCobro(foto) } : {}) },
    );
    setEnviando(false);
    const texto = `${soles(Number(r.total))} · ${r.servicio}${r.barbero ? ` · ${r.barbero}` : ''}`;
    if (pagado === undefined) {
      // El ticket existe; solo faltó el cobro: queda en «Listos para cobrar».
      avisar(`Anotado ${texto}. Si no aparece como cobrado, cóbralo en «Listos para cobrar».`, 'espera');
    } else {
      avisar(`Cobrado con ${etiquetaMetodo(metodo).toLowerCase()}: ${texto}`, 'ok');
    }
    // La tarjeta de fidelidad, sola: si el celular tiene tarjeta, su sello (una vez por ticket).
    // Cliente nuevo con cumpleaños: a su ficha (datos 0017), ya creada por caja_ticket.
    if (modoCliente === 'nuevo' && cumple && telLimpio.length >= 9) void guardarCumple(companyId, telLimpio, cumple);
    const sello = pagado === undefined ? null : await sumarSelloDeCita(companyId, telLimpio, r.id, Number(r.total));
    if (sello) avisar(sello.texto, sello.tono);
    setHecho({
      texto,
      tel: telLimpio.length >= 9 ? telLimpio : '',
      cliente: nombre.trim(),
      atendio: r.barbero ?? '',
      sello,
      // Lo cobrado, para su boleta. Si el cobro no entró, sin boleta: primero se cobra.
      ...(pagado === undefined ? {} : {
        id: r.id,
        lineas: [...new Set(items)].map((i) => ({
          descripcion: porId.get(i)?.name ?? '',
          cantidad: cuenta(i),
          precio: Number(porId.get(i)?.price ?? 0),
          producto: porId.get(i)?.tipo === 'producto',
        })),
      }),
    });
    setItems([]);
    quitarCliente();
    if (activos.length !== 1) setBarbero('');
    alListo();
    // Cobrado: arriba, con «Último: …» a la vista y el paso 1 listo para el siguiente cliente.
    guiarA(raiz.current);
  }

  return (
    <section ref={raiz} className="card ticket" aria-label="Cobrar">
      <div className="card-head">
        <h3><Receipt size={17} style={{ verticalAlign: -3 }} /> Cobrar</h3>
        <button type="button" className="q-icon" aria-label="Cerrar" onClick={alCerrar} disabled={enviando}>
          <X size={16} />
        </button>
      </div>

      {hecho && (
        <div className="ticket-hecho" role="status">
          <span>
            Último: <b>{hecho.texto}</b>
            {hecho.sello && <small className="ticket-hecho__sello"><Gift size={13} /> {hecho.sello.texto}</small>}
          </span>
          {hecho.tel && hecho.sello?.tono !== 'ok' && (
            <Link className="btn btn-ghost btn-sm" href={`/panel/fideliza/caja?q=${hecho.tel.slice(-9)}`}>
              <Gift size={14} /> Sumar a su tarjeta
            </Link>
          )}
          {/* La boleta del cobro: sola o con su botón, según Ajustes › Boletas (modules/facturacion). */}
          {hecho.id && hecho.lineas && (
            <ComprobanteDelCobro companyId={companyId} refCobro={{ tipo: 'cita', id: hecho.id }} lineas={hecho.lineas} telefono={hecho.tel}
              cliente={hecho.cliente} atendio={hecho.atendio} />
          )}
        </div>
      )}

      <div className="ticket-cuerpo">
        {activos.length > 0 ? (
          <div ref={refBarbero} className={`ticket-paso${ahora === 'barbero' ? ' ticket-paso--ahora' : ''}`}>
            <span className="ticket-rotulo">1 · ¿Quién lo atendió?</span>
            <div className="ticket-chips" role="radiogroup" aria-label="Barbero">
              {activos.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={barbero === t.id}
                  className={`ticket-chip${barbero === t.id ? ' on' : ''}`} onClick={() => elegirBarbero(t.id)}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="ticket-nota">
            Todavía no hay barberos en <Link href="/panel/equipo">Equipo</Link>: el ticket se cobra igual, pero no suma a la
            comisión de nadie.
          </p>
        )}

        <div ref={refItems} className={`ticket-paso${ahora === 'items' ? ' ticket-paso--ahora' : ''}`}>
          <span className="ticket-rotulo">{activos.length > 0 ? '2 · ' : ''}¿Qué se hizo? <small>toca para elegir; la cantidad, abajo con − y +</small></span>
          <div className="ticket-chips">
            {servicios.map((c) => (
              <button key={c.id} type="button" className={`ticket-chip ticket-chip--item${cuenta(c.id) ? ' on' : ''}`}
                aria-pressed={cuenta(c.id) > 0} onClick={() => alternar(c.id)}>
                <span>{c.name}</span>
                <small>{c.price != null ? soles(Number(c.price)) : '—'}</small>
                {cuenta(c.id) > 1 && <i className="ticket-x">×{cuenta(c.id)}</i>}
              </button>
            ))}
          </div>
          {productos.length > 0 && (
            <div className="ticket-productos">
              <span className="ticket-rotulo">Productos <small>bebidas, ceras, geles…</small></span>
              <FiltroProductos productos={productos} ventas={ventas} render={(lista) => (
              <div className="ticket-chips">
                {lista.map((c) => (
                  <button key={c.id} type="button" className={`ticket-chip ticket-chip--item${cuenta(c.id) ? ' on' : ''}`}
                    disabled={c.stock != null && c.stock <= 0 && cuenta(c.id) === 0}
                    aria-pressed={cuenta(c.id) > 0} onClick={() => alternar(c.id)}>
                    <span>{c.name}</span>
                    <small>{c.price != null ? soles(Number(c.price)) : '—'}{c.stock != null ? ` · quedan ${c.stock}` : ''}</small>
                    {cuenta(c.id) > 1 && <i className="ticket-x">×{cuenta(c.id)}</i>}
                  </button>
                ))}
              </div>
              )} />
            </div>
          )}
          {servicios.length === 0 && productos.length === 0 && (
            <p className="ticket-nota">No hay servicios activos en el <Link href="/panel/catalogo">Catálogo</Link>.</p>
          )}
        </div>

        {pideSede && (
          <div ref={refSede} className={`ticket-paso${ahora === 'sede' ? ' ticket-paso--ahora' : ''}`}>
            <span className="ticket-rotulo">¿En qué sede?</span>
            <div className="ticket-chips" role="radiogroup" aria-label="Sede">
              {sedes.map((s) => (
                <button key={s.nombre} type="button" role="radio" aria-checked={sede === s.nombre}
                  className={`ticket-chip${sede === s.nombre ? ' on' : ''}`} onClick={() => elegirSede(s.nombre)}>
                  {s.nombre.split(' · ')[0]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="ticket-paso">
          {conCliente ? (
            <>
              <span className="ticket-rotulo ticket-rotulo--cerrable">
                Cliente <small>con su celular, el sello de su tarjeta se suma solo</small>
                <button type="button" className="ticket-cerrar" onClick={quitarCliente} aria-label="Quitar cliente">
                  <X size={15} /> Quitar
                </button>
              </span>
              {modoCliente === 'elegido' ? (
                <div className="nc-elegido">
                  <b>{nombre || 'Sin nombre'}</b>
                  <span className="muted">{tel}</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setTel(''); setNombre(''); setModoCliente('buscar'); }}>Cambiar</button>
                </div>
              ) : modoCliente === 'nuevo' ? (
                <>
                  <div className="ticket-cliente">
                    <input className="input" inputMode="tel" placeholder="Celular · 987654321" value={tel} onChange={(e) => setTel(e.target.value)}
                      aria-label="Celular del cliente" autoComplete="off" autoFocus />
                    <input className="input" placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)}
                      aria-label="Nombre del cliente" autoComplete="off" />
                  </div>
                  <ElegirCumple valor={cumple} alCambiar={setCumple} />
                  <button type="button" className="nc-link" onClick={() => { setTel(''); setNombre(''); setModoCliente('buscar'); }}>
                    <Search size={14} /> Buscar en mis clientes
                  </button>
                </>
              ) : (
                <>
                  <div className="search nc-buscar">
                    <Search size={16} />
                    <input placeholder="Nombre o celular" value={busca} onChange={(e) => setBusca(e.target.value)}
                      aria-label="Buscar cliente por nombre o celular" autoComplete="off" autoFocus />
                  </div>
                  {encontrados.map((l) => (
                    <button type="button" key={l.id} className="buscador-res" onClick={() => elegirCliente(l)}>
                      <b>{l.name || 'Sin nombre'}</b>
                      <span className="muted">{soloDigitos(l.phone ?? '').slice(-9)}</span>
                    </button>
                  ))}
                  {busca.trim().length >= 2 && encontrados.length === 0 && <small className="muted">Nadie con «{busca.trim()}».</small>}
                  <button type="button" className="nc-link" onClick={clienteNuevo}>
                    <UserPlus size={14} /> Es cliente nuevo
                  </button>
                </>
              )}
            </>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConCliente(true)}>
              <UserPlus size={14} /> Cliente (opcional, para su tarjeta)
            </button>
          )}
        </div>
      </div>

      {/* El ticket, como lo tiene el cliente en la mano, y el botón de cobrar debajo. */}
      <div ref={refPie} className={`ticket-pie${ahora === 'cobrar' ? ' ticket-pie--listo' : ''}`}>
        {items.length > 0 && (
          <ul className="ticket-lineas">
            {[...new Set(items)].map((id) => (
              <li key={id}>
                <span>{porId.get(id)?.name}</span>
                <span className="ticket-paso-cant" role="group" aria-label={`Cantidad de ${porId.get(id)?.name}`}>
                  <button type="button" className="ticket-mm" aria-label={cuenta(id) === 1 ? `Quitar ${porId.get(id)?.name}` : 'Uno menos'} onClick={() => quitarUno(id)}>
                    <Minus size={16} />
                  </button>
                  <b aria-live="polite">{cuenta(id)}</b>
                  <button type="button" className="ticket-mm" aria-label="Uno más" onClick={() => sumarUno(id)}
                    disabled={stockDe(id) != null && (stockDe(id) ?? 0) <= cuenta(id)}>
                    <Plus size={16} />
                  </button>
                </span>
                <b>{soles(Number(porId.get(id)?.price ?? 0) * cuenta(id))}</b>
              </li>
            ))}
          </ul>
        )}
        <div className="ticket-total">
          <span>Total</span>
          <b>{soles(total)}</b>
        </div>
        {falta ? (
          <p className="ticket-falta">Falta: {falta.charAt(0).toLowerCase() + falta.slice(1)}</p>
        ) : (
          <BotonCobrar grande total={total} ocupado={enviando} etiqueta={enviando ? 'Cobrando…' : `Cobrar ${soles(total)}`} alCobrar={(m, f) => void cobrar(m, f)} />
        )}
      </div>
    </section>
  );
}
