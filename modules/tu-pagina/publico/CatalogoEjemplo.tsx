'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Check, Info, Search, ShoppingBag, X } from 'lucide-react';
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

type Producto = (typeof PRODUCTOS)[number];
const CATEGORIAS = ['Todos', 'Hogar', 'Accesorios', 'Alimentos'] as const;

export default function CatalogoEjemplo({ plantilla, incrustado = false, reclamosHref }: { plantilla: PlantillaEjemplo; incrustado?: boolean; reclamosHref?: string }) {
  const [buscar, setBuscar] = useState('');
  const [categoria, setCategoria] = useState<string>('Todos');
  const [producto, setProducto] = useState<Producto | null>(null);
  const [agregados, setAgregados] = useState(0);
  const [aviso, setAviso] = useState(false);
  const visibles = useMemo(() => PRODUCTOS.filter((p) =>
    (categoria === 'Todos' || p.categoria === categoria) &&
    `${p.nombre} ${p.descripcion}`.toLocaleLowerCase('es').includes(buscar.trim().toLocaleLowerCase('es')),
  ), [buscar, categoria]);
  const opcion = PLANTILLAS_EJEMPLO.find((p) => p.id === plantilla)!;
  const marca = incrustado ? 'Vendemia · demo' : 'Ámbar Estudio';
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
      <div className="ce-tienda">
        <header className="ce-cabecera">
          <div className="ce-cabecera__marca"><span className="ce-monograma">{incrustado ? 'V' : 'A'}</span><span><b>{marca}</b><small>Objetos para disfrutar lo cotidiano</small></span></div>
          <div className="ce-cabecera__acciones"><button type="button" onClick={() => setAviso(true)}><Info size={18} aria-hidden="true" /><span>Nosotros</span></button><button type="button" onClick={() => setAviso(true)} aria-label={`Carrito de ejemplo, ${agregados} artículos`}><ShoppingBag size={19} aria-hidden="true" />{agregados > 0 && <b>{agregados}</b>}</button></div>
        </header>

        <div className="ce-hero">
          <div className="ce-hero__contenido"><span className="ce-hero__eyebrow">{incrustado ? 'VENDEMIA · CATÁLOGO DE EJEMPLO' : 'ÁMBAR ESTUDIO · HECHO CON CALMA'}</span><h1>Objetos que hacen<br />especial lo simple.</h1><p>Una pequeña selección para tu casa, tus días y tus ganas de regalar.</p><a href="#productos">Explorar catálogo <ArrowRight size={17} aria-hidden="true" /></a></div>
          <div className="ce-hero__arte" aria-hidden="true"><div className="ce-foto ce-foto--1" /><span>colección 2026</span></div>
        </div>

        <div className="ce-busqueda"><Search size={19} aria-hidden="true" /><input aria-label="Buscar productos de ejemplo" placeholder="¿Qué estás buscando?" value={buscar} onChange={(e) => setBuscar(e.target.value)} /></div>

        <div className="ce-contenido" id="productos">
          <aside className="ce-categorias"><h2>Categorías</h2>{CATEGORIAS.map((c) => <button key={c} type="button" aria-pressed={categoria === c} onClick={() => setCategoria(c)}><span>{c}</span><small>{c === 'Todos' ? PRODUCTOS.length : PRODUCTOS.filter((p) => p.categoria === c).length}</small></button>)}</aside>
          <main className="ce-catalogo"><div className="ce-catalogo__cabeza"><div><span>CATÁLOGO · {opcion.nombre.toUpperCase()}</span><h2>{categoria === 'Todos' ? 'Nuestra colección' : categoria}</h2></div><p>{visibles.length} {visibles.length === 1 ? 'producto' : 'productos'}</p></div>
            {visibles.length ? <div className="ce-grid">{visibles.map((p) => <button className="ce-producto" key={p.id} type="button" onClick={() => setProducto(p)}><span className={`ce-producto__foto ce-foto ce-foto--${p.foto}`}><em>Ver detalle</em></span><span className="ce-producto__cuerpo"><small>{p.categoria}</small><b>{p.nombre}</b><span className="ce-producto__descripcion">{p.descripcion}</span><strong>S/ {p.precio.toFixed(2)}</strong></span></button>)}</div> : <div className="ce-vacio">No encontramos productos con esa búsqueda. Prueba otra palabra o categoría.</div>}
          </main>
        </div>
        <footer className="ce-pie"><b>{marca}</b><span>Una tienda de muestra creada con Vendemia.</span>{reclamosHref && <a href={reclamosHref}>Libro de Reclamaciones</a>}<a href={`${principal}/panel/tu-pagina`}>Crea tu catálogo</a></footer>
      </div>
      {incrustado && <div className="ce-demo-enlace"><a href={`${principal}${urlEjemplo(plantilla)}`}>Ver las cuatro plantillas de ejemplo <ArrowRight size={16} aria-hidden="true" /></a></div>}

      {producto && <div className="ce-modal" role="presentation" onClick={() => setProducto(null)}><div className="ce-modal__dialogo" role="dialog" aria-modal="true" aria-label={producto.nombre} onClick={(e) => e.stopPropagation()}><button className="ce-modal__cerrar" aria-label="Cerrar" onClick={() => setProducto(null)}><X size={22} /></button><div className={`ce-modal__foto ce-foto ce-foto--${producto.foto}`} /><div className="ce-modal__datos"><small>{producto.categoria}</small><h2>{producto.nombre}</h2><strong>S/ {producto.precio.toFixed(2)}</strong><p>{producto.descripcion}</p><button onClick={() => { setAgregados((n) => n + 1); setProducto(null); setAviso(true); }}><ShoppingBag size={19} /> Añadir al carrito de ejemplo</button><span>Esta demo no envía pedidos ni realiza cobros.</span></div></div></div>}
      {aviso && <div className="ce-aviso" role="status"><Check size={19} aria-hidden="true" /><span>Esta es una muestra. Tu catálogo real mostrará tus productos, fotos y precios.</span><button aria-label="Cerrar aviso" onClick={() => setAviso(false)}><X size={17} /></button></div>}
    </div>
  );
}
