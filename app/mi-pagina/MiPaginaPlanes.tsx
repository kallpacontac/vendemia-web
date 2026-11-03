'use client';

import { useState } from 'react';
import { ArrowRight, Check, ChevronDown } from 'lucide-react';
import MiPaginaHeader, { MiPaginaLogo } from './MiPaginaHeader';
import { opcionesPagina } from './planes-data';

type Periodo = 'mensual' | 'trimestral' | 'anual';

const comparacion = [
  ['Productos en la carta', 'Hasta 45', 'Hasta 70', 'Ilimitados'],
  ['Carrito y pedidos por WhatsApp', 'Sí', 'Sí', 'Sí'],
  ['Enlace propio y código QR', 'Sí', 'Sí', 'Sí'],
  ['Portadas', 'Hasta 1', 'Hasta 2', 'Ilimitadas'],
  ['Popups y avisos', '—', 'Hasta 1', 'Ilimitados'],
  ['Opciones por producto', '—', 'Sí', 'Sí'],
  ['Historial de pedidos', '—', 'Sí', 'Sí'],
  ['Varias sedes y recojo en tienda', 'Sí', 'Sí', 'Sí'],
  ['Moneda configurable (PEN / USD)', 'Sí', 'Sí', 'Sí'],
  ['Buzón de sugerencias', '—', 'Sí', 'Sí'],
  ['Carta en varios idiomas', '—', 'Sí', 'Sí'],
  ['Libro de reclamos', '—', '—', 'Sí'],
  ['Captación de clientes', '—', '—', 'Sí'],
  ['Analítica de visitas', '—', '—', 'Sí'],
  ['Imprimir tickets', '—', 'Sí', 'Sí'],
] as const;

const preguntasPlanes = [
  { pregunta: '¿Hay prueba gratis?', respuesta: 'Sí. Puedes explorar tu carta durante 7 días sin tarjeta. Al terminar la prueba eliges cómo continuar desde tu panel.' },
  { pregunta: '¿Qué diferencia hay entre los planes?', respuesta: 'Básico incluye carrito y pedidos por WhatsApp. Interactivo añade variantes, avisos e historial. Pro amplía los límites e incluye captación de clientes y analítica.' },
  { pregunta: '¿Puedo cambiar de periodo?', respuesta: 'Puedes comparar los importes mensuales, trimestrales y anuales aquí. El periodo se elige al activar el plan desde tu panel.' },
  { pregunta: '¿Los precios incluyen IGV?', respuesta: 'Sí. Los importes mostrados en soles incluyen IGV.' },
] as const;

export default function MiPaginaPlanes() {
  const [periodo, setPeriodo] = useState<Periodo>('anual');

  return <div className="mp mp-planes-pagina">
    <MiPaginaHeader planes />
    <main>
      <nav className="mp-planes__miga" aria-label="Ruta de navegación"><a href="/mi-pagina">Inicio</a><span>/</span><span>Planes y precios</span></nav>
      <section className="mp-planes" aria-labelledby="mp-planes-titulo">
        <div className="mp-planes__intro"><h1 id="mp-planes-titulo">Planes de carta digital<br />interactiva</h1><p>Todos incluyen carrito, pedidos por WhatsApp sin comisiones, enlace propio y código QR. Empieza con 7 días gratis, sin tarjeta.</p><div className="mp-planes__periodos" role="group" aria-label="Periodo de pago">{(['mensual', 'trimestral', 'anual'] as const).map((valor) => <button type="button" key={valor} aria-pressed={periodo === valor} onClick={() => setPeriodo(valor)}>{valor === 'mensual' ? 'Mensual' : valor === 'trimestral' ? 'Trimestral' : 'Anual'}{valor === 'trimestral' && <small>−10%</small>}{valor === 'anual' && <small>Gratis 2 meses</small>}</button>)}</div><span className="mp-planes__moneda">Precios en soles. El pago se realiza desde tu panel.</span></div>
        <div className="mp-planes__grid">{opcionesPagina.map((opcion, indice) => { const precio = periodo === 'anual' ? opcion.anual : periodo === 'trimestral' ? Math.round(opcion.mensual * .9 * 100) / 100 : opcion.mensual; const cobro = periodo === 'anual' ? opcion.anual * 12 : periodo === 'trimestral' ? precio * 3 : precio; return <article className={`mp-plan mp-plan--${indice === 1 ? 'destacado' : 'claro'}`} key={opcion.nombre}>{indice === 1 && <span className="mp-plan__sello">El más elegido</span>}<h2>{opcion.nombre}</h2><p>{opcion.detalle}</p><div className="mp-plan__precio">{periodo !== 'mensual' && <del>S/ {opcion.mensual.toFixed(2)} al mes</del>}<strong>S/ {precio.toFixed(2)}</strong><span>al mes</span></div><span className="mp-plan__cobro">{periodo === 'mensual' ? 'IGV incluido.' : `Pagas S/ ${cobro.toFixed(2)} cada ${periodo === 'anual' ? 'año' : 'trimestre'}. IGV incluido.`}</span><a className="mp-plan__boton" href="/panel/tu-pagina">Probar 7 días gratis</a><small className="mp-plan__despues">Al terminar la prueba eliges cómo continuar.</small><div className="mp-plan__separador" aria-hidden="true"><i /><span /><i /></div><ul>{opcion.puntos.map((punto) => <li key={punto}><Check size={16} />{punto}</li>)}</ul></article>; })}</div>
        <div className="mp-planes__nota"><span><b>Pago desde tu panel.</b> Elige el plan y el periodo que necesitas.</span><span><b>7 días gratis, sin tarjeta.</b> Durante la prueba no se cobra nada.</span><span><b>Tu carta a tu manera.</b> Cambia productos, precios y contenido desde tu panel.</span></div>
      </section>
      <section className="mp-comparacion" aria-labelledby="mp-comparacion-titulo"><div className="mp-comparacion__intro"><h2 id="mp-comparacion-titulo">Comparación completa</h2><p>Qué incluye cada plan, función por función.</p></div><div className="mp-comparacion__desborde"><table><caption>Comparación de funciones entre los planes Básico, Interactivo y Pro</caption><thead><tr><th scope="col">Función</th><th scope="col">Básico</th><th scope="col">Interactivo</th><th scope="col">Pro</th></tr></thead><tbody><tr><th scope="row">Precio mensual</th>{opcionesPagina.map((opcion) => <td key={opcion.nombre}>S/ {opcion.mensual.toFixed(2)}</td>)}</tr>{comparacion.map(([nombre, basico, interactivo, pro]) => <tr key={nombre}><th scope="row">{nombre}</th><td>{basico}</td><td>{interactivo}</td><td>{pro}</td></tr>)}<tr><th scope="row">Prueba gratis</th><td>7 días</td><td>7 días</td><td>7 días</td></tr></tbody></table></div></section>
      <section className="mp-planes__otras"><a href="/mi-pagina#ejemplos"><span>Cartas con diseño</span><b>Explora nuestras páginas de ejemplo <ArrowRight size={18} /></b></a><a href="/contacto"><span>Páginas web a medida</span><b>Cuéntanos qué necesita tu negocio <ArrowRight size={18} /></b></a></section>
      <section className="mp-planes__preguntas" aria-labelledby="mp-planes-preguntas"><h2 id="mp-planes-preguntas">Preguntas sobre planes y pagos</h2><div>{preguntasPlanes.map(({ pregunta, respuesta }) => <details key={pregunta}><summary>{pregunta}<ChevronDown size={19} /></summary><p>{respuesta}</p></details>)}</div></section>
    </main>
    <footer className="mp-footer"><a className="mp-marca" href="/mi-pagina" aria-label="Vendemia Mi página, ir al inicio"><MiPaginaLogo /></a><span>Mi página · una herramienta de Vendemia</span><a href="/mi-pagina">Volver a Mi página <ArrowRight size={15} /></a></footer>
  </div>;
}
