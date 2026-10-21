'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Check, Info, Minus, Plus, Search, ShoppingBag, X } from 'lucide-react';
import { PLANTILLAS_EJEMPLO, urlEjemplo, type PlantillaEjemplo } from '@/modules/tu-pagina/dominio/ejemplo';
import './catalogo-ejemplo.css';

const PRODUCTOS = [
  { id: 0, nombre: 'Taza de cerámica artesanal', descripcion: 'Hecha a mano para acompañar cada pausa.', precio: 49, categoria: 'Hogar', foto: '0' },
  { id: 1, nombre: 'Vela ámbar', descripcion: 'Aroma suave de vainilla y madera.', precio: 39, categoria: 'Hogar', foto: '1' },
  { id: 2, nombre: 'Bolso tejido natural', descripcion: 'Ligero, resistente y listo para salir.', precio: 89, categoria: 'Accesorios', foto: '2' },
  { id: 3, nombre: 'Café de especialidad', descripcion: 'Tostado fresco, origen de la selva peruana.', precio: 42, categoria: 'Alimentos', foto: '3' },
  { id: 4, nombre: 'Monstera en maceta', descripcion: 'Un toque verde para cualquier rincón.', precio: 65, categoria: 'Hogar', foto: '4' },
  { id: 5, nombre: 'Chocolate artesanal', descripcion: 'Cacao peruano de sabor intenso.', precio: 28, categoria: 'Alimentos', foto: '5' },
] as const;

const PRODUCTOS_IMPULSO = [
  { id: 0, nombre: 'Zapatillas Ruta Uno', descripcion: 'Amortiguación ligera para sumar kilómetros cada día.', precio: 289, categoria: 'Calzado', foto: '0' },
  { id: 1, nombre: 'Cortaviento Tramo', descripcion: 'Capa ligera que acompaña el ritmo sin estorbar.', precio: 219, categoria: 'Ropa', foto: '1' },
  { id: 2, nombre: 'Mochila Kilómetro', descripcion: 'Espacio justo para moverte de la calle al entrenamiento.', precio: 179, categoria: 'Accesorios', foto: '2' },
  { id: 3, nombre: 'Zapatillas Circuito', descripcion: 'Ajuste cómodo y tracción para entrenar a tu manera.', precio: 319, categoria: 'Calzado', foto: '3' },
  { id: 4, nombre: 'Polo Aire', descripcion: 'Tejido respirable y tacto suave para cada sesión.', precio: 89, categoria: 'Ropa', foto: '4' },
  { id: 5, nombre: 'Gorra Ritmo', descripcion: 'Protección ligera para salir cuando quieras.', precio: 69, categoria: 'Accesorios', foto: '5' },
] as const;

type Producto = (typeof PRODUCTOS)[number] | (typeof PRODUCTOS_IMPULSO)[number];
const CATEGORIAS = ['Todos', 'Hogar', 'Accesorios', 'Alimentos'] as const;
const CATEGORIAS_IMPULSO = ['Todos', 'Calzado', 'Ropa', 'Accesorios'] as const;

export default function CatalogoEjemplo({ plantilla, incrustado = false, reclamosHref }: { plantilla: PlantillaEjemplo; incrustado?: boolean; reclamosHref?: string }) {
  const esImpulso = plantilla === 'impulso';
  const productos = esImpulso ? PRODUCTOS_IMPULSO : PRODUCTOS;
  const categorias = esImpulso ? CATEGORIAS_IMPULSO : CATEGORIAS;
  const [buscar, setBuscar] = useState('');
  const [categoria, setCategoria] = useState<string>('Todos');
  const [producto, setProducto] = useState<Producto | null>(null);
  const [carrito, setCarrito] = useState<Record<number, number>>({});
  const [verCarrito, setVerCarrito] = useState(false);
  const [aviso, setAviso] = useState(false);
  const visibles = useMemo(() => productos.filter((p) =>
    (categoria === 'Todos' || p.categoria === categoria) &&
    `${p.nombre} ${p.descripcion}`.toLocaleLowerCase('es').includes(buscar.trim().toLocaleLowerCase('es')),
  ), [buscar, categoria, productos]);
  const opcion = PLANTILLAS_EJEMPLO.find((p) => p.id === plantilla)!;
  const lineas = productos.map((p) => ({ producto: p, cantidad: carrito[p.id] ?? 0 })).filter((l) => l.cantidad > 0);
  const agregados = lineas.reduce((suma, l) => suma + l.cantidad, 0);
  const total = lineas.reduce((suma, l) => suma + l.cantidad * l.producto.precio, 0);
  const cambiarCantidad = (id: number, cambio: number) => setCarrito((actual) => {
    const siguiente = { ...actual };
    const cantidad = Math.max(0, (siguiente[id] ?? 0) + cambio);
    if (cantidad) siguiente[id] = cantidad;
    else delete siguiente[id];
    return siguiente;
  });
  const marca = incrustado ? 'Vendemia · demo' : esImpulso ? 'TRAZO / movimiento' : 'Ámbar Estudio';
  const principal = incrustado ? (process.env.NEXT_PUBLIC_SITE_URL || 'https://vendemias.com').replace(/\/+$/, '') : '';

  return (
    <div className={`ce ce--${plantilla}${incrustado ? ' ce--incrustado' : ''}`}>
      <div className="ce-demo-barra">
        <span><Info size={15} aria-hidden="true" /> Catálogo de ejemplo · los productos y precios son ilustrativos</span>
        {!incrustado && <a href="/panel/tu-pagina">Crear mi página <ArrowRight size={15} aria-hidden="true" /></a>}
      </div>
      {!incrustado && (
        <div className="ce-selector" aria-label="Plantillas de ejemplo">
          <div><b>Explora las plantillas</b><span>Así las verán tus clientes</span></div>
          <nav>
            {PLANTILLAS_EJEMPLO.map((p) => <a key={p.id} href={urlEjemplo(p.id)} aria-current={plantilla === p.id ? 'page' : undefined}>{p.nombre}</a>)}
          </nav>
        </div>
      )}
      {!incrustado && <div className="ce-negocios"><span>¿Quieres ver un negocio completo?</span><a href="/ejemplos/cafeteria">Cafetería · tienda <ArrowRight size={14} /></a><a href="/ejemplos/clinica-dental?diseno=clara">Clínica dental · agenda <ArrowRight size={14} /></a></div>}
      <div className="ce-tienda">
        <header className="ce-cabecera">
          <div className="ce-cabecera__marca"><span className="ce-monograma">{incrustado ? 'V' : esImpulso ? 'T' : 'A'}</span><span><b>{marca}</b><small>{esImpulso ? 'Hecho para seguir' : 'Objetos para disfrutar lo cotidiano'}</small></span></div>
          <div className="ce-cabecera__acciones"><button type="button" onClick={() => setAviso(true)}><Info size={18} aria-hidden="true" /><span>Nosotros</span></button><button type="button" onClick={() => setVerCarrito(true)} aria-label={`Carrito de ejemplo, ${agregados} artículos`}><ShoppingBag size={19} aria-hidden="true" />{agregados > 0 && <b>{agregados}</b>}</button></div>
        </header>

        <div className="ce-hero">
          <div className="ce-hero__contenido"><span className="ce-hero__eyebrow">{esImpulso ? 'TRAZO · COLECCIÓN EN MOVIMIENTO' : incrustado ? 'VENDEMIA · CATÁLOGO DE EJEMPLO' : 'ÁMBAR ESTUDIO · HECHO CON CALMA'}</span><h1>{esImpulso ? <>ENCUENTRA<br />TU RITMO.</> : <>Objetos que hacen<br />especial lo simple.</>}</h1><p>{esImpulso ? 'Calzado, ropa y accesorios para moverte a tu manera.' : 'Una pequeña selección para tu casa, tus días y tus ganas de regalar.'}</p><a href="#productos">{esImpulso ? 'Comprar la colección' : 'Explorar catálogo'} <ArrowRight size={17} aria-hidden="true" /></a></div>
          {!esImpulso && <div className="ce-hero__arte" aria-hidden="true"><div className="ce-foto ce-foto--1" /><span>colección 2026</span></div>}
        </div>

        {esImpulso && <div className="ce-colecciones" aria-label="Explorar por categoría">
          {CATEGORIAS_IMPULSO.map((c, i) => <button key={c} type="button" className={`ce-coleccion ce-coleccion--${i}`} onClick={() => { setCategoria(c); document.getElementById('productos')?.scrollIntoView({ behavior: 'smooth' }); }}><span>{c === 'Todos' ? 'Toda la colección' : c}</span><ArrowRight size={20} aria-hidden="true" /></button>)}
        </div>}

        <div className="ce-busqueda"><Search size={19} aria-hidden="true" /><input aria-label="Buscar productos de ejemplo" placeholder="¿Qué estás buscando?" value={buscar} onChange={(e) => setBuscar(e.target.value)} /></div>

        <div className="ce-contenido" id="productos">
          <aside className="ce-categorias"><h2>Categorías</h2>{categorias.map((c) => <button key={c} type="button" aria-pressed={categoria === c} onClick={() => setCategoria(c)}><span>{c}</span><small>{c === 'Todos' ? productos.length : productos.filter((p) => p.categoria === c).length}</small></button>)}</aside>
          <main className="ce-catalogo"><div className="ce-catalogo__cabeza"><div><span>CATÁLOGO · {opcion.nombre.toUpperCase()}</span><h2>{categoria === 'Todos' ? 'Nuestra colección' : categoria}</h2></div><p>{visibles.length} {visibles.length === 1 ? 'producto' : 'productos'}</p></div>
            {visibles.length ? <div className="ce-grid">{visibles.map((p) => <button className="ce-producto" key={p.id} type="button" onClick={() => setProducto(p)}><span className={`ce-producto__foto ce-foto ce-foto--${p.foto}`}><em>Ver detalle</em></span><span className="ce-producto__cuerpo"><small>{p.categoria}</small><b>{p.nombre}</b><span className="ce-producto__descripcion">{p.descripcion}</span><strong>S/ {p.precio.toFixed(2)}</strong></span></button>)}</div> : <div className="ce-vacio">No encontramos productos con esa búsqueda. Prueba otra palabra o categoría.</div>}
          </main>
        </div>
        <footer className="ce-pie"><b>{marca}</b><span>Una tienda de muestra creada con Vendemia.</span>{reclamosHref && <a href={reclamosHref}>Libro de Reclamaciones</a>}<a href={`${principal}/panel/tu-pagina`}>Crea tu catálogo</a></footer>
      </div>
      {incrustado && <div className="ce-demo-enlace"><a href={`${principal}${urlEjemplo(plantilla)}`}>Ver las plantillas de ejemplo <ArrowRight size={16} aria-hidden="true" /></a></div>}

      {producto && <div className="ce-modal" role="presentation" onClick={() => setProducto(null)}><div className="ce-modal__dialogo" role="dialog" aria-modal="true" aria-label={producto.nombre} onClick={(e) => e.stopPropagation()}><button className="ce-modal__cerrar" aria-label="Cerrar" onClick={() => setProducto(null)}><X size={22} /></button><div className={`ce-modal__foto ce-foto ce-foto--${producto.foto}`} /><div className="ce-modal__datos"><small>{producto.categoria}</small><h2>{producto.nombre}</h2><strong>S/ {producto.precio.toFixed(2)}</strong><p>{producto.descripcion}</p><button onClick={() => { cambiarCantidad(producto.id, 1); setProducto(null); setVerCarrito(true); }}><ShoppingBag size={19} /> Añadir al carrito de ejemplo</button><span>Esta demo no envía pedidos ni realiza cobros.</span></div></div></div>}
      {verCarrito && <div className="ce-modal" role="presentation" onClick={() => setVerCarrito(false)}><div className="ce-carrito" role="dialog" aria-modal="true" aria-label="Carrito de ejemplo" onClick={(e) => e.stopPropagation()}><div className="ce-carrito__cabeza"><div><small>TIENDA DE EJEMPLO</small><h2>Tu carrito</h2></div><button type="button" aria-label="Cerrar carrito" onClick={() => setVerCarrito(false)}><X size={22} /></button></div>{lineas.length ? <><div className="ce-carrito__lineas">{lineas.map(({ producto: p, cantidad }) => <div className="ce-carrito__linea" key={p.id}><span className={`ce-foto ce-foto--${p.foto}`} /><div><b>{p.nombre}</b><small>S/ {p.precio.toFixed(2)} c/u</small><div className="ce-carrito__cantidad"><button type="button" aria-label={`Quitar una unidad de ${p.nombre}`} onClick={() => cambiarCantidad(p.id, -1)}><Minus size={16} /></button><output>{cantidad}</output><button type="button" aria-label={`Añadir una unidad de ${p.nombre}`} onClick={() => cambiarCantidad(p.id, 1)}><Plus size={16} /></button></div></div><strong>S/ {(p.precio * cantidad).toFixed(2)}</strong></div>)}</div><div className="ce-carrito__pie"><div><span>Total estimado</span><strong>S/ {total.toFixed(2)}</strong></div><button type="button" onClick={() => { setCarrito({}); setVerCarrito(false); setAviso(true); }}>Simular pedido <ArrowRight size={17} /></button><small>Esta muestra no envía pedidos ni realiza cobros.</small></div></> : <div className="ce-carrito__vacio"><ShoppingBag size={33} /><p>Tu carrito está vacío.</p><button type="button" onClick={() => setVerCarrito(false)}>Seguir explorando</button></div>}</div></div>}
      {aviso && <div className="ce-aviso" role="status"><Check size={19} aria-hidden="true" /><span>Esta es una muestra. Tu catálogo real mostrará tus productos, fotos y precios.</span><button aria-label="Cerrar aviso" onClick={() => setAviso(false)}><X size={17} /></button></div>}
    </div>
  );
}
