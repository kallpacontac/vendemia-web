'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Coffee, Info, MapPin, Minus, Plus, Search, ShoppingBag, Trash2, X, ZoomIn } from 'lucide-react';
import ImagenAmpliada from './ImagenAmpliada';
import LlamarMesero from './LlamarMesero';
import { mensajePedido, validarCliente, type ErroresCliente } from '@/modules/tu-pagina/dominio/tienda';
import './negocios-ejemplo.css';

const PRODUCTOS = [
  { id: 0, nombre: 'Latte de la casa', descripcion: 'Doble espresso, leche vaporizada y arte latte.', precio: 14, anterior: 17, categoria: 'Café caliente', destacado: true },
  { id: 1, nombre: 'Cold brew de naranja', descripcion: 'Extracción en frío por 18 horas, hielo y naranja fresca.', precio: 16, categoria: 'Bebidas frías', destacado: false },
  { id: 2, nombre: 'Croissant de pistacho', descripcion: 'Hojaldre de mantequilla con crema de pistacho.', precio: 18, anterior: 22, categoria: 'Panadería', destacado: true },
  { id: 3, nombre: 'Pan de masa madre', descripcion: 'Fermentación lenta de 24 horas y corteza crujiente.', precio: 20, anterior: 24, categoria: 'Panadería', destacado: true },
  { id: 4, nombre: 'Tarta vasca', descripcion: 'Exterior caramelizado y centro cremoso.', precio: 19, categoria: 'Panadería', destacado: false },
  { id: 5, nombre: 'Espresso doble', descripcion: 'Café peruano de temporada, intenso y balanceado.', precio: 11, categoria: 'Café caliente', destacado: false },
] as const;

type Producto = (typeof PRODUCTOS)[number];
const CATEGORIAS = ['Todos', 'Ofertas', 'Café caliente', 'Bebidas frías', 'Panadería'] as const;

export default function CafeteriaEjemplo() {
  const [categoria, setCategoria] = useState<string>('Todos');
  const [busqueda, setBusqueda] = useState('');
  const [producto, setProducto] = useState<Producto | null>(null);
  const [zoom, setZoom] = useState(false);
  const [carrito, setCarrito] = useState<Record<number, number>>({});
  const [verCarrito, setVerCarrito] = useState(false);
  const [pasoCarrito, setPasoCarrito] = useState<'carrito' | 'entrega' | 'hecho'>('carrito');
  const [entrega, setEntrega] = useState<'delivery' | 'recojo'>('recojo');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [referencia, setReferencia] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [metodoPago, setMetodoPago] = useState('');
  const [nota, setNota] = useState('');
  const [errores, setErrores] = useState<ErroresCliente>({});
  const [aviso, setAviso] = useState('');
  const [resumenPedido, setResumenPedido] = useState('');
  const visibles = useMemo(() => PRODUCTOS.filter((p) =>
    (categoria === 'Todos' || (categoria === 'Ofertas' ? p.destacado : p.categoria === categoria)) &&
    `${p.nombre} ${p.descripcion}`.toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es')),
  ), [categoria, busqueda]);
  const lineas = PRODUCTOS.map((p) => ({ producto: p, cantidad: carrito[p.id] ?? 0 })).filter((l) => l.cantidad > 0);
  const unidades = lineas.reduce((suma, linea) => suma + linea.cantidad, 0);
  const total = lineas.reduce((suma, linea) => suma + linea.cantidad * linea.producto.precio, 0);
  const cambiarCantidad = (id: number, cambio: number) => setCarrito((actual) => {
    const siguiente = { ...actual };
    const cantidad = Math.max(0, (siguiente[id] ?? 0) + cambio);
    if (cantidad) siguiente[id] = cantidad;
    else delete siguiente[id];
    return siguiente;
  });
  const anadir = () => {
    if (!producto) return;
    cambiarCantidad(producto.id, 1);
    setProducto(null);
    setPasoCarrito('carrito');
    setVerCarrito(true);
  };
  const confirmarEjemplo = () => {
    const nuevosErrores = validarCliente({ nombre, telefono, direccion, conDelivery: entrega === 'delivery' });
    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length) { setAviso('Completa los datos indicados para ver el resumen.'); return; }
    if (!metodoPago) { setAviso('Elige cómo pagarías.'); return; }
    if (entrega === 'delivery' && ubicacion.trim() && !/^https:\/\/(?:www\.)?(?:maps\.google\.[^/\s]+|google\.[^/\s]+\/maps|goo\.gl\/maps|maps\.app\.goo\.gl)\//i.test(ubicacion.trim())) { setAviso('Pega un enlace válido de Google Maps o deja la ubicación vacía.'); return; }
    setAviso('');
    setResumenPedido(mensajePedido('PED-EJEMPLO', {
      negocio: 'Grano de Barrio', enlace: window.location.href.split('?')[0],
      lineas: lineas.map(({ producto: p, cantidad }) => ({ nombre: p.nombre, opcion: '', precio: p.precio, cantidad })),
      total, entrega, direccion, referencia, nombre, telefono, metodoPago, ubicacion: entrega === 'delivery' ? ubicacion : '', nota,
    }, { detallado: true }));
    setCarrito({});
    setPasoCarrito('hecho');
  };

  useEffect(() => {
    if (!producto || zoom) return;
    const alPulsar = (evento: KeyboardEvent) => { if (evento.key === 'Escape') setProducto(null); };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [producto, zoom]);

  useEffect(() => {
    if (!verCarrito) return;
    const alPulsar = (evento: KeyboardEvent) => { if (evento.key === 'Escape') setVerCarrito(false); };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [verCarrito]);

  return <div className="ne ne-cafe">
    <div className="ne-aviso-demo"><span><Info size={15} /> Ejemplo de cafetería · fotos, productos y precios ilustrativos</span><a href="/panel/tu-pagina">Crear mi página <ArrowRight size={15} /></a></div>
    <nav className="ne-ejemplos" aria-label="Ejemplos de negocios"><b>Explorar ejemplos</b><a href="/ejemplos/la-baguette">La Baguette · panadería</a><a href="/ejemplos/barberia">Barbería · Luxury</a><a aria-current="page" href="/ejemplos/cafeteria">Cafetería · tienda</a><a href="/ejemplos/clinica-dental?diseno=clara">Clínica · agenda clara</a><a href="/ejemplos/clinica-dental?diseno=editorial">Clínica · agenda editorial</a><a href="/ejemplos/clinica-dental?diseno=tienda">Clínica · tienda</a></nav>
    <div className="ne-cafe-promo">CAFÉ DE ORIGEN PERUANO · PAN RECIÉN HORNEADO · TODOS LOS DÍAS</div>
    <header className="ne-cafe-header"><a className="ne-cafe-brand" href="/ejemplos/cafeteria"><span><Coffee size={22} /></span><span><b>Grano de Barrio</b><small>Café & panadería · Lima</small></span></a><div><a href="#menu">Ver carta</a><LlamarMesero negocio="Grano de Barrio" demo /><button type="button" aria-label={`Abrir carrito de ejemplo, ${unidades} ${unidades === 1 ? 'producto' : 'productos'}`} onClick={() => { setPasoCarrito('carrito'); setVerCarrito(true); }}><ShoppingBag size={19} />{unidades > 0 && <b>{unidades}</b>}</button></div></header>
    <div className="ne-cafe-layout">
      <aside className="ne-cafe-sidebar"><h2>Categorías</h2>{CATEGORIAS.map((c) => <button key={c} type="button" aria-pressed={categoria === c} onClick={() => setCategoria(c)}><span>{c}</span><small>{c === 'Todos' ? PRODUCTOS.length : c === 'Ofertas' ? PRODUCTOS.filter((p) => p.destacado).length : PRODUCTOS.filter((p) => p.categoria === c).length}</small></button>)}<p><MapPin size={16} /> Miraflores, Lima</p></aside>
      <main className="ne-cafe-main"><section className="ne-cafe-hero"><img src="/assets/negocios-ejemplo/cafeteria-hero.webp" alt="Barista preparando café junto a panes artesanales en Grano de Barrio" /><div><span>CAFÉ DE BARRIO · HECHO CON CALMA</span><h1>Café recién hecho.<br />Momentos para quedarse.</h1><p>Especialidad peruana, pan de masa madre y algo rico para cada pausa.</p><a href="#menu">Explorar la carta <ArrowRight size={17} /></a></div></section>
        <section className="ne-cafe-ofertas" aria-label="Ofertas especiales"><div className="ne-cafe-titulo"><span>✦ SELECCIÓN DE LA CASA</span><h2>Para probar hoy</h2></div><div className="ne-cafe-ofertas-grid">{PRODUCTOS.filter((p) => p.destacado).map((p) => <button key={p.id} type="button" onClick={() => setProducto(p)}><span className={`ne-cafe-foto ne-cafe-foto--${p.id}`} /><span><b>{p.nombre}</b><small>S/ {p.precio.toFixed(2)} <del>S/ {p.anterior.toFixed(2)}</del></small></span></button>)}</div></section>
        <section id="menu" className="ne-cafe-menu"><div className="ne-cafe-titulo"><span>HECHO AQUÍ CADA DÍA</span><h2>Nuestra carta</h2></div><label className="ne-cafe-buscar"><Search size={18} /><input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Busca café, pan o algo dulce" aria-label="Buscar en la carta" /></label><div className="ne-cafe-chips" aria-label="Filtrar por categoría">{CATEGORIAS.map((c) => <button type="button" key={c} aria-pressed={categoria === c} onClick={() => setCategoria(c)}>{c}</button>)}</div><p className="ne-cafe-resultados">{visibles.length} {visibles.length === 1 ? 'producto' : 'productos'}</p>{visibles.length ? <div className="ne-cafe-grid">{visibles.map((p) => <button key={p.id} type="button" className="ne-cafe-card" onClick={() => setProducto(p)}><span className={`ne-cafe-foto ne-cafe-foto--${p.id}`} />{p.destacado && <em>OFERTA</em>}<span className="ne-cafe-card-texto"><small>{p.categoria}</small><b>{p.nombre}</b><span>{p.descripcion}</span><strong>S/ {p.precio.toFixed(2)} {'anterior' in p && <del>S/ {p.anterior.toFixed(2)}</del>}</strong><i>Ver detalle <ArrowRight size={15} /></i></span></button>)}</div> : <div className="ne-vacio">No encontramos productos. Prueba otra búsqueda.</div>}</section>
      </main>
    </div>
    <footer className="ne-cafe-footer"><b>Grano de Barrio</b><span>Ejemplo creado con Vendemia. No se realizan pedidos ni cobros.</span><a href="/panel/tu-pagina">Crea tu catálogo</a></footer>
    {unidades > 0 && !verCarrito && !producto && <button className="ne-cafe-cartbar" type="button" onClick={() => { setPasoCarrito('carrito'); setVerCarrito(true); }}><ShoppingBag size={18} /><span>Ver mi pedido · {unidades} {unidades === 1 ? 'producto' : 'productos'}</span><b>S/ {total.toFixed(2)}</b></button>}
    {producto && <div className="ne-modal" role="presentation" onClick={() => setProducto(null)}>
      <div className="ne-modal-dialogo ne-cafe-modal" role="dialog" aria-modal="true" aria-label={producto.nombre} onClick={(e) => e.stopPropagation()}>
        <button className="ne-modal-cerrar" type="button" aria-label="Cerrar detalle" onClick={() => setProducto(null)}><X size={21} /></button>
        <button className="ne-modal-foto" type="button" aria-label={`Ampliar foto de ${producto.nombre}`} onClick={() => setZoom(true)}><span className={`ne-cafe-foto ne-cafe-foto--${producto.id}`} /><span className="ne-modal-ampliar"><ZoomIn size={17} /> Toca para ampliar</span></button>
        <div className="ne-modal-info"><small>{producto.categoria}</small><h2>{producto.nombre}</h2><p>{producto.descripcion}</p><strong>S/ {producto.precio.toFixed(2)}</strong><div className="ne-modal-acciones"><button type="button" onClick={anadir}><Plus size={19} /> Añadir al carrito</button><button type="button" onClick={() => setProducto(null)}>Seguir viendo</button></div><span>Esta muestra no envía pedidos ni realiza cobros.</span></div>
      </div>
    </div>}
    {producto && zoom && <ImagenAmpliada src={`/assets/negocios-ejemplo/cafe-${producto.id}.webp`} alt={producto.nombre} onClose={() => setZoom(false)} />}
    {verCarrito && <div className="ne-carrito-fondo" role="presentation" onClick={() => setVerCarrito(false)}><aside className="ne-carrito" role="dialog" aria-modal="true" aria-label="Pedido de ejemplo" onClick={(e) => e.stopPropagation()}>
      <div className="ne-carrito-cabecera"><div><small>GRANO DE BARRIO · DEMOSTRACIÓN</small><h2>{pasoCarrito === 'hecho' ? 'Pedido de ejemplo' : pasoCarrito === 'entrega' ? '¿Cómo lo recibirías?' : 'Tu pedido'}</h2></div><button type="button" aria-label="Cerrar carrito" onClick={() => setVerCarrito(false)}><X size={21} /></button></div>
      {pasoCarrito === 'hecho' && resumenPedido ? <div className="ne-carrito-contenido ne-carrito-exito"><span className="ne-carrito-exito-icono"><Check size={27} /></span><h3>Así llegaría por WhatsApp</h3><p className="ne-carrito-resumen">{resumenPedido.split(/(\*[^*\n]+\*)/g).map((parte, indice) => parte.startsWith('*') && parte.endsWith('*') ? <strong key={indice}>{parte.slice(1, -1)}</strong> : <span key={indice}>{parte}</span>)}</p><p>En la página publicada se guarda el pedido y aparece el botón para avisar por WhatsApp. Esta muestra no guardó ni envió datos.</p><button type="button" onClick={() => { setVerCarrito(false); setPasoCarrito('carrito'); }}>Volver a la carta</button></div> : <>
        {pasoCarrito === 'carrito' ? <div className="ne-carrito-contenido">{lineas.length ? <ul className="ne-carrito-lineas">{lineas.map(({ producto: p, cantidad }) => <li key={p.id}><span className={`ne-cafe-foto ne-cafe-foto--${p.id}`} /><div><b>{p.nombre}</b><small>S/ {p.precio.toFixed(2)} c/u</small><div className="ne-carrito-cantidad"><button type="button" aria-label={`Quitar una unidad de ${p.nombre}`} onClick={() => cambiarCantidad(p.id, -1)}>{cantidad === 1 ? <Trash2 size={16} /> : <Minus size={16} />}</button><output>{cantidad}</output><button type="button" aria-label={`Añadir una unidad de ${p.nombre}`} onClick={() => cambiarCantidad(p.id, 1)}><Plus size={16} /></button></div></div><strong>S/ {(p.precio * cantidad).toFixed(2)}</strong></li>)}</ul> : <div className="ne-carrito-vacio"><ShoppingBag size={32} /><h3>Tu carrito está vacío</h3><p>Explora la carta y añade algo que te guste.</p><button type="button" onClick={() => setVerCarrito(false)}>Ver la carta</button></div>}</div> : <div className="ne-carrito-contenido ne-carrito-entrega">
          <p>Prueba cómo un cliente completaría el pedido. Usa datos ficticios: esta muestra no los guarda ni envía.</p>
          <div className="ne-carrito-entrega-opciones" role="group" aria-label="Forma de entrega de ejemplo"><button type="button" aria-pressed={entrega === 'recojo'} onClick={() => setEntrega('recojo')}>Recojo en tienda</button><button type="button" aria-pressed={entrega === 'delivery'} onClick={() => setEntrega('delivery')}>Delivery</button></div>
          {entrega === 'delivery' && <><label>Dirección de entrega<input value={direccion} maxLength={200} placeholder="Av. Principal 123" onChange={(e) => setDireccion(e.target.value)} aria-invalid={Boolean(errores.direccion)} /></label>{errores.direccion && <small className="ne-carrito-error">{errores.direccion}</small>}<label>Referencia <small>(opcional)</small><input value={referencia} maxLength={200} placeholder="Frente al parque" onChange={(e) => setReferencia(e.target.value)} /></label><label>Enlace de Google Maps <small>(opcional)</small><input value={ubicacion} type="url" maxLength={300} placeholder="https://maps.google.com/?q=…" onChange={(e) => setUbicacion(e.target.value)} /></label></>}
          <label>Tu nombre<input value={nombre} autoComplete="off" maxLength={80} placeholder="María" onChange={(e) => setNombre(e.target.value)} aria-invalid={Boolean(errores.nombre)} /></label>{errores.nombre && <small className="ne-carrito-error">{errores.nombre}</small>}
          <label>Tu celular<input value={telefono} type="tel" inputMode="tel" autoComplete="off" maxLength={20} placeholder="987 654 321" onChange={(e) => setTelefono(e.target.value)} aria-invalid={Boolean(errores.telefono)} /></label>{errores.telefono && <small className="ne-carrito-error">{errores.telefono}</small>}
          <label>¿Cómo pagarás?<select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}><option value="">Elige una opción</option><option>Yape</option><option>Plin</option><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option></select></label>
          <label>Nota para el pedido <small>(opcional)</small><textarea value={nota} maxLength={300} placeholder="Ej. Café sin azúcar" onChange={(e) => setNota(e.target.value)} /></label>
          {aviso && <p className="ne-carrito-error" role="alert">{aviso}</p>}
        </div>}
        {lineas.length > 0 && <div className="ne-carrito-pie"><div><span>Total estimado</span><strong>S/ {total.toFixed(2)}</strong></div><button type="button" onClick={() => pasoCarrito === 'carrito' ? setPasoCarrito('entrega') : confirmarEjemplo()}>{pasoCarrito === 'carrito' ? 'Continuar pedido' : 'Simular confirmación'} <ArrowRight size={17} /></button>{pasoCarrito === 'entrega' && <button className="ne-carrito-volver" type="button" onClick={() => setPasoCarrito('carrito')}>Volver al carrito</button>}</div>}
      </>}
    </aside></div>}
  </div>;
}
