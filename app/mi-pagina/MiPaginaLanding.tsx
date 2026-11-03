'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, Bell, CalendarDays, Camera, Check, ChevronDown, Clock3, LayoutGrid, Link2, MapPin, Menu, Palette, Plus, ShoppingBag, Smartphone, Tags, X } from 'lucide-react';
import { siWhatsapp } from 'simple-icons';

const palabras = ['local', 'carta', 'sitio'] as const;
const banderas = [
  { pais: 'Perú', codigo: 'pe' }, { pais: 'México', codigo: 'mx' },
  { pais: 'Colombia', codigo: 'co' }, { pais: 'Chile', codigo: 'cl' },
  { pais: 'Argentina', codigo: 'ar' }, { pais: 'Ecuador', codigo: 'ec' },
  { pais: 'Bolivia', codigo: 'bo' }, { pais: 'Paraguay', codigo: 'py' },
  { pais: 'Uruguay', codigo: 'uy' }, { pais: 'Brasil', codigo: 'br' },
  { pais: 'Panamá', codigo: 'pa' }, { pais: 'Guatemala', codigo: 'gt' },
  { pais: 'El Salvador', codigo: 'sv' }, { pais: 'Honduras', codigo: 'hn' },
  { pais: 'República Dominicana', codigo: 'do' }, { pais: 'Puerto Rico', codigo: 'pr' },
  { pais: 'España', codigo: 'es' },
] as const;

function MiPaginaLogo() {
  return <span className="mp-logo">Vendem<span className="mp-logo__i">ı</span>a</span>;
}

const ejemplos = [
  { nombre: 'La Baguette', rubro: 'Panadería · carta visual', imagen: '/assets/mi-pagina/previews/la-baguette.webp', alto: 1712, href: '/ejemplos/la-baguette', tono: 'pan' },
  { nombre: 'Grano de Barrio', rubro: 'Cafetería · tienda', imagen: '/assets/mi-pagina/previews/cafeteria.webp', alto: 2118, href: '/ejemplos/cafeteria', tono: 'cafe' },
  { nombre: 'Atelier Norte', rubro: 'Barbería · servicios y agenda', imagen: '/assets/mi-pagina/previews/barberia.webp', alto: 2577, href: '/ejemplos/barberia', tono: 'barberia' },
  { nombre: 'Zona Gol', rubro: 'Canchas · reserva por hora', imagen: '/assets/mi-pagina/previews/canchas.webp', alto: 1403, href: '/ejemplos/canchas', tono: 'cancha' },
  { nombre: 'Sonrisa Norte', rubro: 'Clínica · citas', imagen: '/assets/mi-pagina/previews/clinica.webp', alto: 3805, href: '/ejemplos/clinica-dental?diseno=clara', tono: 'clinica' },
] as const;

const pasos = [
  { numero: '01', titulo: 'Elige cómo atenderás', texto: 'Configura tu página como tienda, agenda o ambas. Después escoge el diseño que mejor represente a tu negocio.' },
  { numero: '02', titulo: 'Agrega lo que ofreces', texto: 'Publica productos, servicios, fotos, precios y horarios desde tu panel. Tu contenido, tu identidad.' },
  { numero: '03', titulo: 'Comparte tu enlace', texto: 'Tus clientes abren la página desde el celular y pueden pedir o reservar sin instalar otra aplicación.' },
] as const;

const funciones = [
  { icono: Camera, titulo: 'Fotos de tus productos', texto: 'Muestra lo que vendes con imágenes y detalles claros.' },
  { icono: Tags, titulo: 'Precios editables', texto: 'Actualiza precios y descripciones desde tu panel.' },
  { icono: LayoutGrid, titulo: 'Categorías para explorar', texto: 'Organiza productos y servicios para encontrarlos rápido.' },
  { icono: ShoppingBag, titulo: 'Pedidos con carrito', texto: 'Tus clientes revisan cantidades y el total antes de pedir.' },
  { icono: CalendarDays, titulo: 'Reservas en pocos pasos', texto: 'Eligen servicio, fecha y horario desde el celular.' },
  { icono: Clock3, titulo: 'Canchas por hora', texto: 'Ven modalidades y turnos disponibles de inmediato.' },
  { icono: Bell, titulo: 'Aviso si se libera un turno', texto: 'Pueden dejar sus datos cuando un horario está ocupado.' },
  { icono: Plus, titulo: 'Complementos opcionales', texto: 'Suma extras a una reserva, como bebidas o snacks.' },
  { icono: MapPin, titulo: 'Tu ubicación a mano', texto: 'Indica dónde te encuentran y cómo llegar.' },
  { icono: Palette, titulo: 'Tu identidad visual', texto: 'Personaliza portada, colores y fotos de tu negocio.' },
  { icono: Link2, titulo: 'Un enlace para compartir', texto: 'Lleva a tus clientes directo a tu página.' },
  { icono: Smartphone, titulo: 'Pensada para móviles', texto: 'Contenido y botones cómodos de usar en pantalla pequeña.' },
] as const;

const opcionesPagina = [
  { nombre: 'Básico', detalle: 'Tu carta con carrito y pedidos directos a tu WhatsApp. Ideal para empezar.', mensual: 29.9, anual: 24.9, puntos: ['Productos en la carta (hasta 45)', 'Carrito y pedidos por WhatsApp', 'Enlace propio y código QR', 'Portadas (hasta 1)', 'Varias sedes y recojo en tienda', 'Moneda configurable (PEN / USD)'] },
  { nombre: 'Interactivo', detalle: 'Más productos, variantes, popup e historial de pedidos para negocios que crecen.', mensual: 59.9, anual: 49.9, puntos: ['Productos en la carta (hasta 70)', 'Carrito y pedidos por WhatsApp', 'Enlace propio y código QR', 'Portadas (hasta 2)', 'Popups y avisos (hasta 1)', 'Opciones por producto (variantes y adicionales)', 'Historial de pedidos', 'Varias sedes y recojo en tienda', 'Moneda configurable (PEN / USD)', 'Buzón de sugerencias', 'Carta en varios idiomas', 'Imprimir tickets (ticketera)'] },
  { nombre: 'Pro', detalle: 'Todo ilimitado, con captación de clientes, libro de reclamos y analítica de visitas.', mensual: 69.9, anual: 57.9, puntos: ['Productos en la carta (ilimitados)', 'Carrito y pedidos por WhatsApp', 'Enlace propio y código QR', 'Portadas (ilimitadas)', 'Popups y avisos (ilimitados)', 'Opciones por producto (variantes y adicionales)', 'Historial de pedidos', 'Varias sedes y recojo en tienda', 'Moneda configurable (PEN / USD)', 'Buzón de sugerencias', 'Carta en varios idiomas', 'Libro de reclamos en tu carta', 'Captación de clientes (registro y exportación)', 'Reporte y analítica de visitas', 'Imprimir tickets (ticketera)'] },
] as const;

const preguntas = [
  { pregunta: '¿Puedo cambiar las fotos y los colores?', respuesta: 'Sí. Desde Mi página puedes cambiar el nombre, la portada, el color y el contenido del negocio. Los ejemplos muestran cómo se ve cada diseño con datos de muestra.' },
  { pregunta: '¿La página sirve para reservar y vender?', respuesta: 'Sí. Puedes usarla como agenda, tienda o una combinación de ambas, según la forma en que atiende tu negocio.' },
  { pregunta: '¿Los ejemplos reciben pedidos reales?', respuesta: 'No. Son demostraciones para explorar el diseño y los flujos; no guardan pedidos, reservas ni pagos.' },
] as const;

export default function MiPaginaLanding() {
  const raiz = useRef<HTMLDivElement>(null);
  const carrusel = useRef<HTMLDivElement>(null);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [cantidad, setCantidad] = useState(0);
  const [total, setTotal] = useState(0);
  const [segundosPromo, setSegundosPromo] = useState(6948);
  const [categoria, setCategoria] = useState<'Favoritos' | 'Bebidas'>('Favoritos');
  const [aviso, setAviso] = useState(false);
  const [tecleado, setTecleado] = useState<string>(palabras[0]);
  const [periodo, setPeriodo] = useState<'mensual' | 'trimestral' | 'anual'>('anual');

  const agregarProducto = (precio: number) => {
    setCantidad((actual) => actual + 1);
    setTotal((actual) => actual + precio);
  };

  const relojPromo = [Math.floor(segundosPromo / 3600), Math.floor((segundosPromo % 3600) / 60), segundosPromo % 60]
    .map((valor) => String(valor).padStart(2, '0')).join(':');

  useEffect(() => {
    const fin = Date.now() + 6948 * 1000;
    const intervalo = window.setInterval(() => setSegundosPromo(Math.max(0, Math.ceil((fin - Date.now()) / 1000))), 1000);
    return () => window.clearInterval(intervalo);
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let indice = 0;
    let longitud = palabras[0].length;
    let borrando = true;
    let temporizador: number;
    const escribir = () => {
      if (borrando) {
        longitud -= 1;
        setTecleado(palabras[indice].slice(0, longitud));
        if (longitud === 0) { borrando = false; indice = (indice + 1) % palabras.length; }
      } else {
        longitud += 1;
        setTecleado(palabras[indice].slice(0, longitud));
        if (longitud === palabras[indice].length) borrando = true;
      }
      temporizador = window.setTimeout(escribir, longitud === palabras[indice].length && borrando ? 2200 : longitud === 0 ? 320 : borrando ? 85 : 125);
    };
    temporizador = window.setTimeout(escribir, 2400);
    const contenedor = raiz.current;
    const elementos = contenedor?.querySelectorAll<HTMLElement>('.mp-reveal');
    if (!contenedor || !elementos?.length || !('IntersectionObserver' in window)) return () => window.clearTimeout(temporizador);
    contenedor.classList.add('mp-motion');
    const observador = new IntersectionObserver((entradas) => {
      entradas.forEach((entrada) => {
        if (!entrada.isIntersecting) return;
        entrada.target.classList.add('mp-visible');
        observador.unobserve(entrada.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });
    elementos.forEach((elemento) => observador.observe(elemento));
    return () => { window.clearTimeout(temporizador); observador.disconnect(); };
  }, []);

  return <div className="mp" ref={raiz}>
    <header className="mp-nav">
      <a className="mp-marca" href="/" aria-label="Vendemia, ir al inicio"><MiPaginaLogo /></a>
      <nav className={menuAbierto ? 'mp-nav__enlaces abierto' : 'mp-nav__enlaces'} aria-label="Mi página">
        <a href="#soluciones" onClick={() => setMenuAbierto(false)}>Qué puedes crear</a>
        <a href="#como-funciona" onClick={() => setMenuAbierto(false)}>Cómo funciona</a>
        <a href="#ejemplos" onClick={() => setMenuAbierto(false)}>Ejemplos</a>
        <a href="#preguntas" onClick={() => setMenuAbierto(false)}>Preguntas</a>
      </nav>
      <div className="mp-nav__acciones"><a className="mp-nav__volver" href="/">Conoce Vendemia</a><a className="mp-boton mp-boton--chico" href="/panel/tu-pagina">Crear mi página <ArrowRight size={16} /></a></div>
      <button className="mp-nav__menu" type="button" aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuAbierto} onClick={() => setMenuAbierto(!menuAbierto)}>{menuAbierto ? <X size={24} /> : <Menu size={24} />}</button>
    </header>

    <main>
      <section className="mp-hero" aria-labelledby="mp-titulo">
        <div className="mp-hero__texto">
          <span className="mp-etiqueta"><span /> Tu negocio en un enlace, sin instalar apps</span>
          <h1 id="mp-titulo" aria-label="Tu página digital para recibir pedidos y reservas">Tu <span className="mp-escritura" aria-hidden="true"><span>{tecleado}</span><i /></span> digital<br /><span className="mp-hero__resto">para recibir pedidos<br />y reservas.</span></h1>
          <p>Tus clientes ven lo que ofreces, eligen sus productos o un horario y te contactan desde la misma página. Tú cambias fotos, precios y disponibilidad cuando quieras.</p>
          <div className="mp-hero__acciones"><a className="mp-boton" href="/panel/tu-pagina">Crear mi página <ArrowRight size={19} /></a><a className="mp-boton mp-boton--borde" href="#ejemplos">Explorar ejemplos</a></div>
          <div className="mp-hero__nota"><Check size={16} /> Tus clientes la abren desde el celular, sin instalar nada.</div>
        </div>
        <div className="mp-hero__visual" aria-label="Vista interactiva de una página de ejemplo">
          <span className="mp-hero__orbita" aria-hidden="true" />
          <span className="mp-hero__mancha mp-hero__mancha--uno" aria-hidden="true" />
          <span className="mp-hero__mancha mp-hero__mancha--dos" aria-hidden="true" />
          <span className="mp-flotante mp-flotante--promo"><small>Tu promo termina en</small><b>{relojPromo}</b></span>
          <span className="mp-flotante mp-flotante--sinapp"><span className="mp-flotante__sello"><Check size={15} /></span> Sin instalar apps</span>
          <div className="mp-telefono">
            <div className="mp-telefono__barra"><span /></div>
            <div className="mp-telefono__portada"><span>grano-de-barrio.vendemia.com</span><strong>Grano de Barrio</strong><small><i /> Abierto ahora · Pedidos y recojo</small></div>
            <div className="mp-telefono__contenido">
              <div className="mp-telefono__categorias"><button type="button" className={categoria === 'Favoritos' ? 'activo' : ''} onClick={() => setCategoria('Favoritos')}>Favoritos</button><button type="button" className={categoria === 'Bebidas' ? 'activo' : ''} onClick={() => setCategoria('Bebidas')}>Bebidas</button></div>
              <div className="mp-telefono__producto"><span className="mp-telefono__foto" /><div><b>{categoria === 'Bebidas' ? 'Cappuccino' : 'Café de la casa'}</b><small>{categoria === 'Bebidas' ? 'Espresso y leche cremosa' : 'Tostado fresco cada mañana'}</small><strong>S/ {categoria === 'Bebidas' ? '14' : '12'}.00</strong></div><button type="button" aria-label="Agregar producto de ejemplo" onClick={() => agregarProducto(categoria === 'Bebidas' ? 14 : 12)}><Plus size={16} /></button></div>
              <div className="mp-telefono__producto"><span className="mp-telefono__foto mp-telefono__foto--dos" /><div><b>Croissant de mantequilla</b><small>Horneado hoy</small><strong>S/ 9.00</strong></div><button type="button" aria-label="Agregar croissant de ejemplo" onClick={() => agregarProducto(9)}><Plus size={16} /></button></div>
              <div className="mp-telefono__producto"><span className="mp-telefono__foto mp-telefono__foto--tres" /><div><b>Queque de naranja</b><small>Porción del día</small><strong>S/ 8.00</strong></div><button type="button" aria-label="Agregar queque de ejemplo" onClick={() => agregarProducto(8)}><Plus size={16} /></button></div>
            </div>
            <div className="mp-telefono__pie"><span><b>{cantidad} {cantidad === 1 ? 'producto' : 'productos'}</b><strong>S/ {total.toFixed(2)}</strong></span><button type="button" onClick={() => setAviso(true)} disabled={cantidad === 0}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={siWhatsapp.path} /></svg> Enviar pedido</button></div>
          </div>
          <span className="mp-flotante mp-flotante--ubicacion"><MapPin size={15} /> Elige entrega o recojo</span>
          <a className="mp-qr" href="/ejemplos/cafeteria" aria-label="Abrir el ejemplo de cafetería del código QR"><Image src="/assets/mi-pagina/qr-cafeteria.svg" alt="Código QR del ejemplo Grano de Barrio" width={132} height={132} unoptimized /></a>
          <p>Prueba la vista: elige una categoría y agrega un producto.</p>
        </div>
      </section>

      <section className="mp-banderas" aria-labelledby="mp-banderas-titulo"><h2 id="mp-banderas-titulo">PENSADA PARA NEGOCIOS DE LATINOAMÉRICA Y ESPAÑA</h2><div className="mp-banderas__ventana"><div className="mp-banderas__pista">{[0, 1].map((repeticion) => <ul key={repeticion} aria-hidden={repeticion === 1}>{banderas.map(({ pais, codigo }) => <li key={codigo}><Image src={`/assets/mi-pagina/banderas/${codigo}.png`} alt={repeticion === 0 ? pais : ''} width={60} height={40} loading="eager" unoptimized /></li>)}</ul>)}</div></div></section>

      <div className="mp-cinta" aria-label="Tipos de negocio"><span>UNA PÁGINA PARA TU FORMA DE TRABAJAR</span><div className="mp-cinta__rubros"><span>Catálogo</span><i /> <span>Reservas</span><i /> <span>Pedidos</span><i /> <span>Canchas</span></div></div>

      <section className="mp-seccion mp-soluciones-seccion" id="soluciones">
        <div className="mp-soluciones-seccion__intro mp-reveal"><h2>Tres formas de hacer más<br />con tu página</h2><p>Elige la que va con tu negocio hoy. Puedes sumar otra cuando la necesites.</p></div>
        <div className="mp-soluciones-grid">
          <a href="/ejemplos/cafeteria" className="mp-solucion mp-solucion--principal mp-reveal"><span className="mp-solucion__icono"><ShoppingBag size={27} /></span><h3>Catálogo interactivo</h3><p>Muestra tus productos con fotos, precios y carrito. Tus clientes preparan un pedido claro desde el celular y tú administras el contenido desde tu panel.</p><ul><li><Check size={18} /> Carrito y pedidos por WhatsApp</li><li><Check size={18} /> Productos y precios editables</li><li><Check size={18} /> Tu marca en una página propia</li><li><Check size={18} /> Enlace fácil de compartir</li></ul><b>Ver catálogo de ejemplo <ArrowRight size={19} /></b></a>
          <div className="mp-soluciones-grid__secundarias">
            <a href="/ejemplos/clinica-dental?diseno=clara" className="mp-solucion mp-solucion--secundaria mp-reveal"><span className="mp-solucion__icono"><CalendarDays size={27} /></span><h3>Agenda para tus servicios</h3><p>Tus clientes ven los servicios, eligen una fecha y encuentran horarios disponibles en pocos toques.</p><b>Ver agenda de ejemplo <ArrowRight size={19} /></b></a>
            <a href="/ejemplos/canchas" className="mp-solucion mp-solucion--destacada mp-reveal"><span className="mp-solucion__icono"><Clock3 size={27} /></span><h3>Canchas listas para reservar</h3><p>Modalidad, día y hora a primera vista, con extras opcionales y lista de espera para turnos ocupados.</p><b>Ver canchas de ejemplo <ArrowRight size={19} /></b></a>
          </div>
        </div>
      </section>

      <section className="mp-pasos" id="como-funciona"><div className="mp-pasos__layout"><div className="mp-pasos__intro mp-reveal"><h2>Lista en tres pasos</h2><p>Sin instalar programas ni contratar a un programador.</p><a href="/panel/tu-pagina">Crear mi página <ArrowRight size={18} /></a></div><ol className="mp-pasos__lista">{pasos.map((paso) => <li className="mp-reveal" key={paso.numero}><span className="mp-pasos__numero">{Number(paso.numero)}</span><div><h3>{paso.titulo}</h3><p>{paso.texto}</p></div></li>)}</ol></div></section>

      <section className="mp-seccion mp-funciones" aria-labelledby="mp-funciones-titulo"><div className="mp-funciones__intro mp-reveal"><span className="mp-sobre">LO IMPORTANTE, A MANO</span><h2 id="mp-funciones-titulo">Todo lo que tu página<br />puede hacer</h2><p>Una experiencia clara para tus clientes y contenido que puedes gestionar desde tu panel.</p></div><div className="mp-funciones__grid">{funciones.map(({ icono: Icono, titulo, texto }) => <div className="mp-funcion mp-reveal" key={titulo}><span className="mp-funcion__icono"><Icono size={24} /></span><div><h3>{titulo}</h3><p>{texto}</p></div></div>)}</div></section>

      <section className="mp-ejemplos" id="ejemplos"><div className="mp-ejemplos__intro mp-reveal"><div><span className="mp-sobre">HECHOS CON VENDEMIA</span><h2>Páginas de ejemplo<br />en acción</h2><p>Pasa el cursor por un celular para recorrer la página. Ábrela para probar el flujo completo; nombres y precios son ilustrativos.</p></div><div className="mp-ejemplos__controles"><button type="button" aria-label="Ver ejemplos anteriores" onClick={() => carrusel.current?.scrollBy({ left: -360, behavior: 'smooth' })}><ArrowLeft size={21} /></button><button type="button" aria-label="Ver más ejemplos" onClick={() => carrusel.current?.scrollBy({ left: 360, behavior: 'smooth' })}><ArrowRight size={21} /></button></div></div><div className="mp-ejemplos__grid" ref={carrusel}>{ejemplos.map((ejemplo) => <a key={ejemplo.nombre} href={ejemplo.href} className={`mp-ejemplo mp-ejemplo--${ejemplo.tono} mp-reveal`}><div className="mp-ejemplo__marco"><div className="mp-ejemplo__telefono"><span className="mp-ejemplo__surco" aria-hidden="true" /><div className="mp-ejemplo__pantalla"><Image src={ejemplo.imagen} alt={`Vista previa de ${ejemplo.nombre}`} width={390} height={ejemplo.alto} unoptimized /></div></div></div><div className="mp-ejemplo__pie"><span><b>{ejemplo.nombre}</b><small>{ejemplo.rubro}</small></span><span className="mp-ejemplo__flecha" aria-hidden="true"><ArrowRight size={20} /></span></div></a>)}</div></section>

      <section className="mp-planes" id="planes" aria-labelledby="mp-planes-titulo"><div className="mp-planes__intro mp-reveal"><h2 id="mp-planes-titulo">Planes de carta digital<br />interactiva</h2><p>Todos incluyen carrito, pedidos por WhatsApp sin comisiones, enlace propio y código QR. Empieza con 7 días gratis, sin tarjeta.</p><div className="mp-planes__periodos" role="group" aria-label="Periodo de pago">{(['mensual', 'trimestral', 'anual'] as const).map((valor) => <button type="button" key={valor} aria-pressed={periodo === valor} onClick={() => setPeriodo(valor)}>{valor === 'mensual' ? 'Mensual' : valor === 'trimestral' ? 'Trimestral' : 'Anual'}{valor === 'trimestral' && <small>−10%</small>}{valor === 'anual' && <small>Gratis 2 meses</small>}</button>)}</div><span className="mp-planes__moneda">Precios en soles. El pago se realiza desde tu panel.</span></div><div className="mp-planes__grid">{opcionesPagina.map((opcion, indice) => { const precio = periodo === 'anual' ? opcion.anual : periodo === 'trimestral' ? Math.round(opcion.mensual * .9 * 100) / 100 : opcion.mensual; const cobro = periodo === 'anual' ? opcion.anual * 12 : periodo === 'trimestral' ? precio * 3 : precio; return <article className={`mp-plan mp-plan--${indice === 1 ? 'destacado' : 'claro'} mp-reveal`} key={opcion.nombre}>{indice === 1 && <span className="mp-plan__sello">El más elegido</span>}<h3>{opcion.nombre}</h3><p>{opcion.detalle}</p><div className="mp-plan__precio"><del>S/ {opcion.mensual.toFixed(2)} al mes</del><strong>S/ {precio.toFixed(2)}</strong><span>al mes</span></div><span className="mp-plan__cobro">{periodo === 'mensual' ? 'Pago mensual' : `Pagas S/ ${cobro.toFixed(2)} cada ${periodo === 'anual' ? 'año' : 'trimestre'}. IGV incluido.`}</span><a className="mp-plan__boton" href="/panel/tu-pagina">Probar 7 días gratis</a><small className="mp-plan__despues">Al terminar la prueba eliges cómo continuar.</small><div className="mp-plan__separador" aria-hidden="true"><i /><span /><i /></div><ul>{opcion.puntos.map((punto) => <li key={punto}><Check size={16} />{punto}</li>)}</ul></article>; })}</div><div className="mp-planes__nota"><span><b>Pago desde tu panel.</b> Elige el plan y el periodo que necesitas.</span><span><b>7 días gratis, sin tarjeta.</b> Durante la prueba no se cobra nada.</span><span><b>Tu carta a tu manera.</b> Cambia productos, precios y contenido desde tu panel.</span></div></section>

      <section className="mp-preguntas" id="preguntas"><div><span className="mp-sobre">PREGUNTAS FRECUENTES</span><h2>Lo que necesitas saber.</h2><p>Explora las demos antes de crear tu propia página.</p></div><div className="mp-preguntas__lista">{preguntas.map(({ pregunta, respuesta }) => <details key={pregunta}><summary>{pregunta}<ChevronDown size={20} /></summary><p>{respuesta}</p></details>)}</div></section>

      <section className="mp-cierre"><span className="mp-sobre">TU NEGOCIO MERECE SU PROPIO ESPACIO</span><h2>Haz que encontrarte<br />sea el primer paso.</h2><p>Prepara tu página con tu nombre, tus fotos y lo que ofreces.</p><a className="mp-boton mp-boton--claro" href="/panel/tu-pagina">Crear mi página <ArrowRight size={19} /></a></section>
    </main>
    <footer className="mp-footer"><a className="mp-marca" href="/" aria-label="Vendemia, ir al inicio"><MiPaginaLogo /></a><span>Mi página · una herramienta de Vendemia</span><a href="/">Volver a Vendemia <ArrowRight size={15} /></a></footer>
    {aviso && <div className="mp-aviso" role="status"><Check size={18} /><span>Esta vista es una muestra. Abre nuestros ejemplos para probar la página completa.</span><button type="button" aria-label="Cerrar aviso" onClick={() => setAviso(false)}><X size={18} /></button></div>}
  </div>;
}
