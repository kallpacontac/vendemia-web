'use client';

import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

const PRODUCTOS = [
  { nombre: 'Pomada mate', descripcion: 'Textura natural y fijación flexible para el peinado diario.', precio: 48, foto: '/assets/luxury-ejemplo/pomada.webp' },
  { nombre: 'Aceite para barba', descripcion: 'Suaviza la barba y cuida la piel sin sensación grasosa.', precio: 52, foto: '/assets/luxury-ejemplo/aceite-barba.webp' },
  { nombre: 'Champú diario', descripcion: 'Limpieza suave para preparar el cabello antes del corte.', precio: 42, foto: '/assets/luxury-ejemplo/champu.webp' },
  { nombre: 'Spray de sal marina', descripcion: 'Movimiento ligero y textura mate para un acabado natural.', precio: 46, foto: '/assets/luxury-ejemplo/spray-sal.webp' },
] as const;

export default function LuxuryCatalogoEjemplo() {
  const carrusel = useRef<HTMLDivElement>(null);
  const [seleccionado, setSeleccionado] = useState<(typeof PRODUCTOS)[number] | null>(null);
  const mover = (direccion: number) => carrusel.current?.scrollBy({ left: carrusel.current.clientWidth * .8 * direccion, behavior: 'smooth' });

  return <section id="catalogo-productos" className="tp-modulo tp-modulo--tienda tp-modulo--luxury-productos lx-ejemplo-productos" aria-label="Catálogo de productos de ejemplo">
    <div className="tp-luxury-productos__cabecera">
      <div><span>LA SELECCIÓN</span><h2 className="tp-seccion">Catálogo de productos</h2></div>
      <div className="tp-luxury-productos__controles" aria-label="Mover catálogo de productos">
        <button type="button" aria-label="Productos anteriores" onClick={() => mover(-1)}><ChevronLeft size={24} aria-hidden="true" /></button>
        <button type="button" aria-label="Productos siguientes" onClick={() => mover(1)}><ChevronRight size={24} aria-hidden="true" /></button>
      </div>
    </div>
    <div className="tp-grid" ref={carrusel}>
      {PRODUCTOS.map((producto) => <button key={producto.nombre} className="tp-tarjeta" type="button" onClick={() => setSeleccionado(producto)}>
        <span className="tp-tarjeta__foto" style={{ backgroundImage: `url("${producto.foto}")` }} aria-hidden="true" />
        <span className="tp-tarjeta__texto"><b>{producto.nombre}</b><span className="tp-tarjeta__desc">{producto.descripcion}</span><span className="tp-tarjeta__pie"><b>S/ {producto.precio}</b><small>Ver producto →</small></span></span>
      </button>)}
    </div>
    <p className="lx-ejemplo-productos__nota">Productos y precios ilustrativos. El catálogo publicado muestra los productos reales del negocio.</p>
    {seleccionado && <div className="lx-ejemplo-productos__velo" onMouseDown={(e) => { if (e.target === e.currentTarget) setSeleccionado(null); }}>
      <div className="lx-ejemplo-productos__modal" role="dialog" aria-modal="true" aria-label={seleccionado.nombre}>
        <button type="button" className="lx-ejemplo-productos__cerrar" aria-label="Cerrar producto" onClick={() => setSeleccionado(null)}><X size={22} aria-hidden="true" /></button>
        <img src={seleccionado.foto} alt={seleccionado.nombre} />
        <div><span>ATELIER NORTE · EJEMPLO</span><h2>{seleccionado.nombre}</h2><p>{seleccionado.descripcion}</p><strong>S/ {seleccionado.precio}</strong><small>Esta muestra no recibe pedidos.</small><button type="button" onClick={() => setSeleccionado(null)}>Seguir viendo</button></div>
      </div>
    </div>}
  </section>;
}
