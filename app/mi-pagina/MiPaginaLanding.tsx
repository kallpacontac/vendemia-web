'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, Check, ChevronDown, Clock3, MapPin, Menu, Plus, ShoppingBag, Smartphone, X } from 'lucide-react';

const palabras = ['página', 'tienda', 'agenda'] as const;
const banderas = [
  { pais: 'Perú', emoji: '🇵🇪' }, { pais: 'México', emoji: '🇲🇽' },
  { pais: 'Colombia', emoji: '🇨🇴' }, { pais: 'Chile', emoji: '🇨🇱' },
  { pais: 'Argentina', emoji: '🇦🇷' }, { pais: 'Ecuador', emoji: '🇪🇨' },
  { pais: 'Bolivia', emoji: '🇧🇴' }, { pais: 'Uruguay', emoji: '🇺🇾' },
  { pais: 'Paraguay', emoji: '🇵🇾' }, { pais: 'Brasil', emoji: '🇧🇷' },
] as const;

function MiPaginaLogo() {
  return <span className="mp-logo">Vendem<span className="mp-logo__i">i</span>a<span className="mp-logo__punto">.</span></span>;
}

const ejemplos = [
  { nombre: 'La Baguette', rubro: 'Panadería · carta visual', imagen: '/assets/negocios-ejemplo/cafe-3.webp', href: '/ejemplos/la-baguette', tono: 'pan' },
  { nombre: 'Grano de Barrio', rubro: 'Cafetería · tienda', imagen: '/assets/negocios-ejemplo/cafeteria-hero.webp', href: '/ejemplos/cafeteria', tono: 'cafe' },
  { nombre: 'Atelier Norte', rubro: 'Barbería · servicios y agenda', imagen: '/assets/luxury-ejemplo/portada.webp', href: '/ejemplos/barberia', tono: 'barberia' },
  { nombre: 'Zona Gol', rubro: 'Canchas · reserva por hora', imagen: '/assets/canchas-ejemplo/portada.webp', href: '/ejemplos/canchas', tono: 'cancha' },
  { nombre: 'Sonrisa Norte', rubro: 'Clínica · citas', imagen: '/assets/negocios-ejemplo/clinica-hero.webp', href: '/ejemplos/clinica-dental?diseno=clara', tono: 'clinica' },
] as const;

const pasos = [
  { numero: '01', titulo: 'Elige cómo atenderás', texto: 'Configura tu página como tienda, agenda o ambas. Después escoge el diseño que mejor represente a tu negocio.' },
  { numero: '02', titulo: 'Agrega lo que ofreces', texto: 'Publica productos, servicios, fotos, precios y horarios desde tu panel. Tu contenido, tu identidad.' },
  { numero: '03', titulo: 'Comparte tu enlace', texto: 'Tus clientes abren la página desde el celular y pueden pedir o reservar sin instalar otra aplicación.' },
] as const;

const funciones = [
  { icono: ShoppingBag, titulo: 'Pedidos con carrito', texto: 'Productos, cantidades y un resumen claro antes de enviar el pedido.' },
  { icono: CalendarDays, titulo: 'Reservas visibles', texto: 'Servicios, fechas y horarios disponibles en un flujo fácil de seguir.' },
  { icono: Smartphone, titulo: 'Hecha para el celular', texto: 'Una portada rápida de entender y botones cómodos para tocar.' },
  { icono: Clock3, titulo: 'Canchas por hora', texto: 'Modalidades, horarios y lista de espera para los turnos ocupados.' },
] as const;

const preguntas = [
  { pregunta: '¿Puedo cambiar las fotos y los colores?', respuesta: 'Sí. Desde Mi página puedes cambiar el nombre, la portada, el color y el contenido del negocio. Los ejemplos muestran cómo se ve cada diseño con datos de muestra.' },
  { pregunta: '¿La página sirve para reservar y vender?', respuesta: 'Sí. Puedes usarla como agenda, tienda o una combinación de ambas, según la forma en que atiende tu negocio.' },
  { pregunta: '¿Los ejemplos reciben pedidos reales?', respuesta: 'No. Son demostraciones para explorar el diseño y los flujos; no guardan pedidos, reservas ni pagos.' },
] as const;

export default function MiPaginaLanding() {
  const raiz = useRef<HTMLDivElement>(null);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [cantidad, setCantidad] = useState(0);
  const [categoria, setCategoria] = useState<'Favoritos' | 'Bebidas'>('Favoritos');
  const [aviso, setAviso] = useState(false);
  const [tecleado, setTecleado] = useState<string>(palabras[0]);

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
          <h1 id="mp-titulo" aria-label="Tu página digital para recibir pedidos y reservas">Tu <span className="mp-escritura" aria-hidden="true"><span>{tecleado}</span><i /></span> digital<br />para recibir pedidos<br />y reservas.</h1>
          <p>Tus clientes ven lo que ofreces, eligen sus productos o un horario y te contactan desde la misma página. Tú cambias fotos, precios y disponibilidad cuando quieras.</p>
          <div className="mp-hero__acciones"><a className="mp-boton" href="/panel/tu-pagina">Crear mi página <ArrowRight size={19} /></a><a className="mp-boton mp-boton--borde" href="#ejemplos">Explorar ejemplos</a></div>
          <div className="mp-hero__nota"><Check size={16} /> Tus clientes la abren desde el celular, sin instalar nada.</div>
        </div>
        <div className="mp-hero__visual" aria-label="Vista interactiva de una página de ejemplo">
          <span className="mp-hero__orbita" aria-hidden="true" />
          <span className="mp-hero__mancha mp-hero__mancha--uno" aria-hidden="true" />
          <span className="mp-hero__mancha mp-hero__mancha--dos" aria-hidden="true" />
          <span className="mp-flotante mp-flotante--promo"><small>Todo en una página</small><b>Lista para compartir</b></span>
          <span className="mp-flotante mp-flotante--sinapp"><Check size={15} /> Sin instalar apps</span>
          <div className="mp-telefono">
            <div className="mp-telefono__barra"><span /></div>
            <div className="mp-telefono__portada"><span>grano-de-barrio.vendemia.com</span><strong>Grano de Barrio</strong><small><i /> Abierto ahora · Pedidos y recojo</small></div>
            <div className="mp-telefono__contenido"><div className="mp-telefono__categorias"><button type="button" className={categoria === 'Favoritos' ? 'activo' : ''} onClick={() => setCategoria('Favoritos')}>Favoritos</button><button type="button" className={categoria === 'Bebidas' ? 'activo' : ''} onClick={() => setCategoria('Bebidas')}>Bebidas</button></div><div className="mp-telefono__producto"><span className="mp-telefono__foto" /><div><b>{categoria === 'Bebidas' ? 'Cappuccino' : 'Café de la casa'}</b><small>{categoria === 'Bebidas' ? 'Espresso y leche cremosa' : 'Tostado fresco cada mañana'}</small><strong>S/ {categoria === 'Bebidas' ? '14' : '12'}.00</strong></div><button type="button" aria-label="Agregar producto de ejemplo" onClick={() => setCantidad(cantidad + 1)}><Plus size={16} /></button></div><div className="mp-telefono__producto"><span className="mp-telefono__foto mp-telefono__foto--dos" /><div><b>Croissant de mantequilla</b><small>Horneado hoy</small><strong>S/ 9.00</strong></div><button type="button" aria-label="Agregar croissant de ejemplo" onClick={() => setCantidad(cantidad + 1)}><Plus size={16} /></button></div><div className="mp-telefono__producto"><span className="mp-telefono__foto mp-telefono__foto--tres" /><div><b>Queque de naranja</b><small>Porción del día</small><strong>S/ 8.00</strong></div><button type="button" aria-label="Agregar queque de ejemplo" onClick={() => setCantidad(cantidad + 1)}><Plus size={16} /></button></div></div>
            <div className="mp-telefono__pie"><span><b>{cantidad}</b> {cantidad === 1 ? 'producto' : 'productos'}</span><button type="button" onClick={() => setAviso(true)} disabled={cantidad === 0}>Ver pedido <ArrowRight size={15} /></button></div>
          </div>
          <span className="mp-flotante mp-flotante--ubicacion"><MapPin size={15} /> Elige entrega o recojo</span>
          <span className="mp-flotante mp-flotante--pedido"><ShoppingBag size={15} /> Pedido a un toque</span>
          <p>Prueba la vista: elige una categoría y agrega un producto.</p>
        </div>
      </section>

      <div className="mp-cinta" aria-label="Tipos de negocio y países de Latinoamérica"><span>UNA PÁGINA PARA TU FORMA DE TRABAJAR</span><div className="mp-cinta__rubros"><span>Catálogo</span><i /> <span>Reservas</span><i /> <span>Pedidos</span><i /> <span>Canchas</span></div><div className="mp-cinta__banderas" aria-label="Banderas latinoamericanas">{banderas.map(({ pais, emoji }) => <span key={pais} title={pais} aria-label={pais}>{emoji}</span>)}</div></div>

      <section className="mp-seccion" id="soluciones"><div className="mp-seccion__cabecera mp-reveal"><div><span className="mp-sobre">TU PÁGINA, A TU MEDIDA</span><h2>Elige lo que necesita<br />tu negocio hoy.</h2></div><p>Los diseños comparten una idea: que tu cliente entienda qué ofreces y pueda actuar en pocos toques.</p></div><div className="mp-soluciones"><a href="/ejemplos/la-baguette" className="mp-solucion mp-solucion--tienda mp-reveal"><span>01 / VENDE</span><ShoppingBag size={32} /><h3>Una tienda para tus productos</h3><p>Fotos, categorías, precios y carrito en un recorrido simple.</p><b>Ver ejemplo <ArrowRight size={18} /></b></a><a href="/ejemplos/clinica-dental?diseno=clara" className="mp-solucion mp-solucion--agenda mp-reveal"><span>02 / AGENDA</span><CalendarDays size={32} /><h3>Una agenda para tus servicios</h3><p>Servicios y horarios fáciles de encontrar desde el primer vistazo.</p><b>Ver ejemplo <ArrowRight size={18} /></b></a><a href="/ejemplos/canchas" className="mp-solucion mp-solucion--canchas mp-reveal"><span>03 / RESERVA</span><Clock3 size={32} /><h3>Una cancha lista para reservar</h3><p>Modalidad, día y hora visibles, con extras opcionales.</p><b>Ver ejemplo <ArrowRight size={18} /></b></a></div></section>

      <section className="mp-pasos" id="como-funciona"><div className="mp-seccion__cabecera mp-reveal"><div><span className="mp-sobre">ASÍ DE SIMPLE</span><h2>Lista en tres pasos.</h2></div><p>Empieza con una plantilla, agrega el contenido de tu negocio y comparte tu página.</p></div><div className="mp-pasos__grid">{pasos.map((paso) => <div className="mp-reveal" key={paso.numero}><span>{paso.numero}</span><h3>{paso.titulo}</h3><p>{paso.texto}</p></div>)}</div></section>

      <section className="mp-seccion mp-funciones" aria-labelledby="mp-funciones-titulo"><div className="mp-seccion__cabecera mp-reveal"><div><span className="mp-sobre">LO IMPORTANTE, A MANO</span><h2 id="mp-funciones-titulo">Diseñada para que<br />puedan elegirte.</h2></div><p>Una experiencia clara para tus clientes y contenido que puedes gestionar desde tu panel.</p></div><div className="mp-funciones__grid">{funciones.map(({ icono: Icono, titulo, texto }) => <div className="mp-reveal" key={titulo}><span><Icono size={24} /></span><h3>{titulo}</h3><p>{texto}</p></div>)}</div></section>

      <section className="mp-ejemplos" id="ejemplos"><div className="mp-seccion__cabecera mp-reveal"><div><span className="mp-sobre">HECHOS CON VENDEMIA</span><h2>Explora nuestras<br />páginas de ejemplo.</h2></div><p>Abre cada demo y prueba el recorrido como lo haría un cliente. Los nombres, productos y precios son ilustrativos.</p></div><div className="mp-ejemplos__grid">{ejemplos.map((ejemplo) => <a key={ejemplo.nombre} href={ejemplo.href} className={`mp-ejemplo mp-ejemplo--${ejemplo.tono} mp-reveal`}><div className="mp-ejemplo__marco"><div className="mp-ejemplo__pantalla"><div className="mp-ejemplo__foto" style={{ backgroundImage: `url('${ejemplo.imagen}')` }} /><div className="mp-ejemplo__texto"><span>PÁGINA DE EJEMPLO</span><strong>{ejemplo.nombre}</strong><small>{ejemplo.rubro}</small></div></div></div><div className="mp-ejemplo__pie"><span><b>{ejemplo.nombre}</b><small>{ejemplo.rubro}</small></span><span className="mp-ejemplo__flecha" aria-label="Abrir ejemplo"><ArrowRight size={20} /></span></div></a>)}</div></section>

      <section className="mp-preguntas" id="preguntas"><div><span className="mp-sobre">PREGUNTAS FRECUENTES</span><h2>Lo que necesitas saber.</h2><p>Explora las demos antes de crear tu propia página.</p></div><div className="mp-preguntas__lista">{preguntas.map(({ pregunta, respuesta }) => <details key={pregunta}><summary>{pregunta}<ChevronDown size={20} /></summary><p>{respuesta}</p></details>)}</div></section>

      <section className="mp-cierre"><span className="mp-sobre">TU NEGOCIO MERECE SU PROPIO ESPACIO</span><h2>Haz que encontrarte<br />sea el primer paso.</h2><p>Prepara tu página con tu nombre, tus fotos y lo que ofreces.</p><a className="mp-boton mp-boton--claro" href="/panel/tu-pagina">Crear mi página <ArrowRight size={19} /></a></section>
    </main>
    <footer className="mp-footer"><a className="mp-marca" href="/" aria-label="Vendemia, ir al inicio"><MiPaginaLogo /></a><span>Mi página · una herramienta de Vendemia</span><a href="/">Volver a Vendemia <ArrowRight size={15} /></a></footer>
    {aviso && <div className="mp-aviso" role="status"><Check size={18} /><span>Esta vista es una muestra. Abre nuestros ejemplos para probar la página completa.</span><button type="button" aria-label="Cerrar aviso" onClick={() => setAviso(false)}><X size={18} /></button></div>}
  </div>;
}
