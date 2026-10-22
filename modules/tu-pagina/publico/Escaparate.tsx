'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * TU PÁGINA · el escaparate: catálogo, carrito, reservar e inscribirse
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La única isla grande de la página. Llega armado del servidor (dominio/tienda.ts)
 * y aquí solo se elige: el cupo lo separa el servidor al confirmar.
 *
 *   · Producto → ficha con opciones → carrito (barra fija abajo) → datos → pedido.
 *   · Cita     → profesional (si se pide) → día → hora → datos → cita separada.
 *   · Grupo    → horario con «quedan N» → datos → cupo separado.
 *
 * Cada ítem trae su tipo (lo marcó el dueño en Mi página o sale del modo): si
 * hay de más de uno, se enseñan en secciones aparte, «Productos» y «Servicios».
 *
 * Todo termina igual: código, resumen y «Avisar por WhatsApp» con el mensaje
 * ya escrito. Lo del cliente (nombre, celular) y el carrito se recuerdan en
 * ESTE navegador, nunca en nuestra base hasta que confirma.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, ChevronRight, Clock, MessageCircle, Minus, Plus, Search, ShoppingBag, Trash2, Users, X } from 'lucide-react';
import { cap, vocabulario } from '@/lib/panel/vocabulario';
import type { Disposicion } from '@/modules/tu-pagina/dominio/plantillas';
import { fotoServicioLuxury } from '@/modules/tu-pagina/dominio/fotos';
import { abreEl, horasLibres, sumarDias, sumarMin } from '@/modules/tu-pagina/dominio/agenda';
import { fechaCorta, urlWhatsApp } from '@/modules/tu-pagina/dominio/envio';
import {
  cuandoCita,
  mensajePedido,
  mensajeReserva,
  soles,
  validarCliente,
  type ErroresCliente,
  type Escaparate as Datos,
  type Item,
  type LineaPedido,
  type TipoItem,
  modoDelTipo,
} from '@/modules/tu-pagina/dominio/tienda';

interface Props {
  esc: Datos;
  slug: string;
  whatsapp: string;
  /** Con «catalogo» se puede pedir; con «reservar», separar citas y cupos. */
  puedePedir: boolean;
  puedeReservar: boolean;
  /** Lo decide la plantilla (dominio/plantillas.ts). */
  disposicion: Disposicion;
  /** «reservas»: solo lo que se reserva (la página /reservar). */
  solo?: 'reservas';
  plantillaLuxury?: boolean;
  catalogoLuxuryDestacado?: boolean;
}

const ORDEN_TIPOS: TipoItem[] = ['cita', 'grupo', 'producto'];
/** Sin ítems, el vocabulario del modo del negocio. */
const modoTipo = (m: Datos['modo']): TipoItem => (m === 'ecommerce' ? 'producto' : m === 'recurring_appointment' ? 'grupo' : 'cita');
const vocabularioDe = (t: TipoItem) => vocabulario(modoDelTipo(t));

interface EnCarrito {
  item: string;
  opcion: string;
  cantidad: number;
}

interface Hecho {
  variante?: 'agenda' | 'tienda';
  titulo: string;
  codigo: string;
  mensaje: string;
}

const DIAS_A_LA_VISTA = 14;
const CLAVE_CLIENTE = 'tu_pagina:cliente';

const nuevoIdem = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function leer<T>(clave: string, porDefecto: T): T {
  try {
    const v = localStorage.getItem(clave);
    return v ? (JSON.parse(v) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}
function guardar(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

/** Nombre y celular del cliente, recordados en este navegador. */
function useCliente() {
  const [cliente, setCliente] = useState({ nombre: '', telefono: '' });
  useEffect(() => setCliente(leer(CLAVE_CLIENTE, { nombre: '', telefono: '' })), []);
  const recordar = useCallback((c: { nombre: string; telefono: string }) => guardar(CLAVE_CLIENTE, c), []);
  return { cliente, setCliente, recordar };
}

const ETIQUETA_DIA = (fecha: string, hoy: string) =>
  fecha === hoy ? 'Hoy' : fecha === sumarDias(hoy, 1) ? 'Mañana' : fechaCorta(fecha).split(' ')[0];

const MENSAJE_FALLO: Record<string, string> = {
  lleno: 'Alguien acaba de tomar ese lugar. Elige otro.',
  pasada: 'Esa hora ya pasó. Elige otra.',
  demasiados: 'Ya tienes varias reservas sin confirmar. Escríbenos por WhatsApp.',
  no_existe: 'Eso ya no está disponible.',
  not_found: 'Esta página ya no recibe reservas en línea. Escríbenos por WhatsApp.',
};

export default function Escaparate({ esc: todo, slug, whatsapp, puedePedir, puedeReservar, disposicion, solo, plantillaLuxury = false, catalogoLuxuryDestacado = false }: Props) {
  const esc = useMemo(
    () => {
      const items = solo === 'reservas' ? todo.items.filter((i) => i.tipo !== 'producto') : todo.items;
      return solo || plantillaLuxury ? { ...todo, items: plantillaLuxury ? items.map((i, indice) =>
        i.tipo !== 'producto' && !i.fotos.length ? { ...i, fotos: [fotoServicioLuxury(i.nombre, indice)] } : i) : items } : todo;
    },
    [todo, solo, plantillaLuxury],
  );
  // Los tipos que hay, en orden; con uno solo, el título es el suyo y no hay secciones.
  const tipos = ORDEN_TIPOS.filter((t) => esc.items.some((i) => i.tipo === t));
  const v = vocabularioDe(tipos[0] ?? modoTipo(esc.modo));
  const familias = useMemo(() => [...new Set(esc.items.map((i) => i.familia).filter(Boolean))], [esc.items]);
  const router = useRouter();
  const carruselProductos = useRef<HTMLDivElement>(null);
  const [familia, setFamilia] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [vistaServicios, setVistaServicios] = useState<'vertical' | 'horizontal'>('vertical');
  const [servicioInlineId, setServicioInlineId] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [verCarrito, setVerCarrito] = useState(false);
  const [hecho, setHecho] = useState<Hecho | null>(null);
  const claveCarrito = `tu_pagina:carrito:${slug}`;
  const [carrito, setCarrito] = useState<EnCarrito[]>([]);

  useEffect(() => setCarrito(leer<EnCarrito[]>(claveCarrito, [])), [claveCarrito]);
  const ponerCarrito = (c: EnCarrito[]) => {
    setCarrito(c);
    guardar(claveCarrito, c);
  };

  const porId = useMemo(() => new Map(esc.items.map((i) => [i.id, i])), [esc.items]);
  // Lo que ya no existe (borrado del catálogo) sale del carrito solo.
  const lineas = carrito.filter((l) => porId.has(l.item));
  const total = lineas.reduce((s, l) => s + (porId.get(l.item)?.precio ?? 0) * l.cantidad, 0);
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);
  const termino = busqueda.trim().toLocaleLowerCase('es');
  const visibles = esc.items.filter((i) =>
    (!familia || i.familia === familia) &&
    (!termino || `${i.nombre} ${i.descripcion} ${i.familia}`.toLocaleLowerCase('es').includes(termino)));
  const item = abierto ? porId.get(abierto) ?? null : null;
  const citaInline = plantillaLuxury && solo === 'reservas' && esc.items.length > 0 && esc.items.every((i) => i.tipo === 'cita');
  const servicioInline = esc.items.find((i) => i.id === servicioInlineId) ?? esc.items[0];
  const alternarServicios = plantillaLuxury && visibles.filter((i) => i.tipo !== 'producto').length > 1;
  const controlesServicios = alternarServicios && (
    <div className="tp-luxury-servicios__controles" role="group" aria-label="Vista de servicios">
      <button type="button" aria-pressed={vistaServicios === 'vertical'} onClick={() => setVistaServicios('vertical')}>Vertical</button>
      <button type="button" aria-pressed={vistaServicios === 'horizontal'} onClick={() => setVistaServicios('horizontal')}>Horizontal</button>
    </div>
  );

  const terminar = (h: Hecho) => {
    setAbierto(null);
    setVerCarrito(false);
    setHecho(h);
    window.scrollTo({ top: 0 });
    router.refresh();
  };

  if (hecho) {
    return (
      <section className={`tp-hecho${hecho.variante === 'tienda' ? ' tp-hecho--tienda' : ''}`} aria-live="polite">
        <div className="tp-hecho__marca"><Check size={36} aria-hidden="true" /></div>
        <h2 className="tp-h1">{hecho.titulo}</h2>
        <p className="tp-lead">Tu código es</p>
        <div className="tp-codigo">{hecho.codigo}</div>
        <p className="tp-resumen">{hecho.mensaje}</p>
        <a className="tp-boton tp-boton--wsp" href={urlWhatsApp(whatsapp, hecho.mensaje)} rel="noopener">
          <MessageCircle size={20} aria-hidden="true" /> Avisar por WhatsApp
        </a>
        <p className="tp-nota">Avísanos para confirmarte. Ya quedó guardado aunque no lo envíes.</p>
        <button type="button" className="tp-boton tp-boton--suave" onClick={() => setHecho(null)}>
          Volver
        </button>
      </section>
    );
  }

  if (citaInline) {
    return <section className="tp-luxury-reserva-real" aria-label="Elegir cita">
      <div className="tp-luxury-reserva-real__selector">
        <span>01 / SERVICIO</span>
        <label htmlFor="tp-servicio-inline">Tu servicio</label>
        <select id="tp-servicio-inline" value={servicioInline.id} onChange={(e) => setServicioInlineId(e.target.value)}>
          {esc.items.map((servicio) => <option key={servicio.id} value={servicio.id}>{servicio.nombre}</option>)}
        </select>
      </div>
      <div className="tp-luxury-reserva-real__panel">
        <Reservar key={servicioInline.id} item={servicioInline} esc={esc} slug={slug} alTerminar={terminar} presentacion="inline" />
      </div>
    </section>;
  }

  return (
    <>
      <section className={`tp-catalogo${catalogoLuxuryDestacado ? ' tp-catalogo--luxury-productos' : ''}`} id="catalogo" aria-label={tipos.length > 1 ? 'Lo que ofrecemos' : cap(v.items)}>
        {(!plantillaLuxury || esc.items.length > 6) && <label className="tp-catalogo__busqueda"><Search size={19} aria-hidden="true" /><input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder={`Buscar ${v.items}`} aria-label={`Buscar ${v.items}`} /></label>}
        <div className="tp-catalogo__layout">
        {familias.length > 1 && (
          <div className="tp-familias" role="group" aria-label="Filtrar por categoría">
            <button type="button" className="tp-chip" aria-pressed={!familia} onClick={() => setFamilia('')}>Todo <small>{esc.items.length}</small></button>
            {familias.map((f) => (
              <button key={f} type="button" className="tp-chip" aria-pressed={familia === f} onClick={() => setFamilia(f)}>{f} <small>{esc.items.filter((i) => i.familia === f).length}</small></button>
            ))}
          </div>
        )}
        <div className="tp-catalogo__resultados">
        {tipos.length <= 1 && !catalogoLuxuryDestacado && <div className="tp-catalogo__cabeza"><h2 className="tp-seccion">{cap(v.items)}</h2><div className="tp-catalogo__cabeza-acciones"><small>{visibles.length} {visibles.length === 1 ? 'resultado' : 'resultados'}</small>{controlesServicios}</div></div>}
        {disposicion === 'carta' ? (
          [...new Set(visibles.map((i) => i.familia))].map((f) => (
            <div key={f || '-'} className="tp-carta">
              {f && <h3 className="tp-carta__seccion">{f}</h3>}
              {visibles.filter((i) => i.familia === f).map((i) => (
                <FilaCarta key={i.id} item={i} alAbrir={() => setAbierto(i.id)} />
              ))}
            </div>
          ))
        ) : (
          <>
        {(tipos.length > 1 ? tipos : [null]).map((t) => {
          const deEste = t ? visibles.filter((i) => i.tipo === t) : visibles;
          if (t && deEste.length === 0) return null;
          return (
            <div key={t ?? 'todo'} id={catalogoLuxuryDestacado && (t ?? tipos[0]) === 'producto' ? 'catalogo-productos' : undefined} className={`tp-modulo tp-modulo--${(t ?? tipos[0]) === 'producto' ? 'tienda' : 'agenda'}${catalogoLuxuryDestacado && (t ?? tipos[0]) === 'producto' ? ' tp-modulo--luxury-productos' : ''}`}>
              {catalogoLuxuryDestacado && (t ?? tipos[0]) === 'producto' ? <div className="tp-luxury-productos__cabecera">
                <div><span>LA SELECCIÓN</span><h2 className="tp-seccion">Catálogo de productos</h2></div>
                <div className="tp-luxury-productos__controles" aria-label="Mover catálogo de productos">
                  <button type="button" aria-label="Productos anteriores" onClick={() => carruselProductos.current?.scrollBy({ left: -carruselProductos.current.clientWidth * .8, behavior: 'smooth' })}><ChevronLeft size={24} aria-hidden="true" /></button>
                  <button type="button" aria-label="Productos siguientes" onClick={() => carruselProductos.current?.scrollBy({ left: carruselProductos.current.clientWidth * .8, behavior: 'smooth' })}><ChevronRight size={24} aria-hidden="true" /></button>
                </div>
              </div> : t && <div className="tp-luxury-servicios__cabecera"><h2 className="tp-seccion">{cap(vocabularioDe(t).items)}</h2>{t !== 'producto' && controlesServicios}</div>}
              <div ref={catalogoLuxuryDestacado && (t ?? tipos[0]) === 'producto' ? carruselProductos : undefined} className={`tp-grid${disposicion === 'cuadricula' ? '' : ' tp-grid--lista'}${plantillaLuxury && (t ?? tipos[0]) !== 'producto' && vistaServicios === 'horizontal' ? ' tp-grid--luxury-horizontal' : ''}`}>
                {deEste.map((i, indice) => (
                  <Tarjeta key={i.id} item={i} plantillaLuxury={plantillaLuxury} indice={indice} alAbrir={() => setAbierto(i.id)} />
                ))}
              </div>
            </div>
          );
        })}
          </>
        )}
        {visibles.length === 0 && <p className="tp-vacio">No encontramos {v.items} con esa búsqueda.</p>}
        </div>
        </div>
      </section>

      {lineas.length > 0 && !verCarrito && !item && (
        <button type="button" className="tp-barra" onClick={() => setVerCarrito(true)}>
          <span className="tp-barra__icono"><ShoppingBag size={20} aria-hidden="true" /><b>{unidades}</b></span>
          <span>Ver mi pedido</span>
          <b>{soles(total)}</b>
        </button>
      )}

      {item && (
        <Hoja titulo={item.nombre} variante={item.tipo === 'producto' ? 'tienda' : 'agenda'} alCerrar={() => setAbierto(null)}>
          {item.tipo === 'producto' ? (
            <FichaProducto
              item={item}
              enCarrito={lineas}
              puedePedir={puedePedir}
              whatsapp={whatsapp}
              alAnadir={(opcion, cantidad) => {
                const i = lineas.findIndex((l) => l.item === item.id && l.opcion === opcion);
                const n = [...lineas];
                if (i >= 0) n[i] = { ...n[i], cantidad: n[i].cantidad + cantidad };
                else n.push({ item: item.id, opcion, cantidad });
                ponerCarrito(n);
                setAbierto(null);
              }}
            />
          ) : !puedeReservar ? (
            <Detalle item={item}>
              <a className="tp-boton tp-boton--wsp" href={urlWhatsApp(whatsapp, `Hola, quiero información de: ${item.nombre}`)} rel="noopener">
                <MessageCircle size={20} aria-hidden="true" /> Preguntar por WhatsApp
              </a>
            </Detalle>
          ) : item.tipo === 'cita' ? (
            <Reservar item={item} esc={esc} slug={slug} alTerminar={terminar} />
          ) : (
            <Inscribir item={item} slug={slug} persona={vocabularioDe('grupo').persona} alTerminar={terminar} />
          )}
        </Hoja>
      )}

      {verCarrito && (
        <Hoja titulo="Tu pedido" variante="tienda" alCerrar={() => setVerCarrito(false)}>
          <Carrito
            lineas={lineas}
            porId={porId}
            esc={esc}
            slug={slug}
            alCambiar={ponerCarrito}
            alTerminar={(h) => {
              ponerCarrito([]);
              terminar({ ...h, variante: 'tienda' });
            }}
          />
        </Hoja>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Piezas
   ═══════════════════════════════════════════════════════════════════════ */

function Tarjeta({ item, alAbrir, plantillaLuxury, indice }: { item: Item; alAbrir: () => void; plantillaLuxury: boolean; indice: number }) {
  const foto = item.fotos[0];
  const respaldo = plantillaLuxury && item.tipo !== 'producto' ? fotoServicioLuxury(item.nombre, indice) : undefined;
  const agotado =
    item.tipo === 'producto' &&
    (item.opciones.length ? item.opciones.every((o) => o.quedan === 0) : item.quedan === 0);
  const sub =
    item.tipo === 'cita'
      ? `${item.duracion} min`
      : item.tipo === 'grupo'
        ? item.grupos.some((g) => g.libres === null || g.libres > 0)
          ? `${item.grupos.length} ${item.grupos.length === 1 ? 'horario' : 'horarios'}`
          : 'Sin cupos'
        : agotado
          ? 'Agotado'
          : item.opciones.length
            ? `${item.opciones.length} opciones`
            : item.quedan !== null && item.quedan <= 5
              ? `¡Quedan ${item.quedan}!`
              : '';
  return (
    <button type="button" className={`tp-tarjeta${agotado ? ' tp-tarjeta--agotado' : ''}`} onClick={alAbrir}>
      <span className="tp-tarjeta__foto" style={foto || respaldo ? { backgroundImage: foto && respaldo && foto !== respaldo ? `url("${foto}"), url("${respaldo}")` : `url("${foto || respaldo}")` } : undefined} aria-hidden="true">
        {!foto && !respaldo && (item.tipo === 'grupo' ? <Users size={26} /> : item.tipo === 'cita' ? <Clock size={26} /> : <ShoppingBag size={26} />)}
      </span>
      <span className="tp-tarjeta__texto">
        <b>{item.nombre}</b>
        {item.descripcion && <span className="tp-tarjeta__desc">{item.descripcion}</span>}
        <span className="tp-tarjeta__pie">
          <b>{soles(item.precio)}</b>
          {sub && <small>{sub}</small>}
        </span>
        {plantillaLuxury && item.tipo !== 'producto' && <span className="tp-tarjeta__reservar">Elegir horario <span aria-hidden="true">→</span></span>}
      </span>
    </button>
  );
}

/** Una línea de la carta: nombre … precio, la descripción debajo y, si hay, la foto al lado. */
function FilaCarta({ item, alAbrir }: { item: Item; alAbrir: () => void }) {
  const agotado = item.tipo === 'producto' && (item.opciones.length ? item.opciones.every((o) => o.quedan === 0) : item.quedan === 0);
  return (
    <button type="button" className={`tp-carta__fila${agotado ? ' tp-tarjeta--agotado' : ''}`} onClick={alAbrir}>
      <span className="tp-carta__texto">
        <span className="tp-carta__linea">
          <b>{item.nombre}</b>
          <i aria-hidden="true" />
          <b>{soles(item.precio)}</b>
        </span>
        {item.descripcion && <span className="tp-carta__desc">{item.descripcion}</span>}
        {agotado && <small>Agotado</small>}
        {item.tipo === 'cita' && <small>{item.duracion} min</small>}
      </span>
      {item.fotos[0] && <span className="tp-carta__foto" style={{ backgroundImage: `url("${item.fotos[0]}")` }} aria-hidden="true" />}
    </button>
  );
}

function Hoja({ titulo, alCerrar, children, variante }: { titulo: string; alCerrar: () => void; children: React.ReactNode; variante: 'agenda' | 'tienda' }) {
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar();
    window.addEventListener('keydown', esc);
    return () => {
      document.body.style.overflow = antes;
      window.removeEventListener('keydown', esc);
    };
  }, [alCerrar]);
  return (
    <div className="tp-velo" onClick={alCerrar}>
      <div className={`tp-hojita tp-hojita--${variante}`} role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="tp-hojita__cerrar" aria-label="Cerrar" onClick={alCerrar}><X size={20} /></button>
        {children}
      </div>
    </div>
  );
}

function Galeria({ fotos, nombre }: { fotos: string[]; nombre: string }) {
  const [i, setI] = useState(0);
  if (!fotos.length) return null;
  return (
    <div className="tp-galeria">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={fotos[i]} alt={nombre} onError={(evento) => {
        const imagen = evento.currentTarget;
        if (!imagen.closest('.tp[data-plantilla="luxury"]')) return;
        const respaldo = fotoServicioLuxury(nombre, 0);
        if (!imagen.src.endsWith(respaldo)) imagen.src = respaldo;
      }} />
      {fotos.length > 1 && (
        <>
          <button type="button" className="tp-galeria__btn tp-galeria__btn--izq" aria-label="Anterior" onClick={() => setI((i - 1 + fotos.length) % fotos.length)}><ChevronLeft size={20} /></button>
          <button type="button" className="tp-galeria__btn tp-galeria__btn--der" aria-label="Siguiente" onClick={() => setI((i + 1) % fotos.length)}><ChevronRight size={20} /></button>
          <span className="tp-galeria__puntos">{fotos.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</span>
        </>
      )}
    </div>
  );
}

function Detalle({ item, children }: { item: Item; children?: React.ReactNode }) {
  return (
    <>
      <Galeria fotos={item.fotos} nombre={item.nombre} />
      <div className="tp-ficha">
        <h2 className="tp-ficha__nombre">{item.nombre}</h2>
        <p className="tp-ficha__precio">
          {soles(item.precio)}
          {item.tipo === 'cita' && <small> · {item.duracion} min</small>}
          {item.tipo === 'grupo' && item.vigenciaMeses > 1 && <small> · {item.vigenciaMeses} meses</small>}
        </p>
        {item.descripcion && <p className="tp-ficha__desc">{item.descripcion}</p>}
        {children}
      </div>
    </>
  );
}

function Contador({ valor, max, alCambiar }: { valor: number; max: number; alCambiar: (n: number) => void }) {
  return (
    <div className="tp-contador" role="group" aria-label="Cantidad">
      <button type="button" aria-label="Uno menos" disabled={valor <= 1} onClick={() => alCambiar(Math.max(1, valor - 1))}><Minus size={18} /></button>
      <output aria-live="polite">{valor}</output>
      <button type="button" aria-label="Uno más" disabled={valor >= max} onClick={() => alCambiar(Math.min(max, valor + 1))}><Plus size={18} /></button>
    </div>
  );
}

function FichaProducto({ item, enCarrito, puedePedir, whatsapp, alAnadir }: {
  item: Item;
  enCarrito: EnCarrito[];
  puedePedir: boolean;
  whatsapp: string;
  alAnadir: (opcion: string, cantidad: number) => void;
}) {
  const [opcion, setOpcion] = useState(item.opciones.find((o) => o.quedan !== 0)?.id ?? '');
  const [cantidad, setCantidad] = useState(1);
  const yaTengo = enCarrito.filter((l) => l.item === item.id && l.opcion === opcion).reduce((s, l) => s + l.cantidad, 0);
  const quedanBase = item.opciones.length ? item.opciones.find((o) => o.id === opcion)?.quedan ?? 0 : item.quedan;
  const quedan = quedanBase === null ? 99 : Math.max(0, quedanBase - yaTengo);
  const falta = item.opciones.length > 0 && !opcion;

  useEffect(() => setCantidad(1), [opcion]);

  return (
    <Detalle item={item}>
      {item.opciones.length > 0 && (
        <div className="tp-campo">
          <label id="tp-op-l">Elige</label>
          <div className="tp-opciones tp-opciones--chicas" role="group" aria-labelledby="tp-op-l">
            {item.opciones.map((o) => (
              <button
                key={o.id}
                type="button"
                className="tp-opcion"
                aria-pressed={opcion === o.id}
                disabled={o.quedan === 0}
                onClick={() => setOpcion(o.id)}
              >
                {o.etiqueta}
                {o.quedan === 0 ? <small>Agotado</small> : o.quedan !== null && o.quedan <= 5 ? <small>Quedan {o.quedan}</small> : null}
              </button>
            ))}
          </div>
        </div>
      )}
      {!puedePedir ? (
        <a className="tp-boton tp-boton--wsp" href={urlWhatsApp(whatsapp, `Hola, me interesa: ${item.nombre}`)} rel="noopener">
          <MessageCircle size={20} aria-hidden="true" /> Preguntar por WhatsApp
        </a>
      ) : quedan <= 0 ? (
        <p className="tp-aviso tp-aviso--suave">{yaTengo ? 'Ya tienes en tu pedido todo lo que queda.' : 'Agotado por ahora.'}</p>
      ) : (
        <>
          <div className="tp-campo">
            <label>Cantidad</label>
            <Contador valor={cantidad} max={quedan} alCambiar={setCantidad} />
          </div>
          <button type="button" className="tp-boton" disabled={falta} onClick={() => alAnadir(opcion, cantidad)}>
            Añadir al pedido · {soles(item.precio === null ? null : item.precio * cantidad)}
          </button>
        </>
      )}
    </Detalle>
  );
}

function CamposCliente({ d, errores, alCambiar, extra }: {
  d: { nombre: string; telefono: string };
  errores: ErroresCliente;
  alCambiar: (k: 'nombre' | 'telefono', v: string) => void;
  extra?: React.ReactNode;
}) {
  return (
    <section className="tp-bloque">
      <h2>Tus datos</h2>
      <div className={`tp-campo${errores.nombre ? ' tp-campo--error' : ''}`}>
        <label htmlFor="tp-nombre">Tu nombre</label>
        <input id="tp-nombre" value={d.nombre} autoComplete="name" maxLength={80} onChange={(e) => alCambiar('nombre', e.target.value)} />
        {errores.nombre && <span className="tp-error">{errores.nombre}</span>}
      </div>
      <div className={`tp-campo${errores.telefono ? ' tp-campo--error' : ''}`}>
        <label htmlFor="tp-tel">Tu celular</label>
        <input id="tp-tel" value={d.telefono} inputMode="tel" autoComplete="tel" placeholder="987 654 321" maxLength={20} onChange={(e) => alCambiar('telefono', e.target.value)} />
        {errores.telefono && <span className="tp-error">{errores.telefono}</span>}
      </div>
      {extra}
    </section>
  );
}

/** El envío al servidor con su idem: un doble toque no separa dos veces. */
function useEnviar(ruta: string) {
  const idem = useRef(nuevoIdem());
  const [enviando, setEnviando] = useState(false);
  const enviar = async (cuerpo: Record<string, unknown>) => {
    setEnviando(true);
    try {
      const r = await fetch(ruta, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...cuerpo, idem: idem.current }),
      });
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown> & { status?: string };
      if (j.status !== 'ok') idem.current = nuevoIdem();
      return j;
    } catch {
      return { status: 'sin_red' };
    } finally {
      setEnviando(false);
    }
  };
  return { enviar, enviando };
}

function Reservar({ item, esc, slug, alTerminar, presentacion }: { item: Item; esc: Datos; slug: string; alTerminar: (h: Hecho) => void; presentacion?: 'inline' }) {
  const { cliente, setCliente, recordar } = useCliente();
  const [profesional, setProfesional] = useState<string>('');
  const [tomadas, setTomadas] = useState<Set<string>>(new Set());
  const [beneficiario, setBeneficiario] = useState('');
  const [errores, setErrores] = useState<ErroresCliente>({});
  const [fallo, setFallo] = useState('');
  const { enviar, enviando } = useEnviar('/api/tu-pagina/publico/reserva');

  const dias = useMemo(
    () => Array.from({ length: DIAS_A_LA_VISTA }, (_, i) => sumarDias(esc.hoy, i)).filter((f) => abreEl(esc.agenda, f)),
    [esc.hoy, esc.agenda],
  );
  const horasDe = useCallback(
    (f: string) =>
      horasLibres(esc.agenda, f, item.duracion, profesional || null, esc.ahora).filter((h) => !tomadas.has(`${f} ${h.hora}`)),
    [esc.agenda, esc.ahora, item.duracion, profesional, tomadas],
  );
  const [dia, setDia] = useState('');
  const [hora, setHora] = useState('');
  useEffect(() => {
    if (!dia || !horasDe(dia).length) setDia(dias.find((f) => horasDe(f).length > 0) ?? dias[0] ?? '');
    setHora('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profesional]);
  const horas = dia ? horasDe(dia) : [];
  const inicio = dia && hora ? `${dia} ${hora}` : '';

  async function confirmar() {
    const e = validarCliente(cliente);
    setErrores(e);
    setFallo('');
    if (Object.keys(e).length || !inicio) return;
    const j = await enviar({
      slug,
      item: item.id,
      inicio,
      profesional: profesional || undefined,
      nombre: cliente.nombre,
      telefono: cliente.telefono,
      beneficiario,
      web: '',
    });
    if (j.status === 'ok' && typeof j.codigo === 'string') {
      recordar(cliente);
      const pro = esc.agenda.equipo.find((x) => x.id === profesional)?.nombre;
      alTerminar({
        titulo: '¡Tu cita está separada!',
        codigo: j.codigo,
        mensaje: mensajeReserva(j.codigo, {
          servicio: item.nombre, precio: item.precio, inicio, profesional: pro, beneficiario, nombre: cliente.nombre, esGrupo: false,
        }),
      });
      return;
    }
    if (j.status === 'lleno' || j.status === 'pasada') {
      setTomadas((t) => new Set(t).add(inicio));
      setHora('');
    }
    if (j.errores) setErrores(j.errores as ErroresCliente);
    setFallo(MENSAJE_FALLO[String(j.status)] ?? (j.status === 'sin_red' ? 'Sin conexión. Revisa tu internet.' : 'No pudimos separar tu cita. Inténtalo otra vez.'));
  }

  return (
    <Detalle item={item}>
      {esc.pideProfesional && (
        <div className="tp-campo">
          <label id="tp-pro-l">¿Con quién?</label>
          <div className="tp-opciones tp-opciones--chicas" role="group" aria-labelledby="tp-pro-l">
            <button type="button" className="tp-opcion" aria-pressed={!profesional} onClick={() => setProfesional('')}>El primero libre</button>
            {esc.agenda.equipo.map((e) => (
              <button key={e.id} type="button" className="tp-opcion" aria-pressed={profesional === e.id} onClick={() => setProfesional(e.id)}>{e.nombre}</button>
            ))}
          </div>
        </div>
      )}
      <div className="tp-campo">
        {presentacion === 'inline' && <span className="tp-luxury-reserva-real__paso">02 / DÍA</span>}
        <label id="tp-dia-l">{presentacion === 'inline' ? 'Elige un día' : 'Día'}</label>
        <div className="tp-dias" role="group" aria-labelledby="tp-dia-l">
          {dias.map((f) => {
            const libres = horasDe(f).length;
            return (
              <button key={f} type="button" className="tp-opcion" aria-pressed={dia === f} disabled={!libres} onClick={() => { setDia(f); setHora(''); }}>
                {ETIQUETA_DIA(f, esc.hoy)}
                <small>{libres ? fechaCorta(f).split(' ').slice(1).join(' ') : 'Lleno'}</small>
              </button>
            );
          })}
        </div>
      </div>
      <div className="tp-campo">
        {presentacion === 'inline' && <span className="tp-luxury-reserva-real__paso">03 / HORA</span>}
        <label id="tp-hora-l">{presentacion === 'inline' ? 'Escoge tu horario' : 'Hora'}</label>
        {horas.length ? (
          <div className="tp-horas" role="group" aria-labelledby="tp-hora-l">
            {horas.map((h) => (
              <button key={h.hora} type="button" className="tp-opcion" aria-pressed={hora === h.hora} onClick={() => setHora(h.hora)}>
                {h.hora}
              </button>
            ))}
          </div>
        ) : (
          <p className="tp-vacio">No quedan horas este día. Prueba otro.</p>
        )}
      </div>
      {inicio && (
        <>
          <CamposCliente
            d={cliente}
            errores={errores}
            alCambiar={(k, val) => { setCliente((c) => ({ ...c, [k]: val })); setErrores((e) => ({ ...e, [k]: undefined })); }}
            extra={
              <div className="tp-campo">
                <label htmlFor="tp-para">¿Es para otra persona? <small>(opcional)</small></label>
                <input id="tp-para" value={beneficiario} maxLength={80} placeholder="Su nombre" onChange={(e) => setBeneficiario(e.target.value)} />
              </div>
            }
          />
          {fallo && <p className="tp-aviso" role="alert">{fallo}</p>}
          <button type="button" className="tp-boton" disabled={enviando} onClick={() => void confirmar()}>
            {enviando ? 'Separando…' : `Separar mi cita · ${cuandoCita(inicio)}`}
          </button>
          <p className="tp-nota">Hasta las {sumarMin(inicio, item.duracion).slice(11)} · Luego nos avisas por WhatsApp.</p>
        </>
      )}
      {!inicio && fallo && <p className="tp-aviso" role="alert">{fallo}</p>}
    </Detalle>
  );
}

function Inscribir({ item, slug, persona, alTerminar }: { item: Item; slug: string; persona: string; alTerminar: (h: Hecho) => void }) {
  const { cliente, setCliente, recordar } = useCliente();
  const [grupo, setGrupo] = useState(item.grupos.find((g) => g.libres === null || g.libres > 0)?.id ?? '');
  const [llenos, setLlenos] = useState<Set<string>>(new Set());
  const [beneficiario, setBeneficiario] = useState('');
  const [errores, setErrores] = useState<ErroresCliente>({});
  const [fallo, setFallo] = useState('');
  const { enviar, enviando } = useEnviar('/api/tu-pagina/publico/reserva');
  const g = item.grupos.find((x) => x.id === grupo);

  async function confirmar() {
    const e = validarCliente(cliente);
    setErrores(e);
    setFallo('');
    if (Object.keys(e).length || !g) return;
    const j = await enviar({ slug, item: item.id, grupo: g.id, nombre: cliente.nombre, telefono: cliente.telefono, beneficiario, web: '' });
    if (j.status === 'ok' && typeof j.codigo === 'string') {
      recordar(cliente);
      alTerminar({
        titulo: '¡Tu cupo está separado!',
        codigo: j.codigo,
        mensaje: mensajeReserva(j.codigo, {
          servicio: item.nombre,
          precio: item.precio,
          grupo: g.etiqueta === g.cuando ? g.cuando : `${g.etiqueta} (${g.cuando})`,
          beneficiario,
          nombre: cliente.nombre,
          esGrupo: true,
        }),
      });
      return;
    }
    if (j.status === 'lleno') {
      setLlenos((s) => new Set(s).add(g.id));
      setGrupo('');
    }
    if (j.errores) setErrores(j.errores as ErroresCliente);
    setFallo(MENSAJE_FALLO[String(j.status)] ?? (j.status === 'sin_red' ? 'Sin conexión. Revisa tu internet.' : 'No pudimos separar tu cupo. Inténtalo otra vez.'));
  }

  return (
    <Detalle item={item}>
      <div className="tp-campo">
        <label id="tp-grupo-l">Elige tu horario</label>
        <div className="tp-grupos" role="group" aria-labelledby="tp-grupo-l">
          {item.grupos.map((x) => {
            const lleno = llenos.has(x.id) || (x.libres !== null && x.libres <= 0);
            return (
              <button key={x.id} type="button" className="tp-grupo" aria-pressed={grupo === x.id} disabled={lleno} onClick={() => setGrupo(x.id)}>
                <span>
                  <b>{x.etiqueta}</b>
                  {x.etiqueta !== x.cuando && <small>{x.cuando}</small>}
                </span>
                <em className={lleno ? 'lleno' : x.libres !== null && x.libres <= 3 ? 'pocos' : ''}>
                  {lleno ? 'Lleno' : x.libres === null ? 'Hay cupos' : `Quedan ${x.libres}`}
                </em>
              </button>
            );
          })}
        </div>
      </div>
      {g && (
        <>
          <CamposCliente
            d={cliente}
            errores={errores}
            alCambiar={(k, val) => { setCliente((c) => ({ ...c, [k]: val })); setErrores((e) => ({ ...e, [k]: undefined })); }}
            extra={
              <div className="tp-campo">
                <label htmlFor="tp-alumno">Nombre del {persona} <small>(si no eres tú)</small></label>
                <input id="tp-alumno" value={beneficiario} maxLength={80} onChange={(e) => setBeneficiario(e.target.value)} />
              </div>
            }
          />
          {fallo && <p className="tp-aviso" role="alert">{fallo}</p>}
          <button type="button" className="tp-boton" disabled={enviando} onClick={() => void confirmar()}>
            {enviando ? 'Separando…' : 'Separar mi cupo'}
          </button>
        </>
      )}
      {!g && fallo && <p className="tp-aviso" role="alert">{fallo}</p>}
    </Detalle>
  );
}

function Carrito({ lineas, porId, esc, slug, alCambiar, alTerminar }: {
  lineas: EnCarrito[];
  porId: Map<string, Item>;
  esc: Datos;
  slug: string;
  alCambiar: (c: EnCarrito[]) => void;
  alTerminar: (h: Hecho) => void;
}) {
  const { cliente, setCliente, recordar } = useCliente();
  const conDelivery = esc.entrega !== 'pickup';
  const conRecojo = esc.entrega !== 'delivery';
  const [entrega, setEntrega] = useState<'recojo' | 'delivery'>(conDelivery ? 'delivery' : 'recojo');
  const [direccion, setDireccion] = useState('');
  const [referencia, setReferencia] = useState('');
  const [errores, setErrores] = useState<ErroresCliente>({});
  const [fallo, setFallo] = useState('');
  const { enviar, enviando } = useEnviar('/api/tu-pagina/publico/pedido');

  const detalle = lineas.map((l) => {
    const i = porId.get(l.item)!;
    const o = i.opciones.find((x) => x.id === l.opcion);
    const quedan = i.opciones.length ? o?.quedan ?? 0 : i.quedan;
    return { ...l, i, opcion: o?.etiqueta ?? '', max: quedan === null ? 99 : quedan };
  });
  const total = detalle.reduce((s, d) => s + (d.i.precio ?? 0) * d.cantidad, 0);

  const cambiar = (k: number, cantidad: number) =>
    alCambiar(cantidad <= 0 ? lineas.filter((_, j) => j !== k) : lineas.map((l, j) => (j === k ? { ...l, cantidad } : l)));

  async function pedir() {
    const e = validarCliente({ ...cliente, direccion, conDelivery: entrega === 'delivery' });
    setErrores(e);
    setFallo('');
    if (Object.keys(e).length) return;
    const j = await enviar({
      slug,
      nombre: cliente.nombre,
      telefono: cliente.telefono,
      entrega,
      direccion,
      referencia,
      lineas: lineas.map((l) => ({ item: l.item, opcion: l.opcion, cantidad: l.cantidad })),
      web: '',
    });
    if (j.status === 'ok' && typeof j.codigo === 'string') {
      recordar(cliente);
      const guardadas = (Array.isArray(j.lineas) ? j.lineas : []) as LineaPedido[];
      alTerminar({
        titulo: '¡Pedido recibido!',
        codigo: j.codigo,
        mensaje: mensajePedido(j.codigo, {
          lineas: guardadas.map((x) => ({ ...x, precio: Number(x.precio), cantidad: Number(x.cantidad) })),
          total: Number(j.total ?? total),
          entrega,
          direccion,
          referencia,
          nombre: cliente.nombre,
          telefono: cliente.telefono,
        }),
      });
      return;
    }
    if (j.errores) setErrores(j.errores as ErroresCliente);
    setFallo(
      j.status === 'sin_stock'
        ? `De «${String(j.producto)}» solo ${Number(j.quedan) === 1 ? 'queda 1' : `quedan ${Number(j.quedan)}`}. Ajusta la cantidad.`
        : j.status === 'falta_opcion'
          ? `Elige la opción de «${String(j.producto)}».`
          : MENSAJE_FALLO[String(j.status)] ?? (j.status === 'sin_red' ? 'Sin conexión. Revisa tu internet.' : 'No pudimos guardar tu pedido. Inténtalo otra vez.'),
    );
  }

  if (!detalle.length) return <p className="tp-vacio">Tu pedido está vacío.</p>;

  return (
    <div className="tp-ficha">
      <h2 className="tp-ficha__nombre">Tu pedido</h2>
      <ul className="tp-lineas">
        {detalle.map((d, k) => (
          <li key={`${d.item}|${d.opcion}`}>
            <span className="tp-lineas__foto" style={d.i.fotos[0] ? { backgroundImage: `url("${d.i.fotos[0]}")` } : undefined} aria-hidden="true" />
            <span className="tp-lineas__texto">
              <b>{d.i.nombre}</b>
              {d.opcion && <small>{d.opcion}</small>}
              <small>{soles(d.i.precio === null ? null : d.i.precio * d.cantidad)}</small>
            </span>
            <span className="tp-lineas__cant">
              <button type="button" aria-label="Uno menos" onClick={() => cambiar(k, d.cantidad - 1)}>{d.cantidad === 1 ? <Trash2 size={16} /> : <Minus size={16} />}</button>
              <output>{d.cantidad}</output>
              <button type="button" aria-label="Uno más" disabled={d.cantidad >= d.max} onClick={() => cambiar(k, d.cantidad + 1)}><Plus size={16} /></button>
            </span>
          </li>
        ))}
      </ul>
      <p className="tp-total"><span>Total</span><b>{soles(total)}</b></p>

      <section className="tp-bloque">
        <h2>Entrega</h2>
        {conDelivery && conRecojo && (
          <div className="tp-opciones" role="group" aria-label="Entrega">
            <button type="button" className="tp-opcion" aria-pressed={entrega === 'delivery'} onClick={() => setEntrega('delivery')}>Delivery</button>
            <button type="button" className="tp-opcion" aria-pressed={entrega === 'recojo'} onClick={() => setEntrega('recojo')}>Recojo en tienda</button>
          </div>
        )}
        {entrega === 'delivery' ? (
          <>
            <div className={`tp-campo${errores.direccion ? ' tp-campo--error' : ''}`} style={{ marginTop: 12 }}>
              <label htmlFor="tp-dir">Dirección</label>
              <input id="tp-dir" value={direccion} autoComplete="street-address" maxLength={200} placeholder="Av. Primavera 123, Surco" onChange={(e) => { setDireccion(e.target.value); setErrores((x) => ({ ...x, direccion: undefined })); }} />
              {errores.direccion && <span className="tp-error">{errores.direccion}</span>}
            </div>
            <div className="tp-campo">
              <label htmlFor="tp-ref">Referencia <small>(opcional)</small></label>
              <input id="tp-ref" value={referencia} maxLength={200} placeholder="Frente al parque" onChange={(e) => setReferencia(e.target.value)} />
            </div>
          </>
        ) : (
          <p className="tp-nota" style={{ textAlign: 'left' }}>{esc.direccion ? `Lo recoges en: ${esc.direccion}` : 'Te diremos dónde recogerlo.'}</p>
        )}
      </section>

      <CamposCliente d={cliente} errores={errores} alCambiar={(k, val) => { setCliente((c) => ({ ...c, [k]: val })); setErrores((e) => ({ ...e, [k]: undefined })); }} />
      {fallo && <p className="tp-aviso" role="alert">{fallo}</p>}
      <button type="button" className="tp-boton" disabled={enviando} onClick={() => void pedir()}>
        {enviando ? 'Guardando…' : `Hacer pedido · ${soles(total)}`}
      </button>
      <p className="tp-nota">Separamos tus productos y luego nos avisas por WhatsApp para coordinar el pago.</p>
    </div>
  );
}
