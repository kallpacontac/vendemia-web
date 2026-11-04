'use client';

/** Catálogo visual de Casa Brasa. Todas las acciones son una simulación local del flujo de mesa. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, CheckCheck, Gift, Minus, Plus, ReceiptText, ShoppingCart, X } from 'lucide-react';
import AtencionEnMesa, { type ApiMesa, type CarritoMesa, type DatosLlamado, type LineaMesa } from '@/modules/tu-pagina/publico/AtencionEnMesa';
import type { Item } from '@/modules/tu-pagina/dominio/tienda';
import type { AjustesCarta } from '@/modules/tu-pagina/dominio/mesa';
import catalogo from './casa-brasa-catalogo.json';
import './casa-brasa.css';

type Producto = (typeof catalogo.categories)[number]['products'][number];
type Llamado = { id: number; titulo: string; detalle: string; creado: number; veces: number; tipo: string };

const categorias = catalogo.categories;
const productos = categorias.flatMap((categoria) => categoria.products);
const items: Item[] = categorias.flatMap((categoria) => categoria.products.map((producto) => ({
  id: producto.id, nombre: producto.name, familia: categoria.name, precio: producto.price,
  descripcion: producto.description, fotos: [producto.image], tipo: 'producto' as const,
  duracion: 0, quedan: null, opciones: [], grupos: [], vigenciaMeses: 0,
})));
const ajustes: AjustesCarta = {};
const mesa = { salon: 'Terraza', numero: '12' };
const equipo = [{ id: 'e1', nombre: 'Rosa Quispe' }, { id: 'e2', nombre: 'Marco Salas' }];
const vacio: CarritoMesa = { lineas: [], unidades: 0, total: 0, personas: 0 };
const precio = (valor: number) => `S/ ${valor.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const resumen = (lineas: LineaMesa[]): CarritoMesa => ({
  lineas,
  unidades: lineas.reduce((total, linea) => total + linea.cantidad, 0),
  total: lineas.reduce((total, linea) => total + linea.precio * linea.cantidad, 0),
  personas: new Set(lineas.map((linea) => linea.mia)).size,
});
const espera = (ms: number) => {
  const segundos = Math.max(0, Math.floor(ms / 1000));
  return segundos >= 60 ? `${Math.floor(segundos / 60)} min ${String(segundos % 60).padStart(2, '0')} s` : `${segundos} s`;
};

export default function MesaEjemplo() {
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);
  const [bannerActivo, setBannerActivo] = useState(1);
  const [productoActivo, setProductoActivo] = useState<Producto | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [carrito, setCarrito] = useState<CarritoMesa>(vacio);
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [promoAbierta, setPromoAbierta] = useState(false);
  const [flujoMesa, setFlujoMesa] = useState(false);
  const [nota, setNota] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [llamados, setLlamados] = useState<Llamado[]>([]);
  const [atendidos, setAtendidos] = useState<number[]>([]);
  const [ahora, setAhora] = useState(0);
  const lineas = useRef<LineaMesa[]>([]);
  const siguiente = useRef(1);

  const registrar = (tipo: string, titulo: string, detalle: string) => {
    setLlamados((actual) => {
      const anterior = tipo === 'pedido' ? null : actual.find((llamado) => llamado.tipo === tipo);
      if (!anterior) return [...actual, { id: siguiente.current++, tipo, titulo, detalle, creado: Date.now(), veces: 1 }];
      return actual.map((llamado) => llamado === anterior ? { ...llamado, veces: llamado.veces + 1, detalle: detalle || llamado.detalle } : llamado);
    });
  };

  const api = useRef<ApiMesa>({
    async llamar(datos: DatosLlamado) {
      if (datos.tipo === 'mozo') registrar('mozo', 'Llama al mesero', '');
      if (datos.tipo === 'cuenta') registrar('cuenta', 'Pide la cuenta', datos.dividir ? 'Quieren dividir la cuenta.' : datos.comprobante === 'factura' ? `Factura · RUC ${datos.documento}` : `Boleta${datos.documento ? ` · DNI ${datos.documento}` : ''}`);
      if (datos.tipo === 'requerimiento') registrar('requerimiento', 'Otro pedido', datos.detalle ?? '');
      if (datos.tipo === 'sugerencia') registrar('sugerencia', 'Sugerencia (solo gerencia)', datos.detalle ?? '');
      if (datos.tipo === 'felicitacion') registrar('felicitacion', 'Felicitación', datos.detalle ?? '');
      return { status: 'ok', repetida: false };
    },
    async leer() { return resumen(lineas.current); },
    async agregar(itemId) {
      const item = items.find((producto) => producto.id === itemId);
      if (!item) return null;
      const existente = lineas.current.find((linea) => linea.mia && linea.catalog_id === itemId);
      if (existente) existente.cantidad += 1;
      else lineas.current = [...lineas.current, { id: itemId, catalog_id: itemId, nombre: item.nombre, opcion: '', precio: item.precio ?? 0, cantidad: 1, mia: true }];
      return resumen(lineas.current);
    },
    async cantidad(id, nuevaCantidad) {
      lineas.current = lineas.current.map((linea) => linea.id === id ? { ...linea, cantidad: nuevaCantidad } : linea).filter((linea) => linea.cantidad > 0);
      return resumen(lineas.current);
    },
    async pedir(nuevaNota) {
      if (!lineas.current.length) return { status: 'vacio' };
      const lista = lineas.current.map((linea) => `${linea.cantidad}× ${linea.nombre}`).join('\n');
      registrar('pedido', 'Quiere pedir', `${lista}${nuevaNota ? `\n“${nuevaNota}”` : ''}\nAproximado: ${precio(resumen(lineas.current).total)}`);
      lineas.current = [];
      return { status: 'ok' };
    },
  });

  useEffect(() => {
    setAhora(Date.now());
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, []);
  useEffect(() => {
    const reloj = setInterval(() => setBannerActivo((actual) => (actual + 1) % catalogo.banners.length), 6500);
    return () => clearInterval(reloj);
  }, []);
  useEffect(() => {
    try {
      if (sessionStorage.getItem('casa-brasa-promo-v1') !== 'vista') {
        setPromoAbierta(true);
        sessionStorage.setItem('casa-brasa-promo-v1', 'vista');
      }
    } catch { /* La promoción sigue accesible desde el botón de regalo. */ }
  }, []);

  const hayModal = Boolean(productoActivo || carritoAbierto || promoAbierta || flujoMesa);
  useEffect(() => {
    if (!hayModal) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const cerrar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') { setProductoActivo(null); setCarritoAbierto(false); setPromoAbierta(false); setFlujoMesa(false); }
    };
    window.addEventListener('keydown', cerrar);
    return () => { document.body.style.overflow = antes; window.removeEventListener('keydown', cerrar); };
  }, [hayModal]);

  const visibles = useMemo(() => categoriaActiva ? categorias.filter((categoria) => categoria.id === categoriaActiva) : categorias, [categoriaActiva]);
  const pendientes = llamados.filter((llamado) => !atendidos.includes(llamado.id));
  const abrirProducto = (producto: Producto) => { setCantidad(1); setProductoActivo(producto); };
  const aviso = (texto: string) => { setMensaje(texto); window.setTimeout(() => setMensaje(''), 3800); };

  async function agregar(producto: Producto, unidades = 1) {
    let resultado: CarritoMesa | null = null;
    for (let i = 0; i < unidades; i++) resultado = await api.current.agregar(producto.id, '');
    if (resultado) { setCarrito(resultado); setProductoActivo(null); aviso(`${producto.name} agregado al pedido.`); }
  }
  async function cambiarCantidad(id: string, nuevaCantidad: number) {
    const resultado = await api.current.cantidad(id, nuevaCantidad);
    if (resultado) setCarrito(resultado);
  }
  async function llamarMesero() {
    if (enviando) return;
    setEnviando(true);
    try {
      await api.current.llamar({ tipo: 'mozo' });
      aviso('Aviso enviado: el mesero va en camino. Mira el panel de atención.');
    } finally { setEnviando(false); }
  }
  async function pedir() {
    if (enviando) return;
    setEnviando(true);
    try {
      const resultado = await api.current.pedir(nota);
      if (resultado.status === 'ok') { setCarrito(vacio); setNota(''); setCarritoAbierto(false); aviso('Pedido de ejemplo enviado al panel del mesero.'); }
    } finally { setEnviando(false); }
  }
  const irAPromo = () => {
    setPromoAbierta(false);
    setCategoriaActiva('288');
    document.getElementById('carta-casa-brasa')?.scrollIntoView({ behavior: 'smooth' });
  };
  const destacarBanner = () => abrirProducto(productos.find((producto) => producto.name === (bannerActivo === 0 ? 'Parrilla Familiar' : 'Mostro Familiar')) ?? productos[0]);

  return <div className="cb">
    <div className="cb-contenedor">
      <header className="cb-cabecera">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="cb-logotipo" src="/assets/restaurante-ejemplo/casa-brasa-wordmark.svg" alt="Casa Brasa · Brasas y grill" />
        <div className="cb-cabecera__acciones">
          <button type="button" className="cb-circulo cb-circulo--regalo" aria-label="Ver promociones" onClick={() => setPromoAbierta(true)}><Gift size={25} aria-hidden="true" /></button>
          <button type="button" className="cb-circulo" aria-label={`Ver pedido, ${carrito.unidades} productos`} onClick={() => setCarritoAbierto(true)}><ShoppingCart size={24} aria-hidden="true" />{carrito.unidades > 0 && <b>{carrito.unidades}</b>}</button>
        </div>
      </header>

      <section className="cb-portada" aria-label="Promociones de Casa Brasa">
        {catalogo.banners.map((banner, indice) => <div key={banner} className={`cb-portada__imagen${indice === bannerActivo ? ' cb-portada__imagen--activa' : ''}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={banner} alt={indice === 0 ? 'Parrilla familiar para compartir' : 'Mostro familiar: pollo, papas y más'} />
        </div>)}
        <button type="button" className="cb-portada__pedir" onClick={destacarBanner}>Pedir ahora</button>
      </section>
      <div className="cb-puntos" role="group" aria-label="Elegir banner">
        {catalogo.banners.map((_, indice) => <button key={indice} type="button" aria-label={`Banner ${indice + 1}`} aria-pressed={bannerActivo === indice} onClick={() => setBannerActivo(indice)} />)}
      </div>

      <nav className="cb-categorias" aria-label="Categorías de la carta">
        <button type="button" className="cb-categoria" aria-pressed={categoriaActiva === null} onClick={() => setCategoriaActiva(null)}><span className="cb-categoria__foto cb-categoria__foto--todo"><span aria-hidden="true">▦</span></span><span>Todo</span></button>
        {categorias.map((categoria) => <button key={categoria.id} type="button" className="cb-categoria" aria-pressed={categoriaActiva === categoria.id} onClick={() => setCategoriaActiva(categoria.id)}>
          <span className="cb-categoria__foto">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={categoria.image} alt="" /></span><span title={categoria.name}>{categoria.name}</span>
        </button>)}
      </nav>

      <main id="carta-casa-brasa" className="cb-carta">
        {visibles.map((categoria) => <section className="cb-seccion" key={categoria.id}>
          <h2>{categoria.name}</h2><span className="cb-onda" aria-hidden="true">﹏﹏﹏</span>
          <div className="cb-productos">
            {categoria.products.map((producto) => <article className="cb-producto" key={producto.id}>
              <button className="cb-producto__detalle" type="button" aria-label={`Ver ${producto.name}`} onClick={() => abrirProducto(producto)}>
                <span className="cb-producto__foto">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={producto.image} alt="" loading="lazy" />{producto.new && <em>Nuevo</em>}</span>
                <span className="cb-producto__texto"><strong>{producto.name}</strong><small>{producto.description}</small></span>
              </button>
              <div className="cb-producto__pie"><b>{precio(producto.price)}</b><button type="button" aria-label={`Agregar ${producto.name}`} onClick={() => void agregar(producto)}><Plus size={19} aria-hidden="true" /></button></div>
            </article>)}
          </div>
        </section>)}
      </main>

      <footer className="cb-pie">
        <div><b>Casa Brasa</b><span>Brasas, parrilla y cocina criolla para compartir.</span></div>
        <div className="cb-pie__acciones"><button type="button" onClick={() => setFlujoMesa(true)}><ReceiptText size={18} /> Pedir la cuenta y más opciones de mesa</button><a href="#panel-mesero">Ver lo que recibe el personal ↓</a></div>
        <small>Ejemplo interactivo: los pedidos y avisos se simulan; no se envían a un restaurante.</small>
      </footer>
    </div>

    <section className="cb-panel" id="panel-mesero" aria-label="Panel de atención de ejemplo">
      <div className="cb-panel__cabeza"><div><span>DETRÁS DE LA CARTA</span><h2>Lo que ve el mesero</h2><p>Los avisos de la mesa aparecen aquí para mostrar cómo funciona.</p></div><button type="button" onClick={() => setFlujoMesa(true)}>Probar más acciones</button></div>
      {pendientes.length === 0 ? <p className="cb-panel__vacio">Ninguna mesa está esperando todavía.</p> : <div className="cb-panel__lista">{pendientes.map((llamado) => <article key={llamado.id}><header><b>Terraza · Mesa 12</b><time>{espera(ahora - llamado.creado)}</time></header><strong>{llamado.titulo}{llamado.veces > 1 ? ` · insistió ${llamado.veces} veces` : ''}</strong>{llamado.detalle && <p>{llamado.detalle}</p>}<button type="button" onClick={() => setAtendidos((actual) => [...actual, llamado.id])}><CheckCheck size={16} /> Llegué a la mesa</button></article>)}</div>}
    </section>

    <div className="cb-flotantes">
      <button type="button" className="cb-mesero" disabled={enviando} onClick={() => void llamarMesero()}><BellRing size={19} aria-hidden="true" /> Llamar al mesero</button>
      <button type="button" className="cb-carrito-flotante" aria-label={`Ver pedido, ${carrito.unidades} productos`} onClick={() => setCarritoAbierto(true)}><ShoppingCart size={22} aria-hidden="true" />{carrito.unidades > 0 && <b>{carrito.unidades}</b>}</button>
    </div>
    {mensaje && <p className="cb-aviso" role="status">{mensaje}</p>}

    {promoAbierta && <div className="cb-velo" role="presentation" onClick={() => setPromoAbierta(false)}><div className="cb-promo" role="dialog" aria-modal="true" aria-label="Promoción especial" onClick={(evento) => evento.stopPropagation()}><button className="cb-cerrar cb-promo__cerrar" type="button" aria-label="Cerrar promoción" onClick={() => setPromoAbierta(false)}><X size={20} /></button>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={catalogo.popup} alt="Promoción miércoles y jueves: cuarto de pollo a la brasa a S/ 15.90" /><button type="button" className="cb-promo__cta" onClick={irAPromo}>Ver promoción</button></div></div>}

    {productoActivo && <div className="cb-velo" role="presentation" onClick={() => setProductoActivo(null)}><div className="cb-modal cb-modal--producto" role="dialog" aria-modal="true" aria-labelledby="cb-producto-titulo" onClick={(evento) => evento.stopPropagation()}><button className="cb-cerrar" type="button" aria-label="Cerrar producto" onClick={() => setProductoActivo(null)}><X size={20} /></button>{/* eslint-disable-next-line @next/next/no-img-element */}<img className="cb-modal__foto" src={productoActivo.image} alt={productoActivo.name} /><div className="cb-modal__contenido"><h2 id="cb-producto-titulo">{productoActivo.name}</h2><b>{precio(productoActivo.price)}</b><p>{productoActivo.description}</p><div className="cb-modal__acciones"><div className="cb-cantidad" role="group" aria-label="Cantidad"><button type="button" aria-label="Uno menos" disabled={cantidad <= 1} onClick={() => setCantidad((actual) => Math.max(1, actual - 1))}><Minus size={16} /></button><output>{cantidad}</output><button type="button" aria-label="Uno más" onClick={() => setCantidad((actual) => Math.min(20, actual + 1))}><Plus size={16} /></button></div><button type="button" className="cb-primario" onClick={() => void agregar(productoActivo, cantidad)}>Agregar · {precio(productoActivo.price * cantidad)}</button></div></div></div></div>}

    {carritoAbierto && <div className="cb-velo" role="presentation" onClick={() => setCarritoAbierto(false)}><div className="cb-modal cb-modal--carrito" role="dialog" aria-modal="true" aria-labelledby="cb-carrito-titulo" onClick={(evento) => evento.stopPropagation()}><button className="cb-cerrar" type="button" aria-label="Cerrar pedido" onClick={() => setCarritoAbierto(false)}><X size={20} /></button><div className="cb-modal__contenido"><h2 id="cb-carrito-titulo">Pedido de la mesa</h2><p>Terraza · Mesa 12</p>{carrito.lineas.length === 0 ? <p>Tu pedido está vacío. Elige algo rico de la carta.</p> : <><ul className="cb-lineas">{carrito.lineas.map((linea) => <li key={linea.id}><div><b>{linea.nombre}</b>{!linea.mia && <small>Agregado desde otro celular</small>}<span>{precio(linea.precio * linea.cantidad)}</span></div>{linea.mia ? <div className="cb-cantidad"><button type="button" aria-label={`Quitar uno de ${linea.nombre}`} onClick={() => void cambiarCantidad(linea.id, linea.cantidad - 1)}><Minus size={15} /></button><output>{linea.cantidad}</output><button type="button" aria-label={`Agregar uno de ${linea.nombre}`} onClick={() => void cambiarCantidad(linea.id, linea.cantidad + 1)}><Plus size={15} /></button></div> : <b>× {linea.cantidad}</b>}</li>)}</ul><div className="cb-total"><span>Total aproximado</span><b>{precio(carrito.total)}</b></div><label className="cb-nota">Algo que debamos saber (opcional)<textarea rows={2} value={nota} maxLength={300} onChange={(evento) => setNota(evento.target.value)} /></label><p>El mesero se acercará a confirmar el pedido.</p><button type="button" className="cb-primario" disabled={enviando} onClick={() => void pedir()}><BellRing size={18} /> Avisar al mesero</button></>}</div></div></div>}

    {flujoMesa && <div className="cb-velo cb-velo--mesa" role="presentation" onClick={() => setFlujoMesa(false)}><div className="cb-mesa-dialogo" role="dialog" aria-modal="true" aria-label="Más opciones de atención en mesa" onClick={(evento) => evento.stopPropagation()}><button type="button" className="cb-cerrar" aria-label="Cerrar opciones de mesa" onClick={() => { setFlujoMesa(false); void api.current.leer().then((actual) => actual && setCarrito(actual)); }}><X size={20} /></button><AtencionEnMesa negocio="Casa Brasa" logo="/assets/restaurante-ejemplo/casa-brasa-wordmark.svg" whatsapp="" token="ejemplo-de-mesa" mesa={mesa} equipo={equipo} items={items} ajustes={ajustes} api={api.current} avisoDemo="Ejemplo: no se avisa a nadie. Prueba las acciones de mesa." /></div></div>}
  </div>;
}
