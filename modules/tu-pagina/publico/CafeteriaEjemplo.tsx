'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Check, Coffee, Info, MapPin, Plus, Search, ShoppingBag, X } from 'lucide-react';
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
  const [carrito, setCarrito] = useState(0);
  const [aviso, setAviso] = useState(false);
  const visibles = useMemo(() => PRODUCTOS.filter((p) =>
    (categoria === 'Todos' || (categoria === 'Ofertas' ? p.destacado : p.categoria === categoria)) &&
    `${p.nombre} ${p.descripcion}`.toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es')),
  ), [categoria, busqueda]);
  const anadir = () => { setCarrito((n) => n + 1); setProducto(null); setAviso(true); };

  return <div className="ne ne-cafe">
    <div className="ne-aviso-demo"><span><Info size={15} /> Ejemplo de cafetería · fotos, productos y precios ilustrativos</span><a href="/panel/tu-pagina">Crear mi página <ArrowRight size={15} /></a></div>
    <nav className="ne-ejemplos" aria-label="Ejemplos de negocios"><b>Explorar ejemplos</b><a aria-current="page" href="/ejemplos/cafeteria">Cafetería · tienda</a><a href="/ejemplos/clinica-dental?diseno=clara">Clínica · agenda clara</a><a href="/ejemplos/clinica-dental?diseno=editorial">Clínica · agenda editorial</a><a href="/ejemplos/clinica-dental?diseno=tienda">Clínica · tienda</a></nav>
    <div className="ne-cafe-promo">CAFÉ DE ORIGEN PERUANO · PAN RECIÉN HORNEADO · TODOS LOS DÍAS</div>
    <header className="ne-cafe-header"><a className="ne-cafe-brand" href="/ejemplos/cafeteria"><span><Coffee size={22} /></span><span><b>Grano de Barrio</b><small>Café & panadería · Lima</small></span></a><div><a href="#menu">Ver carta</a><button type="button" aria-label={`Carrito de ejemplo, ${carrito} ${carrito === 1 ? 'producto' : 'productos'}`} onClick={() => setAviso(true)}><ShoppingBag size={19} />{carrito > 0 && <b>{carrito}</b>}</button></div></header>
    <div className="ne-cafe-layout">
      <aside className="ne-cafe-sidebar"><h2>Categorías</h2>{CATEGORIAS.map((c) => <button key={c} type="button" aria-pressed={categoria === c} onClick={() => setCategoria(c)}><span>{c}</span><small>{c === 'Todos' ? PRODUCTOS.length : c === 'Ofertas' ? PRODUCTOS.filter((p) => p.destacado).length : PRODUCTOS.filter((p) => p.categoria === c).length}</small></button>)}<p><MapPin size={16} /> Miraflores, Lima</p></aside>
      <main className="ne-cafe-main"><section className="ne-cafe-hero"><img src="/assets/negocios-ejemplo/cafeteria-hero.webp" alt="Barista preparando café junto a panes artesanales en Grano de Barrio" /><div><span>CAFÉ DE BARRIO · HECHO CON CALMA</span><h1>Café recién hecho.<br />Momentos para quedarse.</h1><p>Especialidad peruana, pan de masa madre y algo rico para cada pausa.</p><a href="#menu">Explorar la carta <ArrowRight size={17} /></a></div></section>
        <section className="ne-cafe-ofertas" aria-label="Ofertas especiales"><div className="ne-cafe-titulo"><span>✦ SELECCIÓN DE LA CASA</span><h2>Para probar hoy</h2></div><div className="ne-cafe-ofertas-grid">{PRODUCTOS.filter((p) => p.destacado).map((p) => <button key={p.id} type="button" onClick={() => setProducto(p)}><span className={`ne-cafe-foto ne-cafe-foto--${p.id}`} /><span><b>{p.nombre}</b><small>S/ {p.precio.toFixed(2)} <del>S/ {p.anterior.toFixed(2)}</del></small></span></button>)}</div></section>
        <section id="menu" className="ne-cafe-menu"><div className="ne-cafe-titulo"><span>HECHO AQUÍ CADA DÍA</span><h2>Nuestra carta</h2></div><label className="ne-cafe-buscar"><Search size={18} /><input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Busca café, pan o algo dulce" aria-label="Buscar en la carta" /></label><div className="ne-cafe-chips" aria-label="Filtrar por categoría">{CATEGORIAS.map((c) => <button type="button" key={c} aria-pressed={categoria === c} onClick={() => setCategoria(c)}>{c}</button>)}</div><p className="ne-cafe-resultados">{visibles.length} {visibles.length === 1 ? 'producto' : 'productos'}</p>{visibles.length ? <div className="ne-cafe-grid">{visibles.map((p) => <button key={p.id} type="button" className="ne-cafe-card" onClick={() => setProducto(p)}><span className={`ne-cafe-foto ne-cafe-foto--${p.id}`} />{p.destacado && <em>OFERTA</em>}<span className="ne-cafe-card-texto"><small>{p.categoria}</small><b>{p.nombre}</b><span>{p.descripcion}</span><strong>S/ {p.precio.toFixed(2)} {'anterior' in p && <del>S/ {p.anterior.toFixed(2)}</del>}</strong><i>Ver detalle <ArrowRight size={15} /></i></span></button>)}</div> : <div className="ne-vacio">No encontramos productos. Prueba otra búsqueda.</div>}</section>
      </main>
    </div>
    <footer className="ne-cafe-footer"><b>Grano de Barrio</b><span>Ejemplo creado con Vendemia. No se realizan pedidos ni cobros.</span><a href="/panel/tu-pagina">Crea tu catálogo</a></footer>
    {producto && <div className="ne-modal" role="presentation" onClick={() => setProducto(null)}><div className="ne-modal-dialogo" role="dialog" aria-modal="true" aria-label={producto.nombre} onClick={(e) => e.stopPropagation()}><button className="ne-modal-cerrar" type="button" aria-label="Cerrar detalle" onClick={() => setProducto(null)}><X size={21} /></button><span className={`ne-cafe-foto ne-cafe-foto--${producto.id}`} /><div><small>{producto.categoria}</small><h2>{producto.nombre}</h2><p>{producto.descripcion}</p><strong>S/ {producto.precio.toFixed(2)}</strong><button type="button" onClick={anadir}><Plus size={19} /> Añadir al carrito de ejemplo</button><span>Esta muestra no envía pedidos ni realiza cobros.</span></div></div></div>}
    {aviso && <div className="ne-toast" role="status"><Check size={18} /><span>Esta es una muestra. Tu catálogo real mostrará tus propios productos.</span><button type="button" aria-label="Cerrar aviso" onClick={() => setAviso(false)}><X size={17} /></button></div>}
  </div>;
}
